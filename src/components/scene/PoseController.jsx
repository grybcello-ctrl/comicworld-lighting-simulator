import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { APP_MODES } from '../../config/cameraConfig.js';
import { POSE_CONFIG } from '../../config/environmentConfig.js';
import { SUBJECT_TARGET, SUBJECT_TYPES } from '../../config/sceneConfig.js';
import { cameraActions } from '../../state/cameraStore.js';
import { commitPose, getBoneObject, registerSkeleton, setPoseCommitHandler, usePoseState } from '../../state/poseStore.js';
import { useSubjectState } from '../../state/subjectStore.js';
import { findEyeTarget, findFacePoint } from '../../utils/eyeAutofocus.js';

/** Shadow maps render on demand (StudioLight.jsx): request one refresh of every map. */
function refreshShadowMaps(scene) {
  scene.traverse((object) => {
    if (object.isLight && object.shadow) object.shadow.needsUpdate = true;
  });
}

/**
 * Pose Mode: a TransformControls gizmo in 'rotate' mode, attached to the
 * bone selected in the panel (state/poseStore.js).
 *
 * - While a gizmo ring is dragged, OrbitControls is disabled
 *   ('dragging-changed'), so the view never turns with the joint.
 * - Each rotation step refreshes the on-demand shadow maps; releasing the
 *   ring also updates the skinned bounds (culling, raycasts) and re-measures
 *   the AF targets, so Eye AF follows a turned head.
 * - The gizmo lives in lighting mode only: it picks with the orbit camera,
 *   not the photo camera. The pose itself stays in both modes.
 * - The gizmo is flagged hideInScreenshot (ScreenshotBridge.jsx).
 */
export function PoseController({ appMode }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const orbit = useThree((state) => state.controls);
  const invalidate = useThree((state) => state.invalidate);
  const { poseMode, selectedBoneId } = usePoseState();
  const { subjectType, model } = useSubjectState();
  const subjectKey = subjectType === SUBJECT_TYPES.CUSTOM && model.object ? `custom-${model.id}` : 'mannequin';
  const gizmoRef = useRef(null);

  // Bone list of the current subject (the mannequin has no skeleton).
  useLayoutEffect(() => {
    registerSkeleton(subjectKey === 'mannequin' ? null : model.object);
  }, [subjectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gizmo lifetime: one TransformControls per canvas.
  useLayoutEffect(() => {
    const gizmo = new TransformControls(camera, gl.domElement);
    gizmo.setMode('rotate');
    gizmo.setSpace(POSE_CONFIG.space);
    gizmo.setSize(POSE_CONFIG.gizmoSize);
    gizmo.enabled = false;
    const helper = gizmo.getHelper();
    helper.name = 'pose-gizmo';
    helper.userData.hideInScreenshot = true;
    helper.visible = false;
    scene.add(helper);
    gizmoRef.current = gizmo;

    let orbitPaused = false;
    const onDraggingChanged = (event) => {
      const controls = orbit;
      if (event.value) {
        if (controls && controls.enabled) {
          controls.enabled = false;
          orbitPaused = true;
        }
      } else {
        if (controls && orbitPaused) controls.enabled = true;
        orbitPaused = false;
        commitPose();
      }
    };
    const onChange = () => invalidate();
    const onObjectChange = () => {
      refreshShadowMaps(scene);
      invalidate();
    };
    gizmo.addEventListener('dragging-changed', onDraggingChanged);
    gizmo.addEventListener('change', onChange);
    gizmo.addEventListener('objectChange', onObjectChange);

    return () => {
      gizmo.removeEventListener('dragging-changed', onDraggingChanged);
      gizmo.removeEventListener('change', onChange);
      gizmo.removeEventListener('objectChange', onObjectChange);
      if (orbitPaused && orbit) orbit.enabled = true;
      gizmo.detach();
      scene.remove(helper);
      gizmo.dispose();
      gizmoRef.current = null;
      invalidate();
    };
  }, [camera, gl, scene, orbit, invalidate]);

  // After a finished pose change: skinned bounds, shadows, AF targets, redraw.
  useLayoutEffect(
    () =>
      setPoseCommitHandler(() => {
        const subject = scene.getObjectByName('subject');
        if (subject) {
          subject.updateMatrixWorld(true);
          subject.traverse((object) => {
            if (object.isSkinnedMesh) {
              object.computeBoundingSphere();
              object.computeBoundingBox();
            }
          });
          cameraActions.reportAfTargets({
            facePoint: findFacePoint(subject, SUBJECT_TARGET),
            eyeTarget: findEyeTarget(subject),
          });
        }
        refreshShadowMaps(scene);
        invalidate();
      }),
    [scene, invalidate],
  );

  // Attach while Pose Mode is on (lighting mode, a bone selected); detach otherwise.
  useLayoutEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    const bone = poseMode && appMode === APP_MODES.LIGHTING ? getBoneObject(selectedBoneId) : null;
    if (bone) {
      gizmo.attach(bone);
      gizmo.enabled = true;
    } else {
      gizmo.detach();
      gizmo.enabled = false;
    }
    gizmo.getHelper().visible = Boolean(bone);
    invalidate();
  }, [poseMode, selectedBoneId, appMode, subjectKey, invalidate]);

  return null;
}

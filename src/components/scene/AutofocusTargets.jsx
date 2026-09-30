import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { Vector2, Vector3 } from 'three';
import { AF_TARGET_MARKER_CONFIG } from '../../config/environmentConfig.js';
import { SUBJECT_TARGET } from '../../config/sceneConfig.js';
import { cameraActions, useAfTargetPoint } from '../../state/cameraStore.js';
import { subjectKeyOf, useSubjectState } from '../../state/subjectStore.js';
import { useViewState } from '../../state/viewStore.js';
import { findEyeTarget, findFacePoint } from '../../utils/eyeAutofocus.js';

/**
 * Measures the Face and Eye AF targets once per subject and reports them to
 * the camera store. Mounted in both modes, so the AF target marker also works
 * in the lighting view. Must come after <SubjectModel/>: its layout effect
 * then runs once the new subject is attached to the scene.
 */
export function AutofocusTracker() {
  const scene = useThree((state) => state.scene);
  // Same key as SubjectModel: re-measured for a new model, orientation or imported pose.
  const subjectKey = subjectKeyOf(useSubjectState());

  useLayoutEffect(() => {
    const subject = scene.getObjectByName('subject');
    if (!subject) return;
    cameraActions.reportAfTargets({
      facePoint: findFacePoint(subject, SUBJECT_TARGET),
      eyeTarget: findEyeTarget(subject),
    });
  }, [scene, subjectKey]);

  return null;
}

const markerPosition = new Vector3();
const drawingBufferSize = new Vector2();

/**
 * Keeps the marker at least `minScreenDiameterPx` wide for whichever camera
 * renders it (orbit or photo camera): an 8 mm sphere is ~4 px in the
 * full-body orbit view. Runs before the model-view matrix is computed.
 */
function keepMinimumScreenSize(renderer, scene, camera) {
  if (!camera.isPerspectiveCamera) return;
  const { radiusM, minScreenDiameterPx } = AF_TARGET_MARKER_CONFIG;
  renderer.getDrawingBufferSize(drawingBufferSize);
  const distance = camera.getWorldPosition(markerPosition).distanceTo(this.position);
  const metersPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / drawingBufferSize.y;
  const minDiameterPx = minScreenDiameterPx * renderer.getPixelRatio();
  this.scale.setScalar(Math.max(1, (minDiameterPx * metersPerPixel) / (2 * radiusM)));
  this.updateMatrixWorld();
}

/**
 * Small red sphere where the camera focuses (AF target, or the point on the
 * optical axis at the MF distance). Drawn on top (no depth test/write), so it
 * stays visible on the skin and never changes the depth the DoF pass reads.
 * Hidden while a screenshot is taken (ScreenshotBridge.jsx).
 */
export function AutofocusTargetMarker() {
  const { showAfTarget } = useViewState();
  const point = useAfTargetPoint();
  if (!showAfTarget || !point) return null;
  return (
    <mesh
      name="af-target-marker"
      position={point}
      renderOrder={AF_TARGET_MARKER_CONFIG.renderOrder}
      userData={{ hideInScreenshot: true }}
      raycast={() => null}
      onBeforeRender={keepMinimumScreenSize}
    >
      <sphereGeometry args={[AF_TARGET_MARKER_CONFIG.radiusM, 20, 14]} />
      <meshBasicMaterial
        color={AF_TARGET_MARKER_CONFIG.color}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        transparent
      />
    </mesh>
  );
}

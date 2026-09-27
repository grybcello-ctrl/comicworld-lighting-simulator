import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  DepthTexture,
  HalfFloatType,
  PerspectiveCamera,
  Raycaster,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { CAMERA_OPTICS_CONFIG, DOF_CONFIG, getBodyById, getLensById } from '../../config/cameraConfig.js';
import { SUBJECT_TARGET, SUBJECT_TYPES } from '../../config/sceneConfig.js';
import { PhysicalBokehPass } from '../../postprocessing/PhysicalBokehPass.js';
import { cameraActions, useCameraState } from '../../state/cameraStore.js';
import { useSubjectState } from '../../state/subjectStore.js';
import { cameraPose, frameCanvasFit, lensState } from '../../utils/cameraOptics.js';
import { compensatedBackground } from '../../utils/toneMappingInverse.js';

/** Visible in the rendered image (the object and all its ancestors). */
function isRendered(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => material && material.visible !== false);
}

/**
 * Face surface for AF: first visible subject hit of a ray from the front
 * (+z) through the head center. Measured once per subject; any camera pose
 * then gets its face distance by projection (cameraStore.js).
 */
function useFacePointMeasurement(scene) {
  const { subjectType, model } = useSubjectState();
  // Same key as SubjectModel: the mannequin stays as placeholder until a model is ready.
  const subjectKey = subjectType === SUBJECT_TYPES.CUSTOM && model.object ? `custom-${model.id}` : 'mannequin';
  useLayoutEffect(() => {
    const subject = scene.getObjectByName('subject');
    if (!subject) return;
    subject.updateMatrixWorld(true); // a model attached in this commit has not been rendered yet
    const [x, y, z] = SUBJECT_TARGET;
    const raycaster = new Raycaster(new Vector3(x, y, z + 20), new Vector3(0, 0, -1));
    const hit = raycaster.intersectObject(subject, true).find((h) => isRendered(h.object));
    cameraActions.reportFacePoint(hit ? hit.point.toArray() : null);
  }, [scene, subjectKey]);
}

/**
 * Camera mode renderer: a separate "photo" camera (GFX body + GF lens) and a
 * post-processing chain RenderPass → PhysicalBokehPass (thin-lens DoF) →
 * OutputPass (tone mapping + sRGB, as the direct render).
 *
 * Mounted only in camera mode. `useFrame(…, 1)`: a positive priority makes r3f
 * skip its own gl.render, so while mounted this is the only scene render;
 * unmounting hands rendering back to r3f unchanged. The orbit camera,
 * OrbitControls, lights, shadow maps and the subject are never modified: the
 * lighting view comes back exactly as it was. With frameloop="demand" a frame
 * is drawn only when a setting changes (invalidate()).
 */
export function CameraPostFX() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);
  const invalidate = useThree((state) => state.invalidate);
  const settings = useCameraState();
  const { bodyId, lensId, fNumber, focusDistanceM, shootingDistanceM, cameraHeightM, aimHeightM } = settings;

  const photoCamera = useMemo(() => {
    const camera = new PerspectiveCamera();
    camera.name = 'photo-camera';
    return camera;
  }, []);
  const backdrop = useMemo(() => new Color(), []);
  const pipelineRef = useRef(null);

  useFacePointMeasurement(scene);

  // GPU resources live exactly as long as the camera mode.
  useLayoutEffect(() => {
    // MSAA like the default canvas; the depth texture is resolved from the
    // same render, so DoF sees exactly the rendered surfaces (alpha-tested hair included).
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: DOF_CONFIG.msaaSamples,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    target.texture.name = 'CameraPostFX.scene';
    const composer = new EffectComposer(gl, target);
    const bokehPass = new PhysicalBokehPass(DOF_CONFIG);
    const outputPass = new OutputPass();
    composer.addPass(new RenderPass(scene, photoCamera));
    composer.addPass(bokehPass);
    composer.addPass(outputPass);
    pipelineRef.current = { composer, bokehPass };
    return () => {
      pipelineRef.current = null;
      composer.dispose(); // both targets (+ their depth textures) and the copy pass
      bokehPass.dispose();
      outputPass.dispose();
      invalidate(); // redraw the lighting view
    };
  }, [gl, scene, photoCamera, invalidate]);

  useLayoutEffect(() => {
    const { composer } = pipelineRef.current;
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    invalidate();
  }, [size.width, size.height, dpr, invalidate]);

  // Camera pose, lens → FOV, and the DoF parameters.
  useLayoutEffect(() => {
    const body = getBodyById(bodyId);
    const lens = getLensById(lensId);
    const fit = frameCanvasFit(body.sensor, lens.focalLengthMm, size.width, size.height);
    const pose = cameraPose({ shootingDistanceM, cameraHeightM, aimHeightM });

    photoCamera.position.set(...pose.position);
    photoCamera.lookAt(...pose.target);
    photoCamera.fov = fit.verticalFovDeg;
    photoCamera.aspect = size.width / size.height;
    photoCamera.filmGauge = fit.filmGauge; // getFocalLength() === lens focal length
    photoCamera.near = CAMERA_OPTICS_CONFIG.near;
    photoCamera.far = CAMERA_OPTICS_CONFIG.far;
    photoCamera.updateProjectionMatrix();
    photoCamera.updateMatrixWorld();

    const optics = lensState({ focalLengthMm: lens.focalLengthMm, fNumber, focusDistanceM, sensor: body.sensor });
    pipelineRef.current.bokehPass.setLens({
      ...optics,
      pxPerMm: fit.pxPerMm * dpr, // drawing-buffer pixels
      maxCocPx: DOF_CONFIG.maxCocRadiusCssPx * dpr,
      near: photoCamera.near,
      far: photoCamera.far,
    });
    invalidate();
  }, [
    bodyId,
    lensId,
    fNumber,
    focusDistanceM,
    shootingDistanceM,
    cameraHeightM,
    aimHeightM,
    size.width,
    size.height,
    dpr,
    photoCamera,
    invalidate,
  ]);

  useFrame(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;
    // Same backdrop color as the direct render (see toneMappingInverse.js).
    const original = scene.background;
    const compensated = compensatedBackground(original, gl, backdrop);
    if (compensated) scene.background = compensated;
    try {
      pipeline.composer.render();
    } finally {
      scene.background = original;
    }
  }, 1);

  return null;
}

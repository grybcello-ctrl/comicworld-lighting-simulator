import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  DepthTexture,
  HalfFloatType,
  PerspectiveCamera,
  UnsignedIntType,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { CAMERA_OPTICS_CONFIG, DOF_CONFIG, getLensById } from '../../config/cameraConfig.js';
import { PhysicalBokehPass } from '../../postprocessing/PhysicalBokehPass.js';
import { selectCameraFrame } from '../../state/cameraSelectors.js';
import { useCameraState } from '../../state/cameraStore.js';
import { cameraPose, frameCanvasFit, lensState } from '../../utils/cameraOptics.js';
import { compensatedBackground } from '../../utils/toneMappingInverse.js';

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
  const { bodyId, lensId, fNumber, focusDistanceM, shootingDistanceM, cameraHeightM, aimHeightM, aspectId, aspectFlipped } = settings;

  const photoCamera = useMemo(() => {
    const camera = new PerspectiveCamera();
    camera.name = 'photo-camera';
    return camera;
  }, []);
  const backdrop = useMemo(() => new Color(), []);
  const pipelineRef = useRef(null);

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
    const lens = getLensById(lensId);
    // The aspect crop (selectCameraFrame) is the frame fitted into the canvas.
    // camera.aspect stays the canvas aspect (undistorted pixels); the frame's
    // ratio sets the FOV and the letterbox/pillarbox mask shows only the frame.
    const frame = selectCameraFrame({ bodyId, aspectId, aspectFlipped });
    const fit = frameCanvasFit(frame, lens.focalLengthMm, size.width, size.height);
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

    const optics = lensState({ focalLengthMm: lens.focalLengthMm, fNumber, focusDistanceM, sensor: frame });
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
    aspectId,
    aspectFlipped,
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

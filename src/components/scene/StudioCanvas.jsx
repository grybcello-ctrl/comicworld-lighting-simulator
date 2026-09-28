import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { APP_MODES } from '../../config/cameraConfig.js';
import { CAMERA_CONFIG, CAMERA_VIEWS, RENDER_CONFIG } from '../../config/sceneConfig.js';
import { useAppMode } from '../../state/cameraStore.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { fitOverview, setupBounds } from '../../utils/viewFit.js';
import { AutofocusTargetMarker, AutofocusTracker } from './AutofocusTargets.jsx';
import { CameraPostFX } from './CameraPostFX.jsx';
import { ScreenshotBridge } from './ScreenshotBridge.jsx';
import { StudioEnvironment } from './StudioEnvironment.jsx';
import { StudioLight } from './StudioLight.jsx';
import { SubjectModel } from './SubjectModel.jsx';

// RectAreaLight (softboxes) needs its LTC lookup textures registered once.
RectAreaLightUniformsLib.init();

function StudioFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#4a4a50" roughness={0.95} />
      </mesh>
    </group>
  );
}

/**
 * Applies the camera framing requested from the panel: fixed subject views
 * (Full body / Face close-up) or overview views fitted to all fixtures
 * (Top / Front / Side / Quarter).
 */
function CameraViewController() {
  const { cameraView } = useLightingState();
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const view = CAMERA_VIEWS[cameraView.id];
    // The initial framing comes from the Canvas camera props.
    if (!view || !controls || cameraView.requestId === 0) return;
    const framing = view.fit
      ? fitOverview(setupBounds(scene), view.fit, {
          fovDeg: camera.fov,
          aspect: camera.aspect,
          minDistanceM: CAMERA_CONFIG.minDistance,
          maxDistanceM: CAMERA_CONFIG.maxDistance,
        })
      : view;
    // Drop leftover damping from a previous drag so the jump is exact.
    controls._sphericalDelta?.set(0, 0, 0);
    controls._panOffset?.set(0, 0, 0);
    camera.position.set(...framing.position);
    controls.target.set(...framing.target);
    controls.update();
    invalidate();
  }, [cameraView, camera, controls, scene, invalidate]);

  return null;
}

/**
 * Rendering strategy (no frame drops):
 * - frameloop="demand": a frame is drawn only when something changes (props,
 *   OrbitControls movement/damping). An idle scene costs nothing.
 * - Shadow maps render on demand per light (see useOnDemandShadow in
 *   StudioLight.jsx), so orbiting the camera never re-renders shadow maps, and
 *   editing one light only re-renders that light's map.
 * - Shadow map sizes follow each beam's footprint (utils/shadowModel.js)
 *   instead of a fixed 1024², so narrow beams use small maps.
 *
 * Modes (state/cameraStore.js):
 * - Lighting: direct render through the orbit camera, helpers shown.
 * - Camera: <CameraPostFX> takes over rendering (photo camera + DoF). Only
 *   helpers change: light rays and the selection highlight are hidden, fixture
 *   picking and OrbitControls are paused (kept mounted, so the orbit view is
 *   restored untouched). Lights, subject and shadow maps are shared as-is.
 *
 * The environment (cyc, bokeh spheres, grid, angle guide) and the AF target
 * marker neither cast shadows nor emit light: shadow maps and the lighting on
 * the subject are identical with every toggle on or off.
 */
export function StudioCanvas() {
  const { lights, selectedLightId, showFixtures, showLightRays } = useLightingState();
  const { selectLight } = useLightingActions();
  const appMode = useAppMode();
  const isCameraMode = appMode === APP_MODES.CAMERA;

  return (
    <Canvas
      frameloop="demand"
      shadows="percentage"
      dpr={[1, 2]}
      // Screenshot export reads the canvas back (ScreenshotBridge.jsx).
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: CAMERA_CONFIG.position, fov: CAMERA_CONFIG.fov, near: 0.02, far: 100 }}
    >
      <color attach="background" args={[RENDER_CONFIG.backgroundColor]} />
      <ambientLight intensity={RENDER_CONFIG.ambientIntensity} />

      <StudioFloor />
      {/* 18% gray cyc, bokeh spheres, floor grid, angle guide (viewStore.js). */}
      <StudioEnvironment appMode={appMode} />
      {/* Default mannequin or the uploaded glTF/GLB (subjectStore.js). */}
      <SubjectModel />
      {/* After SubjectModel: measures the AF targets once the subject is attached. */}
      <AutofocusTracker />
      <AutofocusTargetMarker />

      {lights.map((light) => (
        <StudioLight
          key={light.id}
          light={light}
          isSelected={!isCameraMode && light.id === selectedLightId}
          showFixture={showFixtures}
          showLightRays={!isCameraMode && showLightRays}
          onSelect={isCameraMode ? undefined : selectLight}
        />
      ))}

      <OrbitControls
        makeDefault
        enabled={!isCameraMode}
        target={CAMERA_CONFIG.orbitTarget}
        enableDamping
        dampingFactor={0.08}
        minDistance={CAMERA_CONFIG.minDistance}
        maxDistance={CAMERA_CONFIG.maxDistance}
        maxPolarAngle={CAMERA_CONFIG.maxPolarAngle}
      />
      <CameraViewController />
      {isCameraMode && <CameraPostFX />}
      <ScreenshotBridge />
    </Canvas>
  );
}

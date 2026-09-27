import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { CAMERA_CONFIG, CAMERA_VIEWS, RENDER_CONFIG } from '../../config/sceneConfig.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { MannequinSubject } from './MannequinSubject.jsx';
import { StudioLight } from './StudioLight.jsx';

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

/** Applies the camera framing requested from the panel (Full body / Face close-up). */
function CameraViewController() {
  const { cameraView } = useLightingState();
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const view = CAMERA_VIEWS[cameraView.id];
    // The initial framing comes from the Canvas camera props.
    if (!view || !controls || cameraView.requestId === 0) return;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
    invalidate();
  }, [cameraView, camera, controls, invalidate]);

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
 */
export function StudioCanvas() {
  const { lights, selectedLightId, showFixtures } = useLightingState();
  const { selectLight } = useLightingActions();

  return (
    <Canvas
      frameloop="demand"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: CAMERA_CONFIG.position, fov: CAMERA_CONFIG.fov, near: 0.02, far: 100 }}
    >
      <color attach="background" args={[RENDER_CONFIG.backgroundColor]} />
      <ambientLight intensity={RENDER_CONFIG.ambientIntensity} />

      <StudioFloor />
      <MannequinSubject />

      {lights.map((light) => (
        <StudioLight
          key={light.id}
          light={light}
          isSelected={light.id === selectedLightId}
          showFixture={showFixtures}
          onSelect={selectLight}
        />
      ))}

      <OrbitControls
        makeDefault
        target={CAMERA_CONFIG.orbitTarget}
        enableDamping
        dampingFactor={0.08}
        minDistance={CAMERA_CONFIG.minDistance}
        maxDistance={CAMERA_CONFIG.maxDistance}
        maxPolarAngle={CAMERA_CONFIG.maxPolarAngle}
      />
      <CameraViewController />
    </Canvas>
  );
}

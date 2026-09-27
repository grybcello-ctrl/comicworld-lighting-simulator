import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { CAMERA_CONFIG, RENDER_CONFIG } from '../../config/sceneConfig.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { BustSubject } from './BustSubject.jsx';
import { StudioLight } from './StudioLight.jsx';

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

export function StudioCanvas() {
  const { lights, selectedLightId } = useLightingState();
  const { selectLight } = useLightingActions();

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: CAMERA_CONFIG.position, fov: CAMERA_CONFIG.fov, near: 0.05, far: 100 }}
    >
      <color attach="background" args={[RENDER_CONFIG.backgroundColor]} />
      <ambientLight intensity={RENDER_CONFIG.ambientIntensity} />

      <StudioFloor />
      <BustSubject />

      {lights.map((light) => (
        <StudioLight
          key={light.id}
          light={light}
          isSelected={light.id === selectedLightId}
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
    </Canvas>
  );
}

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D } from 'three';
import { getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import { RENDER_CONFIG, SUBJECT_TARGET } from '../../config/sceneConfig.js';
import { kelvinToHex } from '../../utils/colorTemperature.js';
import { computeLightIntensity, placementToPosition } from '../../utils/lightMath.js';
import { MODIFIER_RENDERERS, resolveRenderer, STROBE_BODY_RENDERERS } from './fixtures/index.js';

const DEG_TO_RAD = Math.PI / 180;

/** Simple vertical stand from the floor up to the fixture. */
function LightStand({ position }) {
  const [x, y, z] = position;
  const height = Math.max(y, 0.05);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.016, height, 8]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.02, 3]} />
        <meshStandardMaterial color="#1e1e1e" />
      </mesh>
    </group>
  );
}

/**
 * Renders one LightInstance: stand, strobe body, modifier, and the actual
 * three.js spot light. All behavior is driven by catalog data.
 */
export function StudioLight({ light, isSelected, onSelect }) {
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);

  const fixtureRef = useRef(null);
  const target = useMemo(() => new Object3D(), []);

  const position = useMemo(
    () => placementToPosition(light.placement, SUBJECT_TARGET),
    [light.placement],
  );

  // Aim the fixture (local +Z) at the subject whenever it moves.
  useLayoutEffect(() => {
    fixtureRef.current?.lookAt(...SUBJECT_TARGET);
  }, [position]);

  if (!strobe || !modifier) return null;

  const BodyRenderer = resolveRenderer(STROBE_BODY_RENDERERS, strobe.body.shape, 'cylinder');
  const ModifierRenderer = resolveRenderer(MODIFIER_RENDERERS, modifier.geometry.shape, 'none');
  const { beamAngleDeg, penumbra, shadowSoftness } = modifier.lighting;

  const handleClick = (event) => {
    event.stopPropagation();
    onSelect(light.id);
  };

  return (
    <group name={`studio-light-${light.id}`}>
      <LightStand position={position} />

      <group ref={fixtureRef} position={position} onClick={handleClick}>
        {BodyRenderer && <BodyRenderer body={strobe.body} isSelected={isSelected} />}
        {ModifierRenderer && (
          <ModifierRenderer geometry={modifier.geometry} isLit={light.enabled} />
        )}
      </group>

      <primitive object={target} position={SUBJECT_TARGET} />
      <spotLight
        position={position}
        target={target}
        visible={light.enabled}
        intensity={computeLightIntensity(strobe, modifier, light.powerStops)}
        color={kelvinToHex(light.colorTempK)}
        angle={Math.min((beamAngleDeg / 2) * DEG_TO_RAD, Math.PI / 2 - 0.01)}
        penumbra={penumbra}
        decay={2}
        distance={0}
        castShadow
        shadow-mapSize={[RENDER_CONFIG.shadowMapSize, RENDER_CONFIG.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={shadowSoftness}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
      />
    </group>
  );
}

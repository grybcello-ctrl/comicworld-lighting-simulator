import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D } from 'three';
import { getGridById, getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import { RENDER_CONFIG, SUBJECT_TARGET } from '../../config/sceneConfig.js';
import { resolveLightRig } from '../../utils/beamModel.js';
import { getBeamProfileTexture } from '../../utils/beamProfileTexture.js';
import { kelvinToHex } from '../../utils/colorTemperature.js';
import { placementToPosition } from '../../utils/lightMath.js';
import { MODIFIER_RENDERERS, resolveRenderer, STROBE_BODY_RENDERERS } from './fixtures/index.js';

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
 * Renders one LightInstance: stand, strobe body, modifier, and the three.js
 * lights produced by `resolveLightRig` (SpotLight and/or RectAreaLight).
 */
export function StudioLight({ light, isSelected, onSelect }) {
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  const grid = getGridById(light.gridId);

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

  const rig = useMemo(
    () =>
      strobe && modifier
        ? resolveLightRig({
            strobe,
            modifier,
            grid,
            powerLevel: light.powerLevel,
            focusRod: light.focusRod,
            distance: light.placement.distance,
          })
        : null,
    [strobe, modifier, grid, light.powerLevel, light.focusRod, light.placement.distance],
  );

  const beamMap = rig?.spot ? getBeamProfileTexture(rig.spot.profile, rig.spot.angle) : null;

  if (!rig) return null;

  const BodyRenderer = resolveRenderer(STROBE_BODY_RENDERERS, strobe.body.shape, 'cylinder');
  const ModifierRenderer = resolveRenderer(MODIFIER_RENDERERS, modifier.geometry.shape, 'none');
  const color = kelvinToHex(light.colorTempK);

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
          <ModifierRenderer
            geometry={modifier.geometry}
            isLit={light.enabled}
            grid={grid}
            focusRod={light.focusRod}
          />
        )}
        {rig.area && (
          // RectAreaLight emits along its local -Z; rotate so it faces the fixture's +Z.
          <rectAreaLight
            position={[0, 0, rig.area.offsetZ]}
            rotation={[0, Math.PI, 0]}
            width={rig.area.width}
            height={rig.area.height}
            intensity={rig.area.intensity}
            color={color}
            visible={light.enabled}
          />
        )}
      </group>

      <primitive object={target} position={SUBJECT_TARGET} />
      {rig.spot && (
        <spotLight
          position={position}
          target={target}
          visible={light.enabled}
          intensity={rig.spot.intensity}
          color={color}
          angle={rig.spot.angle}
          penumbra={rig.spot.penumbra}
          decay={rig.spot.decay}
          distance={0}
          // `map` must be explicitly null to clear a previous profile.
          map={beamMap}
          castShadow
          shadow-mapSize={[RENDER_CONFIG.shadowMapSize, RENDER_CONFIG.shadowMapSize]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-radius={rig.spot.shadowRadius}
          shadow-camera-near={0.1}
          shadow-camera-far={20}
        />
      )}
    </group>
  );
}

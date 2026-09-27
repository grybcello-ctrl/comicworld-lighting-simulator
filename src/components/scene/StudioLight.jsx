import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, LinearSRGBColorSpace, Object3D } from 'three';
import { getGridById, getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import { selectFixturePose, selectLightColor, selectLightRig } from '../../state/lightSelectors.js';
import { getBeamProfileTexture } from '../../utils/beamProfileTexture.js';
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
 * Re-renders this light's shadow map only when something that changes the
 * depth image changes (pose, cone angle, map size, clip planes). Camera orbits
 * and radius/bias tweaks (applied at sampling time) cost no shadow passes.
 * A resized map must be disposed: WebGLShadowMap only allocates when map === null.
 */
function useOnDemandShadow(lightRef, { mapSize, deps }) {
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const shadow = lightRef.current?.shadow;
    if (!shadow) return;
    shadow.autoUpdate = false;
    if (shadow.map && shadow.map.width !== mapSize) {
      shadow.map.dispose();
      shadow.map = null;
    }
    shadow.needsUpdate = true;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSize, ...deps]);
}

/**
 * Renders one LightInstance: stand, strobe body, modifier, and the three.js
 * lights produced by `selectLightRig` (SpotLight and/or RectAreaLight).
 *
 * `showFixture = false` hides only the meshes (stand, body, modifier). The
 * lights are deliberately kept *outside* the hidden groups: three.js skips the
 * children of invisible objects, lights included.
 */
export function StudioLight({ light, isSelected, showFixture = true, onSelect }) {
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  const grid = getGridById(light.gridId);
  const spotRef = useRef(null);
  const target = useMemo(() => new Object3D(), []);

  // Shared selectors: the panel shows exactly these values.
  const pose = useMemo(() => selectFixturePose(light), [light.placement]); // eslint-disable-line react-hooks/exhaustive-deps
  const rig = useMemo(() => selectLightRig(light, pose), [light, pose]);

  // Kelvin × gel (after the on/off toggles), mixed spectrally. Luminance = gel
  // transmission, so the gel's light loss scales both light types equally.
  const { colorTempEnabled, colorTempK, gelEnabled, gelId, strobeId } = light;
  const { lightColor, emitColor } = useMemo(() => {
    const resolved = selectLightColor({ colorTempEnabled, colorTempK, gelEnabled, gelId, strobeId });
    return {
      lightColor: new Color().setRGB(...resolved.linearRgb, LinearSRGBColorSpace),
      emitColor: new Color(resolved.displayHex),
    };
  }, [colorTempEnabled, colorTempK, gelEnabled, gelId, strobeId]);

  const spot = rig?.spot;
  const shadow = spot?.shadow;
  useOnDemandShadow(spotRef, {
    mapSize: shadow?.mapSize ?? 0,
    deps: [Boolean(spot), pose, spot?.angle, shadow?.cameraNear, shadow?.cameraFar, light.enabled],
  });

  const beamMap = spot ? getBeamProfileTexture(spot.profile, spot.angle) : null;

  if (!rig) return null;

  const BodyRenderer = resolveRenderer(STROBE_BODY_RENDERERS, strobe.body.shape, 'cylinder');
  const ModifierRenderer = resolveRenderer(MODIFIER_RENDERERS, modifier.geometry.shape, 'none');
  const innerDiffuser = light.innerDiffuser ? modifier.accessories?.innerDiffuser : null;
  const handleClick = (event) => {
    event.stopPropagation();
    onSelect(light.id);
  };

  return (
    <group name={`studio-light-${light.id}`}>
      <group visible={showFixture}>
        <LightStand position={pose.position} />
      </group>

      {/* Invisible meshes still raycast in three.js, so drop the handler when hidden. */}
      <group
        position={pose.position}
        quaternion={pose.quaternion}
        onClick={showFixture ? handleClick : undefined}
      >
        <group visible={showFixture}>
          {BodyRenderer && <BodyRenderer body={strobe.body} isSelected={isSelected} />}
          {ModifierRenderer && (
            <ModifierRenderer
              geometry={modifier.geometry}
              isLit={light.enabled}
              emitColor={emitColor}
              grid={grid}
              innerDiffuser={innerDiffuser}
              focusRod={light.focusRod}
            />
          )}
        </group>
        {rig.area && (
          // RectAreaLight emits along its local -Z; rotate so it faces the fixture's +Z.
          <rectAreaLight
            position={[0, 0, rig.area.offsetZ]}
            rotation={[0, Math.PI, 0]}
            width={rig.area.width}
            height={rig.area.height}
            intensity={rig.area.intensity}
            color={lightColor}
            visible={light.enabled}
          />
        )}
      </group>

      {/* Aim point along the (tilted/panned) beam axis, at the subject's distance. */}
      <primitive object={target} position={pose.aimPoint} />
      {spot && (
        <spotLight
          ref={spotRef}
          position={pose.position}
          target={target}
          visible={light.enabled}
          intensity={spot.intensity}
          color={lightColor}
          angle={spot.angle}
          penumbra={spot.penumbra}
          decay={spot.decay}
          distance={0}
          // `map` must be explicitly null to clear a previous profile.
          map={beamMap}
          castShadow
          // Apparent-size shadows (utils/shadowModel.js): radius ∝ source size / distance.
          shadow-mapSize={[shadow.mapSize, shadow.mapSize]}
          shadow-radius={shadow.radius}
          shadow-bias={shadow.bias}
          shadow-normalBias={shadow.normalBias}
          shadow-camera-near={shadow.cameraNear}
          shadow-camera-far={shadow.cameraFar}
        />
      )}
    </group>
  );
}

import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, LinearSRGBColorSpace, Object3D } from 'three';
import { LIGHT_MODELS } from '../../config/equipmentConfig.js';
import { getGridById, getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import {
  selectFixturePose,
  selectLightColor,
  selectLightRig,
  selectSpotPosition,
} from '../../state/lightSelectors.js';
import { BACKGROUND_SHADOW_REACH } from '../../config/environmentConfig.js';
import { useViewState } from '../../state/viewStore.js';
import { getBeamProfileTexture } from '../../utils/beamProfileTexture.js';
import { parabolicHeadPositionM } from '../../utils/parabolicReflector.js';
import { BeamRaysHelper } from './BeamRaysHelper.jsx';
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
 * `showFixture = false` hides only the meshes (stand, body, modifier, the
 * reflector glow) and the light-ray helper. The lights are deliberately kept
 * *outside* the hidden groups: three.js skips the children of invisible
 * objects, lights included. Neither the glow nor the helper emits light.
 */
export function StudioLight({ light, isSelected, showFixture = true, showLightRays = false, onSelect }) {
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

  // The shadow frustum must reach a distant background wall, or the wall
  // behind the subject is lit where the subject blocks the light. The default
  // margin already covers the wall at its default distance; farther walls add
  // their extra distance (×obliqueFactor for rays that hit the wall at an
  // angle). Depth precision is set by the near plane, so a longer far plane
  // costs nothing at the subject (the bias conversion changes by < 1%).
  const { showBackground, backgroundDistanceM } = useViewState();
  const backgroundExtraM = showBackground
    ? Math.max(0, backgroundDistanceM - BACKGROUND_SHADOW_REACH.coveredDistanceM) * BACKGROUND_SHADOW_REACH.obliqueFactor
    : 0;
  const shadowCameraFar = shadow ? shadow.cameraFar + backgroundExtraM : 0;

  // Per-light slope bias for subject casters (utils/shadowSides.js reads it in
  // the shadow pass). It changes the depth map, so it is a shadow dependency.
  const slopeFactor = shadow?.slopeBias.factor;
  const slopeUnits = shadow?.slopeBias.units;
  useLayoutEffect(() => {
    const shadowCamera = spotRef.current?.shadow?.camera;
    if (shadowCamera) shadowCamera.userData.slopeBias = { factor: slopeFactor, units: slopeUnits };
  }, [slopeFactor, slopeUnits, Boolean(spot)]); // eslint-disable-line react-hooks/exhaustive-deps
  // Parabolics: SpotLight at the virtual apex on the beam axis (beamModel.js).
  const spotPosition = useMemo(() => selectSpotPosition(pose, spot), [pose, spot]);
  useOnDemandShadow(spotRef, {
    mapSize: shadow?.mapSize ?? 0,
    deps: [
      Boolean(spot),
      pose,
      spot?.angle,
      spot?.apexOffsetM,
      shadow?.cameraNear,
      shadowCameraFar,
      slopeFactor,
      light.enabled,
    ],
  });

  const beamMap = spot ? getBeamProfileTexture(spot.profile, spot.angle) : null;

  if (!rig) return null;

  const BodyRenderer = resolveRenderer(STROBE_BODY_RENDERERS, strobe.body.shape, 'cylinder');
  const ModifierRenderer = resolveRenderer(MODIFIER_RENDERERS, modifier.geometry.shape, 'none');
  const innerDiffuser = light.innerDiffuser ? modifier.accessories?.innerDiffuser : null;
  // Parabolics: the strobe rides on the focusing rod, firing back into the dish
  // (rotated 180° about Y so its tube faces the apex and its body the opening).
  const isParabolic = modifier.lighting.model === LIGHT_MODELS.PARABOLIC;
  const bodyTransform = isParabolic
    ? { position: [0, 0, parabolicHeadPositionM(modifier.geometry, light.focusRod)], rotation: [0, Math.PI, 0] }
    : { position: [0, 0, 0], rotation: [0, 0, 0] };
  const handleClick = (event) => {
    event.stopPropagation();
    onSelect(light.id);
  };

  return (
    <group name={`studio-light-${light.id}`}>
      <group visible={showFixture}>
        <LightStand position={pose.position} />
      </group>

      {/* Invisible meshes still raycast in three.js, so drop the handler when
          hidden; no onSelect (camera mode) = not pickable. */}
      <group
        position={pose.position}
        quaternion={pose.quaternion}
        onClick={showFixture && onSelect ? handleClick : undefined}
      >
        <group visible={showFixture}>
          {BodyRenderer && (
            <group {...bodyTransform}>
              <BodyRenderer body={strobe.body} isSelected={isSelected} />
            </group>
          )}
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
          position={spotPosition}
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
          // bias = 2 mm at the subject in depth units; normalBias per SHADOW_CONFIG.
          shadow-mapSize={[shadow.mapSize, shadow.mapSize]}
          shadow-radius={shadow.radius}
          shadow-bias={shadow.bias}
          shadow-normalBias={shadow.normalBias}
          shadow-camera-near={shadow.cameraNear}
          shadow-camera-far={shadowCameraFar}
        />
      )}
      {spot && (
        <BeamRaysHelper
          lightRef={spotRef}
          // Hidden together with the fixtures; never shown for a light that is off.
          visible={showLightRays && showFixture && light.enabled}
          color={emitColor}
          startDistance={spot.exitDistanceM}
          emphasized={isSelected}
        />
      )}
    </group>
  );
}

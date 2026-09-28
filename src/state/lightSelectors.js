/**
 * Derived data for a LightInstance. Both the 3D scene (StudioLight) and the
 * control panel (bottom panel rows, HUD) read through these selectors, so what the panel
 * shows is exactly what three.js renders — toggles can never drift apart.
 */
import {
  getGelById,
  getGridById,
  getModifierById,
  getStrobeById,
  isGelCompatible,
} from '../config/equipmentRegistry.js';
import { MIN_FIXTURE_HEIGHT_M, SUBJECT_TARGET } from '../config/sceneConfig.js';
import { resolveLightRig } from '../utils/beamModel.js';
import { resolveLightColor } from '../utils/colorTemperature.js';
import { computeFixturePose } from '../utils/lightMath.js';

/**
 * Effective color inputs after the on/off toggles:
 *   Kelvin toggle off -> null (neutral white)
 *   Gel toggle off    -> null (no gel), selection is kept for re-enabling
 */
export function getLightColorInputs(light) {
  const gelActive =
    light.gelEnabled && light.gelId != null && isGelCompatible(light.strobeId, light.gelId);
  return {
    kelvin: light.colorTempEnabled ? light.colorTempK : null,
    gel: gelActive ? getGelById(light.gelId) : null,
  };
}

export function selectLightColor(light) {
  const { kelvin, gel } = getLightColorInputs(light);
  return resolveLightColor(kelvin, gel);
}

export const selectFixturePose = (light) =>
  computeFixturePose(light.placement, SUBJECT_TARGET, { minHeight: MIN_FIXTURE_HEIGHT_M });

/**
 * World position of the SpotLight: the fixture origin moved `apexOffsetM` along
 * the beam axis (parabolics sit at their virtual apex, usually behind the dish).
 */
export function selectSpotPosition(pose, spot) {
  const offset = spot?.apexOffsetM ?? 0;
  const scale = offset / pose.distanceToSubject;
  return pose.position.map((value, i) => value + (pose.aimPoint[i] - value) * scale);
}

/** Light rig at the fixture's real 3D distance to the subject (shift included). */
export function selectLightRig(light, pose = selectFixturePose(light)) {
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  if (!strobe || !modifier) return null;
  return resolveLightRig({
    strobe,
    modifier,
    grid: getGridById(light.gridId),
    innerDiffuser: light.innerDiffuser,
    powerLevel: light.powerLevel,
    focusRod: light.focusRod,
    distance: pose.distanceToSubject,
  });
}

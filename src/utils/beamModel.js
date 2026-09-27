/**
 * Maps physical strobe + modifier (+ accessories) characteristics to three.js
 * light parameters. Pure functions only — the scene just renders the returned rig.
 *
 * Pipeline:
 *   1. Energy:   outputWs = maxWs * 2^(powerLevel - 10)                  (f-stop law)
 *   2. Optics:   beam angle / penumbra / profile / gain / emitter size per light model
 *   3. Accessories, in physical order: inner diffuser (inside) -> grid (front)
 *   4. Output:   I_axis [cd] = outputWs * candelaPerWs * 2^(gain - losses)
 *   5. Falloff:  distance decay (virtual source) or area-light geometry
 *   6. Shadows:  apparent source size at the 3D subject distance (shadowModel.js)
 */
import { LIGHT_MODELS } from '../config/equipmentConfig.js';
import { FOCUS_ROD_LIMITS, RENDER_CONFIG } from '../config/sceneConfig.js';
import { clamp, lerp, powerLevelToWs } from './lightMath.js';
import { computeShadowParams } from './shadowModel.js';

const DEG_TO_RAD = Math.PI / 180;
/** three.js SpotLight angle must stay below 90°. */
const MAX_SPOT_HALF_ANGLE = Math.PI / 2 - 0.01;
/** Lowest decay we allow three.js to use (strongly collimated beams). */
const MIN_DECAY = 0.5;
/** Fallback emitter size when a modifier defines neither diameter nor sourceDiameterM. */
const DEFAULT_SOURCE_DIAMETER_M = 0.1;

export const DEFAULT_BEAM_PROFILE = Object.freeze({
  hotspotRadius: 1,
  hotspotGain: 0,
  centerDip: 0,
  edgeStart: 1,
});

const normalizeProfile = (profile) => (profile ? { ...DEFAULT_BEAM_PROFILE, ...profile } : null);

const isFlatProfile = (profile) =>
  !profile || (profile.hotspotGain <= 0 && profile.centerDip <= 0 && profile.edgeStart >= 1);

function lerpProfile(from, to, t) {
  const a = normalizeProfile(from) ?? DEFAULT_BEAM_PROFILE;
  const b = normalizeProfile(to) ?? DEFAULT_BEAM_PROFILE;
  return Object.fromEntries(Object.keys(DEFAULT_BEAM_PROFILE).map((key) => [key, lerp(a[key], b[key], t)]));
}

const toSpotHalfAngle = (beamAngleDeg) =>
  Math.min((beamAngleDeg / 2) * DEG_TO_RAD, MAX_SPOT_HALF_ANGLE);

/** Normalized focusing-rod position: 0 = spot, 1 = flood. */
export const focusRodToT = (focusRod) =>
  clamp(focusRod ?? FOCUS_ROD_LIMITS.default, FOCUS_ROD_LIMITS.min, FOCUS_ROD_LIMITS.max) /
  FOCUS_ROD_LIMITS.max;

// ---------------------------------------------------------------------------
// Optics per light model
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ResolvedOptics
 * @property {number} beamAngleDeg
 * @property {number} penumbra
 * @property {number} centerGainStops
 * @property {number} virtualSourceOffsetM
 * @property {number} sourceDiameterM       Effective emitter diameter seen from the subject.
 * @property {object | null} profile
 * @property {number} extraLossStops        Losses from accessories.
 */

/** Plain optics read from a spot-type modifier. */
function readSpotOptics({ lighting, geometry }) {
  return {
    beamAngleDeg: lighting.beamAngleDeg,
    penumbra: lighting.penumbra,
    centerGainStops: lighting.centerGainStops ?? 0,
    virtualSourceOffsetM: lighting.virtualSourceOffsetM ?? 0,
    sourceDiameterM:
      lighting.sourceDiameterM ??
      (geometry.diameter ?? DEFAULT_SOURCE_DIAMETER_M) * (lighting.sourceSizeFraction ?? 1),
    profile: normalizeProfile(lighting.profile),
    extraLossStops: 0,
  };
}

/**
 * Parabolic focusing rod: every optical parameter is interpolated linearly
 * between the `spot` (rod = 0) and `flood` (rod = 100) calibration points.
 *   t = rod / 100
 *   angle    = lerp(spot.angle,    flood.angle,    t)
 *   penumbra = lerp(spot.penumbra, flood.penumbra, t)
 *   D_eff    = diameter · lerp(spot.sourceSizeFraction, flood.sourceSizeFraction, t)
 * Focused, only a small hot area of the dish is lit (near point source, hard
 * shadows); flooded, the whole reflector glows (large source, soft shadows).
 * The spot end also adds on-axis gain (punch) and a collimated throw; the flood
 * end adds a center dip where the head and rod shadow the reflector apex.
 */
export function resolveParabolicOptics({ lighting, geometry }, focusRod) {
  const t = focusRodToT(focusRod);
  const { spot, flood } = lighting.focus;
  const mix = (key, fallback = 0) => lerp(spot[key] ?? fallback, flood[key] ?? fallback, t);
  return {
    beamAngleDeg: mix('beamAngleDeg'),
    penumbra: mix('penumbra'),
    centerGainStops: mix('centerGainStops'),
    virtualSourceOffsetM: mix('virtualSourceOffsetM'),
    sourceDiameterM: geometry.diameter * mix('sourceSizeFraction', 1),
    profile: lerpProfile(spot.profile, flood.profile, t),
    extraLossStops: 0,
  };
}

/**
 * Inner diffuser (inside the modifier, before any front grid):
 *   loss      += diffuser.lightLossStops                       (−1 EV for the 35D)
 *   angle     += beamAngleAddDeg, penumbra += penumbraAdd      (scattering)
 *   hotspot   *= (1 − hotspotFlatten)                          (flatter beam)
 *   D_eff      = max(D_eff · sourceSizeGain, D · sourceSizeMinFraction)
 * The larger emitter is what makes the shadows spread (see shadowModel.js).
 */
export function applyInnerDiffuser(optics, diffuser, modifierDiameterM) {
  if (!diffuser) return optics;
  const profile = optics.profile && {
    ...optics.profile,
    hotspotGain: optics.profile.hotspotGain * (1 - diffuser.hotspotFlatten),
  };
  return {
    ...optics,
    beamAngleDeg: optics.beamAngleDeg + diffuser.beamAngleAddDeg,
    penumbra: clamp(optics.penumbra + diffuser.penumbraAdd, 0, 1),
    sourceDiameterM: Math.max(
      optics.sourceDiameterM * diffuser.sourceSizeGain,
      modifierDiameterM * diffuser.sourceSizeMinFraction,
    ),
    profile,
    extraLossStops: optics.extraLossStops + diffuser.lightLossStops,
  };
}

/**
 * A grid strictly limits the beam (see GRIDS in equipmentConfig.js):
 *   angle    = min(host angle, grid angle)       e.g. 35D flood 60° -> 40°
 *   penumbra = min(host penumbra, grid penumbra)
 *   profile  = { ...host, ...grid.profile }      edge cut -> spill falls off fast
 *   D_eff   *= grid.sourceSizeFactor
 * The reflector's throw (virtual source) is kept.
 */
export function applyGrid(optics, grid) {
  if (!grid) return optics;
  return {
    ...optics,
    beamAngleDeg: Math.min(grid.beamAngleDeg, optics.beamAngleDeg),
    penumbra: Math.min(grid.penumbra, optics.penumbra),
    sourceDiameterM: optics.sourceDiameterM * (grid.sourceSizeFactor ?? 1),
    profile: { ...(optics.profile ?? DEFAULT_BEAM_PROFILE), ...grid.profile },
    extraLossStops: optics.extraLossStops + grid.lightLossStops,
  };
}

// ---------------------------------------------------------------------------
// Falloff
// ---------------------------------------------------------------------------

/**
 * Distance decay with a virtual source offset d0 behind the fixture.
 *   Physical:  E(d) = I * ((dRef + d0) / (d + d0))^2        (calibrated at dRef)
 *   three.js:  E(d) = I3 / d^decay
 * Matching value and local slope at the subject distance d gives:
 *   decay = 2d / (d + d0)          (d0 = 0 -> 2, true inverse square)
 *   I3    = E(d) * d^decay
 * Compact hard sources (beauty dish, bare reflector) keep d0 = 0 so light
 * falls off fast off the highlight — the classic hard-light contrast.
 */
export function computeDistanceFalloff(onAxisCd, distance, virtualSourceOffsetM = 0) {
  const d = Math.max(distance, 0.05);
  const d0 = Math.max(virtualSourceOffsetM, 0);
  const dRef = RENDER_CONFIG.calibrationDistanceM;
  const illuminance = onAxisCd * ((dRef + d0) / (d + d0)) ** 2;
  const decay = Math.max((2 * d) / (d + d0), MIN_DECAY);
  return { decay, intensity: illuminance * d ** decay, illuminance };
}

/**
 * Emitting surface of an area modifier, derived from its geometry.
 * Octagons are converted to a square of equal area (RectAreaLight is rectangular):
 *   A_octa = 2√2 · R²   (R = circumradius = diameter / 2)
 * `diameterM` is the equal-area disk diameter 2·√(A/π), used for shadows.
 */
export function getAreaEmitter(geometry) {
  let emitter;
  if (geometry.shape === 'octaSoftbox') {
    const radius = geometry.diameter / 2;
    const area = 2 * Math.SQRT2 * radius ** 2;
    const side = Math.sqrt(area);
    emitter = { width: side, height: side, area };
  } else {
    const { width, height } = geometry;
    emitter = { width, height, area: width * height };
  }
  return { ...emitter, diameterM: 2 * Math.sqrt(emitter.area / Math.PI) };
}

/**
 * Effective decay exponent of a Lambertian disk of equal area on its axis:
 *   E(d) ∝ R² / (R² + d²)   ->   n(d) = -dlnE/dlnd = 2d² / (R² + d²)
 * Close to a big box the light falls off much slower than inverse square.
 * (Informational — RectAreaLight computes this geometrically.)
 */
export function areaEffectiveDecay(area, distance) {
  const radiusSq = area / Math.PI;
  return (2 * distance ** 2) / (radiusSq + distance ** 2);
}

/** Emitter size of the modifier itself (before rod/diffuser/grid), for accessory bounds. */
function getModifierDiameter(modifier) {
  return modifier.geometry.diameter ?? modifier.lighting.sourceDiameterM ?? DEFAULT_SOURCE_DIAMETER_M;
}

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LightRig
 * @property {string} model
 * @property {number} outputWs
 * @property {number} onAxisCd       Calibrated on-axis intensity at 1 m.
 * @property {null | { intensity: number, angle: number, penumbra: number, decay: number,
 *   profile: object | null, shadow: ReturnType<typeof computeShadowParams> }} spot
 * @property {null | { intensity: number, width: number, height: number, offsetZ: number }} area
 * @property {Object} info           Human-readable summary for the UI.
 */

/**
 * Builds the render-ready light rig for a light instance.
 * @param {{ strobe: object, modifier: object, grid?: object | null,
 *   innerDiffuser?: boolean, powerLevel: number, focusRod?: number,
 *   distance: number }} params  `distance` = 3D light-to-subject distance.
 * @returns {LightRig}
 */
export function resolveLightRig({
  strobe,
  modifier,
  grid = null,
  innerDiffuser = false,
  powerLevel,
  focusRod,
  distance,
}) {
  const { lighting } = modifier;
  const model = lighting.model ?? LIGHT_MODELS.SPOT;
  const outputWs = powerLevelToWs(strobe.maxWs, powerLevel);

  if (model === LIGHT_MODELS.AREA) {
    return resolveAreaRig({ modifier, outputWs, distance });
  }

  const baseOptics =
    model === LIGHT_MODELS.PARABOLIC ? resolveParabolicOptics(modifier, focusRod) : readSpotOptics(modifier);
  const diffuser = innerDiffuser ? (modifier.accessories?.innerDiffuser ?? null) : null;
  const optics = applyGrid(applyInnerDiffuser(baseOptics, diffuser, getModifierDiameter(modifier)), grid);

  const lossStops = lighting.lightLossStops + optics.extraLossStops;
  const onAxisCd =
    outputWs * RENDER_CONFIG.candelaPerWattSecond * 2 ** (optics.centerGainStops - lossStops);
  const falloff = computeDistanceFalloff(onAxisCd, distance, optics.virtualSourceOffsetM);
  const angle = toSpotHalfAngle(optics.beamAngleDeg);
  const shadow = computeShadowParams({ sourceDiameterM: optics.sourceDiameterM, distance, halfAngle: angle });

  return {
    model,
    outputWs,
    onAxisCd,
    spot: {
      intensity: falloff.intensity,
      angle,
      penumbra: clamp(optics.penumbra, 0, 1),
      decay: falloff.decay,
      profile: isFlatProfile(optics.profile) ? null : optics.profile,
      shadow,
    },
    area: null,
    info: {
      distance,
      beamAngleDeg: optics.beamAngleDeg,
      penumbra: optics.penumbra,
      decay: falloff.decay,
      footprintM: 2 * distance * Math.tan(angle),
      gainStops: optics.centerGainStops,
      lossStops,
      sourceDiameterM: optics.sourceDiameterM,
      shadow,
    },
  };
}

/**
 * Softboxes: RectAreaLight luminance L = I / A, so the on-axis intensity
 * (L · A) matches the same energy as a point source, while near-field falloff,
 * wrap and specular shape come from the real diffuser size. A small share of
 * the energy goes to a soft SpotLight purely to cast shadows; its softness uses
 * the diffuser's equal-area diameter at the 3D subject distance.
 */
function resolveAreaRig({ modifier, outputWs, distance }) {
  const { lighting, geometry } = modifier;
  const emitter = getAreaEmitter(geometry);
  const lossStops = lighting.lightLossStops;
  const onAxisCd = outputWs * RENDER_CONFIG.candelaPerWattSecond * 2 ** -lossStops;
  const proxyShare = clamp(RENDER_CONFIG.areaShadowProxyShare, 0, 1);
  const angle = toSpotHalfAngle(lighting.beamAngleDeg);
  const diffuserDistance = Math.max(distance - (geometry.depth ?? 0), 0.05);
  const shadow = computeShadowParams({
    sourceDiameterM: emitter.diameterM,
    distance: diffuserDistance,
    halfAngle: angle,
  });

  return {
    model: LIGHT_MODELS.AREA,
    outputWs,
    onAxisCd,
    spot:
      proxyShare > 0
        ? {
            intensity: onAxisCd * proxyShare,
            angle,
            penumbra: clamp(lighting.penumbra, 0, 1),
            decay: 2,
            profile: null,
            shadow,
          }
        : null,
    area: {
      intensity: (onAxisCd * (1 - proxyShare)) / emitter.area,
      width: emitter.width,
      height: emitter.height,
      offsetZ: (geometry.depth ?? 0) + 0.002, // just in front of the diffuser mesh
    },
    info: {
      distance,
      beamAngleDeg: lighting.beamAngleDeg,
      penumbra: lighting.penumbra,
      decay: areaEffectiveDecay(emitter.area, diffuserDistance),
      footprintM: 2 * distance * Math.tan(angle),
      gainStops: 0,
      lossStops,
      emitterAreaM2: emitter.area,
      sourceDiameterM: emitter.diameterM,
      shadow,
    },
  };
}

/**
 * Maps physical strobe + modifier (+ grid) characteristics to three.js light
 * parameters. Pure functions only — the scene just renders the returned rig.
 *
 * Pipeline:
 *   1. Energy:   outputWs = maxWs * 2^(powerLevel - 10)                  (f-stop law)
 *   2. Optics:   beam angle / penumbra / profile / gain per light model
 *   3. Output:   I_axis [cd] = outputWs * candelaPerWs * 2^(gain - losses)
 *   4. Falloff:  distance decay (virtual source) or area-light geometry
 */
import { LIGHT_MODELS } from '../config/equipmentConfig.js';
import { FOCUS_ROD_LIMITS, RENDER_CONFIG } from '../config/sceneConfig.js';
import { clamp, lerp, powerLevelToWs } from './lightMath.js';

const DEG_TO_RAD = Math.PI / 180;
/** three.js SpotLight angle must stay below 90°. */
const MAX_SPOT_HALF_ANGLE = Math.PI / 2 - 0.01;
/** Lowest decay we allow three.js to use (strongly collimated beams). */
const MIN_DECAY = 0.5;

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

// ---------------------------------------------------------------------------
// Optics per light model
// ---------------------------------------------------------------------------

/** Plain optics read from a spot-type modifier. */
function readSpotOptics(lighting) {
  return {
    beamAngleDeg: lighting.beamAngleDeg,
    penumbra: lighting.penumbra,
    centerGainStops: lighting.centerGainStops ?? 0,
    virtualSourceOffsetM: lighting.virtualSourceOffsetM ?? 0,
    shadowSoftness: lighting.shadowSoftness,
    profile: normalizeProfile(lighting.profile),
  };
}

/**
 * Parabolic focusing rod: every optical parameter is interpolated linearly
 * between the `spot` (rod = 0) and `flood` (rod = 100) calibration points.
 *   t = rod / 100
 *   angle    = lerp(spot.angle,    flood.angle,    t)
 *   penumbra = lerp(spot.penumbra, flood.penumbra, t)
 * The spot end adds on-axis gain (punch) and a large virtual-source offset
 * (collimated throw); the flood end adds a center dip where the head and rod
 * shadow the reflector apex.
 */
export function resolveParabolicOptics(lighting, focusRod) {
  const t = clamp(focusRod ?? FOCUS_ROD_LIMITS.default, FOCUS_ROD_LIMITS.min, FOCUS_ROD_LIMITS.max) /
    FOCUS_ROD_LIMITS.max;
  const { spot, flood } = lighting.focus;
  const mix = (key) => lerp(spot[key] ?? 0, flood[key] ?? 0, t);
  return {
    beamAngleDeg: mix('beamAngleDeg'),
    penumbra: mix('penumbra'),
    centerGainStops: mix('centerGainStops'),
    virtualSourceOffsetM: mix('virtualSourceOffsetM'),
    shadowSoftness: mix('shadowSoftness'),
    profile: lerpProfile(spot.profile, flood.profile, t),
  };
}

/**
 * A grid strictly limits the beam: angle is forced to the grid's rating
 * (never wider than the host reflector), penumbra becomes near-zero and the
 * profile gets a steep edge cut. Throw (virtual source) of the reflector is kept.
 */
export function applyGrid(optics, grid) {
  if (!grid) return { ...optics, extraLossStops: 0 };
  return {
    beamAngleDeg: Math.min(grid.beamAngleDeg, optics.beamAngleDeg),
    penumbra: grid.penumbra,
    centerGainStops: optics.centerGainStops,
    virtualSourceOffsetM: optics.virtualSourceOffsetM,
    shadowSoftness: Math.min(grid.shadowSoftness, optics.shadowSoftness),
    profile: normalizeProfile(grid.profile),
    extraLossStops: grid.lightLossStops,
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
 */
export function getAreaEmitter(geometry) {
  if (geometry.shape === 'octaSoftbox') {
    const radius = geometry.diameter / 2;
    const area = 2 * Math.SQRT2 * radius ** 2;
    const side = Math.sqrt(area);
    return { width: side, height: side, area };
  }
  const { width, height } = geometry;
  return { width, height, area: width * height };
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

const toSpotHalfAngle = (beamAngleDeg) =>
  Math.min((beamAngleDeg / 2) * DEG_TO_RAD, MAX_SPOT_HALF_ANGLE);

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LightRig
 * @property {string} model
 * @property {number} outputWs
 * @property {number} onAxisCd       Calibrated on-axis intensity at 1 m.
 * @property {null | {
 *   intensity: number, angle: number, penumbra: number, decay: number,
 *   shadowRadius: number, profile: object | null }} spot
 * @property {null | { intensity: number, width: number, height: number, offsetZ: number }} area
 * @property {{ beamAngleDeg: number, penumbra: number, decay: number,
 *   footprintM: number, gainStops: number, lossStops: number }} info
 */

/**
 * Builds the render-ready light rig for a light instance.
 * @param {{ strobe: object, modifier: object, grid?: object | null,
 *   powerLevel: number, focusRod?: number, distance: number }} params
 * @returns {LightRig}
 */
export function resolveLightRig({ strobe, modifier, grid = null, powerLevel, focusRod, distance }) {
  const { lighting } = modifier;
  const model = lighting.model ?? LIGHT_MODELS.SPOT;
  const outputWs = powerLevelToWs(strobe.maxWs, powerLevel);

  if (model === LIGHT_MODELS.AREA) {
    return resolveAreaRig({ modifier, outputWs, distance });
  }

  const baseOptics =
    model === LIGHT_MODELS.PARABOLIC ? resolveParabolicOptics(lighting, focusRod) : readSpotOptics(lighting);
  // Grids are only meaningful for spot-type reflectors.
  const optics = applyGrid(baseOptics, model === LIGHT_MODELS.SPOT ? grid : null);

  const lossStops = lighting.lightLossStops + optics.extraLossStops;
  const onAxisCd =
    outputWs * RENDER_CONFIG.candelaPerWattSecond * 2 ** (optics.centerGainStops - lossStops);
  const falloff = computeDistanceFalloff(onAxisCd, distance, optics.virtualSourceOffsetM);
  const angle = toSpotHalfAngle(optics.beamAngleDeg);

  return {
    model,
    outputWs,
    onAxisCd,
    spot: {
      intensity: falloff.intensity,
      angle,
      penumbra: clamp(optics.penumbra, 0, 1),
      decay: falloff.decay,
      shadowRadius: optics.shadowSoftness,
      profile: isFlatProfile(optics.profile) ? null : optics.profile,
    },
    area: null,
    info: {
      beamAngleDeg: optics.beamAngleDeg,
      penumbra: optics.penumbra,
      decay: falloff.decay,
      footprintM: 2 * distance * Math.tan(angle),
      gainStops: optics.centerGainStops,
      lossStops,
    },
  };
}

/**
 * Softboxes: RectAreaLight luminance L = I / A, so the on-axis intensity
 * (L · A) matches the same energy as a point source, while near-field falloff,
 * wrap and specular shape come from the real diffuser size. A small share of
 * the energy goes to a soft SpotLight purely to cast shadows.
 */
function resolveAreaRig({ modifier, outputWs, distance }) {
  const { lighting, geometry } = modifier;
  const emitter = getAreaEmitter(geometry);
  const lossStops = lighting.lightLossStops;
  const onAxisCd = outputWs * RENDER_CONFIG.candelaPerWattSecond * 2 ** -lossStops;
  const proxyShare = clamp(RENDER_CONFIG.areaShadowProxyShare, 0, 1);
  const angle = toSpotHalfAngle(lighting.beamAngleDeg);
  const diffuserDistance = Math.max(distance - (geometry.depth ?? 0), 0.05);

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
            shadowRadius: lighting.shadowSoftness,
            profile: null,
          }
        : null,
    area: {
      intensity: (onAxisCd * (1 - proxyShare)) / emitter.area,
      width: emitter.width,
      height: emitter.height,
      offsetZ: (geometry.depth ?? 0) + 0.002, // just in front of the diffuser mesh
    },
    info: {
      beamAngleDeg: lighting.beamAngleDeg,
      penumbra: lighting.penumbra,
      decay: areaEffectiveDecay(emitter.area, diffuserDistance),
      footprintM: 2 * distance * Math.tan(angle),
      gainStops: 0,
      lossStops,
      emitterAreaM2: emitter.area,
    },
  };
}

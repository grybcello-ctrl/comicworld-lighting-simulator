/**
 * Maps physical strobe + modifier (+ accessories) characteristics to three.js
 * light parameters. Pure functions only — the scene just renders the returned rig.
 *
 * Pipeline:
 *   1. Energy:   outputWs = maxWs * 2^(powerLevel - 10)                  (f-stop law)
 *   2. Optics:   beam angle / penumbra / profile / gain / emitter size per light model
 *   3. Accessories, in physical order: inner diffuser (inside) -> grid (front)
 *   4. Output:   spot/area: I_axis [cd] = outputWs * candelaPerWs * 2^(gain - losses)
 *                parabolic: energy-conserving, I = Φ / Ω_eff (resolveParabolicRig)
 *   5. Falloff:  distance decay (virtual source), exact cone geometry (parabolic)
 *                or area-light geometry
 *   6. Shadows:  apparent source size at the 3D subject distance (shadowModel.js)
 */
import { LIGHT_MODELS } from '../config/equipmentConfig.js';
import { RENDER_CONFIG } from '../config/sceneConfig.js';
import {
  DEFAULT_BEAM_PROFILE,
  effectiveSolidAngle,
  evaluateBeamProfile,
  isFlatProfile,
  normalizeProfile,
} from './beamProfile.js';
import { focusRodToT } from './focusRod.js';
import { clamp, lerp, powerLevelToWs } from './lightMath.js';
import { parabolicHeadPositionM, reflectorGlowProfile } from './parabolicReflector.js';
import { computeShadowParams } from './shadowModel.js';

export { DEFAULT_BEAM_PROFILE };

const DEG_TO_RAD = Math.PI / 180;
/** three.js SpotLight angle must stay below 90°. */
const MAX_SPOT_HALF_ANGLE = Math.PI / 2 - 0.01;
/** Lowest decay we allow three.js to use (strongly collimated beams). */
const MIN_DECAY = 0.5;
/** Fallback emitter size when a modifier defines neither diameter nor sourceDiameterM. */
const DEFAULT_SOURCE_DIAMETER_M = 0.1;

function lerpProfile(from, to, t) {
  const a = normalizeProfile(from) ?? DEFAULT_BEAM_PROFILE;
  const b = normalizeProfile(to) ?? DEFAULT_BEAM_PROFILE;
  return Object.fromEntries(Object.keys(DEFAULT_BEAM_PROFILE).map((key) => [key, lerp(a[key], b[key], t)]));
}

const toSpotHalfAngle = (beamAngleDeg) =>
  Math.min((beamAngleDeg / 2) * DEG_TO_RAD, MAX_SPOT_HALF_ANGLE);

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
 * Parabolic focusing rod: the optical calibration points are interpolated
 * linearly between `spot` (rod = 0, head pushed deep inside to the focal point)
 * and `flood` (rod = 100, head pulled out towards the opening); head travel is
 * parabolicHeadPositionM.
 *   t = rod / 100
 *   angle    = lerp(spot.angle,    flood.angle,    t)
 *   penumbra = lerp(spot.penumbra, flood.penumbra, t)       narrow edge -> wide
 *   D_eff    = diameter · lerp(spot.sourceSizeFraction, flood.sourceSizeFraction, t)
 *   profile  = lerp(spot.profile, flood.profile, t)          hot spot -> flattened
 * Intensity is NOT interpolated: it follows from energy conservation in
 * resolveParabolicRig, so the narrow, concentrated spot gets brighter by itself.
 */
export function resolveParabolicOptics({ lighting, geometry }, focusRod) {
  const t = focusRodToT(focusRod);
  const { spot, flood } = lighting.focus;
  const mix = (key, fallback = 0) => lerp(spot[key] ?? fallback, flood[key] ?? fallback, t);
  return {
    beamAngleDeg: mix('beamAngleDeg'),
    penumbra: mix('penumbra'),
    centerGainStops: 0,
    virtualSourceOffsetM: 0,
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
  if (model === LIGHT_MODELS.PARABOLIC) {
    return resolveParabolicRig({ modifier, optics, outputWs, lossStops, distance, focusRod });
  }

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
      // SpotLight apex = fixture origin; rays helper starts at the modifier front.
      apexOffsetM: 0,
      exitDistanceM: modifier.geometry.depth ?? 0.03,
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
 * Parabolic reflectors: exact cone geometry + energy conservation.
 *
 * Geometry — every reflected ray leaves the aperture (radius R at z = depth)
 * within the half angle α, so the beam is the cone through the aperture rim
 * whose apex sits behind it at
 *   a = R / tan α                     (virtual apex, behind the aperture)
 * The SpotLight is placed at that apex (apexOffsetM = depth − a along the beam
 * axis, usually behind the fixture) with decay = 2. Its footprint then equals
 * the real beam, 2·(R + d_ap·tan α), and its falloff is exactly the spreading of
 * that cone: focused (α small, a large) -> collimated "throw"; flooded ->
 * faster, but still flatter than a point source at the dish.
 *
 * Energy — the beam flux is fixed by the flash energy:
 *   Φ = outputWs · candelaPerWs · Ω_ref · 2^(−losses)
 *   I = Φ / Ω_eff,   Ω_eff = 2π ∫ A(θ) · M(θ) · sin θ dθ     (beamProfile.js)
 * Spot: small α, hot-spot profile -> tiny Ω_eff -> high, punchy center intensity.
 * Flood: wide α, flattened profile M ∝ 1/cos³θ (no center peaking on the
 * subject plane) -> the same energy spread evenly.
 *
 * Shadows use the lit emitter size D_eff at the aperture-to-subject distance,
 * while the shadow frustum spans the real beam at the apex-to-subject distance.
 */
function resolveParabolicRig({ modifier, optics, outputWs, lossStops, distance, focusRod }) {
  const { geometry } = modifier;
  const radius = geometry.diameter / 2;
  const angle = toSpotHalfAngle(optics.beamAngleDeg);
  const penumbra = clamp(optics.penumbra, 0, 1);

  // Flatten over the three.js plateau (inner cone), or up to a grid's edge cut.
  const baseProfile = optics.profile ?? normalizeProfile({});
  const profile = {
    ...baseProfile,
    flattenEdge: Math.min(1 - penumbra, baseProfile.edgeStart),
  };

  const apexBehindApertureM = radius / Math.tan(angle);
  const apexOffsetM = geometry.depth - apexBehindApertureM;
  const apexToSubjectM = Math.max(distance - apexOffsetM, 0.1);
  const apertureToSubjectM = Math.max(distance - geometry.depth, 0.05);

  const solidAngleSr = effectiveSolidAngle(profile, angle, penumbra);
  const fluxAtReference =
    outputWs *
    RENDER_CONFIG.candelaPerWattSecond *
    RENDER_CONFIG.referenceBeamSolidAngleSr *
    2 ** -lossStops;
  const intensity = fluxAtReference / solidAngleSr;
  const centerValue = evaluateBeamProfile(profile, 0, angle);
  const onAxisCd = intensity * centerValue;

  const shadow = computeShadowParams({
    sourceDiameterM: optics.sourceDiameterM,
    distance: apertureToSubjectM,
    halfAngle: angle,
    frustumDistance: apexToSubjectM,
  });
  const headZ = parabolicHeadPositionM(geometry, focusRod);

  return {
    model: LIGHT_MODELS.PARABOLIC,
    outputWs,
    onAxisCd,
    spot: {
      intensity,
      angle,
      penumbra,
      decay: 2,
      profile: isFlatProfile(profile) ? null : profile,
      shadow,
      apexOffsetM,
      // Rays helper: the beam leaves the dish at the aperture plane.
      exitDistanceM: apexBehindApertureM,
    },
    area: null,
    info: {
      distance,
      beamAngleDeg: optics.beamAngleDeg,
      penumbra,
      // Local falloff exponent vs. fixture distance: E ∝ 1/(d − apexOffset)².
      decay: (2 * distance) / apexToSubjectM,
      footprintM: 2 * apexToSubjectM * Math.tan(angle),
      // Center concentration vs. a flat 1 sr reference beam (energy conserving).
      gainStops: Math.log2((RENDER_CONFIG.referenceBeamSolidAngleSr * centerValue) / solidAngleSr),
      lossStops,
      sourceDiameterM: optics.sourceDiameterM,
      shadow,
      parabolic: {
        headZ,
        headDepthFraction: headZ / geometry.depth,
        apexBehindApertureM,
        solidAngleSr,
        flatten: profile.flatten,
        glowCoverage: reflectorGlowProfile(geometry, headZ, []).coverage,
      },
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
            apexOffsetM: 0,
            exitDistanceM: geometry.depth ?? 0,
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

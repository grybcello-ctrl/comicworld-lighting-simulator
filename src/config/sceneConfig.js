/** Scene-level constants (units: meters, degrees). */

/** World-space point every light aims at (center of the mannequin's head). */
export const SUBJECT_TARGET = Object.freeze([0, 1.62, 0]);

/** Camera framings selectable from the panel. */
export const CAMERA_VIEWS = Object.freeze({
  // Full 1.75 m mannequin with some headroom for the fixtures.
  fullBody: { label: 'Full body', position: [0, 1.15, 5.2], target: [0, 0.95, 0] },
  // Close-up to inspect skin micro-texture and specular breakup.
  face: { label: 'Face close-up', position: [0.2, 1.66, 0.62], target: [0, 1.62, 0] },
});

export const CAMERA_CONFIG = Object.freeze({
  position: CAMERA_VIEWS.fullBody.position,
  fov: 35,
  orbitTarget: CAMERA_VIEWS.fullBody.target,
  minDistance: 0.25,
  maxDistance: 15,
  // Allow slightly below the horizon, but never under the floor.
  maxPolarAngle: Math.PI / 2 + 0.15,
});

export const RENDER_CONFIG = Object.freeze({
  // Converts strobe energy (Ws) into three.js spot light intensity (candela).
  // Tune this to calibrate overall exposure.
  // Calibrated so a 600Ws key at 1/8 power through an octabox at ~1.8m reads
  // as a normal exposure with three.js physically based lighting.
  candelaPerWattSecond: 0.4,
  // Distance (m) at which on-axis intensity is calibrated for every model.
  calibrationDistanceM: 1,
  // Softboxes: RectAreaLight cannot cast shadows in three.js, so this share of
  // the energy is carried by a soft, shadow-casting SpotLight at the same spot.
  areaShadowProxyShare: 0.3,
  // Resolution of the generated SpotLight beam-profile textures.
  beamProfileTextureSize: 128,
  ambientIntensity: 0.15,
  backgroundColor: '#1a1a1d',
});

/**
 * Apparent-size shadow model (see src/utils/shadowModel.js).
 * three.js r186 PCF samples a Vogel disk of radius `shadow.radius` texels,
 * so the blur's full width is 2 · radius · texel.
 */
export const SHADOW_CONFIG = Object.freeze({
  // Occluder-to-receiver gap used to size penumbrae (nose→cheek, arm→torso).
  referenceOccluderGapM: 0.1,
  // World size of one shadow texel at the subject. Constant texel size makes
  // shadow.radius directly proportional to the physical penumbra (∝ D / d).
  targetTexelM: 0.004,
  // Map size follows the beam footprint: N = F / texel, clamped, rounded up to a step.
  minMapSize: 256,
  maxMapSize: 2048,
  mapSizeStep: 64,
  minRadius: 0.5,
  // r186's PCF uses 5 Vogel taps; beyond ~12 texels the blur turns grainy.
  maxRadius: 12,
  depthBias: -0.0002,
  // normalBias = texel world size * factor (clamped), avoids acne on big texels.
  normalBiasTexels: 1.5,
  minNormalBias: 0.002,
  maxNormalBias: 0.04,
  cameraNearM: 0.05,
  // Shadow camera far plane = distance to subject + margin (tighter = more depth precision).
  cameraFarMarginM: 6,
});

/** Light color when the Kelvin toggle is off: neutral screen white (sRGB D65 white point). */
export const COLOR_CONFIG = Object.freeze({ neutralWhiteReferenceK: 6504 });

/** Procedural skin micro-relief (src/utils/skinTexture.js). */
export const SKIN_CONFIG = Object.freeze({
  textureSize: 512,
  // World size of one texture tile. Pores ≈ tileSize / poreCells apart.
  tileSizeM: 0.04,
  poreCells: 44,
  plateCells: 11,
  normalScale: 0.9,
  roughnessRange: [0.42, 0.62],
  seed: 1337,
});

/** Slider limits for light placement controls. */
export const PLACEMENT_LIMITS = Object.freeze({
  azimuthDeg: { min: -180, max: 180, step: 1 },
  elevationDeg: { min: -30, max: 85, step: 1 },
  distance: { min: 0.8, max: 5, step: 0.05 },
  // Shift: world-space translation (meters) applied after the orbit placement.
  shiftX: { min: -2, max: 2, step: 0.01 },
  shiftY: { min: -2, max: 2, step: 0.01 },
  shiftZ: { min: -2, max: 2, step: 0.01 },
  // Tilt / pan / roll: rotation offsets (degrees) from "aimed at the subject".
  tiltDeg: { min: -60, max: 60, step: 1 },
  panDeg: { min: -60, max: 60, step: 1 },
  rollDeg: { min: -90, max: 90, step: 1 },
});

/** Lowest allowed fixture height (keeps shifted lights above the floor). */
export const MIN_FIXTURE_HEIGHT_M = 0.1;

/** Parabolic focusing rod: 0 = fully focused (spot), 100 = fully flooded. */
export const FOCUS_ROD_LIMITS = Object.freeze({ min: 0, max: 100, step: 1, default: 30 });

/** Scene-level constants (units: meters, degrees). */

/** World-space point every light aims at (center of the mannequin's head). */
export const SUBJECT_TARGET = Object.freeze([0, 1.62, 0]);

export const CAMERA_CONFIG = Object.freeze({
  // Frames the full 1.75 m mannequin with some headroom for the fixtures.
  position: [0, 1.15, 5.2],
  fov: 35,
  orbitTarget: [0, 0.95, 0],
  minDistance: 0.6,
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
  shadowMapSize: 1024,
  backgroundColor: '#1a1a1d',
});

/** Slider limits for light placement controls. */
export const PLACEMENT_LIMITS = Object.freeze({
  azimuthDeg: { min: -180, max: 180, step: 1 },
  elevationDeg: { min: -30, max: 85, step: 1 },
  distance: { min: 0.8, max: 5, step: 0.05 },
});

/** Parabolic focusing rod: 0 = fully focused (spot), 100 = fully flooded. */
export const FOCUS_ROD_LIMITS = Object.freeze({ min: 0, max: 100, step: 1, default: 30 });

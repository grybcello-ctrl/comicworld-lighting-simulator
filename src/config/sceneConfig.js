/** Scene-level constants (units: meters, degrees). */

/** World-space point every light aims at (center of the bust's head). */
export const SUBJECT_TARGET = Object.freeze([0, 1.46, 0]);

export const CAMERA_CONFIG = Object.freeze({
  position: [0, 1.55, 3.4],
  fov: 35,
  orbitTarget: [0, 1.35, 0],
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

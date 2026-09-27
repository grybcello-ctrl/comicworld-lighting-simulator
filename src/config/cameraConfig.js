/**
 * Camera mode: bodies, lenses and control limits (units: mm for optics, m for
 * the scene). Optics math lives in src/utils/cameraOptics.js.
 */

export const APP_MODES = Object.freeze({
  LIGHTING: 'lighting',
  CAMERA: 'camera',
});

/** 35 mm full-frame diagonal (36 × 24 mm), the reference for "equivalent" values. */
export const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24);

/** Both bodies use the same 102 MP 44 × 33 mm ("GFX") sensor. */
const GFX_SENSOR = Object.freeze({ widthMm: 43.8, heightMm: 32.9, pixelsX: 11648, pixelsY: 8736 });

export const CAMERA_BODIES = Object.freeze([
  { id: 'gfx100s', name: 'FUJIFILM GFX100S', sensor: GFX_SENSOR },
  { id: 'gfx100s-ii', name: 'FUJIFILM GFX100S II', sensor: GFX_SENSOR },
]);

/**
 * GF lenses. `maxAperture` is the widest f-number; `minFocusDistanceM` is
 * measured from the focal plane (sensor), like the lens distance scale.
 * All GF lenses stop down to f/22; the slider stops at `F_STOP_LIMITS.max`.
 */
export const LENSES = Object.freeze([
  { id: 'gf55-f1.7', name: 'GF55mmF1.7 R WR', focalLengthMm: 55, maxAperture: 1.7, minFocusDistanceM: 0.5 },
  {
    id: 'gf55-f3.5',
    name: 'GF55mm F3.5',
    focalLengthMm: 55,
    maxAperture: 3.5,
    // Not a Fujifilm catalogue lens. Modeled as requested; the closest real lens
    // is the GF50mmF3.5 R LM WR (MFD 0.35 m), whose close focus is used here.
    minFocusDistanceM: 0.35,
    note: 'Not in the Fujifilm GF catalogue (closest: GF50mmF3.5 R LM WR). Modeled as a 55 mm f/3.5.',
  },
  { id: 'gf80-f1.7', name: 'GF80mmF1.7 R WR', focalLengthMm: 80, maxAperture: 1.7, minFocusDistanceM: 0.7 },
  { id: 'gf110-f2', name: 'GF110mmF2 R LM WR', focalLengthMm: 110, maxAperture: 2, minFocusDistanceM: 0.9 },
]);

export const getBodyById = (id) => CAMERA_BODIES.find((body) => body.id === id) ?? CAMERA_BODIES[0];
export const getLensById = (id) => LENSES.find((lens) => lens.id === id) ?? LENSES[0];

/** Nominal 1/3-stop f-number series shown by the camera. */
export const THIRD_STOP_F_NUMBERS = Object.freeze([
  1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22,
]);

export const F_STOP_LIMITS = Object.freeze({ max: 16 });

export const CAMERA_LIMITS = Object.freeze({
  // camera.position.z: distance from the focal plane to the subject axis (z = 0).
  shootingDistanceM: { min: 0.6, max: 12, step: 0.01 },
  cameraHeightM: { min: 0.3, max: 2.4, step: 0.01 },
  aimHeightM: { min: 0.1, max: 2.2, step: 0.01 },
  // The lower end is the lens's minimum focus distance.
  focusDistanceM: { max: 30 },
});

export const CAMERA_DEFAULTS = Object.freeze({
  bodyId: 'gfx100s-ii',
  lensId: 'gf80-f1.7',
  fNumber: 2.8,
  shootingDistanceM: 3.5,
  cameraHeightM: 1.45,
  aimHeightM: 1.2,
});

/** Focus modes: 'af' keeps the face in focus, 'manual' uses the focus slider. */
export const FOCUS_MODES = Object.freeze({ AF: 'af', MANUAL: 'manual' });

export const CAMERA_OPTICS_CONFIG = Object.freeze({
  // Permissible circle of confusion for the DoF readout: the 35 mm standard
  // (0.030 mm on a 43.3 mm diagonal) scaled to the sensor diagonal.
  cocLimitPerDiagonal: 0.03 / Math.hypot(36, 24),
  // Photo camera clip planes (m). The depth buffer is converted back to distance.
  near: 0.05,
  far: 100,
  // AF: the ray aims at the head center and focuses on the first subject hit.
  // Without a hit, focus this far in front of the aim point (face surface).
  faceSurfaceOffsetM: 0.1,
});

/** Depth-of-field post-process (src/postprocessing/PhysicalBokehPass.js). */
export const DOF_CONFIG = Object.freeze({
  // Largest blur radius in CSS px (scaled by devicePixelRatio). Blur beyond
  // this is clamped; typical portrait backgrounds stay well below it.
  maxCocRadiusCssPx: 48,
  // Tile size (drawing-buffer px) for the max-CoC search that bounds each gather.
  tileSizePx: 16,
  // Gather samples scale with the blur area, within these bounds.
  minSamples: 16,
  maxSamples: 96,
  // Brightest linear value entering the blur (limits half-float fireflies).
  maxLinearValue: 64,
  // MSAA samples of the scene render in camera mode.
  msaaSamples: 4,
});

/** Viewfinder overlay (frame lines and info strip). */
export const VIEWFINDER_CONFIG = Object.freeze({ maskOpacity: 0.72 });

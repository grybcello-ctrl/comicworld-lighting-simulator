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
  {
    id: 'ttartisan-11-f2.8-fisheye',
    name: 'TTArtisan 11mm f/2.8 Fish-eye',
    focalLengthMm: 11,
    maxAperture: 2.8,
    minFocusDistanceM: 0.17,
    // GFX-mount version: fully manual, no electronic contacts, so no AF.
    manualFocusOnly: true,
    // Rendered by FisheyeLensPass (src/postprocessing/FisheyeLensPass.js),
    // not by the perspective camera. Lens profile: stereographic projection
    // r = 2f·tan(θ/2) (curvature 0.5, see utils/fisheyeProjection.js), 180°
    // field → image circle Ø 44 mm, the 35 mm diagonal (43.3 mm) it is made for.
    fisheye: { curvature: 0.5, strength: 1, maxFieldDeg: 180 },
    note:
      'GFX-mount version, manual focus only (no electronic contacts). Modeled as a stereographic 180° fisheye: its Ø 44 mm image circle spans the GFX frame width, the corners fall outside it.',
  },
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

/**
 * Output aspect ratios (width : height as written). The frame is the largest
 * rectangle of that ratio inside the sensor — a crop, like the camera's own
 * aspect settings, so the lens's angle of view is kept along the uncropped
 * side. Ratios within 1% of the sensor's 43.8 : 32.9 use the full sensor.
 * The orientation toggle swaps width and height (2:3 ↔ 3:2); a portrait
 * frame turns the sensor upright (32.9 × 43.8), like turning the camera.
 */
export const ASPECT_RATIOS = Object.freeze([
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '2:3', label: '2:3', width: 2, height: 3 },
  { id: '4:5', label: '4:5', width: 4, height: 5 },
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '2.35:1', label: '2.35:1', width: 2.35, height: 1 },
  { id: '1.43:1', label: '1.43:1', width: 1.43, height: 1 },
]);
export const getAspectById = (id) => ASPECT_RATIOS.find((aspect) => aspect.id === id) ?? ASPECT_RATIOS[0];

export const CAMERA_DEFAULTS = Object.freeze({
  aspectId: '4:3',
  // false = the ratio as written; true = width and height swapped.
  aspectFlipped: false,
  bodyId: 'gfx100s-ii',
  lensId: 'gf80-f1.7',
  fNumber: 2.8,
  shootingDistanceM: 3.5,
  cameraHeightM: 1.45,
  aimHeightM: 1.2,
});

/**
 * Focus modes: the AF modes keep their target in focus while the camera
 * moves; 'manual' uses the focus slider.
 */
export const FOCUS_MODES = Object.freeze({ AF_EYE: 'af-eye', AF_FACE: 'af-face', MANUAL: 'manual' });

/**
 * Eye AF target search (src/utils/eyeAutofocus.js). Subjects face +Z (glTF
 * convention, also the mannequin); the camera stands on the +Z side.
 */
export const EYE_AF_CONFIG = Object.freeze({
  // Bone names (case-insensitive). Eye bones first, then the head bone.
  eyeBonePattern: /eye/i,
  // Eyelids, brows, lashes, look-at targets and end/control bones are not the eye.
  eyeBoneExclude: /brow|lid|lash|socket|target|look|aim|ctrl|control|common|master|end\b|_end|nub|tip|^eyes$/i,
  headBonePattern: /head/i,
  headBoneExclude: /top|end\b|_end|nub|tip|forehead|ctrl|control|target|aim|look/i,
  // Head-top marker (e.g. Mixamo 'HeadTop_End'); any node type.
  headTopPattern: /head.?top|head.?end|head.?nub/i,
  // Eye bones sit at the eyeball center; the focus goes to the first surface
  // (cornea, or the face shell of models without eyeballs) in front of it, if
  // one lies within this distance. Measured: Mixamo X Bot 3.5 cm.
  eyeSurfaceMaxOffsetM: 0.06,
  // Head bone only: eye height = head joint + fraction × (head top − head joint).
  // Measured on Mixamo X Bot (eye bones as ground truth): 0.36.
  headJointToEyeFraction: 0.36,
  // Head bone / bbox: the face surface is searched up to this far in front of the reference.
  faceSearchDepthM: 0.25,
  // Bbox heuristic: eye height as a fraction of the subject's height (from the
  // feet, hair included). Measured: mannequin 94.4 %, Mixamo X Bot 92.0 % (eye
  // bones); Soldier 90.7 % (helmet) and Michelle 87.1 % (big hair) are
  // head-bone estimates checked on renders. Hair or hats push the value down.
  bboxEyeHeightFraction: 0.92,
  // Vertical half-width of the eye-height slice used to find the head's center.
  bboxSliceHalfHeightFraction: 0.015,
  // Frontal cap of that slice (the face) used for the center line.
  faceCapDepthM: 0.015,
  // Rays are cast half an interpupillary distance (63 mm adult mean) left and
  // right of the head's center line: on the eyes, not on the nose.
  halfInterpupillaryM: 0.0315,
});

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

/**
 * Fisheye lens rendering (FisheyeLensPass). The scene is rendered into up to
 * five 90° faces around the photo camera (front, left, right, up, down; the
 * back face is never inside a ≤ 180° field), then a full-screen shader maps
 * every output pixel to its ray through the lens projection. The faces are
 * sized so the most magnified part of the image still gets one face texel per
 * output pixel, within these bounds.
 */
export const FISHEYE_CONFIG = Object.freeze({
  // Curvature 0 = rectilinear, 0.5 stereographic, 1 equidistant, 1.5 equisolid, 2 orthographic.
  curvature: { min: 0, max: 2, step: 0.01 },
  // Share of the fisheye mapping: 1 = as shot, 0 = fully corrected (rectilinear).
  strength: { min: 0, max: 1, step: 0.01 },
  minFaceSizePx: 512,
  maxFaceSizePx: 1024,
  // Extra texels around each face so bilinear taps never cross a face edge.
  facePaddingPx: 2,
  // Width of the soft edge of the image circle (mm on the sensor).
  circleEdgeMm: 0.15,
});

/** Viewfinder overlay (frame lines and info strip). */
export const VIEWFINDER_CONFIG = Object.freeze({ maskOpacity: 0.72 });

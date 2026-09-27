/**
 * Thin-lens optics for the camera mode.
 *
 * Distances:
 *   - Scene distances (shooting distance, focus distance, DoF limits) are
 *     measured from the focal plane (the sensor, i.e. the photo camera's
 *     position), like the ⦶ mark on a camera body and a lens distance scale.
 *   - Internally the thin lens sits `v` in front of the sensor. For focus
 *     distance D: u + v = D and 1/u + 1/v = 1/f, so the object distance u
 *     (lens → subject) is u = (D + √(D² − 4Df)) / 2.
 *
 * Blur (circle of confusion) of a point at object distance u₂ while focused at u₁:
 *   c = (f/N) · f/(u₁ − f) · (u₂ − u₁)/u₂ = K · (1 − u₁/u₂),   K = f² / (N (u₁ − f))
 * K is also the blur diameter of a point at infinity. c > 0 behind the focus
 * plane, c < 0 in front of it.
 */
import { CAMERA_OPTICS_CONFIG, F_STOP_LIMITS, FULL_FRAME_DIAGONAL_MM, THIRD_STOP_F_NUMBERS } from '../config/cameraConfig.js';

const MM_PER_M = 1000;
const toDeg = (rad) => (rad * 180) / Math.PI;

export const sensorDiagonalMm = (sensor) => Math.hypot(sensor.widthMm, sensor.heightMm);
export const cropFactor = (sensor) => FULL_FRAME_DIAGONAL_MM / sensorDiagonalMm(sensor);

/** Full angle of view (degrees) across `sizeMm` of the sensor, focused at infinity. */
export const angleOfViewDeg = (sizeMm, focalLengthMm) => toDeg(2 * Math.atan(sizeMm / (2 * focalLengthMm)));

export function anglesOfView(sensor, focalLengthMm) {
  return {
    horizontalDeg: angleOfViewDeg(sensor.widthMm, focalLengthMm),
    verticalDeg: angleOfViewDeg(sensor.heightMm, focalLengthMm),
    diagonalDeg: angleOfViewDeg(sensorDiagonalMm(sensor), focalLengthMm),
  };
}

/** Permissible circle of confusion for the DoF readout (mm). */
export const cocLimitMm = (sensor) => sensorDiagonalMm(sensor) * CAMERA_OPTICS_CONFIG.cocLimitPerDiagonal;

/** f-numbers offered for a lens: its maximum aperture, then the 1/3-stop series up to the limit. */
export function availableFNumbers(lens, maxFNumber = F_STOP_LIMITS.max) {
  const stops = THIRD_STOP_F_NUMBERS.filter((n) => n > lens.maxAperture + 0.05 && n <= maxFNumber);
  return [lens.maxAperture, ...stops];
}

/** Closest offered f-number (keeps a setting valid when the lens changes). */
export function snapFNumber(lens, fNumber) {
  const stops = availableFNumbers(lens);
  return stops.reduce((best, n) => (Math.abs(Math.log(n / fNumber)) < Math.abs(Math.log(best / fNumber)) ? n : best));
}

/**
 * How the sensor frame maps onto the canvas: the 4:3 frame is fitted inside
 * the canvas (letter-/pillar-boxed); the render covers the whole canvas, the
 * viewfinder overlay masks what lies outside the frame.
 *
 * Returns the vertical FOV for `camera.fov`, the film size spanned by the
 * whole canvas (for `camera.filmGauge`, so getFocalLength() returns f) and
 * the frame rectangle in canvas pixels.
 */
export function frameCanvasFit(sensor, focalLengthMm, width, height) {
  const pxPerMm = Math.min(width / sensor.widthMm, height / sensor.heightMm);
  const filmWidthMm = width / pxPerMm;
  const filmHeightMm = height / pxPerMm;
  const frameWidth = sensor.widthMm * pxPerMm;
  const frameHeight = sensor.heightMm * pxPerMm;
  return {
    pxPerMm,
    filmWidthMm,
    filmHeightMm,
    // three.js: filmHeight = filmGauge / max(aspect, 1).
    filmGauge: width >= height ? filmWidthMm : filmHeightMm,
    verticalFovDeg: angleOfViewDeg(filmHeightMm, focalLengthMm),
    frame: { x: (width - frameWidth) / 2, y: (height - frameHeight) / 2, width: frameWidth, height: frameHeight },
  };
}

/** Closest focus distance a lens can reach (m, from the focal plane); never below 4f. */
export const minFocusDistanceM = (lens) => Math.max(lens.minFocusDistanceM, (4.05 * lens.focalLengthMm) / MM_PER_M);

/**
 * Thin-lens focus geometry for a focus distance measured from the sensor.
 * @returns {{ objectDistanceMm: number, imageDistanceMm: number }}
 *          u (lens → focus plane) and v (lens → sensor)
 */
export function focusGeometry(focalLengthMm, focusDistanceM) {
  const f = focalLengthMm;
  const d = Math.max(focusDistanceM * MM_PER_M, 4.05 * f);
  const u = (d + Math.sqrt(d * d - 4 * d * f)) / 2;
  return { objectDistanceMm: u, imageDistanceMm: d - u };
}

/**
 * Everything the DoF pass and the readouts need for one setting.
 * @param {{ focalLengthMm: number, fNumber: number, focusDistanceM: number, sensor: Object }} params
 */
export function lensState({ focalLengthMm, fNumber, focusDistanceM, sensor }) {
  const f = focalLengthMm;
  const { objectDistanceMm: u, imageDistanceMm: v } = focusGeometry(f, focusDistanceM);
  const blurAtInfinityMm = (f * f) / (fNumber * (u - f));
  return {
    focalLengthMm: f,
    fNumber,
    focusDistanceM,
    objectDistanceMm: u,
    imageDistanceMm: v,
    apertureDiameterMm: f / fNumber,
    // K in c = K · (1 − u₁/u₂).
    cocScaleMm: blurAtInfinityMm,
    blurAtInfinityMm,
    blurAtInfinityFrameShare: blurAtInfinityMm / sensor.widthMm,
  };
}

/** Signed blur diameter (mm on the sensor) of a point `distanceM` from the sensor. */
export function blurDiameterMm(lens, distanceM) {
  const u2 = Math.max(distanceM * MM_PER_M - lens.imageDistanceMm, lens.focalLengthMm * 1.001);
  return lens.cocScaleMm * (1 - lens.objectDistanceMm / u2);
}

/**
 * Depth of field for a permissible circle of confusion `cocMm`.
 * Hyperfocal H = f²/(N c) + f; near = u(H − f)/(H + u − 2f); far = u(H − f)/(H − u).
 * All returned distances are from the focal plane (m); far may be Infinity.
 */
export function depthOfField(lens, cocMm) {
  const f = lens.focalLengthMm;
  const u = lens.objectDistanceMm;
  const v = lens.imageDistanceMm;
  const hyperfocalMm = (f * f) / (lens.fNumber * cocMm) + f;
  const nearMm = (u * (hyperfocalMm - f)) / (hyperfocalMm + u - 2 * f);
  const farMm = u < hyperfocalMm ? (u * (hyperfocalMm - f)) / (hyperfocalMm - u) : Infinity;
  const nearM = (nearMm + v) / MM_PER_M;
  const farM = Number.isFinite(farMm) ? (farMm + v) / MM_PER_M : Infinity;
  return {
    // Hyperfocal as a focus distance (from the focal plane).
    hyperfocalM: (hyperfocalMm + (hyperfocalMm * f) / (hyperfocalMm - f)) / MM_PER_M,
    nearM,
    farM,
    totalM: farM - nearM,
    frontM: lens.focusDistanceM - nearM,
    backM: farM - lens.focusDistanceM,
  };
}

/** Photo camera pose: dolly along +z (camera.position.z = shooting distance), aimed at the subject axis. */
export function cameraPose({ shootingDistanceM, cameraHeightM, aimHeightM }) {
  return { position: [0, cameraHeightM, shootingDistanceM], target: [0, aimHeightM, 0] };
}

/** Distance of `point` along the optical axis (focus is a plane, not a sphere). */
export function axialDistanceM(pose, point) {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const ax = tx - px;
  const ay = ty - py;
  const az = tz - pz;
  const length = Math.hypot(ax, ay, az) || 1;
  return ((point[0] - px) * ax + (point[1] - py) * ay + (point[2] - pz) * az) / length;
}

/** Clamps a focus distance to what the lens can reach. */
export function clampFocusDistanceM(lens, distanceM, maxM) {
  return Math.min(Math.max(distanceM, minFocusDistanceM(lens)), maxM);
}

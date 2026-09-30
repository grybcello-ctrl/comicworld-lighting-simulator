/**
 * Fisheye lens projection: where a ray at field angle θ (from the optical
 * axis) lands on the sensor, at radius r from the image center.
 *
 * One-parameter family with k = 1 − curvature:
 *   k > 0   r = (f/k) · tan(kθ)      k = 1: rectilinear r = f·tanθ; k = ½: stereographic r = 2f·tan(θ/2)
 *   k = 0   r = f · θ                equidistant
 *   k < 0   r = (f/|k|) · sin(|k|θ)  k = −½: equisolid r = 2f·sin(θ/2); k = −1: orthographic r = f·sinθ
 * Every member has dr/dθ = f on the axis, so the center of the image keeps
 * the focal length's scale while the edges are compressed more the higher
 * the curvature (barrel distortion).
 *
 * Strength blends the fisheye mapping with the rectilinear one of the same
 * focal length, like a lens-profile correction amount:
 *   θ(r) = (1 − s) · atan(r/f) + s · θ_fisheye(r)
 * s = 1 is the lens as shot, s = 0 fully "defished".
 *
 * The same formulas run in the shader (postprocessing/FisheyeLensPass.js).
 */
import { FULL_FRAME_DIAGONAL_MM } from '../config/cameraConfig.js';

const DEG = Math.PI / 180;
const K_EPSILON = 1e-3;

export const PROJECTIONS = Object.freeze([
  { curvature: 0, name: 'rectilinear', formula: 'r = f·tanθ' },
  { curvature: 0.5, name: 'stereographic', formula: 'r = 2f·tan(θ/2)' },
  { curvature: 1, name: 'equidistant', formula: 'r = f·θ' },
  { curvature: 1.5, name: 'equisolid', formula: 'r = 2f·sin(θ/2)' },
  { curvature: 2, name: 'orthographic', formula: 'r = f·sinθ' },
]);

export const projectionK = (curvature) => 1 - curvature;

/** Named projection for a curvature value; `exact` when it is one of the classic ones. */
export function projectionName(curvature) {
  const nearest = PROJECTIONS.reduce((best, p) => (Math.abs(p.curvature - curvature) < Math.abs(best.curvature - curvature) ? p : best));
  const exact = Math.abs(nearest.curvature - curvature) < 0.005;
  return { ...nearest, exact, label: exact ? nearest.name : `custom, near ${nearest.name}` };
}

/** Fisheye part: θ for ρ = r/f; NaN beyond the projection's reach (k < 0). */
function fisheyeTheta(rho, k) {
  if (Math.abs(k) < K_EPSILON) return rho;
  if (k > 0) return Math.atan(k * rho) / k;
  const s = -k * rho;
  return s > 1 ? NaN : Math.asin(s) / -k;
}

/** Field angle (rad) of the ray that lands at radius `rMm`; NaN where the lens projects nothing. */
export function fieldAngleRad(rMm, { focalLengthMm, curvature, strength }) {
  const rho = rMm / focalLengthMm;
  const fish = fisheyeTheta(rho, projectionK(curvature));
  return Number.isFinite(fish) ? (1 - strength) * Math.atan(rho) + strength * fish : NaN;
}

/** Image radius (mm) of field angle θ: inverse of fieldAngleRad by bisection (monotonic). Infinity if never reached. */
export function imageRadiusMm(thetaRad, profile) {
  const beyond = (r) => {
    const theta = fieldAngleRad(r, profile);
    return !Number.isFinite(theta) || theta >= thetaRad;
  };
  let hi = profile.focalLengthMm;
  while (!beyond(hi)) {
    hi *= 2;
    if (hi > profile.focalLengthMm * 1e4) return Infinity;
  }
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (beyond(mid)) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Lens profile with the user's curvature/strength. `maxFieldDeg` is the
 * field stop: rays beyond it do not reach the sensor, which ends the image
 * at the image circle.
 */
export function fisheyeProfile(lens, settings) {
  return {
    focalLengthMm: lens.focalLengthMm,
    curvature: settings.fisheyeCurvature,
    strength: settings.fisheyeStrength,
    maxFieldDeg: lens.fisheye.maxFieldDeg,
  };
}

/** Image circle radius (mm): where the field stop cuts the image. */
export const imageCircleRadiusMm = (profile) => imageRadiusMm((profile.maxFieldDeg / 2) * DEG, profile);

/** Full angle (deg) across `sizeMm` through the center, limited by the image circle. */
function fisheyeAngleDeg(sizeMm, profile, circleMm) {
  const half = sizeMm / 2;
  if (half >= circleMm) return profile.maxFieldDeg;
  return (2 * fieldAngleRad(half, profile)) / DEG;
}

/**
 * Angles of view of a frame through a fisheye profile, the image circle and
 * how much of the frame it covers.
 */
export function fisheyeAnglesOfView(frame, profile) {
  const circleMm = imageCircleRadiusMm(profile);
  const diagonalMm = Math.hypot(frame.widthMm, frame.heightMm);
  const k = projectionK(profile.curvature);
  return {
    horizontalDeg: fisheyeAngleDeg(frame.widthMm, profile, circleMm),
    verticalDeg: fisheyeAngleDeg(frame.heightMm, profile, circleMm),
    diagonalDeg: fisheyeAngleDeg(diagonalMm, profile, circleMm),
    imageCircleMm: 2 * circleMm,
    // Where the circle falls: 'full' covers the corners, 'width'/'height' fits that side, else a circle inside the frame.
    coverage:
      circleMm >= diagonalMm / 2
        ? 'full'
        : circleMm >= Math.max(frame.widthMm, frame.heightMm) / 2 - 0.05
          ? 'long side'
          : circleMm >= Math.min(frame.widthMm, frame.heightMm) / 2 - 0.05
            ? 'short side'
            : 'circular',
    projection: projectionName(profile.curvature),
    projectionK: k,
    // Diagonal angle of the full-frame format the lens is sold for.
    fullFrameDiagonalDeg: fisheyeAngleDeg(FULL_FRAME_DIAGONAL_MM, profile, circleMm),
  };
}

/**
 * Face size (px) of the render faces: the most magnified part of the frame
 * (largest dr/dθ within `radiusMm`) must get about one face texel per output
 * pixel even where it lands at a face center (N/2 texels per radian there).
 */
export function fisheyeFaceSizePx(profile, pxPerMm, radiusMm, { minFaceSizePx, maxFaceSizePx }) {
  const circleMm = imageCircleRadiusMm(profile);
  const limit = Math.min(radiusMm, circleMm) * 0.999;
  let maxDrDtheta = profile.focalLengthMm;
  const steps = 64;
  for (let i = 1; i <= steps; i++) {
    const r1 = (limit * (i - 1)) / steps;
    const r2 = (limit * i) / steps;
    const dTheta = fieldAngleRad(r2, profile) - fieldAngleRad(r1, profile);
    if (dTheta > 0) maxDrDtheta = Math.max(maxDrDtheta, (r2 - r1) / dTheta);
  }
  const needed = 2 * maxDrDtheta * pxPerMm;
  return Math.min(maxFaceSizePx, Math.max(minFaceSizePx, Math.ceil(needed / 64) * 64));
}

/**
 * Parabolic reflector geometry: focusing-rod head travel and the irradiance
 * the rear-firing flash head puts on the inside of the dish.
 *
 * Dish frame (fixture local): apex at z = 0, opening at z = depth, beam along +Z.
 *   surface     z(ρ) = depth · (ρ / R)²          R = diameter / 2
 *   focal point f    = R² / (4 · depth)
 * The flash head sits on the axis at z_h and fires backwards (−Z) into the dish.
 */
import { PARABOLIC_CONFIG } from '../config/sceneConfig.js';
import { clamp, lerp } from './lightMath.js';
import { focusRodToT } from './focusRod.js';

export const focalLengthM = ({ diameter, depth }) => (diameter / 2) ** 2 / (4 * depth);

/**
 * Flash-head position on the focusing rod (meters from the apex along +Z):
 *   rod 0   -> pushed deep inside, at the focal point
 *              (reflected rays leave parallel: narrow, punchy, hard)
 *   rod 100 -> pulled out towards the opening, far past the focus
 *              (rays diverge strongly: wide, soft, the whole dish glows)
 *   z_h(t) = lerp(z_in, z_out, t)
 *   z_in  = clamp(f, headMinDepthFraction · depth, z_out)
 *   z_out = headMaxDepthFraction · depth
 */
export function parabolicHeadPositionM(geometry, focusRod) {
  const { depth } = geometry;
  const zOut = depth * PARABOLIC_CONFIG.headMaxDepthFraction;
  const zIn = clamp(focalLengthM(geometry), depth * PARABOLIC_CONFIG.headMinDepthFraction, zOut);
  return lerp(zIn, zOut, focusRodToT(focusRod));
}

/**
 * Relative irradiance on the dish at radius ρ from a head at z_h (inverse square
 * × incidence cosine × the head's emission pattern):
 *   P = (ρ, z(ρ)),  H = (0, z_h),  v = H − P,  d = |v|
 *   n = normalize(−2 · depth · ρ / R², 1)                 inward surface normal
 *   cos ψ = (z_h − z(ρ)) / d                              angle off the head's −Z axis
 *   I(ψ)  = leak + (1 − leak) · max(0, cos ψ)^k            rear-firing tube + backplate
 *   E(ρ)  = I(ψ) · max(0, n · v / d) / d²
 * Deep head (spot): only the region behind the head, near the apex, is hit hard.
 * Head near the opening (flood): distances to all of the dish are similar, so
 * the whole interior is lit evenly.
 */
export function dishIrradiance(geometry, headZ, rho) {
  const { diameter, depth } = geometry;
  const radius = diameter / 2;
  const { headSideLeak, headEmissionExponent } = PARABOLIC_CONFIG;

  const z = depth * (rho / radius) ** 2;
  const vx = -rho;
  const vz = headZ - z;
  const distance = Math.max(Math.hypot(vx, vz), 1e-3);

  const slope = (2 * depth * rho) / radius ** 2;
  const normalLength = Math.hypot(slope, 1);
  const incidence = Math.max(0, (-slope * vx + vz) / (normalLength * distance));

  const cosPsi = vz / distance;
  const emission = headSideLeak + (1 - headSideLeak) * Math.max(0, cosPsi) ** headEmissionExponent;
  return (emission * incidence) / distance ** 2;
}

/**
 * Normalized glow (0..1) at each radius, plus how much of the dish is lit.
 * @param {number[]} radii  ρ samples (m), e.g. the lathe profile points
 * @returns {{ values: number[], coverage: number }}
 *   coverage = share of dish surface area with ≥ `coverageThreshold` of the peak
 */
export function reflectorGlowProfile(geometry, headZ, radii) {
  const raw = radii.map((rho) => dishIrradiance(geometry, headZ, rho));
  const peak = Math.max(...raw, 1e-12);
  const values = raw.map((value) => (value / peak) ** PARABOLIC_CONFIG.glowGamma);

  // Coverage on a fine, area-weighted grid (surface element 2πρ·√(1 + z'²) dρ).
  const { diameter, depth } = geometry;
  const radius = diameter / 2;
  const steps = 200;
  let litArea = 0;
  let totalArea = 0;
  let finePeak = 1e-12;
  const fine = Array.from({ length: steps }, (_, i) => {
    const rho = ((i + 0.5) / steps) * radius;
    const irradiance = dishIrradiance(geometry, headZ, rho);
    finePeak = Math.max(finePeak, irradiance);
    return { rho, irradiance };
  });
  for (const { rho, irradiance } of fine) {
    const area = rho * Math.hypot(1, (2 * depth * rho) / radius ** 2);
    totalArea += area;
    if (irradiance / finePeak >= PARABOLIC_CONFIG.coverageThreshold) litArea += area;
  }
  return { values, coverage: litArea / totalArea };
}

/**
 * Minimal spectral color pipeline:
 *   SPD(λ) × filter T(λ)  --CIE 1931 2° CMFs-->  XYZ  --matrix-->  linear sRGB
 *
 * Everything is evaluated on a 5 nm grid over the visible range, which is
 * precise to well under 0.001 in chromaticity for smooth spectra.
 */

export const WAVELENGTH_MIN_NM = 380;
export const WAVELENGTH_MAX_NM = 780;
export const WAVELENGTH_STEP_NM = 5;

/** Second radiation constant c2 = h·c / k_B, in m·K. */
const PLANCK_C2 = 1.438777e-2;

/** Wavelength samples in nm. */
export const WAVELENGTHS_NM = Array.from(
  { length: (WAVELENGTH_MAX_NM - WAVELENGTH_MIN_NM) / WAVELENGTH_STEP_NM + 1 },
  (_, i) => WAVELENGTH_MIN_NM + i * WAVELENGTH_STEP_NM,
);

/** Piecewise Gaussian with separate widths left/right of the peak. */
function piecewiseGaussian(lambda, mu, sigmaLeft, sigmaRight) {
  const sigma = lambda < mu ? sigmaLeft : sigmaRight;
  const t = (lambda - mu) / sigma;
  return Math.exp(-0.5 * t * t);
}

/**
 * CIE 1931 2° standard observer, multi-lobe analytic fit
 * (Wyman, Sloan & Shirley, "Simple Analytic Approximations to the CIE XYZ
 * Color Matching Functions", JCGT 2013). Max error vs. the tabulated
 * functions is below the variance between human observers.
 * @param {number} lambda Wavelength in nm.
 * @returns {[number, number, number]} [x̄, ȳ, z̄]
 */
export function cie1931Cmf(lambda) {
  const x =
    1.056 * piecewiseGaussian(lambda, 599.8, 37.9, 31.0) +
    0.362 * piecewiseGaussian(lambda, 442.0, 16.0, 26.7) -
    0.065 * piecewiseGaussian(lambda, 501.1, 20.4, 26.2);
  const y =
    0.821 * piecewiseGaussian(lambda, 568.8, 46.9, 40.5) +
    0.286 * piecewiseGaussian(lambda, 530.9, 16.3, 31.1);
  const z =
    1.217 * piecewiseGaussian(lambda, 437.0, 11.8, 36.0) +
    0.681 * piecewiseGaussian(lambda, 459.0, 26.0, 13.8);
  return [x, y, z];
}

const CMF_TABLE = WAVELENGTHS_NM.map(cie1931Cmf);

/**
 * Planck's law, relative spectral radiance of a black body:
 *   B(λ, T) ∝ λ⁻⁵ / (exp(c2 / (λ·T)) − 1)
 * The absolute scale cancels out because colors are normalized by luminance.
 */
export function planckRadiance(lambdaNm, kelvin) {
  const lambda = lambdaNm * 1e-9;
  return lambda ** -5 / Math.expm1(PLANCK_C2 / (lambda * kelvin));
}

/**
 * Integrates spectrum(λ) · transmission(λ) against the CMFs.
 * @param {(lambdaNm: number) => number} spectrum
 * @param {(lambdaNm: number) => number} [transmission]
 * @returns {[number, number, number]} XYZ (unnormalized)
 */
export function spectrumToXyz(spectrum, transmission = () => 1) {
  let X = 0;
  let Y = 0;
  let Z = 0;
  WAVELENGTHS_NM.forEach((lambda, i) => {
    const power = spectrum(lambda) * transmission(lambda);
    const [xBar, yBar, zBar] = CMF_TABLE[i];
    X += power * xBar;
    Y += power * yBar;
    Z += power * zBar;
  });
  return [X, Y, Z];
}

/**
 * XYZ -> linear sRGB (IEC 61966-2-1, D65 white). This is the working color
 * space of three.js (LinearSRGBColorSpace), so no extra conversion is needed.
 * Out-of-gamut (negative) components are clipped to 0.
 * @returns {[number, number, number]}
 */
export function xyzToLinearSrgb([X, Y, Z]) {
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)];
}

export function xyzToChromaticity([X, Y, Z]) {
  const sum = X + Y + Z;
  return sum > 0 ? [X / sum, Y / sum] : [1 / 3, 1 / 3];
}

/**
 * Correlated color temperature from CIE xy chromaticity (McCamy 1992).
 * Accurate to a few kelvin between ~2000K and ~12500K near the Planckian locus;
 * meaningless for saturated colors (use `isNearPlanckian` first).
 */
export function chromaticityToCct([x, y]) {
  const n = (x - 0.332) / (0.1858 - y);
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}

/**
 * Planckian locus approximation (Kim et al. 2002, 1667K–25000K),
 * used to judge how "white" a filtered source still is.
 */
export function planckianLocusXy(kelvin) {
  const t = kelvin;
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  let y;
  if (t <= 2222) y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  else if (t <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  else y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/** Distance of a chromaticity from the Planckian locus at its own CCT. */
export function isNearPlanckian(xy, tolerance = 0.02) {
  const cct = chromaticityToCct(xy);
  if (!(cct >= 1667 && cct <= 25000)) return false;
  const [lx, ly] = planckianLocusXy(cct);
  return Math.hypot(xy[0] - lx, xy[1] - ly) <= tolerance;
}

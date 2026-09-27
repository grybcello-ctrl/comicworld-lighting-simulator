/**
 * Light color from color temperature (Kelvin) and an optional gel.
 *
 * Physically based: the strobe is modeled as a black body at T (Planck's law),
 * the gel as a spectral transmission curve, and the two are multiplied
 * *per wavelength* before projecting to color:
 *
 *   XYZ = Σλ B(λ, T) · T_gel(λ) · cmf(λ)            (CIE 1931 2°)
 *   rgb = M_XYZ→linear-sRGB · XYZ / Y_source         (luminance of the ungelled source = 1)
 *
 * so the result's luminance equals the gel's photopic transmission (its light
 * loss) and its hue is what a camera would record. This is more accurate than
 * multiplying two RGB colors, which breaks down for narrow-band gels.
 * White point: sRGB/D65 — a ~6500K source renders close to neutral.
 */
import { Color, LinearSRGBColorSpace } from 'three';
import { buildGelTransmission } from './gelFilters.js';
import {
  chromaticityToCct,
  isNearPlanckian,
  planckRadiance,
  spectrumToXyz,
  xyzToChromaticity,
  xyzToLinearSrgb,
} from './spectral.js';

/**
 * @typedef {Object} ResolvedLightColor
 * @property {[number, number, number]} linearRgb  Linear sRGB; luminance = gel transmission.
 * @property {number} transmission                 Photopic (luminance) transmission 0..1.
 * @property {number} lossStops                    −log2(transmission).
 * @property {[number, number]} chromaticity       CIE xy of the emitted light.
 * @property {number | null} cctK                  CCT, or null for strongly colored light.
 * @property {string} displayHex                   sRGB hex at full brightness, for UI/emitters.
 */

const colorCache = new Map();
const transmissionCache = new Map();

function getTransmission(gel) {
  if (!gel) return undefined;
  if (!transmissionCache.has(gel.id)) transmissionCache.set(gel.id, buildGelTransmission(gel.filter));
  return transmissionCache.get(gel.id);
}

/** Linear RGB normalized to max channel 1, converted to an sRGB hex string. */
function toDisplayHex([r, g, b]) {
  const peak = Math.max(r, g, b, 1e-6);
  return `#${new Color().setRGB(r / peak, g / peak, b / peak, LinearSRGBColorSpace).getHexString()}`;
}

/**
 * @param {number} kelvin
 * @param {{ id: string, filter: object } | null} [gel]
 * @returns {ResolvedLightColor}
 */
export function resolveLightColor(kelvin, gel = null) {
  const key = `${Math.round(kelvin)}|${gel?.id ?? ''}`;
  const cached = colorCache.get(key);
  if (cached) return cached;

  const spectrum = (lambda) => planckRadiance(lambda, kelvin);
  const sourceY = spectrumToXyz(spectrum)[1];
  const xyz = spectrumToXyz(spectrum, getTransmission(gel)).map((value) => value / sourceY);

  const linearRgb = xyzToLinearSrgb(xyz);
  const transmission = xyz[1];
  const chromaticity = xyzToChromaticity(xyz);
  const result = Object.freeze({
    linearRgb,
    transmission,
    lossStops: -Math.log2(Math.max(transmission, 1e-6)),
    chromaticity,
    cctK: isNearPlanckian(chromaticity) ? chromaticityToCct(chromaticity) : null,
    displayHex: toDisplayHex(linearRgb),
  });
  colorCache.set(key, result);
  return result;
}

/** Linear-sRGB three.js Color (luminance 1) of a black body at `kelvin`. */
export const kelvinToColor = (kelvin) =>
  new Color().setRGB(...resolveLightColor(kelvin).linearRgb, LinearSRGBColorSpace);

/** sRGB hex of a black body at `kelvin` (full brightness), for UI swatches. */
export const kelvinToHex = (kelvin) => resolveLightColor(kelvin).displayHex;

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
 *
 * `kelvin = null` means "color temperature off": the source is exact neutral
 * white, rgb = (1, 1, 1). Gels are then applied to a D65-like black body
 * (6504K) that is white-balanced per channel, so "no Kelvin + no gel" is
 * bit-exact white and "no Kelvin + gel" shows the gel's own color.
 */
import { Color, LinearSRGBColorSpace } from 'three';
import { COLOR_CONFIG } from '../config/sceneConfig.js';
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

const NEUTRAL_WHITE_KEY = 'white';
/** Rec.709 / linear-sRGB luminance weights (= Y row of the XYZ matrix). */
const LUMINANCE_WEIGHTS = [0.2126729, 0.7151522, 0.072175];
const luminanceOf = (rgb) => rgb.reduce((sum, value, i) => sum + value * LUMINANCE_WEIGHTS[i], 0);

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

/** Per-channel gains that turn the reference black body into exact white. */
let neutralWhiteGains = null;
function getNeutralWhiteGains() {
  if (!neutralWhiteGains) {
    const referenceK = COLOR_CONFIG.neutralWhiteReferenceK;
    const spectrum = (lambda) => planckRadiance(lambda, referenceK);
    const xyz = spectrumToXyz(spectrum);
    neutralWhiteGains = xyzToLinearSrgb(xyz.map((value) => value / xyz[1])).map((value) => 1 / value);
  }
  return neutralWhiteGains;
}

/**
 * @param {number | null} kelvin  null = color temperature disabled (neutral white).
 * @param {{ id: string, filter: object } | null} [gel]  null = no gel.
 * @returns {ResolvedLightColor}
 */
export function resolveLightColor(kelvin, gel = null) {
  const isNeutral = kelvin == null;
  const key = `${isNeutral ? NEUTRAL_WHITE_KEY : Math.round(kelvin)}|${gel?.id ?? ''}`;
  const cached = colorCache.get(key);
  if (cached) return cached;

  const sourceK = isNeutral ? COLOR_CONFIG.neutralWhiteReferenceK : kelvin;
  const spectrum = (lambda) => planckRadiance(lambda, sourceK);
  const sourceY = spectrumToXyz(spectrum)[1];
  const xyz = spectrumToXyz(spectrum, getTransmission(gel)).map((value) => value / sourceY);
  const transmission = xyz[1];

  let linearRgb = xyzToLinearSrgb(xyz);
  if (isNeutral) {
    // White-balance to exact (1, 1, 1), then restore the photopic transmission.
    const gains = getNeutralWhiteGains();
    const balanced = linearRgb.map((value, i) => value * gains[i]);
    const scale = transmission / Math.max(luminanceOf(balanced), 1e-9);
    linearRgb = gel ? balanced.map((value) => value * scale) : [1, 1, 1];
  }
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

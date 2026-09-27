/**
 * Keeps the studio backdrop the same color in both modes.
 *
 * Rendering straight to the canvas, three.js clears to `scene.background` in
 * the output color space, untouched by tone mapping. The camera mode renders
 * into a linear HDR target and tone-maps the whole image in OutputPass, which
 * would darken the backdrop (#1a1a1d → ~#080808 with ACES). During that render
 * the backdrop is swapped for the linear color that tone-maps back to the
 * original: the exact inverse of three.js's ACESFilmicToneMapping.
 */
import {
  ACESFilmicToneMapping,
  LinearSRGBColorSpace,
  LinearToneMapping,
  Matrix3,
  NoToneMapping,
  Vector3,
} from 'three';

// three.js tonemapping_pars_fragment (GLSL column-major → Matrix3.set row-major).
const ACES_INPUT = new Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.076, 0.90834, 0.01566,
  0.0284, 0.13383, 0.83777,
);
const ACES_OUTPUT = new Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602,
);
const ACES_INPUT_INVERSE = ACES_INPUT.clone().invert();
const ACES_OUTPUT_INVERSE = ACES_OUTPUT.clone().invert();

/** Inverse of RRTAndODTFit: (v² + 0.0245786v − 0.000090537) / (0.983729v² + 0.432951v + 0.238081) = w. */
function inverseRrtOdtFit(w) {
  const a = 1 - 0.983729 * w;
  const b = 0.0245786 - 0.432951 * w;
  const c = -(0.000090537 + 0.238081 * w);
  return (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

/**
 * Linear value that the renderer's tone mapping maps to `displayLinear`
 * (both linear sRGB), or null when the tone mapping is not supported here.
 */
export function inverseToneMap(displayLinear, toneMapping, exposure, out = new Vector3()) {
  if (toneMapping === NoToneMapping) return out.copy(displayLinear);
  if (toneMapping === LinearToneMapping) return out.copy(displayLinear).divideScalar(exposure);
  if (toneMapping !== ACESFilmicToneMapping) return null;
  out.copy(displayLinear).applyMatrix3(ACES_OUTPUT_INVERSE);
  out.set(inverseRrtOdtFit(out.x), inverseRrtOdtFit(out.y), inverseRrtOdtFit(out.z));
  return out.applyMatrix3(ACES_INPUT_INVERSE).multiplyScalar(0.6 / exposure);
}

const display = new Vector3();
const linear = new Vector3();

/**
 * Sets `target` to the compensated backdrop and returns it, or returns null if
 * the backdrop is not a plain color / the tone mapping is unsupported.
 */
export function compensatedBackground(background, renderer, target) {
  if (!background?.isColor) return null;
  // Color stores linear working-space (linear sRGB) components; the canvas shows
  // exactly these, sRGB-encoded, in the lighting mode.
  display.set(background.r, background.g, background.b);
  if (!inverseToneMap(display, renderer.toneMapping, renderer.toneMappingExposure, linear)) return null;
  return target.setRGB(Math.max(linear.x, 0), Math.max(linear.y, 0), Math.max(linear.z, 0), LinearSRGBColorSpace);
}

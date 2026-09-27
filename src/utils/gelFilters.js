/**
 * Spectral transmission models for color gels, T(λ) in 0..1.
 *
 * - mired:    color-conversion filters (CTO / CTB). A filter that shifts a
 *             black body by ΔM mired has, by Wien's approximation,
 *               T(λ) = T_peak · min(1, exp(−c2 · ΔM·10⁻⁶ · (1/λ − 1/λ_plateau)))
 *             (the ratio of two Planck curves), so it moves the source along
 *             the Planckian locus: 1/T_out ≈ 1/T_in + ΔM·10⁻⁶.
 *             Real CTO dyes flatten out in the red; `plateauNm` (≈620 nm)
 *             reproduces published CTO curves (~17% @420, ~40% @500, ~65% @555).
 * - bandpass: effect gels. Logistic cut-on / cut-off edges between a floor
 *             (blocked) and a peak (passed) transmission.
 */
const PLANCK_C2 = 1.438777e-2; // m·K

const logistic = (x) => 1 / (1 + Math.exp(-x));

function miredTransmission({ miredShift, peak, plateauNm = 620 }) {
  const reference = 1 / (plateauNm * 1e-9);
  return (lambdaNm) => {
    const shape = Math.exp(-PLANCK_C2 * miredShift * 1e-6 * (1 / (lambdaNm * 1e-9) - reference));
    // Positive shifts (CTO) plateau in the red; negative ones (CTB) in the blue.
    return peak * Math.min(1, shape);
  };
}

function bandpassTransmission({ cutOnNm, cutOnWidthNm = 10, cutOffNm, cutOffWidthNm = 10, peak, floor = 0 }) {
  return (lambdaNm) => {
    const pass =
      (cutOnNm == null ? 1 : logistic((lambdaNm - cutOnNm) / cutOnWidthNm)) *
      (cutOffNm == null ? 1 : logistic((cutOffNm - lambdaNm) / cutOffWidthNm));
    return floor + (peak - floor) * pass;
  };
}

const FILTER_MODELS = {
  mired: miredTransmission,
  bandpass: bandpassTransmission,
};

/**
 * @param {{ type: keyof FILTER_MODELS, [key: string]: any }} filter
 * @returns {(lambdaNm: number) => number}
 */
export function buildGelTransmission(filter) {
  const model = FILTER_MODELS[filter?.type];
  if (!model) throw new Error(`Unknown gel filter type: "${filter?.type}"`);
  return model(filter);
}

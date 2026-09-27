/**
 * Angular beam profile math shared by the physics (beamModel.js) and the
 * SpotLight `map` generator (beamProfileTexture.js). Pure functions only.
 *
 * r = θ / halfAngle (0 = beam axis, 1 = cone edge).
 *   M(r) = hotspot(r) · dip(r) · edge(r) · flat(θ)                 (always ≤ 1)
 *   hotspot(r) = (1 − g) + g · exp(−(r / r_h)²)                     punchy center
 *   dip(r)     = 1 − c · exp(−(r / 0.2)²)                            head occlusion
 *   edge(r)    = 1 − smoothstep(e, 1, r)                             grid edge cut
 *   flat(θ)    = 1 − f · (1 − cos³θ_ref / cos³ min(θ, θ_ref))        flattening
 *
 * Flattening: a point source lights a plane with E ∝ I(θ) · cos³θ, so even a
 * flat-intensity SpotLight "peaks" in the center of its footprint. Making
 * I(θ) ∝ 1 / cos³θ inside the plateau (θ ≤ θ_ref = flattenEdge · halfAngle)
 * cancels that exactly; since a map can only attenuate, the center is dimmed
 * to cos³θ_ref and the light's intensity is raised by the energy balance
 * (effectiveSolidAngle), not by hand.
 */
import { smoothstep } from './lightMath.js';

export const DEFAULT_BEAM_PROFILE = Object.freeze({
  hotspotRadius: 1,
  hotspotGain: 0,
  centerDip: 0,
  edgeStart: 1,
  flatten: 0, // 0 = off, 1 = perfectly flat illuminance on a plane ⟂ to the axis
  flattenEdge: 1, // plateau edge θ_ref as a fraction of the half angle
});

/** Radius (fraction of the cone) of the shadow cast by the head/rod on the axis. */
const CENTER_DIP_RADIUS = 0.2;

export const normalizeProfile = (profile) => (profile ? { ...DEFAULT_BEAM_PROFILE, ...profile } : null);

export const isFlatProfile = (profile) =>
  !profile ||
  (profile.hotspotGain <= 0 && profile.centerDip <= 0 && profile.edgeStart >= 1 && profile.flatten <= 0);

/**
 * Relative intensity M(r) at normalized angle r. Always ≤ 1.
 * @param {typeof DEFAULT_BEAM_PROFILE} profile  normalized profile
 * @param {number} r           θ / halfAngle
 * @param {number} halfAngle   cone half angle in radians (needed for flattening)
 */
export function evaluateBeamProfile(profile, r, halfAngle) {
  const { hotspotRadius, hotspotGain, centerDip, edgeStart, flatten, flattenEdge } = profile;
  const hotspot = 1 - hotspotGain + hotspotGain * Math.exp(-((r / Math.max(hotspotRadius, 1e-3)) ** 2));
  const dip = 1 - centerDip * Math.exp(-((r / CENTER_DIP_RADIUS) ** 2));
  const edge = 1 - smoothstep(edgeStart, 1, r);

  let flat = 1;
  if (flatten > 0 && halfAngle > 0) {
    const thetaRef = Math.max(flattenEdge, 0) * halfAngle;
    const theta = Math.min(r * halfAngle, thetaRef);
    flat = 1 - flatten * (1 - (Math.cos(thetaRef) / Math.cos(theta)) ** 3);
  }
  return hotspot * dip * edge * flat;
}

/**
 * three.js SpotLight angular attenuation (getSpotAttenuation in the shaders):
 *   A(θ) = smoothstep(cos α, cos(α · (1 − penumbra)), cos θ)
 */
export function spotConeAttenuation(theta, halfAngle, penumbra) {
  const coneCos = Math.cos(halfAngle);
  const penumbraCos = Math.cos(halfAngle * (1 - penumbra));
  return smoothstep(coneCos, penumbraCos, Math.cos(theta));
}

/**
 * Effective solid angle of the rendered beam (steradians):
 *   Ω_eff = 2π ∫₀^α A(θ) · M(θ/α) · sin θ dθ
 * Energy conservation: a beam carrying flux Φ has on-axis intensity I = Φ / Ω_eff,
 * so narrowing the cone or concentrating the profile raises the center intensity.
 */
export function effectiveSolidAngle(profile, halfAngle, penumbra, steps = 256) {
  const normalized = normalizeProfile(profile);
  const dTheta = halfAngle / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const theta = (i + 0.5) * dTheta;
    const shape = normalized ? evaluateBeamProfile(normalized, theta / halfAngle, halfAngle) : 1;
    sum += spotConeAttenuation(theta, halfAngle, penumbra) * shape * Math.sin(theta);
  }
  return 2 * Math.PI * sum * dTheta;
}

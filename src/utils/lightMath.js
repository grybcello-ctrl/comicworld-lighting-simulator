import { RENDER_CONFIG } from '../config/sceneConfig.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Converts a spherical placement (relative to `origin`) into world coordinates.
 * Azimuth 0 faces +Z (towards the default camera).
 * @returns {[number, number, number]}
 */
export function placementToPosition({ azimuthDeg, elevationDeg, distance }, origin) {
  const azimuth = azimuthDeg * DEG_TO_RAD;
  const elevation = elevationDeg * DEG_TO_RAD;
  const horizontal = distance * Math.cos(elevation);
  return [
    origin[0] + horizontal * Math.sin(azimuth),
    origin[1] + distance * Math.sin(elevation),
    origin[2] + horizontal * Math.cos(azimuth),
  ];
}

/**
 * Spot light intensity for a strobe/modifier pair at a given power setting.
 * powerStops: 0 = full power, -1 = half power, etc.
 */
export function computeLightIntensity(strobe, modifier, powerStops) {
  const outputWs = strobe.maxPowerWs * 2 ** powerStops;
  const transmission = 2 ** -(modifier?.lighting.lightLossStops ?? 0);
  return outputWs * transmission * RENDER_CONFIG.candelaPerWattSecond;
}

/** Formats stops as a flash-style fraction, e.g. -2.3 -> "1/8 +0.7". */
export function formatPowerStops(powerStops) {
  const wholeStops = Math.floor(powerStops + 1e-6);
  const remainder = powerStops - wholeStops;
  const fraction = `1/${2 ** -wholeStops}`;
  return remainder > 0.05 ? `${fraction} +${remainder.toFixed(1)}` : fraction;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

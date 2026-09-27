const DEG_TO_RAD = Math.PI / 180;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, t) => from + (to - from) * t;

/** Hermite smoothstep, same as GLSL. */
export function smoothstep(edge0, edge1, x) {
  if (edge0 >= edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

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

// ---------------------------------------------------------------------------
// Power scale (Profoto Connect Pro style)
// ---------------------------------------------------------------------------

/** Level shown for full power. */
export const FULL_POWER_LEVEL = 10;

/**
 * f-stop power law: every +1.0 on the scale doubles the flash energy.
 *   outputWs = maxWs * 2^(level - 10)
 * e.g. B10 Plus (500Ws): 10.0 -> 500Ws, 9.0 -> 250Ws, 1.0 -> ~1Ws.
 */
export const powerLevelToWs = (maxWs, level) => maxWs * 2 ** (level - FULL_POWER_LEVEL);

/** Snaps a slider value to the strobe's step and range (avoids 7.300000001). */
export function snapPowerLevel(level, { min, max, step }) {
  const snapped = Math.round(level / step) * step;
  return Number(clamp(snapped, min, max).toFixed(1));
}

export const formatPowerLevel = (level) => level.toFixed(1);

export function formatWs(ws) {
  if (ws >= 10) return `${ws.toFixed(0)} Ws`;
  if (ws >= 1) return `${ws.toFixed(1)} Ws`;
  return `${ws.toFixed(2)} Ws`;
}

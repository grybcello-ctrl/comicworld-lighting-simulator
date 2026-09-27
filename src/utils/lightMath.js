import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const WORLD_UP = new Vector3(0, 1, 0);
const LOCAL_FORWARD = new Vector3(0, 0, 1);

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

/**
 * Full fixture pose from a placement.
 *
 * 1. Orbit:  azimuth / elevation / distance around `target` (re-aims the light).
 * 2. Aim:    local +Z (the beam axis) points at `target` from the *orbit* position.
 * 3. Rotate: tilt / pan / roll offsets in the fixture's local frame
 *              tilt + = aim up          -> rotate about local X by −tilt
 *              pan  + = aim right       -> rotate about local Y by −pan
 *                        (seen from behind the fixture; local +X is its left)
 *              roll + = clockwise seen from behind -> rotate about local Z by +roll
 *            Euler order 'YXZ' = pan, then tilt, then roll (like a yoke).
 * 4. Shift:  world-space translation (shiftX / shiftY / shiftZ). The fixture
 *            moves rigidly — it does NOT re-aim, so the beam slides parallel
 *            (feathering). Use tilt/pan to re-aim after shifting.
 *
 * @returns {{ position: [number, number, number], quaternion: [number, number, number, number],
 *   aimPoint: [number, number, number], distanceToSubject: number, subjectOffAxisDeg: number }}
 */
export function computeFixturePose(placement, target, { minHeight = 0 } = {}) {
  const {
    shiftX = 0,
    shiftY = 0,
    shiftZ = 0,
    tiltDeg = 0,
    panDeg = 0,
    rollDeg = 0,
  } = placement;
  const targetVec = new Vector3(...target);
  const orbitVec = new Vector3(...placementToPosition(placement, target));

  // Matrix4.lookAt(eye, center, up) builds +Z = eye − center, so pass (target, orbit)
  // to get +Z pointing from the fixture to the subject (same as Object3D.lookAt).
  const aimQuat = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(targetVec, orbitVec, WORLD_UP),
  );
  const offsetQuat = new Quaternion().setFromEuler(
    new Euler(-tiltDeg * DEG_TO_RAD, -panDeg * DEG_TO_RAD, rollDeg * DEG_TO_RAD, 'YXZ'),
  );
  const quaternion = aimQuat.multiply(offsetQuat);

  const position = orbitVec.add(new Vector3(shiftX, shiftY, shiftZ));
  position.y = Math.max(position.y, minHeight);

  const forward = LOCAL_FORWARD.clone().applyQuaternion(quaternion);
  const toSubject = targetVec.clone().sub(position);
  const distanceToSubject = toSubject.length();

  return {
    position: position.toArray(),
    quaternion: quaternion.toArray(),
    aimPoint: position.clone().addScaledVector(forward, distanceToSubject).toArray(),
    distanceToSubject,
    // Angle between the beam axis and the subject: 0 = centered in the beam.
    subjectOffAxisDeg: forward.angleTo(toSubject) * RAD_TO_DEG,
  };
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

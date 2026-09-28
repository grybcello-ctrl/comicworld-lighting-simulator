/**
 * Overview framings (Top / Front / Side / Quarter): orbit-camera position and
 * target that fit every fixture and the subject into the view.
 */
import { Box3, Vector3 } from 'three';
import { OVERVIEW_FIT_CONFIG } from '../config/environmentConfig.js';

const DEG = Math.PI / 180;
const WORLD_UP = new Vector3(0, 1, 0);

/** Bounding box of the subject and all light fixtures (stands, bodies, modifiers). */
export function setupBounds(scene) {
  const box = new Box3();
  scene.updateMatrixWorld(true);
  for (const child of scene.children) {
    if (child.name === 'subject' || child.name.startsWith('studio-light-')) box.expandByObject(child);
  }
  return box;
}

/**
 * Camera position at (azimuth, elevation) around the box center, far enough
 * that the box's 8 corners fit the frustum with a margin.
 *
 * For a corner p (relative to the target) and the view basis (right r, up u,
 * d = unit vector target → camera), its depth in front of the camera is
 * D − p·d, so it fits when D ≥ p·d + |p·r| / tan(hFov/2) (same for up/vFov).
 *
 * @param {{ azimuthDeg: number, elevationDeg: number }} view
 *   Azimuth 0 = from +Z (camera side), +90 = from +X; elevation 90 = from above.
 * @param {{ fovDeg: number, aspect: number, minDistanceM?: number, maxDistanceM?: number }} lens
 */
export function fitOverview(box, { azimuthDeg, elevationDeg }, { fovDeg, aspect, minDistanceM, maxDistanceM }) {
  const target = box.getCenter(new Vector3());
  const elevation = Math.min(elevationDeg, OVERVIEW_FIT_CONFIG.topElevationDeg) * DEG;
  const azimuth = azimuthDeg * DEG;
  const toCamera = new Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );
  // Same basis as Object3D.lookAt with world up (screen up = −Z when seen from above).
  const forward = toCamera.clone().negate();
  const right = new Vector3().crossVectors(forward, WORLD_UP).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();

  const keep = 1 - 2 * OVERVIEW_FIT_CONFIG.marginFraction;
  const tanV = Math.tan((fovDeg / 2) * DEG) * keep;
  const tanH = Math.tan((fovDeg / 2) * DEG) * aspect * keep;

  let distance = minDistanceM ?? OVERVIEW_FIT_CONFIG.minDistanceM;
  const corner = new Vector3();
  for (let i = 0; i < 8; i++) {
    corner
      .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      .sub(target);
    const depth = corner.dot(toCamera);
    distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanH, depth + Math.abs(corner.dot(up)) / tanV);
  }
  if (maxDistanceM) distance = Math.min(distance, maxDistanceM);
  return {
    position: target.clone().addScaledVector(toCamera, distance).toArray(),
    target: target.toArray(),
    distance,
  };
}

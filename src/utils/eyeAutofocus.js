/**
 * Autofocus targets on the subject (world space, meters).
 *
 * Eye AF, in order of preference:
 *   1. Eye bones ('Eye', 'LeftEye', 'RightEye', …): the bone sits at the
 *      eyeball center, so the target is the first surface in front of it
 *      (lid / cornea), taken for the eye nearer to the camera (+Z side).
 *   2. Head bone: the head joint sits at the skull base, below and behind the
 *      eyes. The eye height is interpolated towards the head top, and the
 *      target is the face surface at that height, on an eye (not the nose).
 *   3. No usable bones: bounding-box heuristic. Eye height is a fixed fraction
 *      of the subject's height; the head's center line comes from the vertices
 *      at that height; the target is the face surface there, on an eye.
 *
 * Z-depth correction: every target ends on the skin seen from the front, not
 * inside the head. Surfaces are found with rays along −Z (the subject faces
 * +Z, the camera stands on the +Z side). Rays are cast half an
 * interpupillary distance left and right of the center line, because the
 * front-most point at eye height is the nose (≈ 3 cm in front of the eyes).
 */
import { Box3, Raycaster, Vector3 } from 'three';
import { EYE_AF_CONFIG } from '../config/cameraConfig.js';

export const AF_TARGET_SOURCES = Object.freeze({
  EYE_BONE: 'eye-bone',
  HEAD_BONE: 'head-bone',
  BBOX: 'bbox',
});

const FORWARD_RAY = new Vector3(0, 0, -1);
const raycaster = new Raycaster();
const scratch = new Vector3();

/** Visible in the rendered image: the object, all its ancestors and a visible material. */
export function isRendered(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => material && material.visible !== false);
}

/**
 * World positions of every rendered mesh vertex, skinning and morph targets
 * applied (Mesh#getVertexPosition), as a flat [x, y, z, …] array.
 */
export function collectWorldVertices(root) {
  const chunks = [];
  let total = 0;
  root.traverse((object) => {
    const position = object.isMesh ? object.geometry?.attributes?.position : null;
    if (!position || !isRendered(object)) return;
    const deformed =
      object.isSkinnedMesh || Boolean(object.morphTargetInfluences && object.geometry.morphAttributes.position);
    const out = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      if (deformed) object.getVertexPosition(i, scratch);
      else scratch.fromBufferAttribute(position, i);
      scratch.applyMatrix4(object.matrixWorld);
      out[i * 3] = scratch.x;
      out[i * 3 + 1] = scratch.y;
      out[i * 3 + 2] = scratch.z;
    }
    chunks.push(out);
    total += out.length;
  });
  const vertices = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    vertices.set(chunk, offset);
    offset += chunk.length;
  }
  return vertices;
}

function boxOfVertices(vertices, filter = () => true) {
  const box = new Box3();
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    if (filter(x, y, z)) box.expandByPoint(scratch.set(x, y, z));
  }
  return box;
}

/** Rendered surfaces hit by a ray along −Z through (x, y), nearest to the camera first. */
function frontHits(root, x, y, startZ) {
  raycaster.set(new Vector3(x, y, startZ), FORWARD_RAY);
  return raycaster.intersectObject(root, true).filter((hit) => isRendered(hit.object));
}

/** Bones named like eyes / a head, plus a head-top marker (any node type). */
export function findNamedBones(root, config = EYE_AF_CONFIG) {
  const eyes = [];
  const heads = [];
  let headTop = null;
  root.traverse((object) => {
    const name = object.name ?? '';
    if (!headTop && config.headTopPattern.test(name)) {
      headTop = { name, position: object.getWorldPosition(new Vector3()) };
    }
    if (!object.isBone) return;
    if (config.eyeBonePattern.test(name) && !config.eyeBoneExclude.test(name)) {
      eyes.push({ name, position: object.getWorldPosition(new Vector3()) });
    } else if (config.headBonePattern.test(name) && !config.headBoneExclude.test(name)) {
      heads.push({ name, position: object.getWorldPosition(new Vector3()) });
    }
  });
  return { eyes, head: heads[0] ?? null, headTop };
}

/**
 * Eye bone → first surface in front of it (lid / cornea). The innermost front
 * surface is used, so hair or glasses further out are ignored. A bone with no
 * surface in front of it lies outside the head (e.g. a look-at control) and is
 * rejected.
 */
function eyeBoneTarget(root, bone, box, config) {
  const { x, y, z } = bone.position;
  const hits = frontHits(root, x, y, box.max.z + 1);
  const inFront = hits.filter((hit) => hit.point.z >= z - 1e-4);
  if (inFront.length === 0) return null;
  const surface = inFront[inFront.length - 1].point;
  const offsetM = surface.z - z;
  const onSurface = offsetM <= config.eyeSurfaceMaxOffsetM;
  return {
    point: [x, y, onSurface ? surface.z : z],
    boneName: bone.name,
    surfaceOffsetM: onSurface ? offsetM : 0,
    onSurface,
  };
}

/**
 * Face surface at height `y` on the eyes of a head centered at `centerX`:
 * the front-most hit of two rays half an IPD left and right of the center
 * line, within [minZ, maxZ]. Falls back to the center line (nose bridge).
 */
function faceSurfaceOnEyes(root, centerX, y, { minZ, maxZ, startZ }, config) {
  const firstHitIn = (x) => {
    const hit = frontHits(root, x, y, startZ).find((h) => h.point.z >= minZ && h.point.z <= maxZ);
    return hit ? { x, z: hit.point.z } : null;
  };
  const eyes = [centerX - config.halfInterpupillaryM, centerX + config.halfInterpupillaryM]
    .map(firstHitIn)
    .filter(Boolean);
  if (eyes.length > 0) return { ...eyes.reduce((a, b) => (b.z > a.z ? b : a)), onEye: true };
  const center = firstHitIn(centerX);
  return center ? { ...center, onEye: false } : null;
}

/** Highest vertex within `radius` (horizontally) of a point: the crown above a head joint. */
function crownAbove(vertices, point, radius) {
  let top = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    const dx = vertices[i] - point.x;
    const dz = vertices[i + 2] - point.z;
    if (dx * dx + dz * dz <= radius * radius && vertices[i + 1] > top) top = vertices[i + 1];
  }
  return top;
}

function headBoneTarget(root, head, headTop, vertices, box, config) {
  const joint = head.position;
  const topY = headTop && headTop.position.y > joint.y ? headTop.position.y : crownAbove(vertices, joint, 0.12);
  const eyeY = joint.y + config.headJointToEyeFraction * Math.max(topY - joint.y, 0);
  const surface = faceSurfaceOnEyes(
    root,
    joint.x,
    eyeY,
    { minZ: joint.z, maxZ: joint.z + config.faceSearchDepthM, startZ: box.max.z + 1 },
    config,
  );
  return {
    point: [surface?.x ?? joint.x, eyeY, surface?.z ?? joint.z],
    boneName: head.name,
    headTopName: headTop?.name ?? null,
    onSurface: Boolean(surface),
    onEye: Boolean(surface?.onEye),
  };
}

/**
 * Bounding-box heuristic (no usable bones): eye height = a fraction of the
 * height; the head's center line from the vertices in a thin slice at that
 * height; depth from the face surface on the eyes. Last resort: the slice's
 * front-most Z (the front face of the eye-height slice's Box3).
 */
function bboxTarget(root, vertices, box, config) {
  const height = box.max.y - box.min.y;
  const eyeY = box.min.y + config.bboxEyeHeightFraction * height;
  let half = config.bboxSliceHalfHeightFraction * height;
  let slice = new Box3();
  for (const widen of [1, 2, 4]) {
    half = config.bboxSliceHalfHeightFraction * height * widen;
    slice = boxOfVertices(vertices, (x, y) => Math.abs(y - eyeY) <= half);
    if (!slice.isEmpty()) break;
  }
  if (slice.isEmpty()) slice = box.clone();
  // Center line = middle of the slice's frontal cap (the face: brows, nose
  // bridge, glasses), not of the whole slice — hair, ears and arms at eye
  // height widen the slice asymmetrically.
  const cap = boxOfVertices(
    vertices,
    (x, y, z) => Math.abs(y - eyeY) <= half && z >= slice.max.z - config.faceCapDepthM,
  );
  const centerX = cap.isEmpty() ? (slice.min.x + slice.max.x) / 2 : (cap.min.x + cap.max.x) / 2;
  const surface = faceSurfaceOnEyes(
    root,
    centerX,
    eyeY,
    { minZ: slice.max.z - config.faceSearchDepthM, maxZ: slice.max.z + 0.01, startZ: box.max.z + 1 },
    config,
  );
  return {
    point: [surface?.x ?? centerX, eyeY, surface?.z ?? slice.max.z],
    eyeHeightFraction: config.bboxEyeHeightFraction,
    sliceFrontZ: slice.max.z,
    onSurface: Boolean(surface),
    onEye: Boolean(surface?.onEye),
  };
}

const cm = (m) => `${(m * 100).toFixed(1)} cm`;

/**
 * Eye AF target for a subject.
 * @returns {{ point: number[], source: string, label: string, detail: string, diagnostics: Object } | null}
 */
export function findEyeTarget(root, config = EYE_AF_CONFIG) {
  root.updateMatrixWorld(true);
  const vertices = collectWorldVertices(root);
  if (vertices.length === 0) return null;
  const box = boxOfVertices(vertices);
  const bones = findNamedBones(root, config);
  // Sanity check for bones: inside the subject (2 cm tolerance), upper 40% of its height.
  const tolerantBox = box.clone().expandByScalar(0.02);
  const inUpperBody = (p) => tolerantBox.containsPoint(p) && p.y >= box.min.y + 0.6 * (box.max.y - box.min.y);
  const diagnostics = {
    eyeBones: bones.eyes.map((b) => b.name),
    headBone: bones.head?.name ?? null,
    boxMin: box.min.toArray(),
    boxMax: box.max.toArray(),
  };

  const eyeTargets = bones.eyes
    .filter((bone) => inUpperBody(bone.position))
    .map((bone) => eyeBoneTarget(root, bone, box, config))
    .filter(Boolean);
  if (eyeTargets.length > 0) {
    // The eye nearer to the camera (+Z side) — where a photographer focuses.
    const eye = eyeTargets.reduce((a, b) => (b.point[2] > a.point[2] ? b : a));
    return {
      point: eye.point,
      source: AF_TARGET_SOURCES.EYE_BONE,
      label: `Eye bone "${eye.boneName}"`,
      detail: eye.onSurface
        ? `lid/cornea ${cm(eye.surfaceOffsetM)} in front of the bone`
        : `bone position (no surface within ${cm(config.eyeSurfaceMaxOffsetM)} in front)`,
      diagnostics: { ...diagnostics, eye },
    };
  }

  if (bones.head && inUpperBody(bones.head.position)) {
    const head = headBoneTarget(root, bones.head, bones.headTop, vertices, box, config);
    return {
      point: head.point,
      source: AF_TARGET_SOURCES.HEAD_BONE,
      label: `Head bone "${head.boneName}"`,
      detail: head.onSurface
        ? `eye height from head joint → ${head.headTopName ? `"${head.headTopName}"` : 'crown'}, face surface${head.onEye ? ' on the eye' : ''}`
        : 'eye height from the head joint, no face surface found (joint depth)',
      diagnostics: { ...diagnostics, head },
    };
  }

  const estimate = bboxTarget(root, vertices, box, config);
  return {
    point: estimate.point,
    source: AF_TARGET_SOURCES.BBOX,
    label: `Bounding box (${(config.bboxEyeHeightFraction * 100).toFixed(1)}% of height)`,
    detail: estimate.onSurface
      ? `no eye/head bones · face surface${estimate.onEye ? ' on the eye' : ''}`
      : 'no eye/head bones · front of the eye-height slice',
    diagnostics: { ...diagnostics, bbox: estimate, wholeBoxFrontZ: box.max.z },
  };
}

/**
 * Face AF target (unchanged from the camera-mode release): first rendered
 * subject surface on a ray from the front through `headCenter`.
 */
export function findFacePoint(root, headCenter) {
  root.updateMatrixWorld(true);
  const [x, y, z] = headCenter;
  const hit = frontHits(root, x, y, z + 20)[0];
  return hit ? hit.point.toArray() : null;
}

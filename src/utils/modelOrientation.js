/**
 * Automatic front alignment of an imported model: whatever axes the file
 * uses, the subject ends up standing on +Y and facing +Z — the side of the
 * photo camera (always on the +Z axis, looking at the subject), so this is
 * the same as turning the model to look at camera.position.
 *
 * Detection, in order:
 *   1. Humanoid rig (Mixamo, VRM, Unreal, …): up = hips → head, left = the
 *      right → left upper arms (or shoulders / upper legs), forward =
 *      left × up. Exact, also for models turned by any angle.
 *   2. Geometry (no rig): Box3 of the vertices.
 *      - Up: the tallest axis (a standing figure or a bust). A file whose
 *        height lies along Z or X (Z-up exports, lying models) is stood up.
 *      - Front/back axis: in the widest horizontal slice (shoulders, or
 *        arms in a T-pose) the wide side is left–right, the other is depth.
 *      - Front sign: the face side has narrow protrusions (nose, chin, lips)
 *        while the back of the head is broad and round; toes point forward.
 *        The votes decide; if they are too weak the file's own +Z is kept.
 * The correction is a rotation only; Box3 centering and scaling follow in
 * fitModelToStage.
 */
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { collectWorldVertices } from './eyeAutofocus.js';
import { humanoidFrame, mapHumanoid } from './humanoidRig.js';

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const AXIS_NAMES = ['X', 'Y', 'Z'];
const component = (vertices, i, axis) => vertices[i * 3 + axis];

export const ORIENTATION_CONFIG = Object.freeze({
  // Another axis must be this much taller than Y to replace it as "up".
  upAxisMargin: 1.25,
  // Axes at least this share of the longest one are up-axis candidates.
  upCandidateShare: 0.8,
  // Voxel grid (per axis) and angle step of the mirror-symmetry search.
  symmetryGrid: 40,
  symmetryStepDeg: 3,
  // Best mirror plane must beat the others by this much to be trusted, and
  // be this symmetric to count as left–right (people score 0.9–1.0).
  symmetryMargin: 0.04,
  minLateralSymmetry: 0.85,
  // Vertex centroid along "up" as a share of the height: heads, hands and
  // faces are densely modelled, so upright figures measure 0.63–0.71
  // (Mixamo X Bot, Michelle, Soldier). Below this the model is upside down.
  upsideDownCentroid: 0.4,
  // Rig or symmetry directions this close to a file axis snap to it
  // (models are authored axis-aligned; a slight lean in the rest pose is not a tilt).
  snapDeg: 10,
  // Head region for the nose test (top share of the height).
  headShare: 0.4,
  headSlices: 40,
  // Band next to each front/back extreme, as a share of the slice depth.
  extremeBand: 0.08,
  // |score| below this keeps the file's own front (+Z) when it is a candidate.
  minSignScore: 0.25,
});

function vertexBox(vertices) {
  const box = new Box3();
  const v = new Vector3();
  for (let i = 0; i < vertices.length; i += 3) box.expandByPoint(v.set(vertices[i], vertices[i + 1], vertices[i + 2]));
  return box;
}

/** Vertex coordinates along directions (unit vectors) relative to `origin`: Float32Array per direction. */
function project(vertices, origin, directions) {
  const count = vertices.length / 3;
  return directions.map((d) => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = (vertices[i * 3] - origin.x) * d.x + (vertices[i * 3 + 1] - origin.y) * d.y + (vertices[i * 3 + 2] - origin.z) * d.z;
    }
    return out;
  });
}

/**
 * Bilateral (mirror) symmetry of the surface for a mirror plane with normal
 * `normal` through `origin`: share of occupied voxels whose mirror image is
 * occupied too. A human scores highest for the left–right normal.
 */
function mirrorScore(vertices, origin, normal, upDir, config) {
  const side = new Vector3().crossVectors(upDir, normal).normalize();
  const [n, u, s] = project(vertices, origin, [normal, upDir, side]);
  let extent = 1e-6;
  for (const coords of [n, u, s]) for (const v of coords) extent = Math.max(extent, Math.abs(v));
  const g = config.symmetryGrid;
  const cell = (v) => Math.min(g - 1, Math.max(0, Math.floor(((v / extent) * 0.5 + 0.5) * g)));
  const occupied = new Set();
  for (let i = 0; i < n.length; i++) occupied.add((cell(n[i]) * g + cell(u[i])) * g + cell(s[i]));
  let matched = 0;
  for (const key of occupied) {
    const ni = Math.floor(key / (g * g));
    const rest = key - ni * g * g;
    if (occupied.has((g - 1 - ni) * g * g + rest)) matched++;
  }
  return matched / occupied.size;
}

/**
 * Up axis (axis-aligned: files use Y-up or Z-up, rarely anything else):
 * the tallest axis; when two axes are about as long (a T-pose's arm span ≈
 * its height), the one that is a left–right mirror axis is not "up". Y wins
 * ties (glTF convention).
 */
function detectUpAxis(vertices, box, config) {
  const size = box.getSize(new Vector3());
  const extents = [size.x, size.y, size.z];
  const max = Math.max(...extents);
  let candidates = [0, 1, 2].filter((axis) => extents[axis] >= config.upCandidateShare * max);
  let symmetry = null;
  if (candidates.length > 1) {
    const center = box.getCenter(new Vector3());
    // Mirror test per candidate normal (the "up" argument only orients the voxel grid).
    symmetry = candidates.map((axis) => mirrorScore(vertices, center, AXES[axis], AXES[(axis + 1) % 3], config));
    const best = Math.max(...symmetry);
    const lateral = candidates[symmetry.indexOf(best)];
    const others = symmetry.filter((value) => value !== best);
    if (best >= config.minLateralSymmetry && others.length && best - Math.max(...others) > config.symmetryMargin) {
      candidates = candidates.filter((axis) => axis !== lateral);
    }
  }
  if (candidates.includes(1) && extents[1] * config.upAxisMargin >= Math.max(...candidates.map((axis) => extents[axis]))) return { axis: 1, symmetry };
  return { axis: candidates.reduce((a, b) => (extents[b] > extents[a] ? b : a)), symmetry };
}

/**
 * Left–right direction in the horizontal plane: the mirror-plane normal with
 * the best symmetry, searched over all angles (files may be turned by any
 * yaw), refined, and snapped to a file axis when within `snapDeg`.
 */
function detectLateralDirection(vertices, center, upDir, h1, h2, config) {
  const directionAt = (deg) => h1.clone().multiplyScalar(Math.cos((deg * Math.PI) / 180)).addScaledVector(h2, Math.sin((deg * Math.PI) / 180));
  let best = { deg: 0, score: -1 };
  for (let deg = 0; deg < 180; deg += config.symmetryStepDeg) {
    const score = mirrorScore(vertices, center, directionAt(deg), upDir, config);
    if (score > best.score) best = { deg, score };
  }
  for (let deg = best.deg - config.symmetryStepDeg; deg <= best.deg + config.symmetryStepDeg; deg += 1) {
    const score = mirrorScore(vertices, center, directionAt(deg), upDir, config);
    if (score > best.score) best = { deg, score };
  }
  const across = mirrorScore(vertices, center, directionAt(best.deg + 90), upDir, config);
  const snapped = [0, 90, 180].find((axisDeg) => Math.abs(best.deg - axisDeg) <= config.snapDeg);
  const deg = snapped ?? best.deg;
  return { direction: directionAt(deg).normalize(), deg, score: best.score, across, snapped: snapped !== undefined };
}

/**
 * Front sign along `forward` (> 0: `forward` is the front).
 * Nose test: in head slices, compare the lateral spread of the vertices at
 * the front and back extremes (narrow = nose, chin, lips; broad = back of
 * the head). Toe test: the feet sit forward of the lower legs.
 */
function detectFrontSign(vertices, center, upDir, forward, lateral, config) {
  const [h, d, l] = project(vertices, center, [upDir, forward, lateral]);
  const count = h.length;
  let min = Infinity;
  let max = -Infinity;
  for (const v of h) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const height = max - min;
  const headFrom = min + (1 - config.headShare) * height;
  const slices = Array.from({ length: config.headSlices }, () => []);
  for (let i = 0; i < count; i++) {
    if (h[i] < headFrom) continue;
    slices[Math.min(config.headSlices - 1, Math.floor(((h[i] - headFrom) / (height * config.headShare)) * config.headSlices))].push(i);
  }
  const spread = (ids) => {
    if (ids.length < 3) return null;
    let mean = 0;
    for (const i of ids) mean += l[i];
    mean /= ids.length;
    let variance = 0;
    for (const i of ids) variance += (l[i] - mean) ** 2;
    return Math.sqrt(variance / ids.length);
  };
  const logs = [];
  for (const ids of slices) {
    if (ids.length < 16) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of ids) {
      if (d[i] < lo) lo = d[i];
      if (d[i] > hi) hi = d[i];
    }
    const band = (hi - lo) * config.extremeBand;
    const front = spread(ids.filter((i) => d[i] >= hi - band));
    const back = spread(ids.filter((i) => d[i] <= lo + band));
    if (front && back && front > 0 && back > 0) logs.push(Math.log(back / front));
  }
  logs.sort((a, b) => a - b);
  // Quartile vote: a few nose/chin slices are decisive, the rest of the head is neutral.
  const noseScore = logs.length ? logs[Math.floor(logs.length * 0.75)] + logs[Math.floor(logs.length * 0.25)] : 0;

  // Toes: the lowest 4% (feet) vs. 8–14% of the height (lower legs), along forward.
  let feet = 0;
  let feetN = 0;
  let shins = 0;
  let shinsN = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < count; i++) {
    const t = (h[i] - min) / height;
    if (d[i] < dMin) dMin = d[i];
    if (d[i] > dMax) dMax = d[i];
    if (t < 0.04) {
      feet += d[i];
      feetN++;
    } else if (t > 0.08 && t < 0.14) {
      shins += d[i];
      shinsN++;
    }
  }
  const toeScore = feetN > 16 && shinsN > 16 ? (4 * (feet / feetN - shins / shinsN)) / Math.max(dMax - dMin, 1e-6) : 0;
  return { score: noseScore + toeScore, noseScore, toeScore };
}

/** Nearest file axis (±X/±Y/±Z) when within `snapDeg`, else the vector itself. */
function snapToAxis(vector, snapDeg) {
  let best = null;
  for (const axis of AXES) {
    for (const sign of [1, -1]) {
      const candidate = axis.clone().multiplyScalar(sign);
      const angle = (vector.angleTo(candidate) * 180) / Math.PI;
      if (!best || angle < best.angle) best = { candidate, angle };
    }
  }
  return best.angle <= snapDeg ? best.candidate : vector.clone().normalize();
}

/**
 * @returns {{ quaternion: Quaternion, method: 'rig' | 'geometry', up: Vector3, forward: Vector3,
 *   rotatedDeg: number, confident: boolean, detail: string }}
 */
export function detectModelOrientation(root, config = ORIENTATION_CONFIG) {
  root.updateMatrixWorld(true);
  let method = 'rig';
  let up;
  let forward;
  let confident = true;
  let detail;

  const { bones } = mapHumanoid(root);
  const frame = humanoidFrame((key) => bones.get(key)?.getWorldPosition(new Vector3()) ?? null);
  const describe = (vector) => {
    const axis = AXES.findIndex((a) => Math.abs(Math.abs(vector.dot(a)) - 1) < 1e-6);
    return axis >= 0 ? `${vector.getComponent(axis) > 0 ? '+' : '−'}${AXIS_NAMES[axis]}` : `(${vector.toArray().map((v) => v.toFixed(2)).join(', ')})`;
  };
  if (frame) {
    up = snapToAxis(frame.up, config.snapDeg);
    // Forward within the plane ⟂ up, then snapped.
    forward = snapToAxis(frame.forward.clone().addScaledVector(up, -frame.forward.dot(up)).normalize(), config.snapDeg);
    detail = `rig: hips → head, left ↔ right ${frame.pairs} · up ${describe(up)}, front ${describe(forward)}`;
  } else {
    method = 'geometry';
    const vertices = collectWorldVertices(root);
    const box = vertexBox(vertices);
    const center = box.getCenter(new Vector3());
    const { axis: upAxis } = detectUpAxis(vertices, box, config);
    // Head end: the vertex centroid lies in the upper part of a figure.
    let centroid = 0;
    for (let i = upAxis; i < vertices.length; i += 3) centroid += vertices[i];
    centroid = (centroid / (vertices.length / 3) - box.min.getComponent(upAxis)) / (box.max.getComponent(upAxis) - box.min.getComponent(upAxis));
    const upsideDown = centroid < config.upsideDownCentroid;
    up = AXES[upAxis].clone().multiplyScalar(upsideDown ? -1 : 1);
    const [h1, h2] = [0, 1, 2].filter((axis) => axis !== upAxis).map((axis) => AXES[axis].clone());
    const lateral = detectLateralDirection(vertices, center, up, h1, h2, config);
    const facing = new Vector3().crossVectors(lateral.direction, up).normalize(); // left × up
    const sign = detectFrontSign(vertices, center, up, facing, lateral.direction, config);
    const weak = Math.abs(sign.score) < config.minSignScore;
    // Weak evidence: keep the file's +Z front if it is one of the two options.
    const fileFront = Math.abs(facing.z) > 0.99 ? Math.sign(facing.z) : 0;
    const frontSign = weak && fileFront ? fileFront : Math.sign(sign.score) || 1;
    forward = facing.multiplyScalar(frontSign);
    confident = !weak && lateral.score - lateral.across > config.symmetryMargin;
    detail =
      `geometry: up ${describe(up)}${upsideDown ? ' (file upside down)' : ''}, front ${describe(forward)}` +
      ` (mirror ${lateral.score.toFixed(2)} vs ${lateral.across.toFixed(2)}${lateral.snapped ? '' : ` at ${lateral.deg}°`}, face ${sign.noseScore.toFixed(2)}, toes ${sign.toeScore.toFixed(2)}${weak ? ', weak → file front kept' : ''})`;
  }

  const left = new Vector3().crossVectors(up, forward).normalize();
  const trueForward = new Vector3().crossVectors(left, up).normalize();
  // Basis (left, up, forward) → (X, Y, Z): the inverse of the basis rotation.
  const basis = new Matrix4().makeBasis(left, up.clone().normalize(), trueForward);
  const quaternion = new Quaternion().setFromRotationMatrix(basis).invert();
  const rotatedDeg = (2 * Math.acos(Math.min(1, Math.abs(quaternion.w))) * 180) / Math.PI;
  return { quaternion, method, up, forward: trueForward, rotatedDeg, confident, detail };
}

/** Rotates the model's root (before fitting) so it stands on +Y facing +Z. */
export function alignModelToFront(root) {
  const orientation = detectModelOrientation(root);
  root.quaternion.premultiply(orientation.quaternion);
  root.updateMatrixWorld(true);
  return orientation;
}

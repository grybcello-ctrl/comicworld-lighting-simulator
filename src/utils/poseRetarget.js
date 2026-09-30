/**
 * Pose retargeting between humanoid skeletons with different bone names,
 * bone axes, proportions and rest poses (e.g. a Mixamo T-pose clip onto an
 * A-pose character).
 *
 * Both skeletons are mapped to canonical humanoid bones (humanoidRig.js) and
 * a body frame is taken from each rest pose (up = hips → head, left = right
 * → left arm). C rotates the source body frame onto the target body frame.
 * For every canonical bone, parents first:
 *   1. Joint rotation: the source bone's rotation relative to its nearest
 *      mapped ancestor, measured from its rest pose and expressed in world
 *      space at rest (δ), is mapped by C and applied on the target's rest:
 *        W_new = W_anc,new · W_anc,rest⁻¹ · (C δ C⁻¹) · W_rest
 *      This carries twist and bend independently of each rig's bone axes.
 *   2. Direction: for bones with a mapped child (spine, neck, arms, legs,
 *      fingers) a swing aligns the target bone's direction to its child with
 *      the source's (after C). This removes rest-pose differences
 *      (T-pose ↔ A-pose) exactly, which relative rotations alone cannot.
 * The hips take the whole-body rotation. Root translation is not applied:
 * the model is set back on the floor afterwards.
 */
import { AnimationMixer, Matrix4, Quaternion, Vector3 } from 'three';
import { humanoidFrame, mapHumanoid, primaryChildKey } from './humanoidRig.js';

const tmpMatrix = new Matrix4();

/** World rotation + position of every canonical bone. */
function worldPoses(map) {
  const out = new Map();
  for (const [key, bone] of map) {
    bone.updateWorldMatrix(true, false);
    const position = new Vector3();
    const quaternion = new Quaternion();
    bone.matrixWorld.decompose(position, quaternion, new Vector3());
    out.set(key, { quaternion, position });
  }
  return out;
}

/** World poses from explicit world matrices (bind pose). */
function worldPosesFromMatrices(map, matrices) {
  const out = new Map();
  for (const [key, bone] of map) {
    const matrix = matrices.get(bone);
    if (!matrix) return null;
    const position = new Vector3();
    const quaternion = new Quaternion();
    matrix.decompose(position, quaternion, new Vector3());
    out.set(key, { quaternion, position });
  }
  return out;
}

const frameOf = (poses) => humanoidFrame((key) => poses.get(key)?.position ?? null);

/**
 * Samples a pose source: rest and posed world transforms of its canonical bones.
 * Rest = the file's node transforms (clips animate away from them), or, for a
 * file without clips, the skin's bind pose (a posed character saved as-is).
 * @param {import('./poseFileLoader.js').PoseSource} source
 */
export function sampleSource(source, clipIndex = 0, time = 0) {
  const { bones: map, unmapped } = mapHumanoid(source.root);
  if (!map.has('hips')) throw new Error('No hips bone found in the pose file — it does not look like a humanoid skeleton.');
  if (!source.rest) {
    // Remember the node transforms once, before any clip touches them.
    source.rest = new Map();
    source.root.traverse((object) => source.rest.set(object, { q: object.quaternion.clone(), p: object.position.clone(), s: object.scale.clone() }));
  }
  const restoreNodes = () => {
    for (const [object, { q, p, s }] of source.rest) {
      object.quaternion.copy(q);
      object.position.copy(p);
      object.scale.copy(s);
    }
    source.root.updateMatrixWorld(true);
  };
  const clip = source.clips[clipIndex] ?? null;
  restoreNodes();
  let rest = worldPoses(map);
  let pose;
  let restKind = 'file rest (node transforms)';
  if (clip) {
    const mixer = new AnimationMixer(source.root);
    mixer.clipAction(clip).play();
    mixer.setTime(Math.min(Math.max(time, 0), clip.duration));
    source.root.updateMatrixWorld(true);
    pose = worldPoses(map);
    mixer.stopAllAction();
    mixer.uncacheRoot(source.root);
    restoreNodes();
  } else {
    pose = rest;
    const bind = source.bindWorld ? worldPosesFromMatrices(map, source.bindWorld) : null;
    if (!bind) throw new Error('The file has no animation and no skin bind pose, so it holds no pose to transfer.');
    rest = bind;
    restKind = 'skin bind pose';
  }
  return { map, rest, pose, unmapped, restKind };
}

/**
 * Applies a sampled source pose to the target skeleton.
 * @param {ReturnType<typeof sampleSource>} source
 * @param {import('three').Object3D} targetRoot  the subject (bones below it)
 * @param {(bone: import('three').Bone) => Quaternion | null} restQuaternionOf  target rest (local)
 * @returns {{ applied: string[], missingInSource: string[], missingInTarget: string[] }}
 */
export function applyRetargetedPose(source, targetRoot, restQuaternionOf) {
  const { bones: target } = mapHumanoid(targetRoot);
  if (!target.has('hips')) throw new Error('The subject has no humanoid skeleton (no hips bone).');

  // Target rest pose: every mapped bone back to its rest rotation.
  for (const bone of target.values()) {
    const rest = restQuaternionOf(bone);
    if (rest) bone.quaternion.copy(rest);
  }
  targetRoot.updateMatrixWorld(true);
  const targetRest = worldPoses(target);

  const sourceFrame = frameOf(source.rest);
  const targetFrame = frameOf(targetRest);
  if (!sourceFrame || !targetFrame) throw new Error('Could not find hips, head and left/right arms or legs in both skeletons.');
  // C: source body frame → target body frame.
  const c = new Quaternion().setFromRotationMatrix(tmpMatrix.copy(targetFrame.matrix).multiply(sourceFrame.matrix.clone().invert()));
  const cInverse = c.clone().invert();

  // Parents first, following the target hierarchy.
  const order = [];
  targetRoot.traverse((object) => {
    for (const [key, bone] of target) if (bone === object) order.push(key);
  });
  const shared = new Set(order.filter((key) => source.map.has(key)));
  const nearestAncestorKey = (key) => {
    for (let o = target.get(key).parent; o; o = o.parent) {
      for (const candidate of shared) if (target.get(candidate) === o) return candidate;
    }
    return null;
  };

  const newWorld = new Map();
  const applied = [];
  for (const key of order) {
    if (!shared.has(key)) continue;
    const bone = target.get(key);
    const sRest = source.rest.get(key).quaternion;
    const sPose = source.pose.get(key).quaternion;
    const tRest = targetRest.get(key).quaternion;
    const ancestor = nearestAncestorKey(key);

    // 1. Relative joint rotation, from the source's rest, in world space at rest.
    let delta;
    let world;
    if (ancestor) {
      const aRest = source.rest.get(ancestor).quaternion;
      const aPose = source.pose.get(ancestor).quaternion;
      const relPose = aPose.clone().invert().multiply(sPose);
      const relRest = aRest.clone().invert().multiply(sRest);
      const deltaLocal = relPose.multiply(relRest.invert());
      delta = aRest.clone().multiply(deltaLocal).multiply(aRest.clone().invert());
      const mapped = c.clone().multiply(delta).multiply(cInverse);
      const tAncRest = targetRest.get(ancestor).quaternion;
      world = newWorld.get(ancestor).clone().multiply(tAncRest.clone().invert()).multiply(mapped).multiply(tRest);
    } else {
      delta = sPose.clone().multiply(sRest.clone().invert());
      world = c.clone().multiply(delta).multiply(cInverse).multiply(tRest);
    }

    // 2. Direction to the primary child matches the source exactly.
    const childKey = key === 'hips' ? null : primaryChildKey(key, shared);
    if (childKey) {
      const restOffset = targetRest.get(childKey).position.clone().sub(targetRest.get(key).position);
      const local = restOffset.applyQuaternion(tRest.clone().invert());
      const current = local.applyQuaternion(world).normalize();
      const wanted = source.pose.get(childKey).position.clone().sub(source.pose.get(key).position).applyQuaternion(c).normalize();
      if (current.lengthSq() > 0.5 && wanted.lengthSq() > 0.5) world = new Quaternion().setFromUnitVectors(current, wanted).multiply(world);
    }
    newWorld.set(key, world);

    // World → local under the (already posed) parent.
    const parentWorld = new Quaternion();
    bone.parent.getWorldQuaternion(parentWorld);
    bone.quaternion.copy(parentWorld.invert().multiply(world));
    bone.updateMatrixWorld(true);
    applied.push(key);
  }
  return {
    applied,
    missingInSource: order.filter((key) => !source.map.has(key)),
    missingInTarget: [...source.map.keys()].filter((key) => !target.has(key)),
  };
}

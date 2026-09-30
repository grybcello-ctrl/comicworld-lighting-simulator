/**
 * Humanoid skeleton mapping: bone names of common rigs (Mixamo, Unreal,
 * VRM, Character Creator, Rigify, 3ds Max Biped, BVH mocap) → canonical
 * bones. Used for automatic front alignment (modelOrientation.js) and for
 * pose retargeting (poseRetarget.js).
 *
 * Canonical names: hips, spine, spine1, spine2, neck, head, and per side
 * (left/right): shoulder, upperArm, lowerArm, hand, upperLeg, lowerLeg,
 * foot, toes, thumb1..3, index1..3, middle1..3, ring1..3, pinky1..3.
 * Keys look like 'hips', 'left.upperArm', 'right.index2'.
 */
import { Matrix4, Vector3 } from 'three';

const SIDE_BASES = {
  shoulder: ['shoulder', 'clavicle', 'collar', 'collarbone'],
  upperArm: ['arm', 'upperarm', 'uparm', 'humerus', 'shldr'],
  lowerArm: ['forearm', 'lowerarm', 'elbow'],
  hand: ['hand', 'wrist'],
  upperLeg: ['upleg', 'upperleg', 'thigh'],
  lowerLeg: ['leg', 'lowerleg', 'calf', 'shin', 'knee'],
  foot: ['foot', 'ankle'],
  toes: ['toebase', 'toe', 'toes', 'ball'],
};
const BASE_TO_PART = new Map(Object.entries(SIDE_BASES).flatMap(([part, bases]) => bases.map((base) => [base, part])));
const FINGERS = { thumb: 'thumb', index: 'index', middle: 'middle', mid: 'middle', ring: 'ring', pinky: 'pinky', little: 'pinky' };
const SPINE_BASES = /^(spine\d*|chest|upperchest|lowerback|abdomen|waist|torso)$/;
// End sites and helpers carry no rotation of their own.
const IGNORED = /(end|nub|tip|top|twist|roll|ik|pole|target|helper|jiggle|adjust|correct|dummy)/;
const PREFIXES = /^(mixamorig\d*|mixamo|armature|skeleton|cc_base_|bip0?1|def[-_.]|org[-_.]|mch[-_.]|j_bip_|j_adj_|b_|bn_|bone_)/i;

/**
 * Splits a bone name into side and base, e.g.
 *   'mixamorigLeftUpLeg' → { side: 'left', base: 'upleg' }
 *   'thigh_l' / 'Bip01 L Thigh' / 'J_Bip_L_UpperLeg' → { side: 'left', base: 'thigh' | 'upperleg' }
 */
export function parseBoneName(name) {
  let raw = String(name ?? '').trim();
  for (let i = 0; i < 3; i++) raw = raw.replace(PREFIXES, '');
  const lower = raw.toLowerCase();
  let side = null;
  let rest = lower;
  if (/left/.test(rest)) {
    side = 'left';
    rest = rest.replace('left', ' ');
  } else if (/right/.test(rest)) {
    side = 'right';
    rest = rest.replace('right', ' ');
  } else {
    // Separate single-letter side tokens: '_l', '.L', 'l_', ' L '.
    const tokens = rest.split(/[^a-z0-9]+/).filter(Boolean);
    const sideToken = tokens.find((token) => token === 'l' || token === 'r');
    if (sideToken) {
      side = sideToken === 'l' ? 'left' : 'right';
      rest = tokens.filter((token) => token !== sideToken).join(' ');
    } else {
      // Glued prefix in mocap names: 'LHipJoint', 'RThumb', 'lForeArm'.
      // (DAZ/Poser BVH: 'rShldr', 'lMid1', 'rButtock'.)
      const glued = rest.match(/^([lr])(?=(hipjoint|buttock|thumb|index|mid|ring|pinky|clavicle|shoulder|shldr|collar|upperarm|uparm|forearm|hand|thigh|upleg|calf|shin|leg|foot|toe))/);
      if (glued) {
        side = glued[1] === 'l' ? 'left' : 'right';
        rest = rest.slice(1);
      }
    }
  }
  const base = rest.replace(/[^a-z0-9]/g, '');
  return { side, base };
}

/** Canonical part for a side base, or null ('handthumb1' → 'thumb1'). */
function sidePart(base) {
  const finger = base.replace(/^hand/, '').match(/^(thumb|index|middle|mid|ring|pinky|little)0*(\d)?$/);
  if (finger) {
    const segment = Number(finger[2] ?? 1);
    return segment >= 1 && segment <= 3 ? `${FINGERS[finger[1]]}${segment}` : null;
  }
  return BASE_TO_PART.get(base) ?? null;
}

/** Bones below `root` in hierarchy order, with their depth. */
function collectBones(root) {
  const bones = [];
  const visit = (object, depth) => {
    if (object.isBone && !object.userData?.poseIgnore) bones.push({ bone: object, depth });
    for (const child of object.children) visit(child, depth + (object.isBone ? 1 : 0));
  };
  visit(root, 0);
  return bones;
}

const isAncestor = (ancestor, object) => {
  for (let o = object.parent; o; o = o.parent) if (o === ancestor) return true;
  return false;
};

/**
 * Maps the skeleton under `root` to canonical humanoid bones.
 * The spine chain between hips and neck is assigned by order (spine, spine1,
 * spine2), so rigs with 2–4 spine bones map consistently.
 * @returns {{ bones: Map<string, import('three').Bone>, names: Map<string, string>, unmapped: string[] }}
 */
export function mapHumanoid(root) {
  const bones = new Map();
  const unmapped = [];
  const all = collectBones(root);
  const spineCandidates = [];
  for (const { bone } of all) {
    const { side, base } = parseBoneName(bone.name);
    if (!base || IGNORED.test(base)) continue;
    let key = null;
    if (side) {
      const part = sidePart(base);
      if (part) key = `${side}.${part}`;
    } else if (base === 'hips' || base === 'pelvis' || base === 'hip') key = 'hips';
    else if (/^neck\d*$/.test(base)) key = bones.has('neck') ? null : 'neck';
    else if (base === 'head') key = 'head';
    else if (SPINE_BASES.test(base)) spineCandidates.push(bone);
    if (key && !bones.has(key)) bones.set(key, bone);
    else if (!key && !SPINE_BASES.test(base)) unmapped.push(bone.name);
  }
  // Spine chain: candidates between hips and neck, ordered root → head.
  const hips = bones.get('hips');
  const neck = bones.get('neck');
  const chain = spineCandidates.filter((bone) => (!hips || isAncestor(hips, bone)) && (!neck || isAncestor(bone, neck)));
  const spineKeys = chain.length <= 3 ? ['spine', 'spine1', 'spine2'].slice(0, chain.length) : ['spine', ...Array(chain.length - 2).fill(null), 'spine1', 'spine2'];
  chain.forEach((bone, i) => (spineKeys[i] ? bones.set(spineKeys[i], bone) : unmapped.push(bone.name)));
  const names = new Map([...bones].map(([key, bone]) => [key, bone.name]));
  return { bones, names, unmapped };
}

/** Next canonical bone whose direction a bone points along (null for ends). */
export function primaryChildKey(key, available) {
  const [side, part] = key.includes('.') ? key.split('.') : [null, key];
  const first = (...keys) => keys.find((candidate) => available.has(candidate)) ?? null;
  if (!side) {
    if (key === 'hips') return null; // oriented as a whole (pelvis), not by a single child
    if (key === 'spine') return first('spine1', 'spine2', 'neck');
    if (key === 'spine1') return first('spine2', 'neck');
    if (key === 'spine2') return first('neck');
    if (key === 'neck') return first('head');
    return null;
  }
  const s = (name) => `${side}.${name}`;
  const finger = part.match(/^(thumb|index|middle|ring|pinky)(\d)$/);
  if (finger) return Number(finger[2]) < 3 ? first(s(`${finger[1]}${Number(finger[2]) + 1}`)) : null;
  switch (part) {
    case 'shoulder':
      return first(s('upperArm'));
    case 'upperArm':
      return first(s('lowerArm'));
    case 'lowerArm':
      return first(s('hand'));
    case 'hand':
      return first(s('middle1'), s('index1'), s('ring1'));
    case 'upperLeg':
      return first(s('lowerLeg'));
    case 'lowerLeg':
      return first(s('foot'));
    case 'foot':
      return first(s('toes'));
    default:
      return null;
  }
}

/**
 * Body frame of a humanoid from world bone positions: up = hips → head,
 * left = right → left (upper arms, else shoulders, else upper legs),
 * forward = left × up (the direction the figure faces). Orthonormal.
 * @param {(key: string) => Vector3 | null} positionOf world position of a canonical bone
 * @returns {{ matrix: Matrix4, up: Vector3, left: Vector3, forward: Vector3, pairs: string } | null}
 */
export function humanoidFrame(positionOf) {
  const hips = positionOf('hips');
  const top = positionOf('head') ?? positionOf('neck') ?? positionOf('spine2');
  if (!hips || !top) return null;
  let pairs = null;
  let left = null;
  for (const part of ['upperArm', 'shoulder', 'upperLeg', 'hand', 'foot']) {
    const l = positionOf(`left.${part}`);
    const r = positionOf(`right.${part}`);
    if (l && r && l.distanceTo(r) > 1e-6) {
      left = l.clone().sub(r);
      pairs = part;
      break;
    }
  }
  if (!left) return null;
  const up = top.clone().sub(hips).normalize();
  left.addScaledVector(up, -left.dot(up)).normalize(); // orthogonal to up
  const forward = new Vector3().crossVectors(left, up).normalize();
  if (!Number.isFinite(forward.x) || forward.lengthSq() < 0.5) return null;
  return { matrix: new Matrix4().makeBasis(left, up, forward), up, left, forward, pairs };
}

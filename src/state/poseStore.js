/**
 * Pose Mode: which bone of the loaded model the rotate gizmo is attached to.
 *
 * React state holds only plain data (mode, bone list, selection, revision).
 * The bone objects and their rest rotations live in a module registry filled
 * by the scene (PoseController.jsx) when a model is loaded, so posing never
 * copies three.js objects into React state.
 */
import { useSyncExternalStore } from 'react';

let state = {
  poseMode: false,
  // [{ id, name, label, depth }] of the current subject, in hierarchy order.
  bones: [],
  selectedBoneId: null,
  // Incremented after every finished pose change (drag end, reset).
  revision: 0,
};
const listeners = new Set();

/** id (bone uuid) → { bone, restQuaternion } */
const registry = new Map();
/** Scene callback: refresh shadows, bounds and AF targets after a pose change. */
let poseCommitHandler = null;

function setState(changes) {
  state = { ...state, ...changes };
  for (const listener of listeners) listener();
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getPoseState = () => state;
export const usePoseState = () => useSyncExternalStore(subscribe, getPoseState);

export const getBoneObject = (id) => registry.get(id)?.bone ?? null;

/**
 * Called by the scene when the subject changes. Collects every object with
 * isBone === true (except helper anchors flagged userData.poseIgnore) and
 * remembers its rest rotation.
 */
export function registerSkeleton(root) {
  registry.clear();
  const bones = [];
  const nameCount = new Map();
  const visit = (object, depth) => {
    if (object.isBone && !object.userData.poseIgnore) {
      const name = object.name || '(unnamed bone)';
      const count = (nameCount.get(name) ?? 0) + 1;
      nameCount.set(name, count);
      registry.set(object.uuid, { bone: object, restQuaternion: object.quaternion.clone() });
      bones.push({ id: object.uuid, name, label: count > 1 ? `${name} #${count}` : name, depth });
    }
    const childDepth = object.isBone && !object.userData.poseIgnore ? depth + 1 : depth;
    for (const child of object.children) visit(child, childDepth);
  };
  if (root) visit(root, 0);
  setState({ bones, selectedBoneId: null, revision: state.revision + 1 });
}

export function setPoseCommitHandler(handler) {
  poseCommitHandler = handler;
  return () => {
    if (poseCommitHandler === handler) poseCommitHandler = null;
  };
}

/** The scene reports a finished pose change (gizmo drag released). */
export function commitPose() {
  poseCommitHandler?.();
  setState({ revision: state.revision + 1 });
}

export const poseActions = {
  setPoseMode(poseMode) {
    setState({ poseMode: Boolean(poseMode) });
  },
  selectBone(id) {
    setState({ selectedBoneId: registry.has(id) ? id : null });
  },
  resetSelectedBone() {
    const entry = registry.get(state.selectedBoneId);
    if (!entry) return;
    entry.bone.quaternion.copy(entry.restQuaternion);
    commitPose();
  },
  resetPose() {
    for (const { bone, restQuaternion } of registry.values()) bone.quaternion.copy(restQuaternion);
    commitPose();
  },
};

/** True when any bone differs from its rest rotation. */
export function isPosed() {
  for (const { bone, restQuaternion } of registry.values()) {
    if (bone.quaternion.angleTo(restQuaternion) > 1e-6) return true;
  }
  return false;
}

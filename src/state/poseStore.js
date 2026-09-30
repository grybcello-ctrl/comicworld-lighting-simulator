/**
 * Pose Mode: which bone of the loaded model the rotate gizmo is attached to.
 *
 * React state holds only plain data (mode, bone list, selection, revision).
 * The bone objects and their rest rotations live in a module registry filled
 * by the scene (PoseController.jsx) when a model is loaded, so posing never
 * copies three.js objects into React state.
 */
import { useSyncExternalStore } from 'react';
import { clipFrames, loadPoseFile } from '../utils/poseFileLoader.js';
import { applyRetargetedPose, sampleSource } from '../utils/poseRetarget.js';
import { getSubjectState, groundCustomModel } from './subjectStore.js';

let state = {
  poseMode: false,
  // [{ id, name, label, depth }] of the current subject, in hierarchy order.
  bones: [],
  selectedBoneId: null,
  // Incremented after every finished pose change (drag end, reset, import).
  revision: 0,
  // Imported pose (plain data; the source skeleton lives in `poseSource`):
  // { fileName, format, clips: [{ name, frames, fps }], clipIndex, frame,
  //   applied, missingInSource, missingInTarget, restKind, groundShiftM } | null
  importedPose: null,
  poseImport: { busy: false, error: null },
};
/** Skeleton + clips of the imported pose file (kept to scrub its frames). */
let poseSource = null;
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
  poseSource = null;
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
  setState({ bones, selectedBoneId: null, importedPose: null, poseImport: { busy: false, error: null }, revision: state.revision + 1 });
}

/** Retargets the stored source at (clip, frame) onto the subject, grounds it and refreshes the scene. */
function applyImportedPose(clipIndex, frame) {
  const stage = getSubjectState().model.object;
  if (!poseSource || !stage) throw new Error('Load a rigged Custom Model first.');
  const clip = poseSource.clips[clipIndex];
  const { fps } = clip ? clipFrames(clip) : { fps: 30 };
  const sampled = sampleSource(poseSource, clipIndex, frame / fps);
  const result = applyRetargetedPose(sampled, stage, (bone) => registry.get(bone.uuid)?.restQuaternion ?? null);
  const groundShiftM = groundCustomModel();
  commitPose();
  return { ...result, restKind: sampled.restKind, sourceUnmapped: sampled.unmapped.length, groundShiftM };
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
    groundCustomModel();
    commitPose();
  },
  /**
   * 'Import Pose': loads a .glb/.gltf/.fbx/.bvh file and retargets its pose
   * (first frame of the first clip, or the skin's pose) onto the subject.
   */
  async importPose(file) {
    if (!file) return;
    if (registry.size === 0) {
      setState({ poseImport: { busy: false, error: 'The subject has no skeleton — load a rigged glTF/GLB (e.g. Mixamo) as Custom Model first.' } });
      return;
    }
    setState({ poseImport: { busy: true, error: null } });
    try {
      const source = await loadPoseFile(file);
      poseSource = source;
      const clips = source.clips.map((clip) => ({ name: clip.name || 'clip', ...clipFrames(clip) }));
      // Prefer a clip with motion (Mixamo FBX files also carry an empty 'Take 001').
      const clipIndex = Math.max(0, clips.findIndex((clip) => clip.frames > 1));
      const result = applyImportedPose(clipIndex, 0);
      setState({
        importedPose: { fileName: file.name, format: source.format, clips, clipIndex, frame: 0, ...result },
        poseImport: { busy: false, error: null },
      });
    } catch (error) {
      poseSource = null;
      setState({ poseImport: { busy: false, error: `Pose import failed: ${error.message}` } });
    }
  },
  /** Another clip / frame of the imported file. */
  setImportedPoseFrame(clipIndex, frame) {
    const current = state.importedPose;
    if (!current || !poseSource) return;
    const clip = current.clips[clipIndex];
    const safeFrame = Math.min(Math.max(Math.round(frame), 0), (clip?.frames ?? 1) - 1);
    try {
      const result = applyImportedPose(clipIndex, safeFrame);
      setState({ importedPose: { ...current, clipIndex, frame: safeFrame, ...result }, poseImport: { busy: false, error: null } });
    } catch (error) {
      setState({ poseImport: { busy: false, error: `Pose import failed: ${error.message}` } });
    }
  },
  /** Drops the imported pose and returns to the rest pose. */
  clearImportedPose() {
    poseSource = null;
    setState({ importedPose: null, poseImport: { busy: false, error: null } });
    poseActions.resetPose();
  },
};

/** True when any bone differs from its rest rotation. */
export function isPosed() {
  for (const { bone, restQuaternion } of registry.values()) {
    if (bone.quaternion.angleTo(restQuaternion) > 1e-6) return true;
  }
  return false;
}

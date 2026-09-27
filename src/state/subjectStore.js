/**
 * Subject state: which subject is lit (default mannequin or a custom glTF
 * model) and the lifecycle of the custom model.
 *
 * A small external store (useSyncExternalStore) rather than React state: the
 * custom model is a three.js object graph with GPU resources and async loading,
 * so ownership and disposal live here, outside React's render/effect timing.
 *
 * Resource rules:
 *   - Exactly one custom model is alive at a time.
 *   - Switching to the mannequin disposes the custom model (geometries,
 *     materials, textures, ImageBitmaps) and cancels any in-flight load.
 *   - Uploading a new model keeps the current one visible until the new one is
 *     ready, then swaps and disposes the old one. A failed upload keeps it.
 *   - A load that finishes after a newer upload / a switch is disposed on arrival.
 *   - Object URLs are revoked by the loader when each load settles.
 */
import { useSyncExternalStore } from 'react';
import { SUBJECT_CONFIG, SUBJECT_TYPES } from '../config/sceneConfig.js';
import { disposeObject3D } from '../utils/disposeObject3D.js';
import { loadModelFromFiles, ModelLoadError } from '../utils/modelLoader.js';
import {
  collectModelStats,
  fitModelToStage,
  prepareMeshesForLighting,
  stripEmbeddedLightsAndCameras,
} from '../utils/modelPreparation.js';

/**
 * @typedef {Object} CustomModelState
 * @property {number} id                  changes with every new model (React key)
 * @property {import('three').Group | null} object  fitted stage group, or null
 * @property {Object | null} info         readout data for the panel
 * @property {string | null} loadingFileName
 * @property {string | null} error
 * @property {Object | null} lastReleased what the last disposal freed
 */
const EMPTY_MODEL = Object.freeze({
  id: 0,
  object: null,
  info: null,
  loadingFileName: null,
  error: null,
  lastReleased: null,
});

let state = { subjectType: SUBJECT_TYPES.MANNEQUIN, model: EMPTY_MODEL };
const listeners = new Set();

/** Incremented to invalidate every load that is still in flight. */
let loadSequence = 0;
let activeLoad = null;

function setState(next) {
  state = next;
  for (const listener of listeners) listener();
}
const setModel = (changes) => setState({ ...state, model: { ...state.model, ...changes } });

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSubjectState = () => state;

/** React hook: current subject state. Works inside and outside the Canvas. */
export const useSubjectState = () => useSyncExternalStore(subscribe, getSubjectState);

function cancelActiveLoad() {
  loadSequence++;
  activeLoad?.cancel();
  activeLoad = null;
}

/** Detaches and disposes the current custom model. */
function releaseCurrentModel() {
  const { object } = state.model;
  return object ? disposeObject3D(object) : null;
}

/** 'mannequin' | 'custom'. Switching to the mannequin frees the custom model. */
export function setSubjectType(subjectType) {
  if (!Object.values(SUBJECT_TYPES).includes(subjectType) || subjectType === state.subjectType) return;
  if (subjectType === SUBJECT_TYPES.MANNEQUIN) {
    cancelActiveLoad();
    const released = releaseCurrentModel();
    setState({ subjectType, model: { ...EMPTY_MODEL, lastReleased: released } });
    return;
  }
  setState({ ...state, subjectType });
}

/** Loads, prepares and fits a model from local files, then makes it the subject. */
export async function loadCustomModel(files) {
  const fileList = Array.from(files ?? []);
  cancelActiveLoad();
  const token = ++loadSequence;
  const isCurrent = () => token === loadSequence && state.subjectType === SUBJECT_TYPES.CUSTOM;

  let handle;
  try {
    handle = loadModelFromFiles(fileList);
  } catch (error) {
    setModel({ loadingFileName: null, error: error.message });
    return;
  }
  activeLoad = { cancel: handle.cancel };
  setModel({ loadingFileName: fileList.map((file) => file.name).join(', '), error: null });

  let loaded = null;
  try {
    loaded = await handle.promise;
    if (!isCurrent()) {
      disposeObject3D(loaded.scene); // superseded while loading
      return;
    }

    const stripped = stripEmbeddedLightsAndCameras(loaded.scene);
    const prepared = prepareMeshesForLighting(loaded.scene);
    const stats = collectModelStats(loaded.scene);
    if (prepared.meshes === 0) throw new ModelLoadError(`${loaded.fileName} contains no meshes.`);
    const fit = fitModelToStage(loaded.scene, SUBJECT_CONFIG.targetHeightM);

    // Swap first, then free the previous model (it is detached immediately).
    const released = releaseCurrentModel();
    setState({
      ...state,
      model: {
        id: token,
        object: fit.stage,
        info: {
          fileName: loaded.fileName,
          totalBytes: loaded.totalBytes,
          companionCount: loaded.companionCount,
          missingFiles: loaded.missingFiles,
          ignoredFiles: loaded.ignoredFiles,
          extensionsUsed: loaded.extensionsUsed,
          animationCount: loaded.animationCount,
          loadMs: loaded.loadMs,
          meshes: prepared.meshes,
          unlitMaterialsConverted: prepared.unlitMaterialsConverted,
          strippedLights: stripped.lights,
          strippedCameras: stripped.cameras,
          ...stats,
          originalSize: fit.originalSize,
          scale: fit.scale,
          fittedSize: fit.fittedSize,
          fittedMin: fit.fittedMin,
          fittedCenter: fit.fittedCenter,
        },
        loadingFileName: null,
        error: null,
        lastReleased: released,
      },
    });
  } catch (error) {
    if (loaded?.scene) disposeObject3D(loaded.scene);
    if (isCurrent()) {
      setModel({ loadingFileName: null, error: error instanceof ModelLoadError ? error.message : String(error) });
    }
  } finally {
    if (token === loadSequence) activeLoad = null;
  }
}

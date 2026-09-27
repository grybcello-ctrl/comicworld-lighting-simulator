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
 *   - Blob URLs: a loaded model owns the Blob URLs of all its files (main file,
 *     .bin, textures) and they are revoked in the same clean-up that disposes
 *     its geometry/materials/textures. Failed/cancelled loads revoke their
 *     URLs immediately (modelLoader.js).
 */
import { useSyncExternalStore } from 'react';
import { SUBJECT_CONFIG, SUBJECT_TYPES } from '../config/sceneConfig.js';
import { disposeObject3D } from '../utils/disposeObject3D.js';
import { loadModelFromFiles, ModelLoadError } from '../utils/modelLoader.js';
import { ensureColorTextureSpaces } from '../utils/textureColorSpace.js';
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
 * @property {ReturnType<import('../utils/blobUrlRegistry.js').createBlobUrlRegistry> | null} blobUrls
 *           Blob URLs of the model's files, revoked on clean-up
 * @property {Object | null} info         readout data for the panel
 * @property {string | null} loadingFileName
 * @property {string | null} error
 * @property {Object | null} lastReleased what the last disposal freed
 */
const EMPTY_MODEL = Object.freeze({
  id: 0,
  object: null,
  blobUrls: null,
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

/**
 * Frees everything a loaded model owns: geometries, materials, textures and
 * image bitmaps (disposeObject3D) plus every Blob URL of its files.
 */
function disposeLoadedModel(object, blobUrls) {
  const released = disposeObject3D(object);
  released.blobUrls = blobUrls ? blobUrls.revokeAll() : 0;
  return released;
}

/** Detaches and disposes the current custom model. */
function releaseCurrentModel() {
  const { object, blobUrls } = state.model;
  return object ? disposeLoadedModel(object, blobUrls) : null;
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
      disposeLoadedModel(loaded.scene, loaded.blobUrls); // superseded while loading
      loaded = null;
      return;
    }

    const stripped = stripEmbeddedLightsAndCameras(loaded.scene);
    const prepared = prepareMeshesForLighting(loaded.scene);
    // After prepareMeshesForLighting, so converted (unlit -> PBR) materials are checked too.
    const colorSpaces = ensureColorTextureSpaces(loaded.scene);
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
        blobUrls: loaded.blobUrls,
        info: {
          fileName: loaded.fileName,
          totalBytes: loaded.totalBytes,
          resourceCount: loaded.resourceCount,
          mappedCount: loaded.mappedCount,
          blobUrlCount: loaded.blobUrls.size,
          missingFiles: loaded.missingFiles,
          unusedFiles: loaded.unusedFiles,
          ambiguousFiles: loaded.ambiguousFiles,
          substitutedFiles: loaded.substitutedFiles,
          boundByName: loaded.boundByName,
          unboundImages: loaded.unboundImages,
          imageSources: loaded.imageSources,
          modifierCalls: loaded.modifierCalls,
          specGlossMaterials: loaded.specGlossMaterials,
          unsupportedExtensions: loaded.unsupportedExtensions,
          colorSpaces,
          extensionsUsed: loaded.extensionsUsed,
          animationCount: loaded.animationCount,
          loadMs: loaded.loadMs,
          meshes: prepared.meshes,
          unlitMaterialsConverted: prepared.unlitMaterialsConverted,
          doubleSidedMaterials: prepared.doubleSidedMaterials,
          madeDoubleSided: prepared.madeDoubleSided,
          thinMaterials: prepared.thinMaterials,
          solidMaterials: prepared.solidMaterials,
          clonedMaterials: prepared.clonedMaterials,
          topologyAnalysed: prepared.topologyAnalysed,
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
    if (loaded) disposeLoadedModel(loaded.scene, loaded.blobUrls);
    if (isCurrent()) {
      setModel({ loadingFileName: null, error: error instanceof ModelLoadError ? error.message : String(error) });
    }
  } finally {
    if (token === loadSequence) activeLoad = null;
  }
}

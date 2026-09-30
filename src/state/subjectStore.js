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
import { Quaternion, Vector3 } from 'three';
import { SUBJECT_CONFIG, SUBJECT_TYPES } from '../config/sceneConfig.js';
import { disposeObject3D } from '../utils/disposeObject3D.js';
import { loadModelFromFiles, ModelLoadError } from '../utils/modelLoader.js';
import { ensureColorTextureSpaces } from '../utils/textureColorSpace.js';
import {
  collectModelStats,
  fitModelToStage,
  groundModelStage,
  prepareMeshesForLighting,
  refitModelStage,
  stripEmbeddedLightsAndCameras,
} from '../utils/modelPreparation.js';
import { alignModelToFront } from '../utils/modelOrientation.js';

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
  // Bumped when the model is re-oriented or re-posed in place (same object):
  // shadows and AF targets are refreshed for every revision.
  revision: 0,
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

const showsCustom = (subject) => subject.subjectType === SUBJECT_TYPES.CUSTOM && subject.model.object !== null;
/** Changes whenever the rendered subject or its shape changes (shadows, AF). */
export const subjectKeyOf = (subject) =>
  showsCustom(subject) ? `custom-${subject.model.id}-r${subject.model.revision}` : SUBJECT_TYPES.MANNEQUIN;
/** Changes only when another model is shown (the pose rest state belongs to it). */
export const skeletonKeyOf = (subject) => (showsCustom(subject) ? `custom-${subject.model.id}` : SUBJECT_TYPES.MANNEQUIN);

const WORLD_AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

/**
 * Manual orientation fix for the custom model: rotates it about a world axis
 * ('y' = turn, 'x' = tip forward/back, 'z' = roll) and re-fits it in place
 * (feet on the floor, centered, 1.725 m tall).
 */
export function rotateCustomModel(axis, degrees) {
  const { object, info } = state.model;
  if (!object || !WORLD_AXES[axis]) return;
  const root = object.children[0].children[0];
  root.quaternion.premultiply(new Quaternion().setFromAxisAngle(WORLD_AXES[axis], (degrees * Math.PI) / 180));
  const fit = refitModelStage(object, SUBJECT_CONFIG.targetHeightM);
  const manual = { ...(info.orientation.manual ?? { x: 0, y: 0, z: 0 }) };
  manual[axis] = (((manual[axis] + degrees) % 360) + 540) % 360 - 180;
  setModel({
    revision: state.model.revision + 1,
    info: { ...info, ...fit, orientation: { ...info.orientation, manual } },
  });
}

/** After an imported pose: the lowest point back on the floor, then refresh shadows/AF. */
export function groundCustomModel() {
  const { object } = state.model;
  if (!object) return 0;
  const shift = groundModelStage(object);
  setModel({ revision: state.model.revision + 1 });
  return shift;
}

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
    // Stand the model on +Y facing the camera (+Z), whatever the file's axes.
    const orientation = alignModelToFront(loaded.scene);
    const fit = fitModelToStage(loaded.scene, SUBJECT_CONFIG.targetHeightM);

    // Swap first, then free the previous model (it is detached immediately).
    const released = releaseCurrentModel();
    setState({
      ...state,
      model: {
        id: token,
        revision: 0,
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
          orientation: {
            method: orientation.method,
            rotatedDeg: orientation.rotatedDeg,
            confident: orientation.confident,
            detail: orientation.detail,
            manual: { x: 0, y: 0, z: 0 },
          },
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

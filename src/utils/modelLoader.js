/**
 * Local glTF/GLB loading — nothing leaves the browser.
 *
 * - The chosen File becomes a blob URL via URL.createObjectURL() and is parsed
 *   by GLTFLoader (lazy-imported, so the main bundle does not grow).
 * - A .gltf may reference external files (scene.bin, textures/skin.png). The
 *   user selects them together with the .gltf; a LoadingManager URL modifier
 *   maps each relative URI (resolved against the blob URL) to the matching
 *   file's own blob URL by file name.
 * - Draco (KHR_draco_mesh_compression) and Meshopt (EXT_meshopt_compression)
 *   use the decoders bundled with three.js (same-origin assets, no CDN).
 * - Every object URL created here is revoked as soon as the load settles
 *   (success, error or cancel): by then GLTFLoader has read all buffers and
 *   decoded all images, so the URLs are no longer needed.
 * - Cancelling never interrupts GLTFLoader mid-parse (that would orphan
 *   half-built textures); the load runs to completion and its result is
 *   disposed here instead of being returned.
 */
import { SUBJECT_CONFIG } from '../config/sceneConfig.js';
import { disposeObject3D } from './disposeObject3D.js';

export class ModelLoadError extends Error {}

const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
};

/** Matches the UUID path of a blob URL (our own URLs and GLTFLoader's internal image URLs). */
const BLOB_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Value for the file input's `accept` attribute. */
export const MODEL_FILE_ACCEPT = [
  ...SUBJECT_CONFIG.modelExtensions,
  ...SUBJECT_CONFIG.companionExtensions,
  'model/gltf-binary',
  'model/gltf+json',
].join(',');

/**
 * Splits a file selection into exactly one model file and its companions.
 * @param {File[] | FileList} files
 */
export function classifyModelFiles(files) {
  const list = Array.from(files ?? []);
  const models = list.filter((file) => SUBJECT_CONFIG.modelExtensions.includes(extensionOf(file.name)));
  if (models.length === 0) {
    const names = list.map((file) => file.name).join(', ') || 'nothing';
    throw new ModelLoadError(`Choose a .glb or .gltf file (selected: ${names}).`);
  }
  if (models.length > 1) {
    throw new ModelLoadError(
      `Select one model at a time (got ${models.map((file) => file.name).join(', ')}).`,
    );
  }
  const [modelFile] = models;
  const others = list.filter((file) => file !== modelFile);
  return {
    modelFile,
    companions: others.filter((file) => SUBJECT_CONFIG.companionExtensions.includes(extensionOf(file.name))),
    ignored: others.filter((file) => !SUBJECT_CONFIG.companionExtensions.includes(extensionOf(file.name))),
  };
}

/** Turns loader errors into messages a user can act on. */
function explainLoadError(error, missingFiles, modelFile) {
  const message = error?.message ?? String(error);
  if (missingFiles.length) {
    return `Missing file(s) referenced by ${modelFile.name}: ${missingFiles.join(', ')}. Select them together with the .gltf file.`;
  }
  if (/KTX2/i.test(message)) {
    return 'This model uses KTX2 (Basis) compressed textures, which this simulator does not decode. Re-export it with PNG/JPEG/WebP textures.';
  }
  if (/Unexpected token|JSON/i.test(message)) return `${modelFile.name} is not a valid glTF file (${message}).`;
  return `Could not load ${modelFile.name}: ${message}`;
}

/**
 * Starts loading a model from local files.
 * @param {File[] | FileList} files  one .glb/.gltf plus optional companion files
 * @returns {{ promise: Promise<LoadedModel>, cancel: () => void }}
 *
 * @typedef {Object} LoadedModel
 * @property {import('three').Group} scene  the glTF default scene (caller owns it)
 * @property {string} fileName
 * @property {number} totalBytes             model + companion files
 * @property {number} companionCount
 * @property {string[]} missingFiles         referenced but not selected (e.g. textures)
 * @property {string[]} ignoredFiles         selected but not usable
 * @property {string[]} extensionsUsed
 * @property {number} animationCount
 * @property {number} loadMs
 */
export function loadModelFromFiles(files) {
  const { modelFile, companions, ignored } = classifyModelFiles(files);

  const objectUrls = new Set();
  const createObjectUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  };
  const revokeAll = () => {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
  };

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };

  const promise = (async () => {
    const startedAt = performance.now();
    const missingFiles = new Set();
    let dracoLoader = null;
    try {
      const [{ LoadingManager }, { GLTFLoader }, { DRACOLoader, DRACO_GLTF_CONFIG }, { MeshoptDecoder }] =
        await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      if (cancelled) throw new ModelLoadError('Load cancelled.');

      const modelUrl = createObjectUrl(modelFile);
      const companionUrls = new Map(
        companions.map((file) => [file.name.toLowerCase(), createObjectUrl(file)]),
      );
      // Relative URIs inside a .gltf resolve against "blob:<origin>/".
      const blobBase = modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1);

      const manager = new LoadingManager();
      manager.setURLModifier((url) => {
        if (!url.startsWith(blobBase)) return url; // data:, http(s):, decoder files
        const relativePath = decodeURIComponent(url.slice(blobBase.length).split(/[?#]/)[0]);
        if (BLOB_UUID_PATTERN.test(relativePath)) return url; // a real blob URL
        const fileName = relativePath.split(/[\\/]/).pop().toLowerCase();
        const mapped = companionUrls.get(fileName);
        if (mapped) return mapped;
        missingFiles.add(relativePath);
        return url;
      });

      // The glTF-specific Draco build (smaller than the default decoder).
      dracoLoader = new DRACOLoader(manager).setDecoderPath(DRACO_GLTF_CONFIG);
      const loader = new GLTFLoader(manager).setDRACOLoader(dracoLoader).setMeshoptDecoder(MeshoptDecoder);

      const gltf = await loader.loadAsync(modelUrl);
      if (cancelled) {
        disposeObject3D(gltf.scene); // superseded: free it right here
        throw new ModelLoadError('Load cancelled.');
      }
      if (!gltf.scene) throw new ModelLoadError(`${modelFile.name} contains no scene.`);

      return {
        scene: gltf.scene,
        fileName: modelFile.name,
        totalBytes: [modelFile, ...companions].reduce((sum, file) => sum + file.size, 0),
        companionCount: companions.length,
        missingFiles: [...missingFiles],
        ignoredFiles: ignored.map((file) => file.name),
        extensionsUsed: gltf.parser?.json?.extensionsUsed ?? [],
        animationCount: gltf.animations?.length ?? 0,
        loadMs: performance.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof ModelLoadError) throw error;
      throw new ModelLoadError(explainLoadError(error, [...missingFiles], modelFile));
    } finally {
      // Decoder workers and every blob URL are released no matter what happened.
      dracoLoader?.dispose();
      revokeAll();
    }
  })();

  return { promise, cancel };
}

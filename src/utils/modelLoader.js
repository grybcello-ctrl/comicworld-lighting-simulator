/**
 * Local glTF/GLB loading — nothing leaves the browser.
 *
 * Multi-file .gltf (separate .bin and texture files):
 *   1. The selection is split into one main file (*.gltf / *.glb) and all
 *      other files (modelFileSet.js).
 *   2. Every file gets a Blob URL (URL.createObjectURL) tracked in one
 *      registry (blobUrlRegistry.js); the other files form a Blob URL map
 *      keyed by file name.
 *   3. A THREE.LoadingManager with setURLModifier() redirects each request
 *      GLTFLoader makes (buffers, images) to the matching Blob URL. The same
 *      manager instance is handed to GLTFLoader, whose parser passes it to its
 *      FileLoader (buffers) and ImageBitmapLoader/TextureLoader (images), and
 *      to DRACOLoader — every resource request goes through the modifier.
 *   4. Selected images the model never requested (typical for .glb files that
 *      lost their texture references) are bound to materials by file name
 *      (externalTextureBinder.js), through the same manager.
 * GLTFLoader, DRACOLoader and the Meshopt decoder are lazy-imported, so the
 * main bundle does not grow; the decoders ship with three.js (same origin).
 *
 * Blob URL lifetime: on success the registry is handed to the caller together
 * with the model, and revoked when that model is replaced or removed. On error
 * or cancel it is revoked here immediately, and textures GLTFLoader already
 * decoded before the failure (e.g. images loaded, .bin missing) are disposed
 * too — they never reach a scene, so nobody else could free them. Cancelling never interrupts
 * GLTFLoader mid-parse (that would orphan half-built textures): the load runs
 * to completion and its result is disposed here instead of being returned.
 */
import { createBlobUrlRegistry } from './blobUrlRegistry.js';
import { bindUnreferencedTextures } from './externalTextureBinder.js';
import { disposeObject3D } from './disposeObject3D.js';
import { createResourceResolver, extensionOf, ModelFileError, splitModelFiles } from './modelFileSet.js';
import { SUBJECT_CONFIG } from '../config/sceneConfig.js';

export class ModelLoadError extends Error {}

/** Value for the file input's `accept` attribute (a hint; any file can be added). */
export const MODEL_FILE_ACCEPT = [
  ...SUBJECT_CONFIG.modelExtensions,
  ...SUBJECT_CONFIG.resourceExtensionHints,
  'model/gltf-binary',
  'model/gltf+json',
].join(',');

/**
 * GLTFLoader plugin that only records the parser, so a failed load can free
 * the textures the parser had already created (parser.textureCache).
 */
function captureParser(onParser) {
  return (parser) => {
    onParser(parser);
    return { name: 'studio_capture_parser' };
  };
}

/**
 * Disposes every texture a failed or cancelled parse created, incl. decoded
 * ImageBitmaps. Textures of a scene that was already disposed are skipped
 * (a closed ImageBitmap reports 0 × 0), so nothing is released twice.
 */
async function disposeParserTextures(parser) {
  const pending = Object.values(parser?.textureCache ?? {});
  const textures = await Promise.all(pending.map((promise) => promise.catch(() => null)));
  let count = 0;
  for (const texture of new Set(textures)) {
    if (!texture) continue;
    const image = texture.source?.data ?? texture.image;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
      if (image.width === 0 && image.height === 0) continue; // already closed with its scene
      image.close();
    }
    texture.dispose();
    count++;
  }
  return count;
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
 * @param {File[] | FileList} files  one .glb/.gltf plus any number of resource files
 * @returns {{ promise: Promise<LoadedModel>, cancel: () => void }}
 *
 * @typedef {Object} LoadedModel
 * @property {import('three').Group} scene  the glTF default scene (caller owns it)
 * @property {ReturnType<typeof createBlobUrlRegistry>} blobUrls
 *           Blob URLs of all selected files (caller owns them; revoke on clean-up)
 * @property {string} fileName
 * @property {number} totalBytes             all selected files
 * @property {number} resourceCount          selected files besides the model
 * @property {number} mappedCount            resource files the model actually requested
 * @property {string[]} missingFiles         requested but not selected (e.g. a texture)
 * @property {string[]} unusedFiles          selected but never requested
 * @property {string[]} ambiguousFiles       requested names matching several files
 * @property {Array<{ requested: string, used: string }>} substitutedFiles
 *           requested under another extension (skin.tga -> skin.png)
 * @property {Array<{ file: string, material: string, slots: string[], label: string }>} boundByName
 *           unreferenced images bound to materials by file name
 * @property {Array<{ file: string, reason: string }>} unboundImages
 * @property {{ embedded: number, external: number, total: number }} imageSources
 *           how the model itself stores its images
 * @property {number} modifierCalls          requests seen by the URL modifier
 * @property {string[]} extensionsUsed
 * @property {number} animationCount
 * @property {number} loadMs
 */
export function loadModelFromFiles(files) {
  let split;
  try {
    split = splitModelFiles(files);
  } catch (error) {
    throw new ModelLoadError(error.message);
  }
  const { modelFile, resourceFiles } = split;
  const blobUrls = createBlobUrlRegistry();

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };

  const promise = (async () => {
    const startedAt = performance.now();
    let resolver = null;
    let dracoLoader = null;
    let parser = null;
    let succeeded = false;
    try {
      const [{ LoadingManager }, { GLTFLoader }, { DRACOLoader, DRACO_GLTF_CONFIG }, { MeshoptDecoder }] =
        await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/loaders/DRACOLoader.js'),
          import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        ]);
      if (cancelled) throw new ModelLoadError('Load cancelled.');

      resolver = createResourceResolver({ modelFile, resourceFiles, registry: blobUrls });
      const manager = new LoadingManager();
      manager.setURLModifier(resolver.resolveUrl);

      // The glTF-specific Draco build (smaller than the default decoder).
      dracoLoader = new DRACOLoader(manager).setDecoderPath(DRACO_GLTF_CONFIG);
      const loader = new GLTFLoader(manager)
        .setDRACOLoader(dracoLoader)
        .setMeshoptDecoder(MeshoptDecoder)
        .register(captureParser((value) => (parser = value)));

      const gltf = await loader.loadAsync(resolver.modelUrl);
      if (cancelled) {
        disposeObject3D(gltf.scene); // superseded: free it right here
        throw new ModelLoadError('Load cancelled.');
      }
      if (!gltf.scene) throw new ModelLoadError(`${modelFile.name} contains no scene.`);

      // Images the model never asked for: bind by file name, same manager.
      const referenced = resolver.report();
      const binding = await bindUnreferencedTextures({
        root: gltf.scene,
        unusedEntries: referenced.unusedEntries,
        manager,
      });
      if (cancelled) {
        disposeObject3D(gltf.scene);
        throw new ModelLoadError('Load cancelled.');
      }
      const boundFiles = new Set(binding.bound.map((item) => item.file));

      const report = resolver.report();
      const images = gltf.parser?.json?.images ?? [];
      const embedded = images.filter((image) => image.bufferView !== undefined || /^data:/i.test(image.uri ?? '')).length;
      succeeded = true;
      return {
        scene: gltf.scene,
        blobUrls,
        fileName: modelFile.name,
        totalBytes: [modelFile, ...resourceFiles].reduce((sum, file) => sum + file.size, 0),
        resourceCount: resourceFiles.length,
        mappedCount: report.mapped + boundFiles.size,
        missingFiles: report.missing,
        unusedFiles: report.unused.filter((name) => !boundFiles.has(name)),
        ambiguousFiles: report.ambiguous,
        substitutedFiles: report.substituted,
        boundByName: binding.bound,
        unboundImages: binding.unbound,
        imageSources: { embedded, external: images.length - embedded, total: images.length },
        modifierCalls: report.modifierCalls,
        extensionsUsed: gltf.parser?.json?.extensionsUsed ?? [],
        animationCount: gltf.animations?.length ?? 0,
        loadMs: performance.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof ModelLoadError) throw error;
      if (error instanceof ModelFileError) throw new ModelLoadError(error.message);
      throw new ModelLoadError(explainLoadError(error, resolver?.report().missing ?? [], modelFile));
    } finally {
      dracoLoader?.dispose(); // decoder workers
      if (!succeeded) {
        // Nobody will own these URLs or partially built textures.
        blobUrls.revokeAll();
        await disposeParserTextures(parser);
      }
    }
  })();

  return { promise, cancel };
}

export { extensionOf };

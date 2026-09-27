/**
 * Multi-file glTF support: turns a user's file selection into
 *   - the main model file (exactly one *.gltf or *.glb), and
 *   - a Blob URL map for ALL other files (buffers, textures, anything else),
 *     keyed by file name,
 * plus a resolver for THREE.LoadingManager.setURLModifier() that redirects
 * every resource request GLTFLoader makes to the matching local Blob URL.
 *
 * How the redirect works: GLTFLoader resolves a relative URI against the
 * model's own URL. For a model loaded from "blob:<origin>/<uuid>" the base is
 * "blob:<origin>/", so "textures/Skin%20Color.png" is requested as
 * "blob:<origin>/textures/Skin%20Color.png" — a URL that does not exist. The
 * resolver strips that base, normalizes the path and looks the file up.
 *
 * Matching (case-insensitive), in order:
 *   1. exact relative path, if the browser provides one (webkitRelativePath)
 *   2. file name — the last path segment of the URI
 *   3. if several selected files share that name, the one whose path ends
 *      with the requested path; otherwise the first, reported as ambiguous
 * Normalization handles URI encoding (%20), "./" and "../", Windows
 * backslashes, query strings / fragments and absolute exporter paths
 * ("C:\\Users\\me\\tex.png", "file:///...").
 */
import { SUBJECT_CONFIG } from '../config/sceneConfig.js';

export class ModelFileError extends Error {}

export const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
};

/** Matches the UUID path of a real blob URL (ours, or GLTFLoader's embedded images). */
const BLOB_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** decodeURIComponent that never throws on malformed sequences like "100%.png". */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Normalizes a resource path to forward-slash, lower-case segments without
 * scheme, drive letter, "." or "..".
 * @returns {string[]} path segments, e.g. ["textures", "skin color.png"]
 */
export function normalizeResourcePath(rawPath) {
  const withoutQuery = rawPath.split(/[?#]/)[0];
  return safeDecode(withoutQuery)
    .replace(/\\/g, '/')
    .replace(/^[a-z][a-z0-9+.-]*:\/*/i, '') // file:///, C:/ (drive letters look like schemes)
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => segment.toLowerCase());
}

const pathOf = (file) => normalizeResourcePath(file.webkitRelativePath || file.name);

/**
 * Finds the one main model file; every other file becomes a resource.
 * @param {File[] | FileList} files
 * @returns {{ modelFile: File, resourceFiles: File[] }}
 */
export function splitModelFiles(files) {
  const list = Array.from(files ?? []);
  const models = list.filter((file) => SUBJECT_CONFIG.modelExtensions.includes(extensionOf(file.name)));
  if (models.length === 0) {
    const names = list.map((file) => file.name).join(', ') || 'nothing';
    throw new ModelFileError(`Choose a .glb or .gltf file (selected: ${names}).`);
  }
  if (models.length > 1) {
    throw new ModelFileError(`Select one model at a time (got ${models.map((file) => file.name).join(', ')}).`);
  }
  const [modelFile] = models;
  return { modelFile, resourceFiles: list.filter((file) => file !== modelFile) };
}

/**
 * Creates the main-file Blob URL, the Blob URL map for every resource file and
 * the URL-modifier function. All URLs come from `registry` (blobUrlRegistry.js),
 * so the caller can revoke them together.
 *
 * @param {{ modelFile: File, resourceFiles: File[],
 *   registry: ReturnType<import('./blobUrlRegistry.js').createBlobUrlRegistry> }} params
 */
export function createResourceResolver({ modelFile, resourceFiles, registry }) {
  const modelUrl = registry.create(modelFile);
  // Relative URIs inside the model resolve against "blob:<origin>/". (If a
  // blob URL had no "/", GLTFLoader would use "./" as base instead.)
  const slash = modelUrl.lastIndexOf('/');
  const blobBase = slash >= 0 ? modelUrl.slice(0, slash + 1) : null;
  const modelDirectory = pathOf(modelFile).slice(0, -1);

  /** File name (lower-case) -> entries with that name. */
  const blobUrlsByName = new Map();
  const entries = resourceFiles.map((file) => {
    const entry = { file, path: pathOf(file), url: registry.create(file), requested: false };
    const key = file.name.toLowerCase();
    if (!blobUrlsByName.has(key)) blobUrlsByName.set(key, []);
    blobUrlsByName.get(key).push(entry);
    return entry;
  });

  const requested = new Set();
  const missing = new Set();
  const ambiguous = new Set();

  const endsWith = (path, suffix) =>
    suffix.length <= path.length && suffix.every((segment, i) => path[path.length - suffix.length + i] === segment);

  function findEntry(segments) {
    // 1. Exact path relative to the model (folder selections provide real paths).
    const exact = [...modelDirectory, ...segments].join('/');
    const exactMatch = entries.find((entry) => entry.path.join('/') === exact);
    if (exactMatch) return exactMatch;
    // 2./3. By file name, disambiguated by the longest matching path suffix.
    const candidates = blobUrlsByName.get(segments[segments.length - 1]) ?? [];
    if (candidates.length <= 1) return candidates[0] ?? null;
    const bySuffix = candidates.filter((entry) => endsWith(entry.path, segments));
    if (bySuffix.length === 1) return bySuffix[0];
    ambiguous.add(segments.join('/')); // several files fit: use the first, but report it
    return bySuffix[0] ?? candidates[0];
  }

  /** For LoadingManager.setURLModifier(): redirect resource requests to Blob URLs. */
  /** Relative part of a request, or null for absolute URLs that must pass through. */
  function relativePathOf(url) {
    if (blobBase && url.startsWith(blobBase)) {
      const rest = url.slice(blobBase.length);
      return BLOB_UUID_PATTERN.test(rest.split(/[?#]/)[0]) ? null : rest; // a real blob URL
    }
    // data:, blob:, http(s):, //host and same-origin assets (decoders) pass through.
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/')) return null;
    return url; // "./" base (no-slash blob URLs)
  }

  function resolveUrl(url) {
    const rawPath = relativePathOf(url);
    if (rawPath === null) return url;
    const segments = normalizeResourcePath(rawPath);
    if (segments.length === 0) return url;
    const displayPath = safeDecode(rawPath.split(/[?#]/)[0]).replace(/\\/g, '/');
    requested.add(displayPath);
    const entry = findEntry(segments);
    if (!entry) {
      missing.add(displayPath);
      return url; // an unknown blob: URL fails locally (no network request)
    }
    entry.requested = true;
    return entry.url;
  }

  /** What the model asked for vs. what the user selected (read after the load settles). */
  function report() {
    return {
      requested: [...requested],
      missing: [...missing],
      ambiguous: [...ambiguous],
      unused: entries.filter((entry) => !entry.requested).map((entry) => entry.file.name),
      mapped: entries.filter((entry) => entry.requested).length,
    };
  }

  return { modelUrl, blobBase, blobUrlsByName, resolveUrl, report };
}

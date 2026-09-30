/**
 * Multi-file glTF / GLB support: turns a user's file selection into
 *   - the main model file (exactly one *.gltf or *.glb), and
 *   - a Blob URL map for ALL other files (buffers, textures, anything else),
 *     keyed by normalized file name,
 * plus a resolver for THREE.LoadingManager.setURLModifier() that redirects
 * every resource request GLTFLoader makes to the matching local Blob URL.
 * Works the same for .gltf and .glb: a .glb may also reference external
 * images/buffers by URI (only bufferView-embedded images need no file).
 *
 * How the redirect works: GLTFLoader resolves a relative URI against the
 * model's own URL. For a model loaded from "blob:<origin>/<uuid>" the base is
 * "blob:<origin>/", so "textures/Skin%20Color.png" is requested as
 * "blob:<origin>/textures/Skin%20Color.png" — a URL that does not exist.
 * Absolute URIs written by exporters ("http://…/tex.png", a stale
 * "blob:http://other-origin/머리.png", "file:///D:/…") are requested as-is and
 * can never load here either. For every such request the resolver extracts the
 * pure file name and looks it up among the selected files.
 *
 * File-name extraction: strip query/fragment → percent-decode (tolerating
 * malformed "%") → "\\" to "/" → drop scheme/host/drive → last path segment →
 * Unicode NFC (macOS file pickers report Korean names decomposed, NFD, while
 * glTF JSON is usually NFC) → lower case.
 *
 * Matching, in order:
 *   1. exact relative path, if the browser provides one (webkitRelativePath)
 *   2. file name (case-insensitive, NFC)
 *   3. if several selected files share that name, the one whose path ends
 *      with the requested path; otherwise the first, reported as ambiguous
 *   4. same name without extension, among image files only (e.g. the model
 *      asks for "skin.tga" / "skin.psd", the user selected "skin.png";
 *      browsers decode by content, not by extension), reported as a
 *      substitution
 * Requests that must never be redirected: data: URIs, live blob URLs (our
 * own and GLTFLoader's embedded images) and the app's own assets (decoders).
 */
import { SUBJECT_CONFIG } from '../config/sceneConfig.js';

export class ModelFileError extends Error {}

export const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
};

/** Extensions treated as images for extension-less (stem) matching. */
export const IMAGE_EXTENSIONS = Object.freeze([
  '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp', '.ktx2',
  '.tga', '.tif', '.tiff', '.psd', '.exr', '.dds', '.hdr',
]);
export const isImageName = (name) => IMAGE_EXTENSIONS.includes(extensionOf(name));

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

/** Case- and Unicode-insensitive key: NFC (precomposed Hangul) + lower case. */
export const nameKey = (name) => name.normalize('NFC').toLowerCase();

const stemOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/**
 * Normalizes a resource path to forward-slash, NFC, lower-case segments
 * without query, scheme, host, drive letter, "." or "..".
 * @returns {string[]} path segments, e.g. ["textures", "skin color.png"]
 */
export function normalizeResourcePath(rawPath) {
  let path = safeDecode(rawPath.split(/[?#]/)[0]).replace(/\\/g, '/');
  path = path.replace(/^blob:/i, ''); // "blob:http://host/x.png" -> "http://host/x.png"
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, ''); // scheme + host (http://host, file://)
  path = path.replace(/^\/\/[^/]*/, ''); // protocol-relative //host
  path = path.replace(/^[a-z][a-z0-9+.-]*:/i, ''); // drive letter "C:" or bare scheme
  return path
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => nameKey(segment));
}

/**
 * The pure file name of any URL/URI GLTFLoader may request, e.g.
 *   "blob:http://localhost:3000/%EB%A8%B8.png?x=1"  -> "머.png"
 *   "C:\\Users\\me\\Tex.PNG"                         -> "tex.png"
 */
export const fileNameFromUrl = (url) => normalizeResourcePath(url).pop() ?? '';

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
    throw new ModelFileError(`Choose a .glb, .gltf, .obj or .fbx file (selected: ${names}).`);
  }
  if (models.length > 1) {
    throw new ModelFileError(`Select one model at a time (got ${models.map((file) => file.name).join(', ')}).`);
  }
  const [modelFile] = models;
  return { modelFile, resourceFiles: list.filter((file) => file !== modelFile) };
}

/** The app's own same-origin, non-blob URLs (decoder scripts/wasm) — never redirected. */
function isAppAssetUrl(url) {
  if (typeof location === 'undefined' || !/^https?:/i.test(url)) return false;
  try {
    return new URL(url).origin === location.origin;
  } catch {
    return false;
  }
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

  /** Normalized file name -> entries with that name. */
  const blobUrlsByName = new Map();
  /** Normalized image name without extension -> image entries. */
  const imagesByStem = new Map();
  const entries = resourceFiles.map((file) => {
    const entry = { file, path: pathOf(file), url: registry.create(file), requested: false };
    const key = nameKey(file.name);
    if (!blobUrlsByName.has(key)) blobUrlsByName.set(key, []);
    blobUrlsByName.get(key).push(entry);
    if (isImageName(file.name)) {
      const stem = stemOf(key);
      if (!imagesByStem.has(stem)) imagesByStem.set(stem, []);
      imagesByStem.get(stem).push(entry);
    }
    return entry;
  });
  const liveUrls = new Set(entries.map((entry) => entry.url));

  const requested = new Set();
  const missing = new Set();
  const ambiguous = new Set();
  const substituted = []; // { requested, used }
  let modifierCalls = 0;

  const endsWith = (path, suffix) =>
    suffix.length <= path.length && suffix.every((segment, i) => path[path.length - suffix.length + i] === segment);

  function findEntry(segments) {
    const fileName = segments[segments.length - 1];
    // 1. Exact path relative to the model (folder selections provide real paths).
    const exact = [...modelDirectory, ...segments].join('/');
    const exactMatch = entries.find((entry) => entry.path.join('/') === exact);
    if (exactMatch) return { entry: exactMatch };
    // 2./3. By file name, disambiguated by the longest matching path suffix.
    const candidates = blobUrlsByName.get(fileName) ?? [];
    if (candidates.length === 1) return { entry: candidates[0] };
    if (candidates.length > 1) {
      const bySuffix = candidates.filter((entry) => endsWith(entry.path, segments));
      if (bySuffix.length === 1) return { entry: bySuffix[0] };
      ambiguous.add(segments.join('/')); // several files fit: use the first, but report it
      return { entry: bySuffix[0] ?? candidates[0] };
    }
    // 4. Same image under another extension (skin.tga -> skin.png).
    if (isImageName(fileName)) {
      const sameStem = imagesByStem.get(stemOf(fileName)) ?? [];
      if (sameStem.length >= 1) {
        if (sameStem.length > 1) ambiguous.add(segments.join('/'));
        return { entry: sameStem[0], substituted: true };
      }
    }
    return { entry: null };
  }

  /**
   * The part of a request to look up, or null for URLs that must pass through
   * untouched (data:, live blob URLs, the app's own assets).
   */
  function lookupPathOf(url) {
    if (/^data:/i.test(url)) return null;
    if (liveUrls.has(url) || url === modelUrl) return null;
    if (blobBase && url.startsWith(blobBase)) {
      const rest = url.slice(blobBase.length);
      return BLOB_UUID_PATTERN.test(rest.split(/[?#]/)[0]) ? null : rest; // a real blob URL
    }
    if (/^blob:/i.test(url)) {
      // A blob URL of another page/origin (stale exporter URI): look it up by
      // name; a real, live blob of this page (uuid path) passes through.
      const tail = url.split(/[?#]/)[0].split('/').pop();
      return BLOB_UUID_PATTERN.test(tail) ? null : url;
    }
    if (isAppAssetUrl(url)) return null;
    return url; // http(s)://elsewhere, //host, file:, "./" base, bare names
  }

  /** For LoadingManager.setURLModifier(): redirect resource requests to Blob URLs. */
  function resolveUrl(url) {
    modifierCalls++;
    const rawPath = lookupPathOf(url);
    if (rawPath === null) return url;
    const segments = normalizeResourcePath(rawPath);
    if (segments.length === 0) return url;
    const displayPath = safeDecode(rawPath.split(/[?#]/)[0]).replace(/\\/g, '/').normalize('NFC');
    requested.add(displayPath);
    const { entry, substituted: isSubstitute } = findEntry(segments);
    if (!entry) {
      missing.add(displayPath);
      return url; // cannot load; GLTFLoader leaves that texture slot empty
    }
    entry.requested = true;
    if (isSubstitute) substituted.push({ requested: displayPath, used: entry.file.name.normalize('NFC') });
    return entry.url;
  }

  /** What the model asked for vs. what the user selected (read after the load settles). */
  function report() {
    return {
      modifierCalls,
      requested: [...requested],
      missing: [...missing],
      ambiguous: [...ambiguous],
      substituted: [...substituted],
      unused: entries.filter((entry) => !entry.requested).map((entry) => entry.file.name.normalize('NFC')),
      unusedEntries: entries.filter((entry) => !entry.requested),
      mapped: entries.filter((entry) => entry.requested).length,
    };
  }

  return { modelUrl, blobBase, blobUrlsByName, resolveUrl, report };
}

/**
 * Binds selected image files that the model never asked for to its materials,
 * by file name. This is the common "white model" case: the .glb (often
 * converted from FBX/OBJ, or exported with "textures: none") contains no image
 * references at all, so no LoadingManager redirect can ever fire.
 *
 * File name -> (material, slot):
 *   "Body_BaseColor.png"  -> material "Body", map
 *   "hair_albedo.PNG"     -> material "Hair", map
 *   "Face_Mat_Normal.png" -> material "Face_Mat", normalMap
 *   "Body_ORM.png"        -> aoMap + roughnessMap + metalnessMap (R/G/B, glTF order)
 *   "texture.png"         -> the only material of a single-material model, map
 * Tokens come from camelCase / "_" / "-" / "." / space splits of the NFC,
 * lower-cased names. Slot keywords are read from the end of the name; the
 * rest ("MAT_Unagi_Body_1_UI") is matched against material and mesh names:
 *   1. exact name   — all tokens, numbers included ("body 1" ≠ "body 2")
 *   2. token subset — every file token appears in the name, numbers included
 *   3. loose        — noise words ("mat", "material") and pure numbers ignored
 * The first stage with exactly one candidate wins. Ambiguous or unmatched
 * files are reported, never guessed. Slots the model already fills are never
 * overwritten.
 *
 * Textures are created like GLTFLoader's own (ImageBitmap, flipY = false for
 * glTF UVs, repeat wrapping, mipmaps); color slots are tagged SRGBColorSpace.
 * They load from the selection's Blob URLs through the same LoadingManager.
 */
import { SRGBColorSpace } from 'three';
import { extensionOf, isImageName, nameKey } from './modelFileSet.js';

/** Image formats browsers can decode natively (others can't be bound). */
const DECODABLE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp'];

/**
 * Slot keywords, matched as the LAST tokens of the file name (longest first).
 * `slots` lists the material properties the image feeds.
 */
const SLOT_RULES = [
  { words: ['occlusion roughness metallic', 'occlusionroughnessmetallic', 'orm', 'arm', 'rma'], slots: ['aoMap', 'roughnessMap', 'metalnessMap'], label: 'ORM' },
  { words: ['metallic roughness', 'metallicroughness', 'metalroughness'], slots: ['roughnessMap', 'metalnessMap'], label: 'metallic-roughness' },
  { words: ['base color', 'base colour', 'basecolor', 'basecolour', 'albedo', 'diffuse', 'diff', 'color', 'colour', 'col', 'alb', 'bc', 'd', '베이스컬러', '베이스 컬러', '컬러', '색상', '디퓨즈', '알베도'], slots: ['map'], label: 'base color' },
  { words: ['normal dx', 'normaldx', 'normal directx', 'nrm dx'], slots: ['normalMap'], label: 'normal (DirectX)', directX: true },
  { words: ['normal gl', 'normalgl', 'normal opengl', 'normal', 'nrm', 'nor', 'norm', 'nml', 'n', '노멀', '노말'], slots: ['normalMap'], label: 'normal' },
  { words: ['roughness', 'rough', 'rgh', '러프니스', '거칠기'], slots: ['roughnessMap'], label: 'roughness' },
  { words: ['metallic', 'metalness', 'metal', '메탈릭', '메탈니스', '금속'], slots: ['metalnessMap'], label: 'metalness' },
  { words: ['ambient occlusion', 'ambientocclusion', 'occlusion', 'ao', '오클루전'], slots: ['aoMap'], label: 'ambient occlusion' },
  { words: ['emissive', 'emission', 'emit', 'glow', '이미시브', '발광'], slots: ['emissiveMap'], label: 'emissive' },
  // Recognized but not bindable automatically (would change the material model).
  { words: ['height', 'displacement', 'disp', 'bump', 'specular', 'spec', 'gloss', 'glossiness', 'opacity', 'alpha', 'mask', 'transmission', 'subsurface', 'sss', 'cavity', 'curvature', 'id', '높이', '투명도', '알파'], slots: [], label: 'unsupported' },
];
const COLOR_SLOTS = new Set(['map', 'emissiveMap']);
/** Single-letter keywords only count as a suffix after a name ("body_d"), never alone. */
const SHORT_WORDS = new Set(['d', 'n']);
const NOISE_TOKENS = new Set(['mat', 'material', 'materials', 'mtl', 'mi', 'm', 't', 'shader', 'tex', 'texture', 'textures', 'tx', 'map', 'img', 'image', 'final', 'default', '재질', '텍스처', '텍스쳐']);
/** Resolution / variant suffixes after the slot keyword: "_BaseColor_4k", "_Normal_01", "_Color.1001". */
const TRAILING_NOISE = /^(\d+|\d+k|udim|lod\d*|v\d+|srgb|linear|lin)$/;

/** "Face_MatNormal-01.PNG" -> ["face", "mat", "normal", "01"] */
export function tokenize(name) {
  return name
    .normalize('NFC')
    .replace(/\.[^.]+$/, '') // extension
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2') // camelCase
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
const meaningful = (tokens) => tokens.filter((token) => !NOISE_TOKENS.has(token) && !/^\d+$/.test(token));

/**
 * Splits a file name into the name part and its slot rule.
 * @returns {{ nameTokens: string[], keyTokens: string[], rule: object | null }}
 *   nameTokens: every token of the name part (numbers kept), keyTokens: loose form
 */
export function classifyTextureName(fileName) {
  const tokens = tokenize(fileName);
  while (tokens.length > 1 && TRAILING_NOISE.test(tokens[tokens.length - 1])) tokens.pop();
  for (let take = Math.min(3, tokens.length); take >= 1; take--) {
    const tail = tokens.slice(-take);
    const phrase = tail.join(' ');
    const joined = tail.join('');
    for (const rule of SLOT_RULES) {
      const hit = rule.words.find((word) => word === phrase || (take > 1 && word === joined));
      if (!hit) continue;
      if (SHORT_WORDS.has(hit) && tokens.length === 1) continue;
      const nameTokens = tokens.slice(0, -take);
      return { nameTokens, keyTokens: meaningful(nameTokens), rule };
    }
  }
  return { nameTokens: tokens, keyTokens: meaningful(tokens), rule: null }; // no keyword: a base color at best
}

/** Material -> names it can be matched by (its own name, the names of meshes using it). */
function collectMaterials(root) {
  const byMaterial = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      if (!byMaterial.has(material)) byMaterial.set(material, { names: [tokenize(material.name || '')] });
      if (object.name) byMaterial.get(material).names.push(tokenize(object.name));
    }
  });
  return byMaterial;
}

/** Mesh names carry exporter suffixes ("Body_1_UI_0"): ignore a trailing primitive index. */
const withoutPrimitiveIndex = (tokens) => (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1]) ? tokens.slice(0, -1) : tokens);

/**
 * Best material for a file name, in three stages (see the header):
 * exact name, token subset with numbers, loose tokens without numbers.
 */
function matchMaterial({ nameTokens, keyTokens }, materials) {
  const entries = [...materials];
  if (nameTokens.length === 0 && keyTokens.length === 0) return { material: null, reason: 'no name to match' };

  const unique = (candidates) => {
    const distinct = [...new Set(candidates)];
    return distinct.length === 1 ? distinct[0] : distinct.length > 1 ? 'ambiguous' : null;
  };
  const exactKey = nameTokens.join(' ');
  const stages = [
    // 1. Exact: "mat unagi body 1 ui" == material "MAT_Unagi_Body_1_UI".
    () => entries.filter(([, { names }]) => names.some((n) => n.join(' ') === exactKey || withoutPrimitiveIndex(n).join(' ') === exactKey)),
    // 2. Every file token (numbers included) appears in one name; tightest names win.
    () => {
      const hits = entries
        .map(([material, { names }]) => ({ material, size: Math.min(...names.filter((n) => nameTokens.every((t) => n.includes(t))).map((n) => n.length)) }))
        .filter((entry) => Number.isFinite(entry.size));
      const tightest = Math.min(...hits.map((entry) => entry.size));
      return hits.filter((entry) => entry.size === tightest).map((entry) => [entry.material]);
    },
    // 3. Loose: noise words and numbers ignored ("T_Body_D" -> "body").
    () => {
      if (keyTokens.length === 0) return [];
      const hits = entries
        .map(([material, { names }]) => ({ material, size: Math.min(...names.map(meaningful).filter((n) => keyTokens.every((t) => n.includes(t))).map((n) => n.length)) }))
        .filter((entry) => Number.isFinite(entry.size));
      const tightest = Math.min(...hits.map((entry) => entry.size));
      return hits.filter((entry) => entry.size === tightest).map((entry) => [entry.material]);
    },
  ];
  let ambiguous = false;
  for (const stage of stages) {
    const result = nameTokens.length ? unique(stage().map(([material]) => material)) : null;
    if (result === 'ambiguous') {
      ambiguous = true;
      continue;
    }
    if (result) return { material: result };
  }
  return { material: null, reason: ambiguous ? 'several materials match' : 'no material with that name' };
}

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/**
 * @param {{ root: import('three').Object3D, unusedEntries: Array<{ file: File, url: string }>,
 *   manager: import('three').LoadingManager }} params
 * @returns {Promise<{ bound: Array<{ file: string, material: string, slots: string[], label: string }>,
 *   unbound: Array<{ file: string, reason: string }> }>}
 */
export async function bindUnreferencedTextures({ root, unusedEntries, manager }) {
  const bound = [];
  const unbound = [];
  const images = unusedEntries.filter((entry) => isImageName(entry.file.name));
  if (images.length === 0) return { bound, unbound };

  const materials = collectMaterials(root);
  const onlyMaterial = materials.size === 1 ? [...materials.keys()][0] : null;

  // 1. Decide (material, slots) for every file, without touching anything yet.
  const plans = [];
  for (const entry of images) {
    const fileName = entry.file.name.normalize('NFC');
    if (!DECODABLE_EXTENSIONS.includes(extensionOf(fileName))) {
      unbound.push({ file: fileName, reason: `${extensionOf(fileName)} cannot be decoded by browsers — convert it to PNG/JPEG` });
      continue;
    }
    const classified = classifyTextureName(fileName);
    const { rule } = classified;
    if (rule && rule.slots.length === 0) {
      unbound.push({ file: fileName, reason: 'this map type is not bound automatically' });
      continue;
    }
    const slots = rule ? rule.slots : ['map'];
    let { material, reason } = matchMaterial(classified, materials);
    if (!material && onlyMaterial) material = onlyMaterial; // single-material model
    if (!material) {
      unbound.push({ file: fileName, reason });
      continue;
    }
    plans.push({ entry, fileName, material, slots, rule, specificity: classified.nameTokens.length });
  }

  // 2. One file per (material, slot); the model's own textures always win.
  const claims = new Map(); // "uuid|slot" -> plans
  for (const plan of plans) {
    for (const slot of plan.slots) {
      const key = `${plan.material.uuid}|${slot}`;
      if (!claims.has(key)) claims.set(key, []);
      claims.get(key).push(plan);
    }
  }
  const accepted = [];
  for (const plan of plans) {
    const usable = plan.slots.filter((slot) => slot in plan.material && !plan.material[slot]);
    if (usable.length === 0) {
      unbound.push({ file: plan.fileName, reason: `"${plan.material.name || 'material'}" already has this texture` });
      continue;
    }
    const contested = usable.some((slot) => {
      const rivals = claims.get(`${plan.material.uuid}|${slot}`);
      const best = Math.max(...rivals.map((rival) => rival.specificity));
      return rivals.filter((rival) => rival.specificity === best).length > 1 || plan.specificity < best;
    });
    if (contested) {
      unbound.push({ file: plan.fileName, reason: `several files fit the same slot of "${plan.material.name || 'material'}"` });
      continue;
    }
    accepted.push({ ...plan, slots: usable });
  }
  if (accepted.length === 0) return { bound, unbound };

  // 3. Load and assign (same texture settings as GLTFLoader).
  const { ImageBitmapLoader, TextureLoader } = await import('three');
  const useBitmaps = typeof createImageBitmap !== 'undefined';
  const loader = useBitmaps ? new ImageBitmapLoader(manager) : new TextureLoader(manager);
  if (useBitmaps) loader.setOptions({ premultiplyAlpha: 'none' });

  const { Texture, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter } = await import('three');
  for (const plan of accepted) {
    let texture;
    try {
      const result = await loadTexture(loader, plan.entry.url);
      texture = result.isTexture ? result : new Texture(result);
    } catch {
      unbound.push({ file: plan.fileName, reason: 'the image could not be decoded' });
      continue;
    }
    texture.name = plan.fileName;
    texture.flipY = false; // glTF UV convention
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    if (plan.slots.some((slot) => COLOR_SLOTS.has(slot))) texture.colorSpace = SRGBColorSpace;
    texture.userData.boundByName = true;
    texture.needsUpdate = true;

    const { material } = plan;
    for (const slot of plan.slots) {
      material[slot] = texture;
      // glTF: factor × texture. With the texture gone the exporter's factor is
      // meaningless, so let the texture define the value.
      if (slot === 'roughnessMap') material.roughness = 1;
      if (slot === 'metalnessMap') material.metalness = 1;
      if (slot === 'emissiveMap' && material.emissive?.getHex() === 0) material.emissive.setRGB(1, 1, 1);
      if (slot === 'normalMap' && plan.rule?.directX && material.normalScale) material.normalScale.y *= -1;
    }
    material.needsUpdate = true;
    bound.push({ file: plan.fileName, material: material.name || '(unnamed)', slots: plan.slots, label: plan.rule?.label ?? 'base color' });
  }
  return { bound, unbound };
}

/**
 * Texture color-space check for loaded models.
 *
 * Color textures (albedo/base color, emissive, sheen color, specular color)
 * store sRGB-encoded values. If they are sampled as linear data the model
 * looks washed out (too bright, low saturation), so they must be tagged
 * THREE.SRGBColorSpace; three.js then decodes them to linear on the GPU.
 *
 * GLTFLoader already tags these slots correctly; this pass guarantees it for
 * every material (including materials created later, e.g. unlit -> PBR
 * conversions) without touching anything else: data maps (normal, roughness,
 * metalness, AO, ...) must stay linear, and PBR parameters and shadow flags
 * are left as they are.
 */
import { SRGBColorSpace } from 'three';

/** Material slots whose texels are colors (sRGB-encoded). */
export const COLOR_TEXTURE_SLOTS = Object.freeze(['map', 'emissiveMap', 'sheenColorMap', 'specularColorMap']);

/** Slots that hold non-color data and must never be decoded as sRGB. */
export const DATA_TEXTURE_SLOTS = Object.freeze([
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'sheenRoughnessMap',
  'specularIntensityMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
]);

const materialsOf = (object) => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);

/**
 * Ensures every color texture of every mesh material is SRGBColorSpace.
 * A texture also used in a data slot is left untouched (changing it would
 * break that slot) and reported as a conflict.
 *
 * @returns {{ colorTextures: number, alreadySrgb: number, corrected: number,
 *   conflicts: number, dataTextures: number }}
 */
export function ensureColorTextureSpaces(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (object.isMesh || object.isPoints || object.isLine) materialsOf(object).forEach((m) => materials.add(m));
  });

  const dataTextures = new Set();
  const colorTextures = new Set();
  for (const material of materials) {
    for (const slot of DATA_TEXTURE_SLOTS) if (material[slot]?.isTexture) dataTextures.add(material[slot]);
    for (const slot of COLOR_TEXTURE_SLOTS) if (material[slot]?.isTexture) colorTextures.add(material[slot]);
  }

  const result = { colorTextures: colorTextures.size, alreadySrgb: 0, corrected: 0, conflicts: 0, dataTextures: dataTextures.size };
  for (const texture of colorTextures) {
    if (texture.colorSpace === SRGBColorSpace) {
      result.alreadySrgb++;
    } else if (dataTextures.has(texture)) {
      result.conflicts++;
    } else {
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true; // re-upload with sRGB decoding if already on the GPU
      result.corrected++;
    }
  }
  return result;
}

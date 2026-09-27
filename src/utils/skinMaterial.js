/**
 * PBR skin materials for the mannequin, sharing one set of procedural maps.
 *
 * Each body part needs its own UV repeat so the micro-relief has the same
 * world-space scale everywhere (SKIN_CONFIG.tileSizeM). Texture clones share
 * the same `Source`, so the GPU uploads each map only once; materials are
 * cached per (variant, repeat) and share one shader program.
 */
import { Color, MeshPhysicalMaterial, Vector2 } from 'three';
import { SKIN_CONFIG } from '../config/sceneConfig.js';
import { generateSkinTextures } from './skinTexture.js';

export const SKIN_VARIANTS = Object.freeze({
  skin: { color: '#c9c4bd' },
  joint: { color: '#b7b1a9' },
});

let baseMaps = null;
function getBaseMaps() {
  if (!baseMaps) {
    baseMaps = generateSkinTextures({ ...SKIN_CONFIG, size: SKIN_CONFIG.textureSize });
  }
  return baseMaps;
}

const materialCache = new Map();

/**
 * UV repeats for a surface of the given world size. U wraps around closed
 * surfaces (spheres, cylinders), so it must be a whole number to avoid a seam.
 * @param {number} circumferenceM  Size along U (around the part).
 * @param {number} lengthM         Size along V (along the part).
 */
export function skinRepeatFor(circumferenceM, lengthM) {
  const tile = SKIN_CONFIG.tileSizeM;
  return [Math.max(1, Math.round(circumferenceM / tile)), Math.max(0.5, Math.round((lengthM / tile) * 2) / 2)];
}

/**
 * @param {{ repeat: [number, number], variant?: keyof SKIN_VARIANTS }} options
 * @returns {MeshPhysicalMaterial}
 */
export function getSkinMaterial({ repeat: [repeatU, repeatV], variant = 'skin' }) {
  const key = `${variant}|${repeatU}|${repeatV}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const { normalMap, roughnessMap } = getBaseMaps();
  const withRepeat = (texture) => {
    const clone = texture.clone(); // shares the image Source (single GPU upload)
    clone.repeat.set(repeatU, repeatV);
    clone.needsUpdate = true;
    return clone;
  };

  const material = new MeshPhysicalMaterial({
    color: new Color(SKIN_VARIANTS[variant].color),
    // Final roughness = roughness × roughnessMap.g, so the map holds absolute values.
    roughness: 1,
    roughnessMap: withRepeat(roughnessMap),
    normalMap: withRepeat(normalMap),
    normalScale: new Vector2(SKIN_CONFIG.normalScale, SKIN_CONFIG.normalScale),
    metalness: 0,
    // Skin IOR ≈ 1.4 -> F0 ≈ 2.8 % (default 1.5 would be too glossy).
    ior: 1.4,
    // Faint sheen imitates vellus hair at grazing angles.
    sheen: 0.2,
    sheenRoughness: 0.8,
    sheenColor: new Color(SKIN_VARIANTS[variant].color),
  });
  materialCache.set(key, material);
  return material;
}

/**
 * Generates SpotLight `map` textures that encode an angular beam profile
 * (hot center, center dip, hard edge, flattening — see beamProfile.js).
 * three.js projects the map through the spot's shadow camera (fov = 2 * angle)
 * and multiplies the light color by it, so the texture edge = cone edge.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { RENDER_CONFIG } from '../config/sceneConfig.js';
import { evaluateBeamProfile } from './beamProfile.js';

const MAX_CACHED_TEXTURES = 64;

// Kept for existing imports.
export { evaluateBeamProfile };

function buildTexture(profile, halfAngle, size) {
  const data = new Uint8Array(size * size * 4);
  const tanHalfAngle = Math.tan(halfAngle);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const planarRadius = Math.hypot(u, v); // tan(θ) / tan(halfAngle)
      let value = 0;
      if (planarRadius <= 1) {
        // Convert planar projection radius back to an angular fraction.
        const theta = Math.atan(planarRadius * tanHalfAngle);
        value = evaluateBeamProfile(profile, theta / halfAngle, halfAngle);
      }
      const byte = Math.round(value * 255);
      const offset = (y * size + x) * 4;
      data[offset] = byte;
      data[offset + 1] = byte;
      data[offset + 2] = byte;
      data[offset + 3] = 255;
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace; // values are linear multipliers
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Small LRU cache: the focusing rod would otherwise rebuild textures every frame it moves. */
const textureCache = new Map();

const cacheKey = (profile, halfAngle) =>
  [
    profile.hotspotRadius,
    profile.hotspotGain,
    profile.centerDip,
    profile.edgeStart,
    profile.flatten,
    profile.flattenEdge,
    halfAngle,
  ]
    .map((value) => value.toFixed(3))
    .join('|');

/**
 * @returns {import('three').DataTexture | null} null for a flat profile.
 */
export function getBeamProfileTexture(profile, halfAngle) {
  if (!profile) return null;
  const key = cacheKey(profile, halfAngle);
  const cached = textureCache.get(key);
  if (cached) {
    // Refresh LRU position.
    textureCache.delete(key);
    textureCache.set(key, cached);
    return cached;
  }

  const texture = buildTexture(profile, halfAngle, RENDER_CONFIG.beamProfileTextureSize);
  textureCache.set(key, texture);

  if (textureCache.size > MAX_CACHED_TEXTURES) {
    const [oldestKey, oldestTexture] = textureCache.entries().next().value;
    textureCache.delete(oldestKey);
    // three.js re-uploads a disposed texture automatically if it is still in use.
    oldestTexture.dispose();
  }
  return texture;
}

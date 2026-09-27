/**
 * GLTFLoader plugin for KHR_materials_pbrSpecularGlossiness.
 *
 * three.js removed this extension in r147, but many downloads still use it —
 * Sketchfab's "scene.gltf + scene.bin + textures/*_diffuse.png" exports in
 * particular. Without it GLTFLoader never even requests the textures (they are
 * referenced only from inside the extension), so the model loads white and no
 * file mapping can help.
 *
 * Conversion to three.js MeshPhysicalMaterial (per KHR_materials_specular):
 *   diffuseFactor / diffuseTexture        -> color / map (sRGB), alpha -> opacity
 *   specularFactor / specular RGB (F0)    -> specularColor = F0 / 0.04, specularColorMap
 *     (three: F0 = min(0.04 · specularColor · map, 1) · specularIntensity at IOR 1.5)
 *   glossinessFactor / specGloss alpha    -> roughness = 1 − glossiness, roughnessMap
 *     (roughnessMap is derived from the texture's alpha: G = 255 · (1 − A · glossiness))
 *   metalness                             -> 0 (a spec-gloss surface has no metal channel)
 * Everything else (normal, occlusion, emissive, alphaMode, doubleSided) is
 * handled by GLTFLoader as usual. Textures load through the parser, i.e. the
 * same LoadingManager and URL modifier as every other file.
 */
import { CanvasTexture, Color, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial, SRGBColorSpace } from 'three';

export const SPEC_GLOSS_EXTENSION = 'KHR_materials_pbrSpecularGlossiness';
/** F0 of a dielectric at IOR 1.5 — three's base for specularColor. */
const DIELECTRIC_F0 = 0.04;

/**
 * roughness = 1 − glossinessFactor · A, written to the green channel (three.js
 * reads roughness from G). Uses a 2D canvas, so it works for ImageBitmaps.
 */
function roughnessTextureFromGlossiness(source, glossinessFactor) {
  const image = source.image;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!width || !height || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    const roughness = Math.round(255 * (1 - glossinessFactor * (data[i + 3] / 255)));
    data[i] = roughness;
    data[i + 1] = roughness;
    data[i + 2] = roughness;
    data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.name = `${source.name || 'specularGlossiness'} (roughness)`;
  texture.flipY = source.flipY; // glTF: false
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.channel = source.channel;
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
  texture.rotation = source.rotation;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.userData.derivedFrom = SPEC_GLOSS_EXTENSION;
  return texture;
}

/** @param {import('three/examples/jsm/loaders/GLTFLoader.js').GLTFParser} parser */
export function createSpecGlossPlugin(parser, report = { converted: [] }) {
  const extensionOf = (materialIndex) => parser.json.materials?.[materialIndex]?.extensions?.[SPEC_GLOSS_EXTENSION];

  return {
    name: SPEC_GLOSS_EXTENSION,

    getMaterialType(materialIndex) {
      return extensionOf(materialIndex) ? MeshPhysicalMaterial : null;
    },

    async extendMaterialParams(materialIndex, materialParams) {
      const extension = extensionOf(materialIndex);
      if (!extension) return;
      const pending = [];

      // Diffuse replaces glTF base color (the fallback pbrMetallicRoughness block
      // of such files is usually empty -> white).
      const diffuse = extension.diffuseFactor ?? [1, 1, 1, 1];
      materialParams.color = new Color().setRGB(diffuse[0], diffuse[1], diffuse[2], 'srgb-linear');
      materialParams.opacity = diffuse[3];
      if (extension.diffuseTexture !== undefined) {
        pending.push(parser.assignTexture(materialParams, 'map', extension.diffuseTexture, SRGBColorSpace));
      } else {
        delete materialParams.map;
      }

      const specular = extension.specularFactor ?? [1, 1, 1];
      const glossiness = extension.glossinessFactor ?? 1;
      materialParams.metalness = 0;
      delete materialParams.metalnessMap;
      delete materialParams.roughnessMap;
      materialParams.roughness = 1 - glossiness;
      materialParams.specularIntensity = 1;
      materialParams.specularColor = new Color().setRGB(
        specular[0] / DIELECTRIC_F0,
        specular[1] / DIELECTRIC_F0,
        specular[2] / DIELECTRIC_F0,
        'srgb-linear',
      );

      if (extension.specularGlossinessTexture !== undefined) {
        const slot = {};
        pending.push(
          parser.assignTexture(slot, 'specularColorMap', extension.specularGlossinessTexture, SRGBColorSpace).then(() => {
            if (!slot.specularColorMap) return;
            materialParams.specularColorMap = slot.specularColorMap;
            const roughnessMap = roughnessTextureFromGlossiness(slot.specularColorMap, glossiness);
            if (roughnessMap) {
              materialParams.roughnessMap = roughnessMap;
              materialParams.roughness = 1; // the map now holds the absolute value
            }
          }),
        );
      }

      await Promise.all(pending);
      report.converted.push(parser.json.materials[materialIndex].name ?? `material ${materialIndex}`);
    },
  };
}

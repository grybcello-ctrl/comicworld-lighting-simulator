/**
 * OBJ (+ MTL + textures) and FBX subjects, loaded through the same file
 * mapping as glTF (modelFileSet.js): one LoadingManager whose URL modifier
 * redirects every request (the .mtl, textures) to the selected files' Blob URLs.
 *
 * Their Phong / Lambert / Basic materials are converted to
 * MeshStandardMaterial: three.js RectAreaLight (the softboxes) only lights
 * MeshStandard / MeshPhysical materials. Color, maps, emissive, alpha and
 * sidedness are kept; roughness comes from the Phong shininess
 * (Blinn-Phong ↔ GGX: roughness ≈ √(2 / (shininess + 2))).
 */
import { MeshStandardMaterial } from 'three';

const LEGACY_MATERIAL = (material) => material?.isMeshPhongMaterial || material?.isMeshLambertMaterial || material?.isMeshBasicMaterial;

function toStandard(material) {
  const standard = new MeshStandardMaterial({
    name: material.name,
    color: material.color?.clone(),
    map: material.map ?? null,
    normalMap: material.normalMap ?? null,
    bumpMap: material.bumpMap ?? null,
    bumpScale: material.bumpScale ?? 1,
    alphaMap: material.alphaMap ?? null,
    aoMap: material.aoMap ?? null,
    emissive: material.emissive?.clone(),
    emissiveMap: material.emissiveMap ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    vertexColors: material.vertexColors,
    roughness: material.isMeshPhongMaterial ? Math.min(1, Math.sqrt(2 / ((material.shininess ?? 30) + 2))) : 1,
    metalness: 0,
  });
  if (material.normalMap && material.normalScale) standard.normalScale.copy(material.normalScale);
  standard.userData = { ...material.userData, convertedFrom: material.type };
  return standard;
}

/** Converts every legacy material in place; returns how many were converted. */
export function convertLegacyMaterials(root) {
  const converted = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const swap = (material) => {
      if (!LEGACY_MATERIAL(material)) return material;
      if (!converted.has(material)) converted.set(material, toStandard(material));
      return converted.get(material);
    };
    object.material = Array.isArray(object.material) ? object.material.map(swap) : swap(object.material);
  });
  // Textures now belong to the standard copies; free only the old materials.
  for (const material of converted.keys()) material.dispose();
  return converted.size;
}

/** `mtllib` names referenced by an OBJ text. */
const mtlLibraries = (text) => [...text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)].map((match) => match[1]);

/**
 * @param {{ modelFile: File, resourceFiles: File[], manager: import('three').LoadingManager,
 *   resolver: ReturnType<import('./modelFileSet.js').createResourceResolver> }} params
 * @returns {Promise<{ scene: import('three').Object3D, animations: import('three').AnimationClip[], convertedMaterials: number, format: string }>}
 */
export async function loadLegacyModel({ modelFile, manager, resolver }) {
  const extension = modelFile.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  let scene;
  let animations = [];
  let format;
  if (extension === '.obj') {
    format = 'OBJ';
    const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/OBJLoader.js'),
      import('three/examples/jsm/loaders/MTLLoader.js'),
    ]);
    const text = await modelFile.text();
    const loader = new OBJLoader(manager);
    for (const library of mtlLibraries(text)) {
      try {
        // Relative name → the URL modifier maps it to the selected .mtl.
        const materials = await new MTLLoader(manager).loadAsync(library);
        materials.preload();
        loader.setMaterials(materials);
        break;
      } catch {
        // Missing .mtl: reported as missing by the resolver, default material used.
      }
    }
    scene = loader.parse(text);
  } else if (extension === '.fbx') {
    format = 'FBX';
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    scene = await new FBXLoader(manager).loadAsync(resolver.modelUrl);
    animations = scene.animations ?? [];
  } else {
    throw new Error(`Unsupported model format: ${modelFile.name}`);
  }
  const convertedMaterials = convertLegacyMaterials(scene);
  return { scene, animations, convertedMaterials, format };
}

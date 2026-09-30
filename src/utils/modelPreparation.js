/**
 * Prepares a loaded glTF scene to act as the simulator's subject:
 *   1. strip embedded lights/cameras (KHR_lights_punctual would add light the
 *      simulator doesn't control)
 *   2. shadows on every mesh, while keeping the model's own PBR materials;
 *      all materials double-sided (side + shadowSide) so thin meshes block light
 *   3. auto-center + auto-scale with THREE.Box3 (feet on y = 0, centered on
 *      x = 0 / z = 0, height = SUBJECT_CONFIG.targetHeightM)
 */
import { Box3, Group, MeshStandardMaterial, Vector3 } from 'three';
import { enableDoubleSidedShadows } from './shadowSides.js';

/** Removes lights and cameras shipped inside the model. */
export function stripEmbeddedLightsAndCameras(root) {
  const removed = [];
  root.traverse((object) => {
    if (object.isLight || object.isCamera) removed.push(object);
  });
  for (const object of removed) object.removeFromParent();
  return {
    lights: removed.filter((object) => object.isLight).length,
    cameras: removed.filter((object) => object.isCamera).length,
  };
}

/**
 * Lit replacement for an unlit (KHR_materials_unlit -> MeshBasicMaterial)
 * material: same color, maps, alpha and sidedness, but PBR-shaded so the
 * strobes, softbox area lights, shadows and gel colors affect it.
 * (three.js RectAreaLight only shades MeshStandard/MeshPhysical materials.)
 */
function toLitMaterial(basic) {
  const lit = new MeshStandardMaterial({
    name: basic.name,
    color: basic.color.clone(),
    map: basic.map,
    alphaMap: basic.alphaMap,
    aoMap: basic.aoMap,
    aoMapIntensity: basic.aoMapIntensity,
    transparent: basic.transparent,
    opacity: basic.opacity,
    alphaTest: basic.alphaTest,
    side: basic.side,
    vertexColors: basic.vertexColors,
    roughness: 1,
    metalness: 0,
  });
  lit.userData = { ...basic.userData, convertedFromUnlit: true };
  return lit;
}

/**
 * Enables castShadow/receiveShadow on every mesh and keeps its materials.
 * glTF materials already load as MeshStandardMaterial / MeshPhysicalMaterial
 * (skin, cloth, sheen, clearcoat, transmission, textures and color spaces
 * intact), which respond physically to every light type in the simulator.
 * Only unlit materials, which ignore light entirely, are swapped for a lit
 * equivalent (textures are reused, the old material is disposed).
 */
export function prepareMeshesForLighting(root) {
  const converted = new Map();
  let meshes = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    object.castShadow = true;
    object.receiveShadow = true;
    // Skinned bounds follow the bind pose; never let posed limbs get culled.
    if (object.isSkinnedMesh) object.frustumCulled = false;

    const swap = (material) => {
      if (!material?.isMeshBasicMaterial) return material;
      if (!converted.has(material)) converted.set(material, toLitMaterial(material));
      return converted.get(material);
    };
    object.material = Array.isArray(object.material) ? object.material.map(swap) : swap(object.material);
  });

  // Textures are now owned by the lit copies; release only the old materials.
  for (const basic of converted.keys()) basic.dispose();

  // Double-sided materials; thin meshes (hair cards, planes) cast shadows from
  // both faces or light bleeds through them (shadowSides.js). Runs after the
  // unlit -> PBR swap so the new materials are included.
  const sides = enableDoubleSidedShadows(root);
  return { meshes, unlitMaterialsConverted: converted.size, ...sides };
}

/** Triangles, unique materials and textures (for the panel readout). */
export function collectModelStats(root) {
  let triangles = 0;
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const { index, attributes } = object.geometry;
    triangles += Math.floor((index ? index.count : (attributes.position?.count ?? 0)) / 3);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { triangles, materials: materials.size, textures: textures.size };
}

const toArray = (vector) => [vector.x, vector.y, vector.z];

/**
 * Auto-centering and scaling with THREE.Box3.
 *   box    = Box3.setFromObject(model, precise = true)    world-space vertex bounds
 *   scale  s = targetHeight / box.height                 uniform, keeps proportions
 *   offset o = (−center.x, −box.min.y, −center.z)         applied before scaling
 *   world(p) = s · (p + o)
 * so the feet land on y = 0, the model is centered on x = 0 / z = 0, and the
 * height equals `targetHeightM`. The model is wrapped instead of mutated:
 *   stage (scale s) -> offset (position o) -> original glTF scene
 * The result is re-measured and returned for verification.
 *
 * @returns {{ stage: Group, originalSize: number[], scale: number,
 *   fittedSize: number[], fittedMin: number[], fittedCenter: number[] }}
 */
export function fitModelToStage(model, targetHeightM) {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  if (box.isEmpty()) throw new Error('The model contains no visible geometry.');

  const size = box.getSize(new Vector3());
  if (!(size.y > 1e-9)) {
    throw new Error('The model has no height (flat along Y), so it cannot be scaled to a standing subject.');
  }
  const center = box.getCenter(new Vector3());
  const scale = targetHeightM / size.y;

  const offset = new Group();
  offset.name = 'custom-model-offset';
  offset.position.set(-center.x, -box.min.y, -center.z);
  offset.add(model);

  const stage = new Group();
  stage.name = 'custom-model';
  stage.scale.setScalar(scale);
  stage.add(offset);

  stage.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(stage, true);
  return {
    stage,
    originalSize: toArray(size),
    scale,
    fittedSize: toArray(fitted.getSize(new Vector3())),
    fittedMin: toArray(fitted.min),
    fittedCenter: toArray(fitted.getCenter(new Vector3())),
  };
}


/**
 * Re-fits a stage built by fitModelToStage after the model was rotated
 * (manual orientation fix): same Box3 centering and scaling, in place, so the
 * stage object (and everything attached to it) stays the same.
 */
export function refitModelStage(stage, targetHeightM) {
  const offset = stage.children[0];
  const model = offset.children[0];
  stage.scale.setScalar(1);
  offset.position.set(0, 0, 0);
  stage.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  const size = box.getSize(new Vector3());
  if (box.isEmpty() || !(size.y > 1e-9)) throw new Error('The model has no height after rotating.');
  const center = box.getCenter(new Vector3());
  // The stage may sit below a parent (the 'subject' group at the origin).
  const parentInverse = stage.parent ? stage.parent.matrixWorld.clone().invert() : null;
  if (parentInverse) {
    center.applyMatrix4(parentInverse);
    box.min.applyMatrix4(parentInverse);
  }
  offset.position.set(-center.x, -box.min.y, -center.z);
  stage.scale.setScalar(targetHeightM / size.y);
  stage.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(stage, true);
  return { scale: stage.scale.x, fittedSize: toArray(fitted.getSize(new Vector3())), fittedMin: toArray(fitted.min), fittedCenter: toArray(fitted.getCenter(new Vector3())) };
}

/**
 * Puts the lowest point of the (posed) model back on the floor (y = 0)
 * without changing its scale — used after a pose is imported.
 * @returns {number} vertical shift in meters
 */
export function groundModelStage(stage) {
  const offset = stage.children[0];
  stage.updateMatrixWorld(true);
  const box = new Box3().setFromObject(stage, true);
  if (box.isEmpty()) return 0;
  const shift = -box.min.y;
  offset.position.y += shift / stage.scale.y;
  stage.updateMatrixWorld(true);
  return shift;
}

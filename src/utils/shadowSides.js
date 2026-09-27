/**
 * Shadow-pass sides and slope bias for the subject (custom models + mannequin).
 *
 * The problem: three.js renders only the opposite side of a single-sided
 * material into the shadow map (FrontSide -> back faces). A single sheet (hair
 * card, plane) whose front faces the light therefore casts NO shadow, and a rim
 * light shines straight through the hair onto the face and the bangs.
 *
 * 1. enableDoubleSidedShadows(root) — custom models:
 *      material.side = DoubleSide for every material (both faces render)
 *      thin sheets  (hair cards, planes, single-sheet cloth):
 *                   shadowSide = DoubleSide -> every face blocks light
 *      closed solids (skin, body, props):
 *                   shadowSide = BackSide  -> their back faces still sit behind
 *                   every lit face, so they cast the same shadows but can never
 *                   shadow themselves (see below why that matters)
 *    Sheets vs. solids are told apart by topology (meshTopology.js). A material
 *    shared by both kinds is cloned for the sheets (textures stay shared).
 *    SUBJECT_CONFIG.shadowSideMode = 'double' forces DoubleSide everywhere.
 *
 * 2. installSlopeBias(root) — every subject mesh:
 *    Soft lights use PCF kernels of up to 16 texels. Double-sided sheets (and
 *    very thin solids such as ears) are in the shadow map at their own depth,
 *    so the kernel makes their lit faces shadow themselves (acne). A per-light
 *    slope-scaled depth offset (glPolygonOffset) in the shadow pass fixes that:
 *      factor = shadow.slopeBias.factor  (= base + perRadius × shadow.radius)
 *    read from `shadowCamera.userData.slopeBias`, which StudioLight sets per
 *    light from computeShadowParams. A large constant bias would instead push
 *    every shadow away from thin gaps — the light leak this file removes.
 */
import { BackSide, DoubleSide } from 'three';
import { SUBJECT_CONFIG } from '../config/sceneConfig.js';
import { measureSurfaceOpenness } from './meshTopology.js';

function applySlopeBias(renderer, object, camera, shadowCamera, geometry, depthMaterial) {
  const slopeBias = shadowCamera?.userData?.slopeBias;
  if (!slopeBias || !depthMaterial) return;
  depthMaterial.polygonOffset = true;
  depthMaterial.polygonOffsetFactor = slopeBias.factor;
  depthMaterial.polygonOffsetUnits = slopeBias.units;
}

/** Depth materials are shared by all casters: always restore them after the draw. */
function resetSlopeBias(renderer, object, camera, shadowCamera, geometry, depthMaterial) {
  if (!depthMaterial) return;
  depthMaterial.polygonOffset = false;
  depthMaterial.polygonOffsetFactor = 0;
  depthMaterial.polygonOffsetUnits = 0;
}

/** Installs the per-light slope bias on every mesh under `root`. Idempotent. */
export function installSlopeBias(root) {
  let meshes = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.onBeforeShadow = applySlopeBias;
    object.onAfterShadow = resetSlopeBias;
    meshes++;
  });
  return meshes;
}

/**
 * Makes every material of a custom model double-sided, with double-sided
 * shadows for thin sheets and back-face shadows for closed solids.
 * castShadow, receiveShadow, textures and PBR parameters are untouched.
 * @returns {{ doubleSidedMaterials: number, thinMaterials: number,
 *   solidMaterials: number, clonedMaterials: number, madeDoubleSided: number,
 *   topologyAnalysed: boolean }}
 */
export function enableDoubleSidedShadows(root) {
  const forceDouble = SUBJECT_CONFIG.shadowSideMode === 'double';
  const { analysed, usages } = measureSurfaceOpenness(root);
  const isThin = (usage) => forceDouble || !analysed || usage.openness > SUBJECT_CONFIG.thinSurfaceOpenness;

  // Which kinds of surface use each material?
  const kinds = new Map();
  for (const usage of usages) {
    if (!usage.material) continue;
    const kind = kinds.get(usage.material) ?? { thin: false, solid: false };
    if (isThin(usage)) kind.thin = true;
    else kind.solid = true;
    kinds.set(usage.material, kind);
  }

  // Shared by sheets and solids: give the sheets their own copy.
  const thinCopies = new Map();
  for (const usage of usages) {
    const kind = kinds.get(usage.material);
    if (!kind?.thin || !kind.solid || !isThin(usage)) continue;
    if (!thinCopies.has(usage.material)) {
      const copy = usage.material.clone(); // textures are shared, not duplicated
      copy.name = `${usage.material.name || 'material'} (thin)`;
      thinCopies.set(usage.material, copy);
    }
    const copy = thinCopies.get(usage.material);
    if (Array.isArray(usage.mesh.material)) {
      usage.mesh.material = usage.mesh.material.slice();
      usage.mesh.material[usage.group.materialIndex] = copy;
    } else {
      usage.mesh.material = copy;
    }
  }

  const stats = {
    doubleSidedMaterials: 0,
    thinMaterials: 0,
    solidMaterials: 0,
    clonedMaterials: thinCopies.size,
    madeDoubleSided: 0,
    topologyAnalysed: analysed,
  };
  const configure = (material, thin) => {
    const shadowSide = thin ? DoubleSide : BackSide;
    if (material.side !== DoubleSide) stats.madeDoubleSided++;
    material.side = DoubleSide;
    material.shadowSide = shadowSide;
    material.needsUpdate = true;
    stats.doubleSidedMaterials++;
    stats[thin ? 'thinMaterials' : 'solidMaterials']++;
  };
  for (const [material, kind] of kinds) configure(material, kind.thin && !kind.solid);
  for (const copy of thinCopies.values()) configure(copy, true);
  return stats;
}

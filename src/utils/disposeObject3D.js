/**
 * Frees every GPU/CPU resource owned by an Object3D subtree: geometries,
 * materials, textures (plus their decoded ImageBitmaps) and skeleton bone
 * textures. Shared resources are released once. The subtree is detached from
 * its parent first, so no render can re-upload a disposed resource.
 *
 * @param {import('three').Object3D | null} root
 * @returns {{ geometries: number, materials: number, textures: number,
 *   imageBitmaps: number, skeletons: number }} what was released
 */
export function disposeObject3D(root) {
  const released = { geometries: 0, materials: 0, textures: 0, imageBitmaps: 0, skeletons: 0 };
  if (!root) return released;

  root.removeFromParent();

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();

  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    }
    if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
  });

  for (const material of materials) {
    // Every texture slot (map, normalMap, roughnessMap, sheenColorMap, ...) is
    // an own property of the material, so scan them generically.
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
    // Custom shaders keep textures in uniforms.
    for (const uniform of Object.values(material.uniforms ?? {})) {
      if (uniform?.value?.isTexture) textures.add(uniform.value);
    }
  }

  for (const texture of textures) {
    const image = texture.source?.data ?? texture.image;
    // GLTFLoader decodes images to ImageBitmaps; texture.dispose() only frees the
    // GPU copy, so close the decoded bitmap explicitly.
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
      image.close();
      released.imageBitmaps++;
    }
    texture.dispose();
    released.textures++;
  }
  for (const material of materials) {
    material.dispose();
    released.materials++;
  }
  for (const geometry of geometries) {
    geometry.dispose();
    released.geometries++;
  }
  for (const skeleton of skeletons) {
    skeleton.dispose();
    released.skeletons++;
  }
  return released;
}

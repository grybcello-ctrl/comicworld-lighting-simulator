/**
 * Loads a pose source from a local file — nothing is uploaded:
 *   .glb / .gltf (self-contained)  GLTFLoader: skeleton + animations
 *   .fbx                           FBXLoader (Mixamo exports, with or without skin)
 *   .bvh                           BVHLoader: mocap skeleton + one clip
 *
 * Only the skeleton and clips are kept. Meshes, materials and textures of
 * the file are disposed right away; images referenced by an FBX are never
 * fetched (the URL modifier answers with a 1 × 1 pixel).
 *
 * @typedef {Object} PoseSource
 * @property {import('three').Object3D} root   hierarchy containing the bones
 * @property {import('three').AnimationClip[]} clips
 * @property {Map<import('three').Bone, import('three').Matrix4> | null} bindWorld
 *           bind pose (world) from the first skinned mesh, if any
 * @property {string} format
 * @property {string} fileName
 */
import { AnimationClip, Group, LoadingManager } from 'three';

export class PoseFileError extends Error {}

export const POSE_FILE_ACCEPT = '.glb,.gltf,.fbx,.bvh,model/gltf-binary';

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const extensionOf = (name) => (name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();

/** Bind pose world matrices (inverse of the skeleton's bone inverses). */
function bindPoseOf(root) {
  let skinned = null;
  root.traverse((object) => {
    if (!skinned && object.isSkinnedMesh && object.skeleton) skinned = object;
  });
  if (!skinned) return null;
  const bind = new Map();
  skinned.skeleton.bones.forEach((bone, i) => bind.set(bone, skinned.skeleton.boneInverses[i].clone().invert()));
  return bind;
}

/** Frees the file's render resources (geometry, materials, textures); bones and clips stay. */
function stripRenderData(root) {
  const textures = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (!(object.isMesh || object.isLine || object.isPoints)) return;
    object.geometry?.dispose?.();
    for (const material of [].concat(object.material ?? [])) materials.add(material);
    object.visible = false;
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose?.();
  }
  for (const texture of textures) {
    const image = texture.source?.data ?? texture.image;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
    texture.dispose();
  }
}

/** @param {File} file @returns {Promise<PoseSource>} */
export async function loadPoseFile(file) {
  const format = extensionOf(file.name);
  if (format === '.bvh') {
    const { BVHLoader } = await import('three/examples/jsm/loaders/BVHLoader.js');
    const { skeleton, clip } = new BVHLoader().parse(await file.text());
    const root = new Group();
    root.name = 'bvh-pose-root';
    root.add(skeleton.bones[0]);
    return { root, clips: clip ? [clip] : [], bindWorld: null, format: 'BVH', fileName: file.name };
  }
  if (format === '.fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const manager = new LoadingManager();
    manager.setURLModifier((url) => (/^data:/i.test(url) ? url : TRANSPARENT_PIXEL));
    let root;
    try {
      root = new FBXLoader(manager).parse(await file.arrayBuffer(), '');
    } catch (error) {
      throw new PoseFileError(`Could not read ${file.name} as FBX (${error.message}).`);
    }
    const bindWorld = bindPoseOf(root);
    stripRenderData(root);
    return { root, clips: root.animations ?? [], bindWorld, format: 'FBX', fileName: file.name };
  }
  if (format === '.glb' || format === '.gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const manager = new LoadingManager();
    manager.setURLModifier((url) => (/^(data|blob):/i.test(url) ? url : TRANSPARENT_PIXEL));
    let gltf;
    try {
      gltf = await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), '');
    } catch (error) {
      throw new PoseFileError(
        `Could not read ${file.name} (${error.message}). A .gltf with a separate .bin cannot be used as a pose file — export it as .glb.`,
      );
    }
    const root = gltf.scene;
    const bindWorld = bindPoseOf(root);
    stripRenderData(root);
    return { root, clips: gltf.animations ?? [], bindWorld, format: 'glTF', fileName: file.name };
  }
  throw new PoseFileError(`Choose a .glb, .gltf, .fbx or .bvh pose file (got ${file.name}).`);
}

/** Frame count and duration of a clip (30 fps if the clip has no key times). */
export function clipFrames(clip) {
  if (!(clip instanceof AnimationClip) || !(clip.duration > 0)) return { frames: 1, fps: 30, duration: 0 };
  const times = clip.tracks.find((track) => track.times.length > 1)?.times;
  const fps = times ? Math.round(1 / Math.max(times[1] - times[0], 1e-3)) : 30;
  return { frames: Math.max(1, Math.round(clip.duration * fps) + 1), fps, duration: clip.duration };
}


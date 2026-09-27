import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { LIGHT_RAYS_CONFIG } from '../../config/sceneConfig.js';

const { rayCount, ringSegments } = LIGHT_RAYS_CONFIG;

// Vertex budget (LineSegments = vertex pairs):
//   rays: start ring -> subject ring | start ring | subject ring | beam axis
const OUTLINE_VERTEX_COUNT = (rayCount + 2 * ringSegments + 1) * 2;
//   core ring = full-intensity cone (three.js inner cone: angle · (1 − penumbra))
const CORE_VERTEX_COUNT = ringSegments * 2;
//   translucent frustum side: (ringSegments + 1) × 2 vertices
const FILL_VERTEX_COUNT = (ringSegments + 1) * 2;

const noRaycast = () => null;

function createLineObject(vertexCount, opacity) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  const material = new LineBasicMaterial({
    transparent: true,
    opacity,
    depthTest: false, // always readable, even through the subject
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false; // vertices move every frame; bounds would be stale
  lines.renderOrder = LIGHT_RAYS_CONFIG.renderOrder;
  lines.raycast = noRaycast;
  return lines;
}

function createFillObject() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(FILL_VERTEX_COUNT * 3), 3));
  const index = [];
  for (let i = 0; i < ringSegments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(index);
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: LIGHT_RAYS_CONFIG.fillOpacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = LIGHT_RAYS_CONFIG.renderOrder - 1;
  mesh.raycast = noRaycast;
  return mesh;
}

// Scratch vectors, reused every frame.
const apex = new Vector3();
const aim = new Vector3();
const axis = new Vector3();
const basisU = new Vector3();
const basisV = new Vector3();
const point = new Vector3();
const HELPER_UP = new Vector3(0, 1, 0);
const WHITE = new Color(1, 1, 1);
const HELPER_RIGHT = new Vector3(1, 0, 0);

/** Writes the ring point at polar angle `phi`, radius `radius`, `distance` along the axis. */
function writeRingPoint(array, offset, distance, radius, phi) {
  point
    .copy(apex)
    .addScaledVector(axis, distance)
    .addScaledVector(basisU, Math.cos(phi) * radius)
    .addScaledVector(basisV, Math.sin(phi) * radius);
  array[offset] = point.x;
  array[offset + 1] = point.y;
  array[offset + 2] = point.z;
}

/**
 * 'Show Light Rays': visualizes a SpotLight's real beam as clear lines —
 * the cone from where light leaves the modifier (`startDistance` from the
 * SpotLight apex, e.g. a parabolic's aperture) to the subject distance
 * (the aim point), plus the full-intensity core cone and the beam axis.
 *
 * Bound to the render loop: every rendered frame it reads the *live* SpotLight
 * (world position, target, angle, penumbra), so focusing-rod, tilt and shift
 * changes are reflected in the same frame they are rendered. It is a pure
 * visual: unlit materials, no shadows, no raycasting, and it is skipped
 * entirely while hidden.
 *
 * @param {{ lightRef: React.RefObject<import('three').SpotLight>, visible: boolean,
 *   color: import('three').Color, startDistance?: number, emphasized?: boolean }} props
 */
export function BeamRaysHelper({ lightRef, visible, color, startDistance = 0, emphasized = false }) {
  const { outline, core, fill } = useMemo(
    () => ({
      outline: createLineObject(OUTLINE_VERTEX_COUNT, LIGHT_RAYS_CONFIG.lineOpacity),
      core: createLineObject(CORE_VERTEX_COUNT, LIGHT_RAYS_CONFIG.coreOpacity),
      fill: createFillObject(),
    }),
    [],
  );

  // Dispose GPU resources on unmount.
  useLayoutEffect(
    () => () => {
      for (const object of [outline, core, fill]) {
        object.geometry.dispose();
        object.material.dispose();
      }
    },
    [outline, core, fill],
  );

  useLayoutEffect(() => {
    outline.material.color.copy(color);
    outline.material.opacity = emphasized
      ? LIGHT_RAYS_CONFIG.lineOpacity
      : LIGHT_RAYS_CONFIG.dimmedLineOpacity;
    core.material.color.copy(color).lerp(WHITE, 0.35);
    fill.material.color.copy(color);
  }, [outline, core, fill, color, emphasized]);

  useFrame(() => {
    const light = lightRef.current;
    if (!visible || !light) return;

    light.updateWorldMatrix(true, false);
    light.target.updateWorldMatrix(true, false);
    light.getWorldPosition(apex);
    light.target.getWorldPosition(aim);
    axis.subVectors(aim, apex);
    const endDistance = axis.length();
    if (endDistance < 1e-4) return;
    axis.divideScalar(endDistance);

    // Orthonormal basis around the beam axis.
    basisU.crossVectors(axis, Math.abs(axis.y) > 0.99 ? HELPER_RIGHT : HELPER_UP).normalize();
    basisV.crossVectors(axis, basisU).normalize();

    const tanOuter = Math.tan(light.angle);
    const tanCore = Math.tan(light.angle * (1 - light.penumbra));
    const start = Math.min(Math.max(startDistance, 0), endDistance * 0.98);
    const startRadius = start * tanOuter;
    const endRadius = endDistance * tanOuter;
    const coreRadius = endDistance * tanCore;

    // Outline: rays, start ring, subject ring, axis.
    const lines = outline.geometry.attributes.position.array;
    let o = 0;
    for (let i = 0; i < rayCount; i++) {
      const phi = (i / rayCount) * Math.PI * 2;
      writeRingPoint(lines, o, start, startRadius, phi);
      writeRingPoint(lines, o + 3, endDistance, endRadius, phi);
      o += 6;
    }
    for (const [distance, radius] of [
      [start, startRadius],
      [endDistance, endRadius],
    ]) {
      for (let i = 0; i < ringSegments; i++) {
        writeRingPoint(lines, o, distance, radius, (i / ringSegments) * Math.PI * 2);
        writeRingPoint(lines, o + 3, distance, radius, ((i + 1) / ringSegments) * Math.PI * 2);
        o += 6;
      }
    }
    writeRingPoint(lines, o, start, 0, 0);
    writeRingPoint(lines, o + 3, endDistance, 0, 0);
    outline.geometry.attributes.position.needsUpdate = true;

    // Core ring at the subject distance.
    const coreLines = core.geometry.attributes.position.array;
    for (let i = 0, c = 0; i < ringSegments; i++, c += 6) {
      writeRingPoint(coreLines, c, endDistance, coreRadius, (i / ringSegments) * Math.PI * 2);
      writeRingPoint(coreLines, c + 3, endDistance, coreRadius, ((i + 1) / ringSegments) * Math.PI * 2);
    }
    core.geometry.attributes.position.needsUpdate = true;

    // Translucent frustum side.
    const surface = fill.geometry.attributes.position.array;
    for (let i = 0, f = 0; i <= ringSegments; i++, f += 6) {
      const phi = (i / ringSegments) * Math.PI * 2;
      writeRingPoint(surface, f, start, startRadius, phi);
      writeRingPoint(surface, f + 3, endDistance, endRadius, phi);
    }
    fill.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <group visible={visible} name="beam-rays-helper">
      <primitive object={fill} />
      <primitive object={outline} />
      <primitive object={core} />
    </group>
  );
}

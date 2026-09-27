/**
 * Tells thin open surfaces (hair cards, planes, single-sheet cloth) apart from
 * closed solids (skin, body, props) by topology, for every (mesh, material).
 *
 *   openness = boundary edge length / √(surface area)   (scale- and density-invariant)
 *     closed solid            0
 *     body with a neck hole   ≈ 0.3 – 0.6
 *     long open tube (sleeve) ≈ 1.6   — a shell: its far side is still behind it
 *     bowl / hood             ≈ 2.5
 *     any flat sheet          ≥ 2√π ≈ 3.54 (isoperimetric minimum: a disc)
 *     strips of hair cards    ≫ 4
 *
 * Why it matters: a closed solid's back faces lie behind every lit front face,
 * so back-face shadows (three.js default) are correct and never self-shadow. A
 * single sheet facing the light has no back face in the shadow map and casts
 * no shadow unless its shadowSide is DoubleSide.
 *
 * Boundaries are found over the WHOLE model in model space: glTF splits one
 * closed body into several primitives (one per material), and the seam between
 * two primitives is shared, not a boundary. Vertices are welded by position,
 * so UV/normal seams don't count either. Two back-to-back sheets share all
 * their edges and count as closed — correctly, since one of them always faces
 * away from the light and is in the shadow map.
 */
import { Vector3 } from 'three';

/** Models above this many vertices are not analysed (every surface counts as thin). */
export const MAX_ANALYSED_VERTICES = 2_000_000;

const materialsOf = (mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * @param {import('three').Object3D} root
 * @returns {{ analysed: boolean, usages: Array<{ mesh: import('three').Mesh,
 *   material: import('three').Material, openness: number }> }}
 */
export function measureSurfaceOpenness(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh && object.geometry?.getAttribute('position')) meshes.push(object);
  });

  const vertexTotal = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
  const usagesOf = (mesh) => {
    const groups = mesh.geometry.groups;
    return Array.isArray(mesh.material) && groups.length
      ? groups.map((group) => ({ mesh, material: mesh.material[group.materialIndex], group }))
      : materialsOf(mesh).slice(0, 1).map((material) => ({ mesh, material, group: null }));
  };
  if (vertexTotal > MAX_ANALYSED_VERTICES) {
    return { analysed: false, usages: meshes.flatMap(usagesOf).map((u) => ({ ...u, openness: Infinity })) };
  }

  // World-space positions of every mesh (bind pose for skinned meshes).
  const point = new Vector3();
  const worldPositions = meshes.map((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    const out = new Float64Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      out[3 * i] = point.x;
      out[3 * i + 1] = point.y;
      out[3 * i + 2] = point.z;
    }
    return out;
  });

  // Weld tolerance relative to the model size (absorbs transform round-off).
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const positions of worldPositions) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (positions[i + k] < min[k]) min[k] = positions[i + k];
        if (positions[i + k] > max[k]) max[k] = positions[i + k];
      }
    }
  }
  const cell = Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 1e-5, 1e-12);

  const weldIds = new Map();
  const welded = worldPositions.map((positions) => {
    const ids = new Uint32Array(positions.length / 3);
    for (let v = 0; v < ids.length; v++) {
      const key = `${Math.round(positions[3 * v] / cell)},${Math.round(positions[3 * v + 1] / cell)},${Math.round(positions[3 * v + 2] / cell)}`;
      let id = weldIds.get(key);
      if (id === undefined) {
        id = weldIds.size;
        weldIds.set(key, id);
      }
      ids[v] = id;
    }
    return ids;
  });
  const stride = weldIds.size;

  // Pass 1: count every welded edge over the whole model; accumulate areas.
  const edgeUses = new Map();
  const usages = [];
  meshes.forEach((mesh, m) => {
    const index = mesh.geometry.getIndex();
    const total = index ? index.count : mesh.geometry.getAttribute('position').count;
    for (const usage of usagesOf(mesh)) {
      const start = usage.group ? usage.group.start : 0;
      const end = usage.group ? Math.min(total, start + usage.group.count) : total;
      usages.push({ ...usage, meshIndex: m, start, end, area: 0, boundaryLength: 0 });
    }
  });
  const vertexOf = (mesh, i) => (mesh.geometry.getIndex() ? mesh.geometry.getIndex().getX(i) : i);
  const forEachTriangle = (usage, callback) => {
    const ids = welded[usage.meshIndex];
    for (let t = usage.start; t + 2 < usage.end; t += 3) {
      const a = vertexOf(usage.mesh, t);
      const b = vertexOf(usage.mesh, t + 1);
      const c = vertexOf(usage.mesh, t + 2);
      if (ids[a] === ids[b] || ids[b] === ids[c] || ids[a] === ids[c]) continue; // degenerate
      callback(a, b, c, ids);
    }
  };
  const edgeKey = (ids, a, b) => (ids[a] < ids[b] ? ids[a] * stride + ids[b] : ids[b] * stride + ids[a]);

  for (const usage of usages) {
    const positions = worldPositions[usage.meshIndex];
    forEachTriangle(usage, (a, b, c, ids) => {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = edgeKey(ids, p, q);
        edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
      }
      const ux = positions[3 * b] - positions[3 * a], uy = positions[3 * b + 1] - positions[3 * a + 1], uz = positions[3 * b + 2] - positions[3 * a + 2];
      const vx = positions[3 * c] - positions[3 * a], vy = positions[3 * c + 1] - positions[3 * a + 1], vz = positions[3 * c + 2] - positions[3 * a + 2];
      usage.area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    });
  }

  // Pass 2: boundary = edge used by exactly one triangle in the whole model.
  for (const usage of usages) {
    const positions = worldPositions[usage.meshIndex];
    forEachTriangle(usage, (a, b, c, ids) => {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        if (edgeUses.get(edgeKey(ids, p, q)) !== 1) continue;
        usage.boundaryLength += Math.hypot(
          positions[3 * p] - positions[3 * q],
          positions[3 * p + 1] - positions[3 * q + 1],
          positions[3 * p + 2] - positions[3 * q + 2],
        );
      }
    });
  }

  return {
    analysed: true,
    usages: usages.map(({ mesh, material, group, area, boundaryLength }) => ({
      mesh,
      material,
      group,
      area,
      boundaryLength,
      openness: area > 0 ? boundaryLength / Math.sqrt(area) : Infinity,
    })),
  };
}

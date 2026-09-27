/**
 * Procedural skin micro-relief — no image files. Builds a tileable height field
 * and derives a tangent-space normal map plus a roughness map from it.
 *
 * Height field h(u, v), all layers periodic over the tile (seamless repeat):
 *   plates  Worley F2 − F1 ridges -> the polygonal network of fine furrows
 *           (skin "plates", ~3–4 mm across)
 *   pores   Worley F1 dimples with per-cell random size/depth/presence
 *   micro   3-octave value-noise fBm (fine grain that breaks up speculars)
 *   broad   low-frequency undulation
 * Normal: n = normalize(−k·∂h/∂u, −k·∂h/∂v, 1), OpenGL (+Y) convention as three.js expects.
 * k is auto-calibrated so the 95th-percentile slope hits `targetSlope`, which
 * keeps the relief strength independent of the texture resolution.
 * Roughness: slightly rougher in pores and furrows, varied by the micro noise.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

/** Deterministic PRNG so the skin looks identical on every load. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (i, n) => ((i % n) + n) % n;
const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Periodic value noise with `period` lattice cells across the tile. Returns −1..1. */
function createValueNoise(period, random) {
  const lattice = Float32Array.from({ length: period * period }, () => random() * 2 - 1);
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = quintic(x - x0);
    const ty = quintic(y - y0);
    const at = (i, j) => lattice[wrap(j, period) * period + wrap(i, period)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/**
 * Periodic Worley (cellular) noise: one jittered feature point per cell.
 * Distances are in cell units. Also returns per-cell random attributes.
 */
function createWorley(cells, random) {
  const points = Array.from({ length: cells * cells }, () => ({
    x: random(),
    y: random(),
    size: random(),
    depth: random(),
    presence: random(),
  }));
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    let nearest = null;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const point = points[wrap(cy + j, cells) * cells + wrap(cx + i, cells)];
        const dx = cx + i + point.x - x;
        const dy = cy + j + point.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance < f1) {
          f2 = f1;
          f1 = distance;
          nearest = point;
        } else if (distance < f2) {
          f2 = distance;
        }
      }
    }
    return { f1, f2, cell: nearest };
  };
}

function createDataTexture(data, size) {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace; // linear data, not color
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8; // clamped to the GPU maximum by three.js
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {{ size: number, poreCells: number, plateCells: number,
 *   roughnessRange: [number, number], seed: number, targetSlope?: number }} options
 * @returns {{ normalMap: DataTexture, roughnessMap: DataTexture }}
 */
export function generateSkinTextures({
  size,
  poreCells,
  plateCells,
  roughnessRange,
  seed,
  targetSlope = 0.55,
}) {
  const random = mulberry32(seed);
  const plates = createWorley(plateCells, random);
  const pores = createWorley(poreCells, random);
  const micro = [64, 128, 256].map((period) => createValueNoise(period, random));
  const broad = createValueNoise(8, random);

  const height = new Float32Array(size * size);
  const cavity = new Float32Array(size * size); // 0..1, where pores/furrows are
  const grain = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;

      const plate = plates(u, v);
      const furrow = 1 - smoothstep(0, 0.09, plate.f2 - plate.f1);

      const pore = pores(u, v);
      const hasPore = pore.cell.presence > 0.3;
      const poreRadius = 0.16 + 0.16 * pore.cell.size;
      const dimple = hasPore ? (1 - smoothstep(0, poreRadius, pore.f1)) ** 2 : 0;

      const fbm = micro[0](u, v) * 0.5 + micro[1](u, v) * 0.3 + micro[2](u, v) * 0.2;

      const i = y * size + x;
      height[i] =
        -0.55 * furrow - (0.6 + 0.6 * pore.cell.depth) * dimple + 0.18 * fbm + 0.35 * broad(u, v);
      cavity[i] = Math.max(furrow, dimple);
      grain[i] = fbm;
    }
  }

  // Central differences with wrap-around (seamless), in height units per texel.
  const gradX = new Float32Array(size * size);
  const gradY = new Float32Array(size * size);
  const slopes = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      gradX[i] = (height[y * size + wrap(x + 1, size)] - height[y * size + wrap(x - 1, size)]) / 2;
      gradY[i] = (height[wrap(y + 1, size) * size + x] - height[wrap(y - 1, size) * size + x]) / 2;
      slopes[i] = Math.hypot(gradX[i], gradY[i]);
    }
  }
  const sortedSlopes = Float32Array.from(slopes).sort();
  const p95 = sortedSlopes[Math.floor(sortedSlopes.length * 0.95)] || 1;
  const strength = targetSlope / p95;

  const normalData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const [roughMin, roughMax] = roughnessRange;
  for (let i = 0; i < size * size; i++) {
    const nx = -gradX[i] * strength;
    const ny = -gradY[i] * strength;
    const inv = 1 / Math.hypot(nx, ny, 1);
    const o = i * 4;
    normalData[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
    normalData[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
    normalData[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    normalData[o + 3] = 255;

    const roughness = Math.min(
      1,
      roughMin + (roughMax - roughMin) * (0.5 + 0.5 * grain[i]) + 0.1 * cavity[i],
    );
    const byte = Math.round(roughness * 255);
    roughnessData[o] = byte;
    roughnessData[o + 1] = byte; // three.js reads roughness from G
    roughnessData[o + 2] = byte;
    roughnessData[o + 3] = 255;
  }

  return {
    normalMap: createDataTexture(normalData, size),
    roughnessMap: createDataTexture(roughnessData, size),
  };
}

/**
 * Physically based depth of field (thin lens) for the camera mode.
 *
 * Why not three's BokehPass: its blur grows linearly with depth difference
 * (`(focus + viewZ) * aperture`), its `aperture` is not an f-number, and it
 * renders depth with `scene.overrideMaterial = MeshDepthMaterial`, which
 * ignores alpha-cutout hair cards. This pass instead reads the depth buffer of
 * the real scene render (same materials, same alpha test) and computes the
 * circle of confusion from focal length, f-number and focus distance
 * (src/utils/cameraOptics.js):
 *
 *   c(mm) = K · (1 − u₁/u₂),  K = f² / (N (u₁ − f)),  radius(px) = c/2 · px per sensor mm
 *
 * Passes (all linear HDR, before tone mapping, so bright highlights bloom into
 * proper bokeh discs):
 *   1. prefilter  rgb = color, a = signed CoC radius (px; < 0 in front of focus)
 *                 into a mip-mapped half-float target
 *   2. tile max   largest |CoC| per 16 × 16 tile
 *   3. dilate     spreads each tile's max to the tiles its blur can reach
 *   4. gather     Vogel-disk scatter-as-gather bounded by the dilated tile
 *                 radius. A sample contributes when its own blur disc covers
 *                 the pixel; samples behind the pixel are clamped to 2× the
 *                 pixel's CoC (no blurred background over a sharp subject),
 *                 samples in front are not (a blurred foreground spreads over
 *                 what lies behind it).
 *   5. smooth     3 × 3 tent on blurred pixels only (hides sampling grain)
 */
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PREFILTER_SHADER = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focalLengthMm;
  uniform float objectDistanceMm; // u1: lens -> focus plane
  uniform float imageDistanceMm;  // v1: lens -> sensor
  uniform float cocScaleMm;       // K: blur diameter at infinity
  uniform float pxPerMm;          // drawing-buffer px per sensor mm
  uniform float maxCocPx;
  uniform float maxLinearValue;
  varying vec2 vUv;

  void main() {
    vec3 color = min(texture2D(tColor, vUv).rgb, vec3(maxLinearValue));
    float depth = texture2D(tDepth, vUv).x;
    // Axial distance from the camera (the focal plane), in mm.
    float sensorDistanceMm = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar) * 1000.0;
    float objectMm = max(sensorDistanceMm - imageDistanceMm, focalLengthMm * 1.001);
    float cocMm = cocScaleMm * (1.0 - objectDistanceMm / objectMm);
    float cocPx = clamp(0.5 * cocMm * pxPerMm, -maxCocPx, maxCocPx);
    gl_FragColor = vec4(color, cocPx);
  }
`;

// CoC-weighted color for the mip chain: (rgb · w, w) with w ∝ |CoC|. A plain
// box mip would average a sharp subject into the coarse texels next to it, and
// wide background gathers would then paint a halo of subject color around it.
const WEIGHT_SHADER = /* glsl */ `
  uniform sampler2D tCoc;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tCoc, vUv);
    float w = abs(s.a) + 0.25;
    gl_FragColor = vec4(s.rgb * w, w);
  }
`;

const TILE_MAX_SHADER = /* glsl */ `
  uniform sampler2D tCoc;
  uniform ivec2 sourceSize;
  uniform int tileSize;
  void main() {
    ivec2 origin = ivec2(gl_FragCoord.xy) * tileSize;
    float maxCoc = 0.0;
    for (int y = 0; y < tileSize; y++) {
      for (int x = 0; x < tileSize; x++) {
        ivec2 p = min(origin + ivec2(x, y), sourceSize - 1);
        maxCoc = max(maxCoc, abs(texelFetch(tCoc, p, 0).a));
      }
    }
    gl_FragColor = vec4(maxCoc, 0.0, 0.0, 1.0);
  }
`;

const DILATE_SHADER = /* glsl */ `
  uniform sampler2D tTiles;
  uniform ivec2 tileCount;
  uniform int tileSize;
  uniform int reach;
  void main() {
    ivec2 tile = ivec2(gl_FragCoord.xy);
    float radius = texelFetch(tTiles, tile, 0).r;
    for (int y = -reach; y <= reach; y++) {
      for (int x = -reach; x <= reach; x++) {
        ivec2 neighbour = tile + ivec2(x, y);
        if (any(lessThan(neighbour, ivec2(0))) || any(greaterThanEqual(neighbour, tileCount))) continue;
        float neighbourRadius = texelFetch(tTiles, neighbour, 0).r;
        // Closest pixels of the two tiles are at least this far apart.
        float gap = float(max(abs(x), abs(y)) - 1) * float(tileSize);
        if (neighbourRadius > gap) radius = max(radius, neighbourRadius);
      }
    }
    gl_FragColor = vec4(radius, 0.0, 0.0, 1.0);
  }
`;

const GATHER_SHADER = /* glsl */ `
  uniform sampler2D tCoc;
  uniform sampler2D tWeighted;
  uniform sampler2D tTiles;
  uniform vec2 texelSize;
  uniform int tileSize;
  uniform int minSamples;
  uniform int maxSamples;
  varying vec2 vUv;

  const float GOLDEN_ANGLE = 2.39996323;
  const float SQRT_PI = 1.77245385;

  // Interleaved gradient noise: per-pixel rotation of the sample pattern.
  float interleavedGradientNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec4 center = textureLod(tCoc, vUv, 0.0);
    float centerCoc = center.a;
    float centerAbs = abs(centerCoc);
    float radius = texelFetch(tTiles, ivec2(gl_FragCoord.xy) / tileSize, 0).r;
    if (radius < 0.5) {
      gl_FragColor = vec4(center.rgb, 0.0);
      return;
    }

    int count = clamp(int(ceil(radius * radius * 0.35)), minSamples, maxSamples);
    float n = float(count);
    float spacing = radius * SQRT_PI / sqrt(n);
    float ringBand = max(1.0, radius / sqrt(n));
    float lod = clamp(log2(spacing) - 1.5, 0.0, 2.0);
    float rotation = interleavedGradientNoise(gl_FragCoord.xy) * 6.28318531;

    vec3 sum = center.rgb;
    float total = 1.0;
    float coveredRadius = 0.0;
    for (int i = 0; i < 128; i++) {
      if (i >= count) break;
      float r = sqrt((float(i) + 0.5) / n) * radius;
      float theta = float(i) * GOLDEN_ANGLE + rotation;
      vec2 uv = vUv + vec2(cos(theta), sin(theta)) * r * texelSize;
      // CoC at full resolution (exact edges), color from the weighted mips.
      float sampleCoc = texture2D(tCoc, uv).a;
      vec4 weighted = textureLod(tWeighted, uv, lod);
      vec3 sampleColor = weighted.rgb / max(weighted.a, 1e-4);
      float sampleAbs = abs(sampleCoc);
      // Farther than this pixel: may not blur over it beyond 2x its own CoC.
      if (sampleCoc > centerCoc) sampleAbs = min(sampleAbs, 2.0 * centerAbs);
      // Soft coverage edge against sampling aliasing, never wider than the sample's own disc.
      float band = max(1.0, min(ringBand, sampleAbs));
      float cover = smoothstep(r - 0.5 * band, r + 0.5 * band, sampleAbs);
      // Non-covering samples add the running mean (neutral).
      sum += mix(sum / total, sampleColor, cover);
      total += 1.0;
      coveredRadius += cover * sampleAbs;
    }
    gl_FragColor = vec4(sum / total, max(centerAbs, coveredRadius / n));
  }
`;

const SMOOTH_SHADER = /* glsl */ `
  uniform sampler2D tGather;
  uniform vec2 texelSize;
  varying vec2 vUv;
  void main() {
    vec4 center = texture2D(tGather, vUv);
    if (center.a < 1.5) {
      gl_FragColor = vec4(center.rgb, 1.0);
      return;
    }
    vec3 sum = vec3(0.0);
    float weightSum = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec4 s = texture2D(tGather, vUv + vec2(float(x), float(y)) * texelSize);
        // Tent weights; sharp neighbours are left out.
        float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0) * step(1.0, s.a);
        sum += s.rgb * w;
        weightSum += w;
      }
    }
    vec3 smoothed = sum / max(weightSum, 1e-4);
    gl_FragColor = vec4(mix(center.rgb, smoothed, smoothstep(1.5, 4.0, center.a)), 1.0);
  }
`;

const createTarget = (options = {}) =>
  new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    ...options,
  });

const createMaterial = (fragmentShader, uniforms) =>
  new ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader, uniforms, depthTest: false, depthWrite: false });

export class PhysicalBokehPass extends Pass {
  /**
   * @param {{ tileSizePx: number, minSamples: number, maxSamples: number, maxLinearValue: number }} options
   */
  constructor({ tileSizePx, minSamples, maxSamples, maxLinearValue }) {
    super();
    this.needsSwap = true;
    this.tileSize = tileSizePx;

    this.cocTarget = createTarget({ minFilter: LinearFilter, magFilter: LinearFilter });
    this.cocTarget.texture.name = 'PhysicalBokehPass.coc';
    // Mip-mapped so wide gathers read pre-averaged color (fewer samples, no grain).
    this.weightedTarget = createTarget({
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: true,
    });
    this.weightedTarget.texture.name = 'PhysicalBokehPass.weighted';
    this.tileTarget = createTarget();
    this.tileTarget.texture.name = 'PhysicalBokehPass.tiles';
    this.dilatedTarget = createTarget();
    this.dilatedTarget.texture.name = 'PhysicalBokehPass.dilated';
    this.gatherTarget = createTarget({ minFilter: LinearFilter, magFilter: LinearFilter });
    this.gatherTarget.texture.name = 'PhysicalBokehPass.gather';

    this.prefilterMaterial = createMaterial(PREFILTER_SHADER, {
      tColor: { value: null },
      tDepth: { value: null },
      cameraNear: { value: 0.05 },
      cameraFar: { value: 100 },
      focalLengthMm: { value: 50 },
      objectDistanceMm: { value: 3000 },
      imageDistanceMm: { value: 50 },
      cocScaleMm: { value: 0 },
      pxPerMm: { value: 1 },
      maxCocPx: { value: 1 },
      maxLinearValue: { value: maxLinearValue },
    });
    this.weightMaterial = createMaterial(WEIGHT_SHADER, { tCoc: { value: this.cocTarget.texture } });
    this.tileMaxMaterial = createMaterial(TILE_MAX_SHADER, {
      tCoc: { value: this.cocTarget.texture },
      sourceSize: { value: new Vector2(1, 1) },
      tileSize: { value: this.tileSize },
    });
    this.dilateMaterial = createMaterial(DILATE_SHADER, {
      tTiles: { value: this.tileTarget.texture },
      tileCount: { value: new Vector2(1, 1) },
      tileSize: { value: this.tileSize },
      reach: { value: 1 },
    });
    this.gatherMaterial = createMaterial(GATHER_SHADER, {
      tCoc: { value: this.cocTarget.texture },
      tWeighted: { value: this.weightedTarget.texture },
      tTiles: { value: this.dilatedTarget.texture },
      texelSize: { value: new Vector2(1, 1) },
      tileSize: { value: this.tileSize },
      minSamples: { value: minSamples },
      maxSamples: { value: Math.min(maxSamples, 128) },
    });
    this.smoothMaterial = createMaterial(SMOOTH_SHADER, {
      tGather: { value: this.gatherTarget.texture },
      texelSize: { value: new Vector2(1, 1) },
    });
    // (ivec2 uniforms take a Vector2: three uploads it with uniform2i.)
    this.fsQuad = new FullScreenQuad(null);
  }

  /**
   * @param {{ focalLengthMm: number, objectDistanceMm: number, imageDistanceMm: number,
   *   cocScaleMm: number, pxPerMm: number, maxCocPx: number, near: number, far: number }} lens
   */
  setLens({ focalLengthMm, objectDistanceMm, imageDistanceMm, cocScaleMm, pxPerMm, maxCocPx, near, far }) {
    const u = this.prefilterMaterial.uniforms;
    u.focalLengthMm.value = focalLengthMm;
    u.objectDistanceMm.value = objectDistanceMm;
    u.imageDistanceMm.value = imageDistanceMm;
    u.cocScaleMm.value = cocScaleMm;
    u.pxPerMm.value = pxPerMm;
    u.maxCocPx.value = maxCocPx;
    u.cameraNear.value = near;
    u.cameraFar.value = far;
    this.dilateMaterial.uniforms.reach.value = Math.max(1, Math.ceil(maxCocPx / this.tileSize));
  }

  setSize(width, height) {
    const tilesX = Math.ceil(width / this.tileSize);
    const tilesY = Math.ceil(height / this.tileSize);
    this.cocTarget.setSize(width, height);
    this.weightedTarget.setSize(width, height);
    this.gatherTarget.setSize(width, height);
    this.tileTarget.setSize(tilesX, tilesY);
    this.dilatedTarget.setSize(tilesX, tilesY);
    this.tileMaxMaterial.uniforms.sourceSize.value.set(width, height);
    this.dilateMaterial.uniforms.tileCount.value.set(tilesX, tilesY);
    this.gatherMaterial.uniforms.texelSize.value.set(1 / width, 1 / height);
    this.smoothMaterial.uniforms.texelSize.value.set(1 / width, 1 / height);
  }

  renderQuad(renderer, material, target) {
    this.fsQuad.material = material;
    renderer.setRenderTarget(target);
    this.fsQuad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const prefilter = this.prefilterMaterial.uniforms;
    prefilter.tColor.value = readBuffer.texture;
    prefilter.tDepth.value = readBuffer.depthTexture;

    this.renderQuad(renderer, this.prefilterMaterial, this.cocTarget);
    this.renderQuad(renderer, this.weightMaterial, this.weightedTarget); // mipmaps are generated after this render
    this.renderQuad(renderer, this.tileMaxMaterial, this.tileTarget);
    this.renderQuad(renderer, this.dilateMaterial, this.dilatedTarget);
    this.renderQuad(renderer, this.gatherMaterial, this.gatherTarget);

    this.fsQuad.material = this.smoothMaterial;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.cocTarget.dispose();
    this.weightedTarget.dispose();
    this.tileTarget.dispose();
    this.dilatedTarget.dispose();
    this.gatherTarget.dispose();
    this.prefilterMaterial.dispose();
    this.weightMaterial.dispose();
    this.tileMaxMaterial.dispose();
    this.dilateMaterial.dispose();
    this.gatherMaterial.dispose();
    this.smoothMaterial.dispose();
    this.fsQuad.dispose();
  }
}

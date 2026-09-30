/**
 * Fisheye lens for the camera mode: barrel distortion as a real lens
 * projection, not a wide perspective FOV.
 *
 * A perspective camera cannot see 180° (tan 90° is infinite) and stretches
 * everything towards the edges. This pass instead:
 *   1. renders the scene into up to five 90° faces around the photo camera
 *      (front, right, left, up, down, in the camera's own frame) packed in
 *      one atlas render target with a depth texture;
 *   2. draws a full-screen quad that turns each output pixel into its sensor
 *      position (mm from the image center), the sensor position into a field
 *      angle θ through the lens projection (utils/fisheyeProjection.js), and
 *      θ into a ray that is looked up in the matching face.
 * Four rotated-grid taps per pixel antialias the result and the image
 * circle's edge. Rays beyond the field stop are black.
 *
 * Depth of field: the pass writes gl_FragDepth as the perspective depth of
 * the ray's distance, so PhysicalBokehPass (next in the chain) reads the
 * fisheye image's distances like those of a normal render.
 *
 * Output is linear HDR like the RenderPass it replaces; OutputPass tone-maps.
 */
import {
  AlwaysDepth,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NearestFilter,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Faces in the photo camera's frame (x right, y up, looking down −z) and
 * their cell in the 3 × 2 atlas. Order and bases match faceSample() below.
 */
const FACES = Object.freeze([
  { name: 'front', forward: [0, 0, -1], up: [0, 1, 0], cell: [0, 0] },
  { name: 'right', forward: [1, 0, 0], up: [0, 1, 0], cell: [1, 0] },
  { name: 'left', forward: [-1, 0, 0], up: [0, 1, 0], cell: [2, 0] },
  { name: 'up', forward: [0, 1, 0], up: [0, 0, 1], cell: [0, 1] },
  { name: 'down', forward: [0, -1, 0], up: [0, 0, -1], cell: [1, 1] },
]);

/** Camera-local rotation of a face camera (its −z along `forward`). */
function faceRotation({ forward, up }) {
  const f = new Vector3(...forward);
  const u = new Vector3(...up);
  const right = new Vector3().crossVectors(f, u);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, u, f.clone().negate()));
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  #include <packing>
  uniform sampler2D tAtlas;
  uniform sampler2D tAtlasDepth;
  uniform vec2 resolution;       // output, drawing-buffer px
  uniform float pxPerMm;         // drawing-buffer px per sensor mm
  uniform float focalLengthMm;
  uniform float projectionK;     // 1 − curvature
  uniform float strength;        // share of the fisheye mapping
  uniform float maxFieldRad;     // half of the lens's field (field stop)
  uniform float imageCircleMm;   // radius where the field stop cuts the image
  uniform float circleEdgeMm;
  uniform float faceTanHalf;     // tan(half FOV) of a face incl. padding
  uniform float faceNear;
  uniform float faceFar;
  uniform float cameraNear;      // clip planes the bokeh pass decodes depth with
  uniform float cameraFar;
  uniform float outsideDistanceM; // distance written outside the image circle (in focus)

  // θ for rho = r / f (see utils/fisheyeProjection.js); valid = 0 beyond the projection.
  float fieldAngle(float rho, out float valid) {
    valid = 1.0;
    float fish;
    if (abs(projectionK) < 1e-3) {
      fish = rho;
    } else if (projectionK > 0.0) {
      fish = atan(projectionK * rho) / projectionK;
    } else {
      float s = -projectionK * rho;
      if (s > 1.0) { valid = 0.0; s = 1.0; }
      fish = asin(s) / -projectionK;
    }
    return mix(atan(rho), fish, strength);
  }

  // Atlas uv of a camera-local direction and the cosine to that face's axis.
  vec2 faceSample(vec3 d, out float cosToFace) {
    vec3 a = abs(d);
    vec3 forward; vec3 up; vec2 cell;
    if (-d.z >= a.x && -d.z >= a.y) {
      forward = vec3(0.0, 0.0, -1.0); up = vec3(0.0, 1.0, 0.0); cell = vec2(0.0, 0.0);
    } else if (a.x >= a.y) {
      if (d.x > 0.0) { forward = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 1.0, 0.0); cell = vec2(1.0, 0.0); }
      else { forward = vec3(-1.0, 0.0, 0.0); up = vec3(0.0, 1.0, 0.0); cell = vec2(2.0, 0.0); }
    } else if (d.y > 0.0) {
      forward = vec3(0.0, 1.0, 0.0); up = vec3(0.0, 0.0, 1.0); cell = vec2(0.0, 1.0);
    } else {
      forward = vec3(0.0, -1.0, 0.0); up = vec3(0.0, 0.0, -1.0); cell = vec2(1.0, 1.0);
    }
    vec3 right = cross(forward, up);
    cosToFace = dot(d, forward);
    vec2 tangent = vec2(dot(d, right), dot(d, up)) / max(cosToFace, 1e-4);
    vec2 faceUv = 0.5 + 0.5 * tangent / faceTanHalf;
    return (cell + clamp(faceUv, 0.0, 1.0)) / vec2(3.0, 2.0);
  }

  // Ray through the lens for an output pixel position; inside = 0 outside the image.
  vec3 lensRay(vec2 fragPx, out float inside, out float radiusMm) {
    vec2 mm = (fragPx - 0.5 * resolution) / pxPerMm;
    radiusMm = length(mm);
    float valid;
    float theta = fieldAngle(radiusMm / focalLengthMm, valid);
    inside = valid * step(theta, maxFieldRad + 1e-4);
    float phi = atan(mm.y, mm.x);
    theta = min(theta, maxFieldRad);
    return vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), -cos(theta));
  }

  void main() {
    // Rotated-grid supersampling (4 taps per output pixel).
    const vec2 TAPS[4] = vec2[4](vec2(0.125, 0.375), vec2(-0.375, 0.125), vec2(-0.125, -0.375), vec2(0.375, -0.125));
    vec3 color = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float inside; float radiusMm; float cosToFace;
      vec3 d = lensRay(gl_FragCoord.xy + TAPS[i], inside, radiusMm);
      if (inside < 0.5) continue;
      float edge = 1.0 - smoothstep(imageCircleMm - circleEdgeMm, imageCircleMm, radiusMm);
      color += texture2D(tAtlas, faceSample(d, cosToFace)).rgb * edge;
    }
    gl_FragColor = vec4(color * 0.25, 1.0);

    // Distance along the pixel-center ray (for the depth of field).
    float inside; float radiusMm; float cosToFace;
    vec3 d = lensRay(gl_FragCoord.xy, inside, radiusMm);
    float distanceM = outsideDistanceM;
    if (inside > 0.5 && radiusMm < imageCircleMm) {
      float depth = texture2D(tAtlasDepth, faceSample(d, cosToFace)).x;
      float faceViewZ = perspectiveDepthToViewZ(depth, faceNear, faceFar);
      distanceM = min(-faceViewZ / max(cosToFace, 1e-4), cameraFar);
    }
    gl_FragDepth = viewZToPerspectiveDepth(-distanceM, cameraNear, cameraFar);
  }
`;

export class FisheyeLensPass extends Pass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').PerspectiveCamera} camera  photo camera (position, orientation, clip planes)
   * @param {{ facePaddingPx: number, circleEdgeMm: number }} options
   */
  constructor(scene, camera, { facePaddingPx, circleEdgeMm }) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.facePaddingPx = facePaddingPx;
    this.faceSize = 0;
    this.atlas = null;
    this.faces = FACES.map((face) => {
      const faceCamera = new PerspectiveCamera(90, 1, 0.05, 100);
      faceCamera.name = `fisheye-face-${face.name}`;
      return { ...face, camera: faceCamera, rotation: faceRotation(face) };
    });
    this.material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        tAtlas: { value: null },
        tAtlasDepth: { value: null },
        resolution: { value: new Vector2(1, 1) },
        pxPerMm: { value: 1 },
        focalLengthMm: { value: 11 },
        projectionK: { value: 0.5 },
        strength: { value: 1 },
        maxFieldRad: { value: Math.PI / 2 },
        imageCircleMm: { value: 22 },
        circleEdgeMm: { value: circleEdgeMm },
        faceTanHalf: { value: 1 },
        faceNear: { value: 0.05 },
        faceFar: { value: 100 },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 100 },
        outsideDistanceM: { value: 3 },
      },
      depthTest: true,
      depthWrite: true,
      depthFunc: AlwaysDepth,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  /**
   * @param {{ focalLengthMm: number, curvature: number, strength: number, maxFieldDeg: number,
   *   imageCircleRadiusMm: number, pxPerMm: number, faceSizePx: number, outsideDistanceM: number }} lens
   */
  setLens({ focalLengthMm, curvature, strength, maxFieldDeg, imageCircleRadiusMm, pxPerMm, faceSizePx, outsideDistanceM }) {
    const u = this.material.uniforms;
    u.focalLengthMm.value = focalLengthMm;
    u.projectionK.value = 1 - curvature;
    u.strength.value = strength;
    u.maxFieldRad.value = ((maxFieldDeg / 2) * Math.PI) / 180;
    u.imageCircleMm.value = Number.isFinite(imageCircleRadiusMm) ? imageCircleRadiusMm : 1e6;
    u.pxPerMm.value = pxPerMm;
    u.outsideDistanceM.value = outsideDistanceM;
    this.ensureAtlas(faceSizePx);
  }

  /** (Re)allocates the face atlas; faces keep their 90° plus padding. */
  ensureAtlas(faceSize) {
    if (this.atlas && this.faceSize === faceSize) return;
    this.releaseTargets();
    this.faceSize = faceSize;
    this.atlas = new WebGLRenderTarget(3 * faceSize, 2 * faceSize, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthTexture: new DepthTexture(3 * faceSize, 2 * faceSize, UnsignedIntType),
    });
    this.atlas.texture.name = 'FisheyeLensPass.faces';
    this.atlas.depthTexture.minFilter = NearestFilter;
    this.atlas.depthTexture.magFilter = NearestFilter;
    this.atlas.scissorTest = true;
    // Padding: the face spans tan ±faceTanHalf, the ±1 edge sits facePaddingPx inside.
    const tanHalf = 1 / (1 - (2 * this.facePaddingPx) / faceSize);
    this.material.uniforms.faceTanHalf.value = tanHalf;
    const fov = (2 * Math.atan(tanHalf) * 180) / Math.PI;
    for (const face of this.faces) {
      face.camera.fov = fov;
      face.camera.updateProjectionMatrix();
    }
    this.material.uniforms.tAtlas.value = this.atlas.texture;
    this.material.uniforms.tAtlasDepth.value = this.atlas.depthTexture;
  }

  /** Frees the atlas (the lens is not fisheye any more); the next setLens allocates it again. */
  releaseTargets() {
    if (!this.atlas) return;
    this.atlas.depthTexture.dispose();
    this.atlas.dispose();
    this.atlas = null;
    this.faceSize = 0;
    this.material.uniforms.tAtlas.value = null;
    this.material.uniforms.tAtlasDepth.value = null;
  }

  setSize(width, height) {
    this.material.uniforms.resolution.value.set(width, height);
  }

  renderFaces(renderer) {
    const { camera, scene, atlas, faceSize } = this;
    const u = this.material.uniforms;
    camera.updateMatrixWorld();
    const position = new Vector3();
    const orientation = new Quaternion();
    camera.matrixWorld.decompose(position, orientation, new Vector3());
    u.faceNear.value = camera.near;
    u.faceFar.value = camera.far;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;

    const shadowMap = renderer.shadowMap;
    const shadowAutoUpdate = shadowMap.autoUpdate;
    try {
      this.faces.forEach((face, index) => {
        const faceCamera = face.camera;
        faceCamera.near = camera.near;
        faceCamera.far = camera.far;
        faceCamera.layers.mask = camera.layers.mask;
        faceCamera.updateProjectionMatrix();
        faceCamera.position.copy(position);
        faceCamera.quaternion.copy(orientation).multiply(face.rotation);
        faceCamera.updateMatrixWorld();
        const [col, row] = face.cell;
        atlas.viewport.set(col * faceSize, row * faceSize, faceSize, faceSize);
        atlas.scissor.copy(atlas.viewport);
        renderer.setRenderTarget(atlas);
        renderer.render(scene, faceCamera);
        // Shadow maps do not depend on the camera: render them once per frame.
        if (index === 0) {
          shadowMap.autoUpdate = false;
          shadowMap.needsUpdate = false;
        }
      });
    } finally {
      shadowMap.autoUpdate = shadowAutoUpdate;
    }
  }

  render(renderer, writeBuffer /* , readBuffer */) {
    if (!this.atlas) return;
    this.renderFaces(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear(true, true, false);
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.releaseTargets();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

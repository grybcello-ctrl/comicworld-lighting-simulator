/**
 * Apparent-size shadow model: maps the physical emitter size and the 3D
 * light-to-subject distance to three.js SpotLight shadow parameters.
 *
 * Physics (similar triangles: emitter diameter D at distance d from an
 * occluder that sits a gap s in front of the receiving surface):
 *   apparent (angular) size   α = 2 · atan(D / 2d)
 *   penumbra width            w = D · s / d        -> inversely proportional to d
 * Close / large source = wide penumbra (soft); far / small source = hard edge.
 *
 * three.js mapping (r186 PCF: Vogel disk of radius `shadow.radius` texels,
 * so the blur's full width is 2 · r · t for texel size t):
 *   shadow frustum width at d   F = 2 · d · tan(θ)         (fov = 2θ = spot cone)
 *   texel size                  t = clamp(max(t0, w / 2r_max), F / Nmax, F / Nmin)
 *   shadow.radius               r = w / (2t) = D · s / (2 · t · d)
 * With the constant target texel t0 the radius is directly proportional to
 * D / d: it rises as the focusing rod floods (D grows) and falls with distance.
 * Only very wide/far or very narrow/near beams hit the map-size clamps; there
 * t follows F, which keeps the blur physically sized (and r still monotonic).
 * Very soft shadows (r would exceed r_max, where 5 PCF taps get grainy) use a
 * coarser texel instead: r stays at r_max but the blur keeps its physical width.
 *
 * Map size N = ceil(F / t) rounded up to `mapSizeStep`, so narrow beams get
 * small (cheap) maps and the texel never exceeds t.
 */
import { SHADOW_CONFIG } from '../config/sceneConfig.js';
import { clamp } from './lightMath.js';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * @param {{ sourceDiameterM: number, distance: number, halfAngle: number,
 *   frustumDistance?: number }} params
 *   halfAngle        SpotLight.angle (radians)
 *   distance         emitter-to-subject distance (sets the penumbra)
 *   frustumDistance  SpotLight-apex-to-subject distance (sets the shadow frustum);
 *                    differs for parabolics, whose SpotLight sits at the virtual apex.
 */
export function computeShadowParams({ sourceDiameterM, distance, halfAngle, frustumDistance = distance }) {
  const {
    referenceOccluderGapM,
    targetTexelM,
    minMapSize,
    maxMapSize,
    mapSizeStep,
    minRadius,
    maxRadius,
    depthBias,
    normalBiasTexels,
    minNormalBias,
    maxNormalBias,
    cameraNearM,
    cameraFarMarginM,
  } = SHADOW_CONFIG;

  const d = Math.max(distance, 0.1);
  const D = Math.max(sourceDiameterM, 0.001);

  const apparentSizeDeg = 2 * Math.atan(D / (2 * d)) * RAD_TO_DEG;
  const penumbraM = (D * referenceOccluderGapM) / d;

  const frustumWidthM = 2 * Math.max(frustumDistance, 0.1) * Math.tan(halfAngle);
  const texelM = clamp(
    Math.max(targetTexelM, penumbraM / (2 * maxRadius)),
    frustumWidthM / maxMapSize,
    frustumWidthM / minMapSize,
  );
  const mapSize = clamp(
    Math.ceil(frustumWidthM / texelM / mapSizeStep) * mapSizeStep,
    minMapSize,
    maxMapSize,
  );

  return {
    apparentSizeDeg,
    penumbraM,
    mapSize,
    texelM,
    radius: clamp(penumbraM / (2 * texelM), minRadius, maxRadius),
    bias: depthBias,
    normalBias: clamp(texelM * normalBiasTexels, minNormalBias, maxNormalBias),
    cameraNear: cameraNearM,
    cameraFar: Math.max(frustumDistance, d) + cameraFarMarginM,
  };
}

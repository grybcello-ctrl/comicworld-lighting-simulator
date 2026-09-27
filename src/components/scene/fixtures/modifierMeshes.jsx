import { useLayoutEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  Color,
  DoubleSide,
  FrontSide,
  LatheGeometry,
  Vector2,
} from 'three';
import { FOCUS_ROD_LIMITS, PARABOLIC_CONFIG } from '../../../config/sceneConfig.js';
import { parabolicHeadPositionM, reflectorGlowProfile } from '../../../utils/parabolicReflector.js';

/**
 * Modifier renderers. Same convention as strobe bodies: the mount is at the
 * local origin and the modifier opens towards +Z (the subject).
 * `isLit` switches emitting surfaces between glowing and idle.
 * Optional props: `emitColor` (glow color of lit surfaces, i.e. Kelvin × gel),
 * `grid` (GridDefinition | null), `innerDiffuser` (InnerDiffuserDefinition | null),
 * `focusRod` (0..100).
 */

const HALF_PI = Math.PI / 2;

function EmitterMaterial({ isLit, color = '#ffffff' }) {
  return (
    <meshBasicMaterial
      color={isLit ? color : '#4a4a4a'}
      toneMapped={!isLit}
      side={DoubleSide}
    />
  );
}

/** Honeycomb grid disc clipped to the front of a reflector. */
function GridMesh({ grid, radius, frontZ }) {
  const { thickness, color } = grid.geometry;
  return (
    <group position={[0, 0, frontZ + thickness / 2]}>
      <mesh rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[radius * 1.03, radius * 1.03, thickness, 32, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.6} side={DoubleSide} />
      </mesh>
      {/* Hex cells, drawn as a wireframe disc. */}
      <mesh position={[0, 0, thickness / 2]}>
        <circleGeometry args={[radius, 6, 0, Math.PI * 2]} />
        <meshBasicMaterial color="#202020" wireframe />
      </mesh>
      <mesh position={[0, 0, thickness / 2 - 0.001]}>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.8} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Open cone reflector with a bright bulb inside (and an optional grid). */
export function ReflectorMesh({ geometry, isLit, emitColor, grid }) {
  const { diameter, depth, color } = geometry;
  return (
    <group>
      <mesh position={[0, 0, depth / 2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[diameter / 2, 0.06, depth, 32, 1, true]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.25} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <EmitterMaterial isLit={isLit} color={emitColor} />
      </mesh>
      {grid && <GridMesh grid={grid} radius={diameter / 2} frontZ={depth} />}
    </group>
  );
}

/** Rod length behind the head; it passes through the apex like a focusing tube. */
const FOCUS_ROD_EXTRA_LENGTH_M = 0.3;

/**
 * Fake global illumination for the dish interior: an additive, vertex-colored
 * copy of the reflector surface whose brightness is the irradiance the
 * rear-firing head puts on each ring of the dish (parabolicReflector.js).
 * Head deep inside (spot) -> the glow pools around the apex; head pulled out
 * (flood) -> the whole silver interior glows evenly. Unlit material: it never
 * adds light to the scene, so it can't change the real lighting.
 */
function ReflectorGlow({ geometry, profilePoints, segments, headZ, emitColor }) {
  const glowGeometry = useMemo(() => {
    const lathe = new LatheGeometry(profilePoints, segments);
    lathe.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(lathe.attributes.position.count * 3), 3),
    );
    return lathe;
  }, [profilePoints, segments]);

  useLayoutEffect(() => () => glowGeometry.dispose(), [glowGeometry]);

  // Re-shade whenever the head moves along the rod or the light color changes.
  useLayoutEffect(() => {
    const { values } = reflectorGlowProfile(
      geometry,
      headZ,
      profilePoints.map((point) => point.x),
    );
    const colors = glowGeometry.attributes.color.array;
    const tint = new Color(emitColor ?? '#ffffff');
    const pointsPerMeridian = profilePoints.length;
    // LatheGeometry vertex order: for each segment i, for each profile point j.
    for (let v = 0; v < glowGeometry.attributes.color.count; v++) {
      const brightness = values[v % pointsPerMeridian] * PARABOLIC_CONFIG.glowIntensity;
      colors[v * 3] = tint.r * brightness;
      colors[v * 3 + 1] = tint.g * brightness;
      colors[v * 3 + 2] = tint.b * brightness;
    }
    glowGeometry.attributes.color.needsUpdate = true;
  }, [glowGeometry, geometry, headZ, emitColor, profilePoints]);

  return (
    <mesh geometry={glowGeometry} rotation={[HALF_PI, 0, 0]} raycast={() => null}>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={PARABOLIC_CONFIG.glowOpacity}
        blending={AdditiveBlending}
        depthWrite={false}
        // LatheGeometry front faces point outwards: the concave interior is the
        // back face, so the glow never shows on the outside of the dish.
        side={BackSide}
        toneMapped={false}
        // Pull the glow in front of the coplanar dish surface (no z-fighting).
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/**
 * Deep faceted parabola z = depth * (ρ / R)^2 opening towards +Z, with the
 * focusing rod on the axis. The rear-firing flash tube (and the strobe body,
 * rendered by StudioLight on the same rod) slides along Z:
 *   rod 0   -> pushed deep inside to the focal point (focused: narrow, hard)
 *   rod 100 -> pulled out towards the opening      (flooded: wide, soft)
 * See parabolicHeadPositionM. The rod keeps its length, so it sticks out
 * further behind the dish when the head is pushed in.
 */
export function ParabolicMesh({
  geometry,
  isLit,
  emitColor,
  grid,
  innerDiffuser,
  focusRod = FOCUS_ROD_LIMITS.default,
}) {
  const { diameter, depth, segments = 24, color, exteriorColor = '#161616' } = geometry;
  const radius = diameter / 2;

  // Closed at the apex (ρ = 0), so the glowing interior never shows through.
  const profilePoints = useMemo(() => {
    const steps = 16;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const rho = (radius * i) / steps;
      return new Vector2(rho, depth * (rho / radius) ** 2);
    });
  }, [radius, depth]);

  const headZ = parabolicHeadPositionM(geometry, focusRod);
  const rodLength = depth * PARABOLIC_CONFIG.headMaxDepthFraction + FOCUS_ROD_EXTRA_LENGTH_M;

  // Inner diffuser: a disc between the rear-firing tube and the dish, scattering
  // the light before it hits the reflector. Clamped to fit inside the dish wall.
  const diffuserZ = Math.max(headZ - 0.06, 0.015);
  const diffuserRadius = innerDiffuser
    ? Math.min(radius * innerDiffuser.geometry.radiusFraction, radius * Math.sqrt(diffuserZ / depth) * 0.9)
    : 0;

  return (
    <group>
      {/* Lathe revolves around +Y; rotate so +Y maps to +Z. Front faces point
          outwards: the silver interior is the back face, the black fabric
          exterior the front face. The exterior is unlit because this light's
          SpotLight sits at its virtual apex behind the dish and would otherwise
          light the back of its own reflector. */}
      <mesh rotation={[HALF_PI, 0, 0]}>
        <latheGeometry args={[profilePoints, segments]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} flatShading side={BackSide} />
      </mesh>
      <mesh rotation={[HALF_PI, 0, 0]}>
        <latheGeometry args={[profilePoints, segments]} />
        <meshBasicMaterial color={exteriorColor} side={FrontSide} />
      </mesh>
      {isLit && (
        <ReflectorGlow
          geometry={geometry}
          profilePoints={profilePoints}
          segments={segments}
          headZ={headZ}
          emitColor={emitColor}
        />
      )}
      {/* Focusing rod: ends at the head, slides through the apex. */}
      <mesh position={[0, 0, headZ - rodLength / 2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, rodLength, 8]} />
        <meshStandardMaterial color="#303030" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Flash tube (fires back into the dish) */}
      <mesh position={[0, 0, headZ]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <EmitterMaterial isLit={isLit} color={emitColor} />
      </mesh>
      {innerDiffuser && (
        <mesh position={[0, 0, diffuserZ]}>
          <circleGeometry args={[diffuserRadius, 32]} />
          <EmitterMaterial isLit={isLit} color={isLit ? emitColor : innerDiffuser.geometry.color} />
        </mesh>
      )}
      {grid && <GridMesh grid={grid} radius={radius} frontZ={depth} />}
    </group>
  );
}

/** Rectangular softbox / stripbox: square frustum scaled to width x height. */
export function RectSoftboxMesh({ geometry, isLit, emitColor }) {
  const { width, height, depth, color } = geometry;
  // A 4-sided cylinder with radius 1/sqrt(2) has unit-length sides.
  const unitRadius = Math.SQRT1_2;
  return (
    <group>
      <group scale={[width, height, 1]}>
        <group position={[0, 0, depth / 2]} rotation={[HALF_PI, 0, 0]}>
          <mesh rotation={[0, Math.PI / 4, 0]}>
            <cylinderGeometry args={[unitRadius, unitRadius * 0.2, depth, 4, 1, true]} />
            <meshStandardMaterial color={color} roughness={0.9} side={DoubleSide} />
          </mesh>
        </group>
      </group>
      {/* Front diffuser */}
      <mesh position={[0, 0, depth]}>
        <planeGeometry args={[width, height]} />
        <EmitterMaterial isLit={isLit} color={emitColor} />
      </mesh>
    </group>
  );
}

/** Octagonal softbox. */
export function OctaSoftboxMesh({ geometry, isLit, emitColor }) {
  const { diameter, depth, color } = geometry;
  const radius = diameter / 2;
  return (
    <group>
      <mesh position={[0, 0, depth / 2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[radius, 0.1, depth, 8, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.9} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0, depth]} rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[radius, 8]} />
        <EmitterMaterial isLit={isLit} color={emitColor} />
      </mesh>
    </group>
  );
}

/** Umbrella canopy (spherical cap) with a shaft. */
export function UmbrellaMesh({ geometry, isLit, emitColor }) {
  const { diameter, depth, color } = geometry;
  const radius = diameter / 2;
  // Sphere radius / cap angle that produce the requested diameter and depth.
  const sphereRadius = (radius ** 2 + depth ** 2) / (2 * depth);
  const capAngle = Math.asin(radius / sphereRadius);
  const apexZ = 0.05;
  return (
    <group>
      {/* Canopy: a cap around +Y, rotated so +Y maps to -Z (concave side faces +Z). */}
      <mesh position={[0, 0, apexZ + sphereRadius]} rotation={[-HALF_PI, 0, 0]}>
        <sphereGeometry args={[sphereRadius, 32, 8, 0, Math.PI * 2, 0, capAngle]} />
        <EmitterMaterial isLit={isLit} color={emitColor} />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, 0, 0.1]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.5, 8]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
    </group>
  );
}

/** Shallow dish with a center deflector plate. */
export function BeautyDishMesh({ geometry, isLit, emitColor }) {
  const { diameter, depth, color } = geometry;
  return (
    <group>
      <mesh position={[0, 0, depth / 2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[diameter / 2, 0.08, depth, 40, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} side={DoubleSide} />
      </mesh>
      {/* Inner surface glow */}
      <mesh position={[0, 0, depth * 0.35]}>
        <circleGeometry args={[diameter * 0.3, 32]} />
        <EmitterMaterial isLit={isLit} color={emitColor} />
      </mesh>
      {/* Deflector plate */}
      <mesh position={[0, 0, depth * 0.6]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[diameter * 0.12, diameter * 0.12, 0.01, 24]} />
        <meshStandardMaterial color="#d0d0d0" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** No modifier: just an exposed flash tube. */
export function BareBulbMesh({ isLit, emitColor }) {
  return (
    <mesh position={[0, 0, 0.03]}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <EmitterMaterial isLit={isLit} color={emitColor} />
    </mesh>
  );
}

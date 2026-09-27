import { DoubleSide } from 'three';

/**
 * Modifier renderers. Same convention as strobe bodies: the mount is at the
 * local origin and the modifier opens towards +Z (the subject).
 * `isLit` switches emitting surfaces between glowing and idle.
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

/** Open cone reflector with a bright bulb inside. */
export function ReflectorMesh({ geometry, isLit }) {
  const { diameter, depth, color } = geometry;
  return (
    <group>
      <mesh position={[0, 0, depth / 2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[diameter / 2, 0.06, depth, 32, 1, true]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.25} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <EmitterMaterial isLit={isLit} />
      </mesh>
    </group>
  );
}

/** Rectangular softbox / stripbox: square frustum scaled to width x height. */
export function RectSoftboxMesh({ geometry, isLit }) {
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
        <EmitterMaterial isLit={isLit} />
      </mesh>
    </group>
  );
}

/** Octagonal softbox. */
export function OctaSoftboxMesh({ geometry, isLit }) {
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
        <EmitterMaterial isLit={isLit} />
      </mesh>
    </group>
  );
}

/** Umbrella canopy (spherical cap) with a shaft. */
export function UmbrellaMesh({ geometry, isLit }) {
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
        <EmitterMaterial isLit={isLit} color={color} />
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
export function BeautyDishMesh({ geometry, isLit }) {
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
        <EmitterMaterial isLit={isLit} />
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
export function BareBulbMesh({ isLit }) {
  return (
    <mesh position={[0, 0, 0.03]}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <EmitterMaterial isLit={isLit} />
    </mesh>
  );
}

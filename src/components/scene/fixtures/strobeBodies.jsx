/**
 * Strobe body renderers. Convention: the fixture's local +Z axis points at
 * the subject, and the flash tube sits at the origin. Bodies extend towards -Z.
 */

const HIGHLIGHT_EMISSIVE = '#3a6df0';

export function CylinderBody({ body, isSelected }) {
  const { length, radius, color } = body;
  return (
    <group>
      {/* Main housing */}
      <mesh position={[0, 0, -length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius * 0.9, length, 24]} />
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.3}
          emissive={isSelected ? HIGHLIGHT_EMISSIVE : '#000000'}
          emissiveIntensity={isSelected ? 0.6 : 0}
        />
      </mesh>
      {/* Mount ring */}
      <mesh position={[0, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 1.1, radius * 1.1, 0.02, 24]} />
        <meshStandardMaterial color="#555555" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function BoxBody({ body, isSelected }) {
  const { width, height, depth, color } = body;
  return (
    <mesh position={[0, -height * 0.3, -depth / 2]}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        emissive={isSelected ? HIGHLIGHT_EMISSIVE : '#000000'}
        emissiveIntensity={isSelected ? 0.6 : 0}
      />
    </mesh>
  );
}

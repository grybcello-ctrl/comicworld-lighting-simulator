/**
 * Placeholder subject: a stylized bust on a pedestal, built from primitives.
 * Can later be swapped for a GLTF model without affecting the lighting code,
 * as long as the head stays around SUBJECT_TARGET.
 */

const SKIN_MATERIAL_PROPS = { color: '#c9c4bd', roughness: 0.55, metalness: 0 };

function BustPart({ children, ...meshProps }) {
  return (
    <mesh castShadow receiveShadow {...meshProps}>
      {children}
      <meshStandardMaterial {...SKIN_MATERIAL_PROPS} />
    </mesh>
  );
}

export function BustSubject() {
  return (
    <group name="bust-subject">
      {/* Pedestal */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 1, 0.36]} />
        <meshStandardMaterial color="#3b3b40" roughness={0.8} />
      </mesh>

      {/* Chest & shoulders */}
      <BustPart position={[0, 1.12, 0]} scale={[0.22, 0.14, 0.12]}>
        <sphereGeometry args={[1, 48, 32]} />
      </BustPart>

      {/* Neck */}
      <BustPart position={[0, 1.31, 0]}>
        <cylinderGeometry args={[0.048, 0.055, 0.16, 24]} />
      </BustPart>

      {/* Head */}
      <BustPart position={[0, 1.46, 0]} scale={[0.08, 0.108, 0.098]}>
        <sphereGeometry args={[1, 48, 32]} />
      </BustPart>

      {/* Nose — gives an obvious facing direction for judging light angles */}
      <BustPart position={[0, 1.45, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.016, 0.04, 16]} />
      </BustPart>

      {/* Brow ridge */}
      <BustPart position={[0, 1.49, 0.075]} scale={[0.06, 0.012, 0.025]}>
        <sphereGeometry args={[1, 24, 12]} />
      </BustPart>

      {/* Ears */}
      {[-1, 1].map((side) => (
        <BustPart key={side} position={[side * 0.08, 1.46, 0]} scale={[0.012, 0.028, 0.018]}>
          <sphereGeometry args={[1, 16, 12]} />
        </BustPart>
      ))}
    </group>
  );
}

import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';

/**
 * Placeholder subject: a full-body artist's mannequin (~1.75 m, ≈7.5 heads
 * tall) built from primitives, standing on the floor and facing +Z.
 * The head center must stay at SUBJECT_TARGET (lights aim there). Can later be
 * swapped for a GLTF model without affecting the lighting code.
 *
 * All joint positions are for the subject's LEFT side (+X); the right side is
 * mirrored. Units: meters.
 */

const SKIN_MATERIAL_PROPS = { color: '#c9c4bd', roughness: 0.55, metalness: 0 };
const JOINT_MATERIAL_PROPS = { color: '#b7b1a9', roughness: 0.5, metalness: 0 };

const UP = new Vector3(0, 1, 0);

/** Joint centers (left side), from anthropometric proportions for a 1.75 m adult. */
const JOINTS = Object.freeze({
  shoulder: [0.195, 1.425, 0],
  elbow: [0.255, 1.12, -0.015],
  wrist: [0.285, 0.87, 0.02],
  hip: [0.09, 0.9, 0],
  knee: [0.1, 0.49, 0.015],
  ankle: [0.1, 0.085, -0.01],
});

/** Mirrors a left-side point to the right side. */
const mirror = ([x, y, z], side) => [x * side, y, z];

function BodyMaterial({ joint = false }) {
  return <meshStandardMaterial {...(joint ? JOINT_MATERIAL_PROPS : SKIN_MATERIAL_PROPS)} />;
}

/** Ellipsoid body part (unit sphere scaled to radii). */
function Ellipsoid({ position, radii, rotation }) {
  return (
    <mesh position={position} rotation={rotation} scale={radii} castShadow receiveShadow>
      <sphereGeometry args={[1, 40, 28]} />
      <BodyMaterial />
    </mesh>
  );
}

function Joint({ position, radius }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <sphereGeometry args={[radius, 20, 14]} />
      <BodyMaterial joint />
    </mesh>
  );
}

/** Tapered limb segment spanning two joint centers (CapsuleGeometry is uniform, so use a cone-cut cylinder). */
function Limb({ from, to, radiusFrom, radiusTo }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const direction = end.clone().sub(start);
    return {
      position: start.clone().add(end).multiplyScalar(0.5).toArray(),
      // CylinderGeometry runs along +Y with radiusTop at +Y; aim +Y from `to` towards `from`.
      quaternion: new Quaternion().setFromUnitVectors(UP, direction.clone().negate().normalize()),
      length: direction.length(),
    };
  }, [from, to]);

  return (
    <mesh position={position} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radiusFrom, radiusTo, length, 24]} />
      <BodyMaterial />
    </mesh>
  );
}

function Arm({ side }) {
  const shoulder = mirror(JOINTS.shoulder, side);
  const elbow = mirror(JOINTS.elbow, side);
  const wrist = mirror(JOINTS.wrist, side);
  const [wx, wy, wz] = wrist;
  return (
    <group>
      <Joint position={shoulder} radius={0.052} />
      <Limb from={shoulder} to={elbow} radiusFrom={0.046} radiusTo={0.036} />
      <Joint position={elbow} radius={0.037} />
      <Limb from={elbow} to={wrist} radiusFrom={0.035} radiusTo={0.026} />
      <Joint position={wrist} radius={0.027} />
      {/* Hand: flattened ellipsoid, palm facing the thigh. */}
      <Ellipsoid position={[wx + side * 0.006, wy - 0.085, wz + 0.005]} radii={[0.022, 0.085, 0.046]} />
    </group>
  );
}

function Leg({ side }) {
  const hip = mirror(JOINTS.hip, side);
  const knee = mirror(JOINTS.knee, side);
  const ankle = mirror(JOINTS.ankle, side);
  const [ax, , az] = ankle;
  return (
    <group>
      <Joint position={hip} radius={0.075} />
      <Limb from={hip} to={knee} radiusFrom={0.075} radiusTo={0.05} />
      <Joint position={knee} radius={0.052} />
      <Limb from={knee} to={ankle} radiusFrom={0.05} radiusTo={0.032} />
      <Joint position={ankle} radius={0.034} />
      {/* Foot: ~25 cm long, heel under the ankle, toes pointing +Z. */}
      <Ellipsoid position={[ax + side * 0.008, 0.035, az + 0.075]} radii={[0.043, 0.035, 0.13]} />
    </group>
  );
}

export function MannequinSubject() {
  return (
    <group name="mannequin-subject">
      {/* Head (center = SUBJECT_TARGET) */}
      <Ellipsoid position={[0, 1.62, 0]} radii={[0.078, 0.105, 0.095]} />
      {/* Nose — gives an obvious facing direction for judging light angles */}
      <mesh position={[0, 1.61, 0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.016, 0.04, 16]} />
        <BodyMaterial />
      </mesh>
      {/* Brow ridge */}
      <Ellipsoid position={[0, 1.645, 0.075]} radii={[0.06, 0.012, 0.025]} />
      {/* Ears */}
      {[-1, 1].map((side) => (
        <Ellipsoid key={side} position={[side * 0.078, 1.615, 0]} radii={[0.012, 0.028, 0.018]} />
      ))}

      {/* Neck */}
      <Limb from={[0, 1.555, -0.005]} to={[0, 1.44, 0]} radiusFrom={0.045} radiusTo={0.052} />

      {/* Torso: rib cage, shoulder yoke, abdomen, pelvis */}
      <Ellipsoid position={[0, 1.3, 0]} radii={[0.155, 0.185, 0.105]} />
      <Limb from={[-0.185, 1.425, 0]} to={[0.185, 1.425, 0]} radiusFrom={0.05} radiusTo={0.05} />
      <Ellipsoid position={[0, 1.08, 0.005]} radii={[0.13, 0.13, 0.09]} />
      <Ellipsoid position={[0, 0.94, 0]} radii={[0.165, 0.11, 0.1]} />

      {[-1, 1].map((side) => (
        <group key={side}>
          <Arm side={side} />
          <Leg side={side} />
        </group>
      ))}
    </group>
  );
}

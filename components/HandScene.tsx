import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, useTexture } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, CuboidCollider, CylinderCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { Landmark, SKELETON_CONNECTIONS } from '../types';

interface HandSceneProps {
  landmarksRef: React.MutableRefObject<Landmark[] | null>;
}

// Configuration
const VOXEL_SIZE = 0.02; // Slightly larger voxels for visual thickness
const MAX_INSTANCES = 1200;
const VOXEL_DENSITY = 1.5;

// Physics Configuration
const BONE_THICKNESS = 0.035; // Thicker bones for easier grabbing
const HAND_PHYSICAL_SIZE = 2.5; // The hand will always be this size in World Units
const DEPTH_SENSITIVITY = 8.0; // How much Z moves when you move hand closer

// --- UTILS FOR NORMALIZED COORDINATES ---

const getWorldPosition = (l: Landmark, wrist: Landmark, scaleFactor: number) => {
  // 1. Center everything relative to the wrist
  const relX = l.x - wrist.x;
  const relY = l.y - wrist.y;
  // Z in MediaPipe is relative to the wrist scaling roughly, but we need to normalize it too
  const relZ = l.z; // MediaPipe Z is already relative-ish

  // 2. Apply the normalization factor (undoes the camera perspective scaling)
  // 3. Multiply by our desired constant physical size
  const normX = relX * scaleFactor * HAND_PHYSICAL_SIZE;
  const normY = relY * scaleFactor * HAND_PHYSICAL_SIZE;
  const normZ = relZ * scaleFactor * HAND_PHYSICAL_SIZE;

  return new THREE.Vector3(-normX, -normY, -normZ);
};

// --- PHYSICS COMPONENTS ---

const Table = () => {
  return (
    <RigidBody type="fixed" position={[0, -2.5, 0]} restitution={0.2} friction={1}>
      <mesh receiveShadow>
        <boxGeometry args={[10, 0.5, 5]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.8} />
      </mesh>
    </RigidBody>
  );
};

const Sword = () => {
  // Stand on handle: Upright rotation [0, 0, 0]
  // Position: y = -1.0 puts the handle bottom roughly on the table (at -2.25)
  return (
    <RigidBody 
      position={[0, -0.5, 0]} 
      rotation={[0, 0, 0]}
      colliders={false} 
      friction={2.0} // High friction for gripping
      restitution={0.0} // No bounce
      density={2.0} // Heavier sword
      angularDamping={0.5} // Helps it stand up a bit steadier
      linearDamping={0.5}
    >
      {/* Handle - The part we grip (Bottom) */}
      <CylinderCollider args={[0.3, 0.045]} position={[0, -0.3, 0]} />
      <mesh position={[0, -0.3, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.6, 16]} />
        <meshStandardMaterial color="#333" roughness={0.9} />
      </mesh>

      {/* Crossguard */}
      <CuboidCollider args={[0.18, 0.04, 0.06]} position={[0, 0.05, 0]} />
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[0.36, 0.08, 0.12]} />
        <meshStandardMaterial color="#daa520" metalness={1} roughness={0.3} />
      </mesh>

      {/* Blade (Top) */}
      <CuboidCollider args={[0.07, 0.7, 0.02]} position={[0, 0.8, 0]} />
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.14, 1.4, 0.04]} />
        <meshStandardMaterial 
          color="#e0ffff" 
          emissive="#00ffff"
          emissiveIntensity={0.2}
          metalness={0.9} 
          roughness={0.1} 
        />
      </mesh>
    </RigidBody>
  );
};

// --- VISUAL HAND (VOXELS) ---

const VisualHand: React.FC<HandSceneProps> = ({ landmarksRef }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !landmarksRef.current) {
      if (meshRef.current) meshRef.current.count = 0;
      return;
    }

    const landmarks = landmarksRef.current;
    
    // --- NORMALIZE HAND SIZE ---
    // Calculate distance between Wrist(0) and Middle Finger MCP(9) to estimate camera distance
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const dx = wrist.x - middleMCP.x;
    const dy = wrist.y - middleMCP.y;
    const currentApparentSize = Math.sqrt(dx*dx + dy*dy);
    
    // Create a scaling factor to counteract perspective
    // If hand is close (size large), scaleFactor is small (shrink it back to normal)
    const REFERENCE_SIZE = 0.2; // approx size in screen coords when hand is "normal" distance
    const scaleFactor = REFERENCE_SIZE / Math.max(currentApparentSize, 0.01);

    // Calculate World Offset for the Wrist
    // Map screen X/Y (0-1) to World X/Y
    const worldWristX = -(wrist.x - 0.5) * 8; 
    const worldWristY = -(wrist.y - 0.5) * 5; 
    // Map apparent size to Z depth (Bigger = Closer)
    const worldWristZ = (currentApparentSize - 0.1) * DEPTH_SENSITIVITY;

    const wristPos = new THREE.Vector3(worldWristX, worldWristY, worldWristZ);

    const vectors = landmarks.map(l => {
      const local = getWorldPosition(l, wrist, scaleFactor);
      return local.add(wristPos);
    });

    let instanceIdx = 0;

    const placeVoxel = (x: number, y: number, z: number) => {
      if (instanceIdx >= MAX_INSTANCES) return;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(1.0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(instanceIdx++, dummy.matrix);
    };

    // 1. Fill Fingers
    SKELETON_CONNECTIONS.forEach(([start, end]) => {
      const vStart = vectors[start];
      const vEnd = vectors[end];
      const dist = vStart.distanceTo(vEnd);
      const steps = Math.ceil(dist / (VOXEL_SIZE / VOXEL_DENSITY));
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        placeVoxel(
          THREE.MathUtils.lerp(vStart.x, vEnd.x, t),
          THREE.MathUtils.lerp(vStart.y, vEnd.y, t),
          THREE.MathUtils.lerp(vStart.z, vEnd.z, t)
        );
      }
    });

    // 2. Fill Palm
    const fillTriangle = (p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => {
      const density = 6;
      for (let i = 0; i <= density; i++) {
        const t = i / density;
        const edge1 = new THREE.Vector3().lerpVectors(p1, p2, t);
        const edge2 = new THREE.Vector3().lerpVectors(p1, p3, t);
        const dist = edge1.distanceTo(edge2);
        const innerSteps = Math.ceil(dist / (VOXEL_SIZE / 1.5));
        
        for (let j = 0; j <= innerSteps; j++) {
           const k = j / (innerSteps || 1);
           placeVoxel(
             THREE.MathUtils.lerp(edge1.x, edge2.x, k),
             THREE.MathUtils.lerp(edge1.y, edge2.y, k),
             THREE.MathUtils.lerp(edge1.z, edge2.z, k)
           );
        }
      }
    };

    fillTriangle(vectors[0], vectors[5], vectors[17]);
    fillTriangle(vectors[5], vectors[9], vectors[17]);
    fillTriangle(vectors[9], vectors[13], vectors[17]);

    meshRef.current.count = instanceIdx;
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, MAX_INSTANCES]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
      <meshStandardMaterial 
        color="#00efff" 
        roughness={0.2}
        metalness={0.8}
        emissive="#0044aa"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  );
};

// --- PHYSICS HAND (INVISIBLE KINEMATIC COLLIDERS) ---

interface BoneColliderProps {
  startIdx: number;
  endIdx: number;
  landmarksRef: React.MutableRefObject<Landmark[] | null>;
}

const BoneCollider: React.FC<BoneColliderProps> = ({ startIdx, endIdx, landmarksRef }) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  
  useFrame(() => {
    if (!landmarksRef.current || !rigidBodyRef.current) return;
    
    const landmarks = landmarksRef.current;
    
    // --- REPEAT NORMALIZATION LOGIC FOR PHYSICS ---
    // (In a production app, we would calculate this once in parent and pass down vectors,
    // but for this structure we just recalc to keep it simple)
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const dx = wrist.x - middleMCP.x;
    const dy = wrist.y - middleMCP.y;
    const currentApparentSize = Math.sqrt(dx*dx + dy*dy);
    
    const REFERENCE_SIZE = 0.2; 
    const scaleFactor = REFERENCE_SIZE / Math.max(currentApparentSize, 0.01);

    const worldWristX = -(wrist.x - 0.5) * 8; 
    const worldWristY = -(wrist.y - 0.5) * 5; 
    const worldWristZ = (currentApparentSize - 0.1) * DEPTH_SENSITIVITY;
    const wristPos = new THREE.Vector3(worldWristX, worldWristY, worldWristZ);

    const vStartLocal = getWorldPosition(landmarks[startIdx], wrist, scaleFactor);
    const vEndLocal = getWorldPosition(landmarks[endIdx], wrist, scaleFactor);
    
    const vStart = vStartLocal.add(wristPos);
    const vEnd = vEndLocal.add(wristPos);
    
    // Calculate center point
    const center = new THREE.Vector3().lerpVectors(vStart, vEnd, 0.5);
    
    // Calculate rotation
    const direction = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
    // Rapier Capsule is Y-aligned by default
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

    // Move Kinematic Body
    rigidBodyRef.current.setNextKinematicTranslation(center);
    rigidBodyRef.current.setNextKinematicRotation(quaternion);
  });

  return (
    <RigidBody 
      ref={rigidBodyRef} 
      type="kinematicPosition" 
      colliders={false} 
      friction={2.0} // High friction is CRITICAL for grabbing
    >
      {/* 
        Increased radius (2nd arg) to BONE_THICKNESS for easier grabbing.
        Length (1st arg) is approximated, but since bones overlap at joints, it forms a good chain.
      */}
      <CapsuleCollider args={[0.04, BONE_THICKNESS]} /> 
    </RigidBody>
  );
}

const PhysicsHand: React.FC<HandSceneProps> = ({ landmarksRef }) => {
  const [ready, setReady] = useState(false);
  
  // Wait a frame to ensure physics world exists
  useFrame(() => {
    if (!ready) setReady(true);
  });

  if (!ready) return null;

  return (
    <>
      {SKELETON_CONNECTIONS.map(([start, end], i) => (
        <BoneCollider 
          key={`bone-phys-${i}`} 
          startIdx={start} 
          endIdx={end} 
          landmarksRef={landmarksRef} 
        />
      ))}
    </>
  );
};


// --- MAIN SCENE ---

export const SceneContainer: React.FC<HandSceneProps> = (props) => {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <pointLight position={[-10, -5, -5]} color="#ff0080" intensity={2} />
      
      <Physics gravity={[0, -9.81, 0]}>
        <Table />
        <Sword />
        <PhysicsHand {...props} />
        
        <VisualHand {...props} />
      </Physics>
      
      <Environment preset="night" />
    </>
  );
};
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { calculateVertexDisplacement } from '../../odsMath';

// Renders a vector arrow at a specific spatial coordinate
const DynamicVector: React.FC<{
  position: [number, number, number];
  color?: string;
}> = ({ position, color = '#10b981' }) => {
  const { animationRpm, points, globalGain, isPlaying } = useStore();
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (isPlaying) timeRef.current += delta;

    // Calculate displacement at this point using animationRpm
    const disp = calculateVertexDisplacement(
        position[0], position[1], position[2],
        timeRef.current, animationRpm, points, globalGain
    );

    // Position arrow at the deformed surface location
    groupRef.current.position.set(
        position[0] + disp.x,
        position[1] + disp.y,
        position[2] + disp.z
    );

    // Determine direction and magnitude of the vector
    const mag = disp.length();
    
    // Safety check
    if (mag < 0.001) {
        groupRef.current.visible = false;
        return;
    }
    groupRef.current.visible = true;

    // Orient arrow in the direction of instantaneous displacement
    const dir = disp.clone().normalize();
    
    // Scale arrow
    const visualScale = 4.0; // Make arrows big enough to see
    const arrowLen = mag * visualScale;
    
    // Standard ThreeJS ArrowHelper logic manual implementation for total control
    const shaft = groupRef.current.children[0];
    const head = groupRef.current.children[1];
    
    // Orientation quaternion
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    groupRef.current.setRotationFromQuaternion(quaternion);
    
    // Scale parts
    shaft.scale.set(1, arrowLen, 1);
    shaft.position.y = arrowLen / 2;
    
    head.position.y = arrowLen;
  });

  return (
    <group ref={groupRef}>
        <mesh>
            <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
        </mesh>
        <mesh>
            <coneGeometry args={[0.08, 0.2, 16]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
        </mesh>
    </group>
  );
};

export const VectorField: React.FC = () => {
    const { points } = useStore();
    // Render a vector for each sensor point
    return (
        <>
            {points.map(p => (
                <DynamicVector key={p.id} position={p.position} />
            ))}
        </>
    );
};
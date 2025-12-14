import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { calculateVertexDisplacement, SHAFT_LENGTH } from '../../odsMath';

export const Shaft: React.FC = () => {
  const { animationRpm, points, globalGain, isPlaying } = useStore();
  const tubeRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // High resolution curve
  const numPoints = 50;
  const basePoints = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= numPoints; i++) {
      arr.push(new THREE.Vector3(0, 0, (i / numPoints) * SHAFT_LENGTH));
    }
    return arr;
  }, []);

  const curve = useMemo(() => new THREE.CatmullRomCurve3(basePoints), [basePoints]);

  useFrame((state, delta) => {
    if (!tubeRef.current) return;
    if (isPlaying) timeRef.current += delta;
    
    const newPoints = [];
    for (let i = 0; i <= numPoints; i++) {
      const z = (i / numPoints) * SHAFT_LENGTH;
      
      // The shaft is at x=0, y=0, z=z initially
      // We ask the physics engine: "How much does the point at (0,0,z) move?"
      // Use animationRpm for visual movement
      const disp = calculateVertexDisplacement(0, 0, z, timeRef.current, animationRpm, points, globalGain);
      
      // Shaft deflection is often more pronounced than casing, but here we keep it consistent physics
      newPoints.push(new THREE.Vector3(disp.x, disp.y, z + disp.z));
    }
    
    curve.points = newPoints;
    // @ts-ignore
    tubeRef.current.geometry = new THREE.TubeGeometry(curve, 64, 0.12, 12, false); 
  });

  return (
    <mesh ref={tubeRef}>
      <tubeGeometry args={[curve, 64, 0.12, 12, false]} />
      <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.1} />
    </mesh>
  );
};
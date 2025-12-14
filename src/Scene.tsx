import React from 'react';
import { Grid } from '@react-three/drei';
import { MachineTrain } from './components/3d/MachineTrain';
import { VectorField } from './components/3d/Vectors';

// Pure Content Component for ODS
export const Scene: React.FC = () => {
  return (
    <group position={[0, 0, 0]}>
        <MachineTrain />
        <VectorField />

        {/* Helpers */}
        <Grid 
            position={[0, -1.19, 5]} 
            args={[20, 20]} 
            cellSize={1} 
            cellThickness={0.5} 
            cellColor="#444" 
            sectionSize={5} 
            sectionThickness={1} 
            sectionColor="#666" 
            fadeDistance={30} 
            fadeStrength={1} 
        />
        
        {/* Axes Helper: X (Red), Y (Green), Z (Blue) */}
        <axesHelper args={[2]} position={[-3, -1, 0]} />
    </group>
  );
};
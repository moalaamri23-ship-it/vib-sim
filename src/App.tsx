import React from 'react';
import { Scene } from './Scene';
import { Interface } from './components/ui/Interface';
import { useStore } from './store';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { OrbitScene } from './components/3d/OrbitScene';

function App() {
  const { appMode, selectPoint } = useStore();

  return (
    <div className="w-screen h-screen relative bg-black overflow-hidden select-none">
      {/* 3D Viewport Switching */}
      <div className="w-full h-full bg-neutral-950">
          <Canvas 
            shadows 
            dpr={[1, 2]}
            onPointerMissed={(e) => {
               if (e.type === 'click') {
                   selectPoint(null);
               }
            }}
          >
            <PerspectiveCamera makeDefault position={appMode === 'ODS' ? [8, 4, 12] : [0, 0, 8]} fov={45} />
            <OrbitControls 
                target={[0, 0, appMode === 'ODS' ? 5 : 0]} 
                minDistance={4} 
                maxDistance={30}
                enablePan={true}
                enableZoom={true}
            />
            
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 5]} intensity={1} castShadow />
            <spotLight position={[-10, 10, 5]} angle={0.3} penumbra={1} intensity={1} castShadow />
            
            <Environment preset="city" />

            {appMode === 'ODS' ? (
                // ODS SCENE
                <Scene />
            ) : (
                // ORBIT SCENE
                <OrbitScene />
            )}

          </Canvas>
      </div>
      
      {/* UI Overlay */}
      <Interface />
    </div>
  );
}

export default App;
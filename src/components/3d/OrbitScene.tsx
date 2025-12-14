import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';

// --- MATERIALS ---

// Housing: White, matte, slightly transparent to show depth but look solid
const housingMat = new THREE.MeshStandardMaterial({
    color: "#f8fafc", // White/Slate-50
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85, 
    side: THREE.DoubleSide
});

// Shaft: Dark Grey, metallic, solid
const shaftMat = new THREE.MeshStandardMaterial({
    color: "#475569", // Slate-600
    roughness: 0.4,
    metalness: 0.5,
});

// Keyway/Tape on shaft for rotation visibility
const tapeMat = new THREE.MeshBasicMaterial({ color: "#cbd5e1" });
const markMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });

// Probe Body: Dark industrial plastic/metal
const probeMat = new THREE.MeshStandardMaterial({ color: "#1e293b" }); // Slate-800
const kpMat = new THREE.MeshStandardMaterial({ color: "#0f172a" }); // Slate-900

// Brass nut for contrast
const nutMat = new THREE.MeshStandardMaterial({ color: "#d97706" }); // Amber-600

// --- GEOMETRY HELPERS ---

// Create the Housing Shape (Circle with hole + Base)
const createHousingGeometry = () => {
    const shape = new THREE.Shape();
    
    // Outer dimensions
    const outerRadius = 2.8;
    
    // Let's just draw the path
    shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
    
    // 2. Define the Hole (Bore)
    const holePath = new THREE.Path();
    const innerRadius = 2.2; // Bore Radius
    holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true); // Clockwise (hole)
    shape.holes.push(holePath);

    const extrudeSettings = { 
        depth: 2.5, // Housing Thickness
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.1,
        bevelSegments: 2,
        curveSegments: 64 
    };
    
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
};

// --- ORBIT TRAIL COMPONENT ---
// Draws a live history trail of the shaft center
const LiveOrbitTrail: React.FC<{ shaftAngleRef: React.MutableRefObject<number> }> = ({ shaftAngleRef }) => {
    const { orbitPoints, globalGain, isOrbitSimulationVisible, animationRpm, isPlaying } = useStore();
    // Store points as { vec: Vector3, t: number }
    const [history, setHistory] = useState<{ vec: THREE.Vector3, t: number }[]>([]);
    
    const probeX = orbitPoints.find(p => p.id === 'probe-x')?.horizontal;
    const probeY = orbitPoints.find(p => p.id === 'probe-y')?.horizontal;
    
    // Use local time accumulator for fading history independently of angle
    const timeRef = useRef(0);

    useFrame((state, delta) => {
        if (!probeX || !probeY || !isOrbitSimulationVisible) return;
        
        if (isPlaying) timeRef.current += delta;
        
        // Use Actual Shaft Angle (negative CW) for vibration physics to match visual rotation
        const theta = shaftAngleRef.current; 
        // We invert the angle for the Sine calculation because Math.sin(-x) = -Math.sin(x), 
        // but traditionally Vibration analysis equations assume +omega*t.
        // The visual rotation is -omega*t.
        // To match the 2D dashboard which effectively calculates -omega*t (CW), we use the raw angle.
        
        const calcDisp = (comp: any) => {
            // Signal = A * sin(theta + phase)
            // Note: Since theta is negative (CW), sin(theta) generates the wave.
            let val = comp.amplitude * Math.sin(theta + (comp.phase * Math.PI / 180));
            if (comp.harmonics) {
                comp.harmonics.forEach((h: any) => {
                    val += (comp.amplitude * h.amplitudeRatio) * Math.sin(theta * h.order + ((comp.phase + h.phaseShift) * Math.PI / 180));
                });
            }
            if (comp.noise) {
                const noiseFreq = 25.0; // Non-synchronous
                val += comp.noise * 0.5 * Math.sin(timeRef.current * noiseFreq * (animationRpm/60)); 
            }
            return val;
        };

        const SCALAR = 0.005 * (globalGain / 10);
        const dx = calcDisp(probeX) * SCALAR;
        const dy = calcDisp(probeY) * SCALAR;
        const currentPos = new THREE.Vector3(dx, dy, 2.2);

        // TRAIL BUFFER LOGIC
        const cyclesToKeep = 3;
        const durationToKeep = cyclesToKeep * (60 / (Math.max(animationRpm, 1))); 

        setHistory(prev => {
            const next = [...prev, { vec: currentPos, t: timeRef.current }];
            const cutoff = timeRef.current - durationToKeep;
            const valid = next.filter(p => p.t >= cutoff);
            if (valid.length > 2000) return valid.slice(valid.length - 2000);
            return valid;
        });
    });

    if (!isOrbitSimulationVisible) {
        if (history.length > 0) setHistory([]);
        return null;
    }

    const points = history.map(h => h.vec);
    if (points.length < 2) return null;

    return (
        <Line 
            points={points} 
            color="#22d3ee" 
            lineWidth={3} 
            dashed={false}
        />
    );
};

const SimpleProbe: React.FC<{ id: string, angle: number, label: string, isKP?: boolean }> = ({ id, angle, label, isKP }) => {
    const { selectPoint, selectedPointId } = useStore();
    const isSelected = selectedPointId === id;
    
    const distanceFromCenter = 2.5; 
    const x = distanceFromCenter * Math.cos(angle);
    const y = distanceFromCenter * Math.sin(angle);
    const z = 0; 
    
    return (
        <group position={[x, y, z]} rotation={[0, 0, angle - Math.PI / 2]}>
             <group 
                onClick={(e) => { e.stopPropagation(); selectPoint(id); }}
                onPointerOver={() => document.body.style.cursor = 'pointer'}
                onPointerOut={() => document.body.style.cursor = 'auto'}
            >
                {/* 1. Probe Body */}
                <mesh position={[0, 0.4, 0]}>
                    <cylinderGeometry args={[0.15, 0.15, 1.2, 16]} />
                    <primitive object={isKP ? kpMat : probeMat} />
                </mesh>

                {/* 2. Locking Nut */}
                <mesh position={[0, 0.1, 0]}>
                    <cylinderGeometry args={[0.25, 0.25, 0.15, 6]} />
                    <primitive object={nutMat} />
                </mesh>

                {/* 3. Sensor Tip */}
                <mesh position={[0, -0.4, 0]}>
                    <cylinderGeometry args={[0.08, 0.08, 0.4, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>

                {/* 4. Cable Exit */}
                <mesh position={[0, 1.0, 0]}>
                    <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
                    <meshStandardMaterial color="#000" />
                </mesh>

                {/* Label */}
                <Html position={[0, 1.4, 0]} center zIndexRange={[100, 0]}>
                    <div 
                        className={`text-[10px] px-2 py-1 rounded border font-sans font-medium whitespace-nowrap select-none transition-all
                        ${isSelected 
                            ? 'bg-blue-600 text-white border-white shadow-lg scale-105' 
                            : 'bg-slate-800/90 text-slate-200 border-slate-600'}`}
                    >
                        {label}
                    </div>
                </Html>
            </group>
        </group>
    );
};

export const OrbitScene: React.FC = () => {
    const { orbitPoints, animationRpm, globalGain, isPlaying, wireframe, simulationTime, shaftAngle } = useStore();
    const shaftRef = useRef<THREE.Group>(null);
    const timeRef = useRef(0);
    // Local Ref for angle to pass to trail without re-rendering component
    const angleRef = useRef(0);

    const housingGeo = useMemo(() => createHousingGeometry(), []);

    const probeX = orbitPoints.find(p => p.id === 'probe-x')?.horizontal;
    const probeY = orbitPoints.find(p => p.id === 'probe-y')?.horizontal;
    
    useFrame((state, delta) => {
        if (!shaftRef.current || !probeX || !probeY) return;
        
        // FREEZE LOGIC
        if (isPlaying) {
            timeRef.current += delta;
            simulationTime.current = timeRef.current;
            
            // ROTATION LOGIC: Accumulate rotation
            const rotStep = delta * (animationRpm / 60) * Math.PI * 2;
            shaftRef.current.rotation.z -= rotStep;
            
            // SYNC STORE ANGLE
            angleRef.current = shaftRef.current.rotation.z;
            shaftAngle.current = angleRef.current;
        }

        // Physics Logic using ANGLE instead of Time to ensure sync with rotation
        const theta = angleRef.current;

        const calcDisp = (comp: any) => {
            let val = comp.amplitude * Math.sin(theta + (comp.phase * Math.PI / 180));
            if (comp.harmonics) {
                comp.harmonics.forEach((h: any) => {
                    val += (comp.amplitude * h.amplitudeRatio) * Math.sin(theta * h.order + ((comp.phase + h.phaseShift) * Math.PI / 180));
                });
            }
             if (comp.noise) {
                 const noiseFreq = 25.0; // Approx
                 val += comp.noise * 0.5 * Math.sin(timeRef.current * noiseFreq);
            }
            return val;
        };

        const SCALAR = 0.005 * (globalGain / 10); 
        const dx = calcDisp(probeX) * SCALAR;
        const dy = calcDisp(probeY) * SCALAR;

        shaftRef.current.position.x = dx;
        shaftRef.current.position.y = dy;
    });

    return (
        <group>
             {/* Lighting */}
             <ambientLight intensity={0.7} />
             <directionalLight position={[5, 5, 10]} intensity={1.2} />
             <directionalLight position={[-5, 5, -5]} intensity={0.5} />

            {/* --- HOUSING (STATIC) --- */}
            <group position={[0, 0, -1.25]} visible={!wireframe}> 
                <mesh geometry={housingGeo} material={housingMat} />
                <mesh position={[0, -3.2, 1.25]}>
                    <boxGeometry args={[6, 1.5, 2.5]} />
                    <primitive object={housingMat} />
                </mesh>
            </group>

            {/* --- SHAFT (MOVING) --- */}
            <group ref={shaftRef}>
                <mesh rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[1.5, 1.5, 4.0, 64]} />
                    <primitive object={shaftMat} />
                </mesh>
                
                {/* Visual Keyway / Tape - At Angle 0 initially */}
                <mesh position={[1.51, 0, 0]} rotation={[0, 0, 0]}>
                    <boxGeometry args={[0.02, 0.4, 3.8]} />
                    <primitive object={tapeMat} />
                </mesh>

                 {/* Shaft Face X-Mark */}
                 <group position={[0, 0, 2.01]}>
                     <mesh>
                         <boxGeometry args={[0.04, 0.2, 0.01]} />
                         <primitive object={markMat} />
                     </mesh>
                     <mesh rotation={[0, 0, Math.PI/2]}>
                         <boxGeometry args={[0.04, 0.2, 0.01]} />
                         <primitive object={markMat} />
                     </mesh>
                 </group>
            </group>

            {/* --- LIVE ORBIT TRAIL --- */}
            <LiveOrbitTrail shaftAngleRef={angleRef} />

            {/* --- SENSORS (STATIC) --- */}
            <SimpleProbe id="keyphasor" angle={Math.PI/2} label="Keyphasor" isKP />
            <SimpleProbe id="probe-y" angle={(3 * Math.PI)/4} label="Probe Y" />
            <SimpleProbe id="probe-x" angle={Math.PI/4} label="Probe X" />

            {/* Reference Grid */}
            <gridHelper position={[0, -4, 0]} args={[20, 20, 0x333333, 0x111111]} />
        </group>
    );
};
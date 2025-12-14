import { create } from 'zustand';
import { ODSMode, OrbitFault, AppMode, SimulationState, MeasurementPoint } from './types';
import { MOTOR_CENTER, PUMP_CENTER, SHAFT_LENGTH } from './odsMath';

// --- ODS INITIALIZATION ---
const createPoint = (id: string, label: string, x: number, y: number, z: number, isRef = false): MeasurementPoint => ({
    id, label, position: [x, y, z],
    horizontal: { amplitude: 0.2, phase: 0, harmonics: [], noise: 0 },
    vertical: { amplitude: 0.1, phase: 0, harmonics: [], noise: 0 },
    axial: { amplitude: 0.1, phase: 0, harmonics: [], noise: 0 },
    isReference: isRef
});

const INITIAL_ODS_POINTS: MeasurementPoint[] = [
  createPoint('m-foot-de-l', 'Motor Foot DE-L', 0.6, 0.2, 0.8),
  createPoint('m-foot-de-r', 'Motor Foot DE-R', -0.6, 0.2, 0.8),
  createPoint('m-foot-nde-l', 'Motor Foot NDE-L', 0.6, 0.2, -0.8),
  createPoint('m-foot-nde-r', 'Motor Foot NDE-R', -0.6, 0.2, -0.8),
  createPoint('m-nde', 'Motor NDE Brg', 0, 1.4, -0.8),
  createPoint('m-de', 'Motor DE Brg', 0, 1.4, 1.0, true), 
  createPoint('p-de', 'Pump Inboard Brg', 0, 1.35, 5.5),
  createPoint('p-nde', 'Pump Outboard Brg', 0, 1.35, 6.5),
];

// --- ORBIT INITIALIZATION ---
// Probes are usually X and Y. We store them in a similar MeasurementPoint structure.
// Position is purely for 3D visualization placement.
const INITIAL_ORBIT_POINTS: MeasurementPoint[] = [
    // Probe X (Typically 45 degrees Right)
    createPoint('probe-x', 'Probe X', 1.0, 1.0, 0), 
    // Probe Y (Typically 45 degrees Left / 135 total)
    createPoint('probe-y', 'Probe Y', -1.0, 1.0, 0),
    // Keyphasor (Top or Side)
    createPoint('keyphasor', 'Keyphasor', 0, 1.5, -0.5, true), 
];

// Helper to calculate Soft Foot harmonics (ODS)
const updateSoftFootPoints = (points: MeasurementPoint[], machineRpm: number, lineFreq: number): MeasurementPoint[] => {
    const safeRpm = machineRpm || 1; 
    const lfOrder = (2 * lineFreq * 60) / safeRpm;
    
    return points.map(p => {
        if (p.id === 'm-foot-de-r') {
            return { 
                ...p, 
                vertical: { 
                    ...p.vertical,
                    amplitude: 6.0, 
                    harmonics: [{ order: lfOrder, amplitudeRatio: 1.2, phaseShift: 180 }], 
                }
            };
        }
        return p;
    });
};

export const useStore = create<SimulationState>((set, get) => ({
  appMode: 'ODS',
  animationRpm: 110,
  machineRpm: 1480,
  globalGain: 10.0, 
  lineFreq: 50,
  isPlaying: true,
  wireframe: false,
  isAnalysisMode: false,
  isSettingsOpen: false,
  isUploadModalOpen: false,
  isOrbitPlotOpen: false,
  isOrbitSimulationVisible: false,
  currentMode: ODSMode.Manual,
  currentOrbitFault: OrbitFault.Manual,
  simulationTime: { current: 0 },
  shaftAngle: { current: 0 },
  
  points: INITIAL_ODS_POINTS,
  orbitPoints: INITIAL_ORBIT_POINTS,
  
  selectedPointId: null,

  setAppMode: (mode) => set({ appMode: mode, selectedPointId: null, isOrbitPlotOpen: false, isAnalysisMode: false }),
  setAnimationRpm: (animationRpm) => set({ animationRpm }),
  
  setMachineRpm: (machineRpm) => {
      const state = get();
      if (state.appMode === 'ODS' && state.currentMode === ODSMode.SoftFoot) {
           const newPoints = updateSoftFootPoints(state.points, machineRpm, state.lineFreq);
           set({ machineRpm, points: newPoints });
      } else {
           set({ machineRpm });
      }
  },

  setLineFreq: (lineFreq) => {
      const state = get();
      if (state.appMode === 'ODS' && state.currentMode === ODSMode.SoftFoot) {
           const newPoints = updateSoftFootPoints(state.points, state.machineRpm, lineFreq);
           set({ lineFreq, points: newPoints });
      } else {
           set({ lineFreq });
      }
  },

  setGlobalGain: (globalGain) => set({ globalGain }),
  
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  toggleWireframe: () => set((state) => ({ wireframe: !state.wireframe })),
  toggleAnalysisMode: () => set((state) => ({ isAnalysisMode: !state.isAnalysisMode })),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleUploadModal: () => set((state) => ({ isUploadModalOpen: !state.isUploadModalOpen })),
  toggleOrbitPlot: () => set((state) => ({ isOrbitPlotOpen: !state.isOrbitPlotOpen })),
  toggleOrbitSimulation: () => set((state) => ({ isOrbitSimulationVisible: !state.isOrbitSimulationVisible })),
  
  selectPoint: (id) => set({ selectedPointId: id }),
  
  updatePoint: (id, updates) => set((state) => {
    // Determine which list to update based on AppMode or ID check
    // Since IDs are unique ('probe-x' vs 'm-de'), we can check ID presence or just map both arrays safely
    const isOrbitPoint = state.orbitPoints.some(p => p.id === id);
    
    if (isOrbitPoint) {
        return {
            orbitPoints: state.orbitPoints.map(p => p.id === id ? { ...p, ...updates } : p)
        };
    } else {
        return {
            points: state.points.map(p => p.id === id ? { ...p, ...updates } : p)
        };
    }
  }),

  setAllPoints: (newPoints) => set({ points: newPoints }),

  setReferencePoint: (id) => set((state) => ({
    points: state.points.map(p => ({ ...p, isReference: p.id === id })),
    orbitPoints: state.orbitPoints.map(p => ({ ...p, isReference: p.id === id }))
  })),

  resetToMode: (mode) => {
    set((state) => {
        // --- ORBIT MODE LOGIC ---
        if (Object.values(OrbitFault).includes(mode as OrbitFault)) {
            // Reset Orbit Points (Units: Microns/Mils -> we use generic units here, say 50 = 50 microns)
            const baseAmp = 10;
            let newOrbitPoints = state.orbitPoints.map(p => {
                if(p.id === 'keyphasor') return p; // Keep KP as is
                return {
                    ...p,
                    // Use 'horizontal' property for the Probe's radial measurement
                    horizontal: { amplitude: baseAmp, phase: 0, harmonics: [], noise: 0 },
                    // Vertical property unused for single axis probe, but kept for type safety
                    vertical: { amplitude: 0, phase: 0, harmonics: [], noise: 0 },
                    axial: { amplitude: 0, phase: 0, harmonics: [], noise: 0 }
                };
            });

            const updateProbe = (id: string, amp: number, phase: number, harmonics: any[] = [], noise = 0) => {
                newOrbitPoints = newOrbitPoints.map(p => p.id === id ? {
                    ...p,
                    horizontal: { ...p.horizontal, amplitude: amp, phase, harmonics, noise }
                } : p);
            };

            switch (mode) {
                case OrbitFault.Unbalance:
                    // Circle/Ellipse: X and Y 90 deg apart
                    updateProbe('probe-x', 40, 0);
                    updateProbe('probe-y', 40, 90);
                    break;
                case OrbitFault.Misalignment:
                    // Banana / Preload: 1X + 2X
                    const misHarm = [{ order: 2, amplitudeRatio: 0.4, phaseShift: 45 }];
                    updateProbe('probe-x', 35, 0, misHarm);
                    updateProbe('probe-y', 20, 120, misHarm); // Distorted phase relationship
                    break;
                case OrbitFault.ShaftCrack:
                    // 1X + Strong 2X causing internal loop
                    const crackHarm = [{ order: 2, amplitudeRatio: 0.5, phaseShift: 180 }];
                    updateProbe('probe-x', 35, 0, crackHarm);
                    updateProbe('probe-y', 35, 90, crackHarm);
                    break;
                case OrbitFault.RotorBow:
                    // Heavy 1X, very clean, large amplitude
                    updateProbe('probe-x', 60, 0);
                    updateProbe('probe-y', 60, 90);
                    break;
                case OrbitFault.OilWhirl:
                    // Sub-synchronous at ~0.45X
                    const whirl = [{ order: 0.45, amplitudeRatio: 0.8, phaseShift: 90 }];
                    updateProbe('probe-x', 30, 0, whirl);
                    updateProbe('probe-y', 30, 90, whirl);
                    break;
                case OrbitFault.OilWhip:
                    // Locked subsync, chaotic but strong
                    const whip = [{ order: 0.48, amplitudeRatio: 1.5, phaseShift: 80 }];
                    updateProbe('probe-x', 50, 0, whip);
                    updateProbe('probe-y', 50, 90, whip);
                    break;
                case OrbitFault.Preload:
                    // Flattened Orbit (Ellipse with high aspect ratio)
                    updateProbe('probe-x', 45, 0);
                    updateProbe('probe-y', 10, 90); // Constrained Y
                    break;
                case OrbitFault.Rub:
                    // Truncated / Bounce -> High harmonics + Noise
                    const rubHarm = [
                        { order: 0.5, amplitudeRatio: 0.3, phaseShift: 0 },
                        { order: 2.0, amplitudeRatio: 0.3, phaseShift: 180 },
                        { order: 3.0, amplitudeRatio: 0.2, phaseShift: 0 }
                    ];
                    updateProbe('probe-x', 30, 0, rubHarm, 10);
                    updateProbe('probe-y', 30, 90, rubHarm, 10);
                    break;
                case OrbitFault.Looseness:
                     // 1X, 2X, 3X...
                     const looseHarm = [
                         { order: 2, amplitudeRatio: 0.5, phaseShift: 0 },
                         { order: 3, amplitudeRatio: 0.3, phaseShift: 0 },
                         { order: 4, amplitudeRatio: 0.2, phaseShift: 0 },
                     ];
                     updateProbe('probe-x', 25, 0, looseHarm);
                     updateProbe('probe-y', 30, 90, looseHarm);
                     break;
                case OrbitFault.Resonance:
                    // High Amplitude 1X, Phase shift (~180 from neutral)
                    updateProbe('probe-x', 80, 180); 
                    updateProbe('probe-y', 80, 270);
                    break;
            }
            return { orbitPoints: newOrbitPoints, currentOrbitFault: mode as OrbitFault };
        } 
        
        // --- ODS MODE LOGIC (Existing) ---
        else {
              // ... (Preserve ODS Logic)
              let newPoints = state.points.map(p => ({
                  ...p,
                  horizontal: { amplitude: 0.3, phase: 0, harmonics: [], noise: 0 },
                  vertical: { amplitude: 0.2, phase: 0, harmonics: [], noise: 0 },
                  axial: { amplitude: 0.1, phase: 0, harmonics: [], noise: 0 }
              }));
              
              const setAll = (fn: (p: MeasurementPoint) => MeasurementPoint) => {
                  newPoints = newPoints.map(fn);
              }

              const odsMode = mode as ODSMode;

               switch(odsMode) {
                case ODSMode.UnbalanceStatic:
                    setAll(p => (p.id.includes('m-') && !p.id.includes('foot')) ? { ...p, horizontal: { ...p.horizontal, amplitude: 8.0, phase: 90 }, vertical: { ...p.vertical, amplitude: 7.5, phase: 0 } } : p); break;
                case ODSMode.UnbalanceCouple:
                    setAll(p => (p.id.includes('m-') && !p.id.includes('foot')) ? { ...p, horizontal: { ...p.horizontal, amplitude: 8.0, phase: 90 + (p.id.includes('nde')?180:0) }, vertical: { ...p.vertical, amplitude: 7.5, phase: 0 + (p.id.includes('nde')?180:0) } } : p); break;
                case ODSMode.UnbalanceDynamic:
                    setAll(p => { if (p.id === 'm-de') return { ...p, horizontal: { ...p.horizontal, amplitude: 8, phase: 30 }, vertical: { ...p.vertical, amplitude: 7, phase: -60 } }; if (p.id === 'm-nde') return { ...p, horizontal: { ...p.horizontal, amplitude: 6, phase: 150 }, vertical: { ...p.vertical, amplitude: 5, phase: 60 } }; return p; }); break;
                case ODSMode.UnbalanceOverhung:
                    setAll(p => { if (p.id === 'p-de') return { ...p, horizontal: { ...p.horizontal, amplitude: 8, phase: 90 }, vertical: { ...p.vertical, amplitude: 8, phase: 0 }, axial: { ...p.axial, amplitude: 7, phase: 0 } }; if (p.id === 'p-nde') return { ...p, axial: { ...p.axial, amplitude: 7, phase: 180 } }; return p; }); break;
                case ODSMode.AngularMisalignment:
                    setAll(p => (p.id === 'm-de' || p.id === 'p-de') ? { ...p, axial: { amplitude: 9.0, phase: p.id === 'p-de' ? 180 : 0, harmonics: [{ order: 2, amplitudeRatio: 0.5, phaseShift: 0 }], noise: 0 } } : p); break;
                case ODSMode.ParallelMisalignment:
                    setAll(p => { const h = [{ order: 2, amplitudeRatio: 1.5, phaseShift: 0 }]; if (p.id === 'm-de') return { ...p, vertical: { amplitude: 4, phase: 0, harmonics: h }, horizontal: { amplitude: 3, phase: 90, harmonics: h } }; if (p.id === 'p-de') return { ...p, vertical: { amplitude: 4, phase: 180, harmonics: h }, horizontal: { amplitude: 3, phase: 270, harmonics: h } }; return p; }); break;
                case ODSMode.MisalignmentCombo:
                    setAll(p => (p.id === 'm-de' || p.id === 'p-de') ? { ...p, vertical: { amplitude: 5, phase: 0, harmonics: [{ order: 2, amplitudeRatio: 1.0, phaseShift: 0 }] }, axial: { amplitude: 5, phase: 0, harmonics: [{ order: 2, amplitudeRatio: 1.0, phaseShift: 0 }] } } : p); break;
                case ODSMode.BentShaft:
                    setAll(p => (p.id === 'm-de' || p.id === 'm-nde') ? { ...p, axial: { ...p.axial, amplitude: 8.0, phase: p.id === 'm-nde' ? 180 : 0 }, vertical: { ...p.vertical, amplitude: 3.0, phase: 0 } } : p); break;
                case ODSMode.EccentricRotor:
                    setAll(p => p.id === 'm-de' ? { ...p, vertical: { amplitude: 8.0, phase: 0, harmonics: [{ order: 2, amplitudeRatio: 0.4, phaseShift: 0 }] } } : p); break;
                case ODSMode.LoosenessStructural:
                    setAll(p => p.id.includes('foot-de') ? { ...p, vertical: { amplitude: 10.0, phase: 0, harmonics: [{ order: 2, amplitudeRatio: 0.5, phaseShift: 0 }, { order: 3, amplitudeRatio: 0.3, phaseShift: 0 }] } } : p); break;
                case ODSMode.LoosenessRocking:
                    setAll(p => p.id === 'm-de' ? { ...p, horizontal: { amplitude: 8.0, phase: 0, harmonics: [{ order: 2, amplitudeRatio: 0.6, phaseShift: 180 }] }, vertical: { amplitude: 2.0, phase: 90 } } : p); break;
                case ODSMode.LoosenessBearing:
                    setAll(p => p.id === 'p-de' ? { ...p, vertical: { amplitude: 6.0, phase: 0, harmonics: [{ order: 0.5, amplitudeRatio: 0.4, phaseShift: 0 }, { order: 1.5, amplitudeRatio: 0.3, phaseShift: 0 }, { order: 2.0, amplitudeRatio: 0.5, phaseShift: 0 }, { order: 3.0, amplitudeRatio: 0.4, phaseShift: 0 }] } } : p); break;
                case ODSMode.SoftFoot:
                    newPoints = updateSoftFootPoints(newPoints, state.machineRpm, state.lineFreq); break;
                case ODSMode.BearingWear:
                    setAll(p => p.id === 'p-de' ? { ...p, vertical: { amplitude: 1.0, phase: 0, noise: 5.0 }, horizontal: { amplitude: 1.0, phase: 0, noise: 5.0 } } : p); break;
                case ODSMode.GearMesh:
                    setAll(p => p.id === 'p-de' ? { ...p, vertical: { amplitude: 0.5, phase: 0, harmonics: [{ order: 12.0, amplitudeRatio: 8.0, phaseShift: 0 }] } } : p); break;
                case ODSMode.ResonanceVert:
                    setAll(p => { const z = p.position[2]; const amp = Math.abs(Math.sin(z / 2)) * 10.0; return { ...p, vertical: { amplitude: amp, phase: 90, harmonics: [], noise: 0 } }; }); break;
              }
              
              return { points: newPoints, currentMode: odsMode };
        }
    });
  }
}));
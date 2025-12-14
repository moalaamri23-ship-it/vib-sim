import React from 'react';

export type AppMode = 'ODS' | 'ORBIT';

export enum ODSMode {
  Manual = 'Manual Analysis',
  
  // Unbalance
  UnbalanceStatic = 'Static Unbalance (Force)',
  UnbalanceCouple = 'Couple Unbalance',
  UnbalanceDynamic = 'Dynamic Unbalance (Most Common)',
  UnbalanceOverhung = 'Overhung Rotor Unbalance',

  // Misalignment
  AngularMisalignment = 'Angular Misalignment',
  ParallelMisalignment = 'Parallel Misalignment',
  MisalignmentCombo = 'Combined Misalignment',

  // Eccentricity / Shaft
  BentShaft = 'Bent Shaft',
  EccentricRotor = 'Eccentric Rotor (Var. Air Gap)',

  // Mechanical Looseness
  LoosenessStructural = 'Structural Looseness (Type A)',
  LoosenessRocking = 'Rocking Looseness (Type B)',
  LoosenessBearing = 'Loose Bearing Fit (Type C)',
  SoftFoot = 'Soft Foot (Distortion)',

  // Bearings & Gears
  BearingWear = 'Bearing Wear (Late Stage)',
  GearMesh = 'Gear Mesh Issue (High Freq)',
  
  // Resonance
  ResonanceVert = 'Vertical Resonance',
}

export enum OrbitFault {
    Manual = 'Manual Config',
    // 1X / 2X Phenomena
    Unbalance = 'Unbalance (1X Circle)',
    Misalignment = 'Misalignment (Banana/Ellipse)',
    ShaftCrack = 'Shaft Crack (1X + 2X Loop)',
    RotorBow = 'Rotor Bow (High 1X)',
    
    // Fluid Film
    OilWhirl = 'Oil Whirl (0.4X - 0.48X)',
    OilWhip = 'Oil Whip (Locked Sub-sync)',
    Preload = 'Radial Preload (Flattened)',
    
    // Impact / Transient
    Rub = 'Rub (Truncated/Bouncing)',
    Looseness = 'Mechanical Looseness',
    Resonance = 'Resonance (Phase Shift)',
}

export interface Harmonic {
    order: number;      // Multiplier of RPM (e.g., 2.0 for 2X)
    amplitudeRatio: number; // Ratio relative to fundamental (0.0 - 1.0)
    phaseShift: number; // Degrees shift relative to fundamental
}

export interface VibrationComponent {
    amplitude: number; // Fundamental (1X) mm/s or microns
    phase: number;     // Fundamental Phase Degrees
    
    // Advanced Analysis Properties
    harmonics?: Harmonic[]; 
    noise?: number; // Amplitude of high-frequency non-synchronous noise
}

export interface MeasurementPoint {
  id: string;
  label: string;
  position: [number, number, number]; // Static rest position
  
  // 3-Axis Components (For Orbit: Horizontal=X Probe, Vertical=Y Probe)
  horizontal: VibrationComponent;
  vertical: VibrationComponent;
  axial: VibrationComponent;
  
  isReference?: boolean; // Is this the phase reference location
}

export interface SimulationState {
  appMode: AppMode;
  animationRpm: number; // Visual speed (e.g., 20, 110, 350)
  machineRpm: number;   // Physics calculation speed (e.g., 1480, 2980)
  
  globalGain: number; // Master scalar for visualization
  isPlaying: boolean;
  wireframe: boolean;
  isAnalysisMode: boolean; 
  currentMode: ODSMode; 
  currentOrbitFault: OrbitFault;
  
  simulationTime: { current: number }; // Shared physics clock
  shaftAngle: { current: number }; // Shared shaft angle (radians, accumulated) for perfect angular sync

  // Settings
  lineFreq: number; // Hz (Default 50 or 60)
  isSettingsOpen: boolean;
  isUploadModalOpen: boolean;
  isOrbitPlotOpen: boolean; // New window state
  isOrbitSimulationVisible: boolean; // 3D Orbit Trail state

  // ODS Points
  points: MeasurementPoint[];
  
  // Orbit Mode Points (Probe X, Probe Y, Keyphasor)
  orbitPoints: MeasurementPoint[];
  
  selectedPointId: string | null;

  // Actions
  setAppMode: (mode: AppMode) => void;
  setAnimationRpm: (rpm: number) => void;
  setMachineRpm: (rpm: number) => void;
  setLineFreq: (freq: number) => void;
  setGlobalGain: (gain: number) => void;
  togglePlay: () => void;
  toggleWireframe: () => void;
  toggleAnalysisMode: () => void; 
  toggleSettings: () => void;
  toggleUploadModal: () => void;
  toggleOrbitPlot: () => void;
  toggleOrbitSimulation: () => void;

  selectPoint: (id: string | null) => void;
  updatePoint: (id: string, updates: Partial<MeasurementPoint>) => void;
  setReferencePoint: (id: string) => void;
  resetToMode: (mode: ODSMode | OrbitFault) => void;
  
  // Bulk update
  setAllPoints: (points: MeasurementPoint[]) => void;
}

// Fix for React Three Fiber JSX elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
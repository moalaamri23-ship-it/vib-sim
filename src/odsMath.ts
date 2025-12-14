import * as THREE from 'three';
import { MeasurementPoint, VibrationComponent } from './types';

// Constants for machine geometry
export const SHAFT_LENGTH = 10;
export const MOTOR_CENTER = 1.5;
export const PUMP_CENTER = 8.5;

/**
 * Calculates the instantaneous displacement of a single vibration component (Axis)
 * considering Fundamental (1X), Harmonics (2X, 3X...), and High-Freq Noise.
 */
const calculateComponentDisplacement = (
    comp: VibrationComponent, 
    omega: number, 
    t: number, 
    globalGain: number,
    scalar: number
): number => {
    // 1. Fundamental (1X RPM)
    const ang1 = omega * t + (comp.phase * Math.PI / 180);
    let val = Math.sin(ang1) * comp.amplitude;

    // 2. Harmonics (2X, 3X, etc.)
    if (comp.harmonics && comp.harmonics.length > 0) {
        for (const h of comp.harmonics) {
            const hOmega = omega * h.order;
            // Phase is shifted relative to the fundamental's phase + its own offset
            const hAng = hOmega * t + ((comp.phase + h.phaseShift) * Math.PI / 180);
            val += Math.sin(hAng) * (comp.amplitude * h.amplitudeRatio);
        }
    }

    // 3. High Frequency Noise (Bearing Damage)
    // We simulate this as a non-synchronous high frequency (e.g., 25x RPM range)
    // Increased frequency to ensure it looks like "buzz" distinct from 2X/3X orders.
    if (comp.noise && comp.noise > 0) {
        const noiseFreq = omega * 25.0; // Very high frequency impact
        // Complex noise pattern
        const noiseVal = (Math.sin(noiseFreq * t) + 0.5 * Math.sin(noiseFreq * 1.3 * t)); 
        val += noiseVal * comp.noise;
    }

    return val * globalGain * scalar;
};

/**
 * Core Physics Engine: Calculates the displacement vector for ANY point in 3D space
 * based on the weighted influence of measurement points (Sensors).
 */
export const calculateVertexDisplacement = (
  x: number, y: number, z: number,
  t: number,
  animationRpm: number,
  points: MeasurementPoint[],
  globalGain: number
): THREE.Vector3 => {
  // Use Animation RPM for visual rotation speed
  const omega = (animationRpm * 2 * Math.PI) / 60;
  const displacement = new THREE.Vector3(0, 0, 0);
  
  let totalWeight = 0;
  const power = 3.5; // Controls locality.

  // Scale Factor: Controls the relationship between "Mils" and 3D Units.
  const SCALAR = 0.015;

  for (const p of points) {
    // Distance from vertex to sensor
    const dx = x - p.position[0];
    const dy = y - p.position[1];
    const dz = z - p.position[2];
    const distSq = dx*dx + dy*dy + dz*dz;
    const dist = Math.sqrt(distSq);

    // Weight function
    const weight = 1.0 / (Math.pow(dist, power) + 0.1);
    
    // Calculate sensor's instantaneous vibration components with Harmonics
    const magH = calculateComponentDisplacement(p.horizontal, omega, t, globalGain, SCALAR);
    const magV = calculateComponentDisplacement(p.vertical, omega, t, globalGain, SCALAR);
    const magA = calculateComponentDisplacement(p.axial, omega, t, globalGain, SCALAR);
    
    // Add weighted contribution
    displacement.x += magH * weight;
    displacement.y += magV * weight;
    displacement.z += magA * weight;
    
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    displacement.divideScalar(totalWeight);
  }

  return displacement;
};

// Fast hash for caching geometry lookups if needed
export const getGeomHash = (count: number) => `geo-${count}`;
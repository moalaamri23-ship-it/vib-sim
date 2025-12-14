import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Helper to align cylinder to Z axis (ThreeJS cylinders default to Y axis)
const alignZ = (geo: THREE.BufferGeometry) => geo.rotateX(Math.PI / 2);

/**
 * Generates an IEC Standard Electric Motor.
 * Aligned along Z-axis.
 * Center of Stator is roughly (0,0,0).
 */
export const generateMotorCAD = (): THREE.BufferGeometry => {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Main Stator Housing (Finned Area)
  // Length 2.0, Radius 0.8
  const stator = new THREE.CylinderGeometry(0.8, 0.8, 2.0, 32);
  alignZ(stator);
  parts.push(stator);

  // 2. Cooling Fins
  const longFin = new THREE.BoxGeometry(0.05, 0.2, 1.8);
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    if (angle > Math.PI * 0.8 && angle < Math.PI * 2.2) {
       // Skip bottom area for feet
       if (angle > 4 && angle < 5.5) continue;
    }
    
    const fin = longFin.clone();
    // Position on surface
    const r = 0.75;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    
    fin.rotateZ(angle); // Rotate to face outward
    fin.translate(x, y, 0);
    parts.push(fin);
  }

  // 3. Fan Cowl (NDE - Rear)
  // Must be smaller or same size as stator, placed at negative Z
  const cowlLength = 0.5;
  const cowl = new THREE.CylinderGeometry(0.78, 0.78, cowlLength, 32);
  alignZ(cowl);
  cowl.translate(0, 0, -1.25); // Behind stator (which is -1 to 1)
  parts.push(cowl);
  
  // Grating texture effect for cowl (simple torus rings)
  const ring = new THREE.TorusGeometry(0.78, 0.02, 8, 32);
  ring.translate(0, 0, -1.4);
  parts.push(ring);

  // 4. Drive End Shield (Front)
  const deShield = new THREE.CylinderGeometry(0.8, 0.4, 0.4, 32);
  alignZ(deShield);
  deShield.translate(0, 0, 1.2);
  parts.push(deShield);

  // 5. Shaft Output REMOVED (Handled by dedicated shaft mesh in MachineTrain)

  // 6. Terminal Box (Top)
  const tBox = new THREE.BoxGeometry(0.6, 0.4, 0.6);
  tBox.translate(0.5, 0.9, 0.5); // Top right side
  parts.push(tBox);

  // 7. Mounting Feet
  // Two distinct feet blocks at bottom
  const footGeo = new THREE.BoxGeometry(0.4, 0.2, 0.4);
  
  // Front Feet (DE)
  const f1 = footGeo.clone(); f1.translate(0.6, -0.8, 0.8); parts.push(f1);
  const f2 = footGeo.clone(); f2.translate(-0.6, -0.8, 0.8); parts.push(f2);
  
  // Rear Feet (NDE)
  const f3 = footGeo.clone(); f3.translate(0.6, -0.8, -0.8); parts.push(f3);
  const f4 = footGeo.clone(); f4.translate(-0.6, -0.8, -0.8); parts.push(f4);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
};

/**
 * Generates an ANSI Overhung Centrifugal Pump.
 * Includes Bearing Housing Support.
 */
export const generatePumpCAD = (): THREE.BufferGeometry => {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Bearing Housing (The frame)
  // Cylinder along Z
  const housingLen = 1.5;
  const housing = new THREE.CylinderGeometry(0.35, 0.35, housingLen, 24);
  alignZ(housing);
  housing.translate(0, 0, 0); // Center at local 0
  parts.push(housing);

  // 2. Shaft Input REMOVED (Handled by dedicated shaft mesh)

  // 3. Bearing Housing Support Foot (The "Pedestal")
  // Located under the bearing housing
  const pedColumn = new THREE.BoxGeometry(0.4, 0.6, 0.8);
  pedColumn.translate(0, -0.5, 0);
  parts.push(pedColumn);
  
  const pedBase = new THREE.BoxGeometry(1.0, 0.1, 1.2);
  pedBase.translate(0, -0.85, 0);
  parts.push(pedBase);

  // 4. Frame Adapter (Transition to Volute)
  const adapter = new THREE.CylinderGeometry(0.35, 0.8, 0.3, 32);
  alignZ(adapter);
  adapter.translate(0, 0, 0.9);
  parts.push(adapter);

  // 5. Volute Casing (The spiral pump body)
  const voluteWidth = 0.6;
  const voluteRadius = 0.9;
  const volute = new THREE.CylinderGeometry(voluteRadius, voluteRadius, voluteWidth, 32);
  alignZ(volute);
  volute.translate(0, 0, 1.35); // End of adapter
  parts.push(volute);

  // Volute offset bulge (spiral approx)
  const spiral = new THREE.TorusGeometry(0.9, 0.3, 16, 32, Math.PI * 1.5);
  spiral.translate(0, 0, 1.35);
  parts.push(spiral);

  // 6. Discharge Nozzle (Radial - Up)
  const discharge = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 16);
  discharge.translate(0, 1.1, 1.35);
  parts.push(discharge);

  const dischargeFlange = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
  dischargeFlange.translate(0, 1.5, 1.35);
  parts.push(dischargeFlange);

  // 7. Suction Nozzle (Axial - Front)
  const suction = new THREE.CylinderGeometry(0.4, 0.35, 0.6, 16);
  alignZ(suction);
  suction.translate(0, 0, 1.8); // Stick out front of volute
  parts.push(suction);

  const suctionFlange = new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16);
  alignZ(suctionFlange);
  suctionFlange.translate(0, 0, 2.1);
  parts.push(suctionFlange);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
};

/**
 * Generates a SINGLE SIDE of the flexible coupling.
 * By rendering two of these facing each other, we can show misalignment gaps.
 */
export const generateCouplingHalf = (): THREE.BufferGeometry => {
    // Standard half: Hub + Flange + Bolts
    // Oriented +Z, Flange face at Z=0
    const parts = [];

    // Hub (Behind flange)
    const hub = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 24);
    alignZ(hub);
    hub.translate(0, 0, -0.15); 
    parts.push(hub);
    
    // Flange (Face at 0)
    const flange = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24);
    alignZ(flange);
    parts.push(flange); 
    
    // Bolts (visuals sticking out)
    const boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8);
    alignZ(boltGeo);
    for(let i=0; i<6; i++) {
        const angle = (Math.PI/3) * i;
        const b = boltGeo.clone();
        b.translate(0.38*Math.cos(angle), 0.38*Math.sin(angle), 0.05); 
        parts.push(b);
    }
    
    const merged = BufferGeometryUtils.mergeGeometries(parts);
    merged.computeVertexNormals();
    return merged;
}

/**
 * Generates a Structural Steel Skid (C-Channel Base).
 * INCREASED SEGMENTATION for better deformation linkage.
 */
export const generateSkidCAD = (): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    
    // Length increased to 12
    const length = 12;
    const width = 3;
    
    // Side Beams (C-Channels approximated)
    const beamGeo = new THREE.BoxGeometry(0.2, 0.4, length);
    
    const leftBeam = beamGeo.clone();
    leftBeam.translate(width/2, -0.2, length/2 - 2); 
    parts.push(leftBeam);

    const rightBeam = beamGeo.clone();
    rightBeam.translate(-width/2, -0.2, length/2 - 2);
    parts.push(rightBeam);

    // Cross Members
    const crossGeo = new THREE.BoxGeometry(width, 0.3, 0.2);
    
    const c1 = crossGeo.clone(); c1.translate(0, -0.2, -1.0); parts.push(c1); 
    const c2 = crossGeo.clone(); c2.translate(0, -0.2, 1.0); parts.push(c2); 
    const c3 = crossGeo.clone(); c3.translate(0, -0.2, 5.0); parts.push(c3); 
    const c4 = crossGeo.clone(); c4.translate(0, -0.2, 8.0); parts.push(c4); 

    // Grout / Baseplate Surface
    // CRITICAL FIX: High segmentation (12, 1, 24) allows local physics deformation
    // This allows the skid to "stick" to the vibrating feet above it
    const plate = new THREE.BoxGeometry(width + 0.2, 0.1, length, 12, 1, 24);
    plate.translate(0, 0, length/2 - 2);
    parts.push(plate);

    const merged = BufferGeometryUtils.mergeGeometries(parts);
    merged.computeVertexNormals();
    return merged;
}
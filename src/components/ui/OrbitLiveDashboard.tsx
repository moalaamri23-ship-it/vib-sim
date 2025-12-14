import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { Activity, Waves } from 'lucide-react';

export const OrbitLiveDashboard: React.FC = () => {
    const { 
        orbitPoints, 
        animationRpm, 
        isOrbitSimulationVisible, 
        isPlaying,
        appMode,
        shaftAngle // Read the shared angle ref
    } = useStore();
    
    // 1. Hooks
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Store current angle locally to drive loop
    const angleRef = useRef(0);

    const probeX = orbitPoints.find(p => p.id === 'probe-x')?.horizontal;
    const probeY = orbitPoints.find(p => p.id === 'probe-y')?.horizontal;
    
    // 2. Sync Effect not really needed as we pull from Ref in loop, but good for resets
    useEffect(() => {
        if (appMode === 'ORBIT') {
            angleRef.current = shaftAngle.current;
        }
    }, [appMode, shaftAngle]);

    // 3. Animation Loop
    useEffect(() => {
        if (appMode !== 'ORBIT') return;

        let animationFrameId: number;
        
        const render = () => {
            // SYNC: Read the exact physics angle from the store
            angleRef.current = shaftAngle.current;
            
            // Only draw if visible and refs valid
            const canvas = canvasRef.current;
            if (canvas && isOrbitSimulationVisible && probeX && probeY) {
                 const ctx = canvas.getContext('2d');
                 if (ctx) {
                    const width = canvas.width;
                    const height = canvas.height;
                    
                    // Current Shaft Angle (Negative, accumulating CW)
                    const thetaNow = angleRef.current; 
                    const omega = (animationRpm * 2 * Math.PI) / 60; // rad/s for time projection
                    
                    ctx.clearRect(0, 0, width, height);
                    
                    // --- LAYOUT CONSTANTS ---
                    const panelHeight = height / 3;
                    const waveWidth = width * 0.7;
                    
                    // --- HELPERS ---
                    // Calculate Signal based on ANGLE, not Time.
                    // theta is the shaft angle.
                    const getSignalVal = (comp: any, theta: number) => {
                        let val = comp.amplitude * Math.sin(theta + (comp.phase * Math.PI / 180));
                        if (comp.harmonics) {
                            comp.harmonics.forEach((h: any) => {
                                val += (comp.amplitude * h.amplitudeRatio) * Math.sin(theta * h.order + ((comp.phase + h.phaseShift) * Math.PI / 180));
                            });
                        }
                        if (comp.noise) {
                            // Noise is just randomness, we can approximate with high order harmonic of angle
                            val += comp.noise * 0.5 * Math.sin(theta * 25);
                        }
                        return val;
                    };

                    const drawWave = (offsetY: number, color: string, comp: any, label: string) => {
                        const midY = offsetY + panelHeight / 2;
                        
                        // Grid
                        ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(waveWidth, midY); ctx.stroke();
                        
                        // Signal
                        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
                        
                        // Draw 3 Cycles
                        const cycles = 3;
                        // Map width to angle duration
                        const angleDuration = cycles * 2 * Math.PI;

                        let maxAmp = comp.amplitude || 10;
                        if(comp.harmonics) comp.harmonics.forEach((h:any) => maxAmp += comp.amplitude * h.amplitudeRatio);
                        const scaleY = (panelHeight * 0.4) / (maxAmp * 1.2 || 1);

                        const step = 2;
                        for(let x=0; x < waveWidth; x+=step) {
                            // Calculate angle at this pixel (History -> Now)
                            // Right side (x=width) is thetaNow.
                            // Left side (x=0) is thetaNow + angleDuration (Remember theta is negative!)
                            // Wait, theta decreases over time (0 -> -100).
                            // So Past is "More Positive" than Now.
                            // theta(t_past) = thetaNow + omega * dt
                            
                            const pct = (waveWidth - x) / waveWidth; // 1.0 at Left (Past), 0.0 at Right (Now)
                            const thetaAtPixel = thetaNow + (pct * angleDuration);

                            const val = getSignalVal(comp, thetaAtPixel);
                            const y = midY - val * scaleY; // Minus because Canvas Y is Down
                            
                            if(x===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                        
                        // Label
                        ctx.fillStyle = color; ctx.font = '10px monospace'; ctx.fillText(label, 5, offsetY + 12);
                        
                        // Live Value
                        const currentVal = getSignalVal(comp, thetaNow);
                        ctx.textAlign = 'right'; ctx.fillText(`${currentVal.toFixed(1)} µm`, waveWidth - 5, offsetY + 12); ctx.textAlign = 'left';
                    };

                    const drawKP = (offsetY: number) => {
                        const midY = offsetY + panelHeight / 2;
                        const color = '#ef4444';
                        
                        ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(waveWidth, midY); ctx.stroke();
                        
                        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
                        
                        const cycles = 3;
                        const angleDuration = cycles * 2 * Math.PI;
                        
                        const step = 2;
                        // Use wide pulse for visibility
                        const pulseHalfWidth = 0.35 / 2; 

                        for(let x=0; x < waveWidth; x+=step) {
                            const pct = (waveWidth - x) / waveWidth;
                            const thetaAtPixel = thetaNow + (pct * angleDuration);

                            // Trigger Logic: 
                            // Tape is at Angle = thetaAtPixel.
                            // Sensor is at PI/2 (Top).
                            // Normalize thetaAtPixel to 0..2PI relative to circle
                            
                            const theta = thetaAtPixel % (2 * Math.PI); 
                            let normTheta = theta < 0 ? theta + 2*Math.PI : theta;
                            
                            const target = Math.PI / 2;
                            let dist = Math.abs(normTheta - target);
                            if(dist > Math.PI) dist = 2*Math.PI - dist;
                            
                            const isHigh = dist < pulseHalfWidth;
                            const y = isHigh ? midY - 20 : midY + 20; 
                            
                            if(x===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                        ctx.fillStyle = color; ctx.fillText("Keyphasor (Groove Pass)", 5, offsetY + 12);
                    };

                    const drawFFT = (offsetY: number, comp: any) => {
                         const startX = waveWidth + 5;
                         const baseY = offsetY + panelHeight - 10;
                         const availH = panelHeight - 20;
                         
                         ctx.strokeStyle = '#475569';
                         ctx.beginPath(); ctx.moveTo(startX, baseY); ctx.lineTo(width, baseY); ctx.stroke();
                         
                         const maxOrder = 5;
                         const step = (width - startX) / maxOrder;
                         
                         let maxAmp = comp.amplitude || 10;
                         if(comp.harmonics) comp.harmonics.forEach((h:any) => maxAmp = Math.max(maxAmp, comp.amplitude*h.amplitudeRatio));
                         const scale = (availH * 0.8) / maxAmp;
                         
                         const drawBar = (order: number, amp: number, color: string) => {
                             const x = startX + order * step;
                             const h = Math.max(2, amp * scale); 
                             ctx.fillStyle = color;
                             ctx.fillRect(x - 3, baseY - h, 6, h);
                             if (amp > maxAmp * 0.2) {
                                ctx.fillStyle = '#94a3b8'; ctx.font = '8px monospace'; ctx.fillText(`${order}X`, x - 5, baseY + 8);
                             }
                         };
                         drawBar(1, comp.amplitude, '#facc15');
                         if(comp.harmonics) comp.harmonics.forEach((h:any) => { if(h.order <= maxOrder) drawBar(h.order, comp.amplitude * h.amplitudeRatio, '#fbbf24'); });
                         if(comp.noise) drawBar(0.2, comp.noise, '#94a3b8');
                    };
                    
                    drawWave(0, '#22d3ee', probeX, "Probe X (Vibration)");
                    drawFFT(0, probeX);
                    drawWave(panelHeight, '#facc15', probeY, "Probe Y (Vibration)");
                    drawFFT(panelHeight, probeY);
                    drawKP(panelHeight * 2);
                 }
            }
            
            animationFrameId = requestAnimationFrame(render);
        };
        
        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, [probeX, probeY, animationRpm, isPlaying, appMode, isOrbitSimulationVisible, shaftAngle]);

    if (appMode !== 'ORBIT') return null;
    if (!isOrbitSimulationVisible) return null;

    return (
        <div className="absolute top-16 right-4 w-96 bg-slate-900/95 border border-cyan-500/30 backdrop-blur-md rounded-lg shadow-2xl pointer-events-auto flex flex-col animate-in fade-in slide-in-from-right-4 z-40">
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <Waves className="text-cyan-400 w-4 h-4" />
                    <div>
                        <h3 className="text-white text-xs font-bold uppercase">Live Telemetry</h3>
                        <div className="text-[10px] text-slate-400 font-mono">Real-time Probe & KP Signals</div>
                    </div>
                </div>
            </div>
            <div className="p-2 bg-black/60">
                <canvas ref={canvasRef} width={380} height={200} className="w-full h-full rounded" />
            </div>
        </div>
    );
};
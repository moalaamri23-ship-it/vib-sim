import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { ODSMode } from '../../types';
import { X, ArrowRightLeft, ArrowUpDown, Move, Activity } from 'lucide-react';

export const AnalysisWindow: React.FC = () => {
    const { selectedPointId, points, orbitPoints, machineRpm, animationRpm, isAnalysisMode, appMode } = useStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [activeAxis, setActiveAxis] = useState<'horizontal' | 'vertical' | 'axial'>('vertical');

    // Safe retrieval of point data for hooks
    const activeList = appMode === 'ORBIT' ? orbitPoints : points;
    const point = activeList.find(p => p.id === selectedPointId);
    
    // Default values if point not selected to satisfy hook dependencies
    // In Orbit mode, probes are single-axis (Horizontal by default convention in store)
    // Keyphasor is unique.
    const effectiveAxis = appMode === 'ORBIT' ? 'horizontal' : activeAxis;
    const component = point ? point[effectiveAxis] : { amplitude: 0, phase: 0, harmonics: [], noise: 0 };
    const { amplitude, phase, harmonics, noise } = component;
    const isKeyphasor = point?.id === 'keyphasor';
    const isOrbitMode = appMode === 'ORBIT';

    // Drawing Logic - Hook MUST be called unconditionally
    useEffect(() => {
        // Exit inside the effect if conditions aren't met
        if (!isAnalysisMode || !point || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Setup Canvas
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // --- 1. TIME WAVEFORM (Top Half) ---
        const twfHeight = height * 0.45;
        const twfY = 20; // Padding top
        const midY = twfY + twfHeight / 2;

        // Draw Grid
        ctx.strokeStyle = '#334155'; // Slate-700
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Zero Line
        ctx.moveTo(0, midY); ctx.lineTo(width, midY);
        ctx.stroke();

        // Draw Waveform
        ctx.strokeStyle = isKeyphasor ? '#ef4444' : '#22d3ee'; // Red for KP, Cyan for Vib
        ctx.lineWidth = 2;
        ctx.beginPath();

        const cycles = 3;
        
        // --- KEYPHASOR LOGIC (SQUARE WAVE PULSE) ---
        if (isKeyphasor) {
             // 1X Pulse trigger. Amplitude = Voltage (e.g., 5V or 20V)
             // Logic: Low (0) most of the time, High (Amp) for brief duration once per cycle
             // Phase shifts where the pulse starts. 
             // Phase 0 = Pulse starts at t=0 of cycle? 
             // Convention: Pulse occurs when Notch passes Probe.
             
             const phaseRad = (phase * Math.PI) / 180;
             const pulseWidthRad = Math.PI / 4; // 45 degree wide pulse

             const displayLimit = Math.max(5, amplitude * 1.2);
             const yScale = (twfHeight / 2) / displayLimit;

             for (let x = 0; x < width; x++) {
                 const tTotal = (x / width) * cycles * 2 * Math.PI;
                 // Normalize t to 0..2PI
                 const tCycle = tTotal % (2 * Math.PI);
                 
                 // Check if inside pulse window based on Phase
                 // Pulse happens when (t - phase) is close to 0 (or defined trigger)
                 // Let's say Pulse center is at Phase.
                 
                 // Distance from phase angle
                 // Handle wrapping
                 let dist = Math.abs(tCycle - phaseRad);
                 if(dist > Math.PI) dist = 2*Math.PI - dist;
                 
                 // Square Wave Logic
                 let yVal = 0;
                 if (dist < pulseWidthRad / 2) {
                     yVal = amplitude; 
                 } else {
                     yVal = 0; // or -amplitude for AC coupled? Usually DC offset 0-5V. let's assume 0 to Amp.
                 }
                 
                 // For drawing 0 to Amp, we offset from midY? Or from bottom?
                 // Let's center it for visual simplicity like an AC signal for now
                 yVal = (dist < pulseWidthRad / 2) ? amplitude : -amplitude/4;

                 const yPixel = midY - (yVal * yScale);
                 if (x === 0) ctx.moveTo(x, yPixel);
                 else ctx.lineTo(x, yPixel);
             }
        } 
        
        // --- VIBRATION LOGIC (COMPLEX SINE) ---
        else {
            const phaseRad = (phase * Math.PI) / 180;
            
            // --- SCALE CALCULATION ---
            let maxTheoreticalAmp = amplitude; 
            if (harmonics) harmonics.forEach(h => maxTheoreticalAmp += amplitude * h.amplitudeRatio);
            if (noise) maxTheoreticalAmp += noise * 1.5;
            
            // Minimum display
            const displayLimit = Math.max(2, maxTheoreticalAmp * 1.2); 
            const yScale = (twfHeight / 2) / displayLimit;

            for (let x = 0; x < width; x++) {
                const t = (x / width) * cycles * 2 * Math.PI; 
                
                let yVal = amplitude * Math.sin(t + phaseRad);
                if (harmonics) {
                    harmonics.forEach(h => {
                        const hPhaseRad = (phase + h.phaseShift) * Math.PI / 180;
                        yVal += (amplitude * h.amplitudeRatio) * Math.sin((t * h.order) + hPhaseRad);
                    });
                }
                if (noise) {
                    const noiseFreq = 25.0; 
                    yVal += (noise * 0.5) * (Math.sin(t * noiseFreq) + Math.sin(t * noiseFreq * 1.3));
                }

                const yPixel = midY - (yVal * yScale); 
                
                if (x === 0) ctx.moveTo(x, yPixel);
                else ctx.lineTo(x, yPixel);
            }
        }
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#94a3b8'; // Slate-400
        ctx.font = '10px monospace';
        ctx.fillText(`${isKeyphasor ? 'Keyphasor' : 'TWF'} (Machine: ${machineRpm} RPM)`, 10, twfY + 12);
        
        // --- 2. FFT SPECTRUM (Bottom Half) ---
        const fftY = height * 0.55;
        const fftHeight = height * 0.40;
        const fftBaseY = fftY + fftHeight;

        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(0, fftBaseY); ctx.lineTo(width, fftBaseY);
        ctx.stroke();

        const numBins = 120;
        const barWidth = (width / numBins) * 0.8;
        const order1Index = Math.floor(numBins * 0.10); 
        
        // Keyphasor Spectrum = 1X dominant + harmonics (Square wave has odd harmonics)
        // Vib Spectrum = Configured
        
        const yScaleFFT = (fftHeight * 0.9) / (Math.max(amplitude, 1) * 1.2);

        for (let i = 0; i < numBins; i++) {
            let barAmp = 0;
            const currentOrder = i / order1Index;

            if (isKeyphasor) {
                // Square wave spectrum: 1X, 3X, 5X... decreasing 1/n
                if (Math.abs(currentOrder - 1.0) < 0.1) barAmp = amplitude * 0.63; // 4/pi * A / 2 approx
                else if (Math.abs(currentOrder - 3.0) < 0.1) barAmp = amplitude * 0.21;
                else if (Math.abs(currentOrder - 5.0) < 0.1) barAmp = amplitude * 0.12;
            } else {
                // Normal Vib
                barAmp = Math.random() * (amplitude * 0.05); // Noise floor
                if (Math.abs(currentOrder - 1.0) < (0.5/order1Index)) {
                    barAmp = amplitude;
                    if (Math.abs(currentOrder - 1.0) > 0.1) barAmp *= 0.2;
                }
                if (harmonics) {
                    harmonics.forEach(h => {
                        const targetIndex = Math.round(order1Index * h.order);
                        if (i === targetIndex) {
                            barAmp = amplitude * h.amplitudeRatio;
                        } else if (Math.abs(i - (order1Index * h.order)) < 1.0) {
                            barAmp = Math.max(barAmp, amplitude * h.amplitudeRatio * 0.7);
                        }
                    });
                }
                if (noise && i > order1Index * 4) {
                     barAmp += Math.random() * noise * 0.4;
                     if (Math.abs(i - numBins * 0.8) < 10) barAmp += noise * 0.5;
                }
            }
            
            const barPixelHeight = barAmp * yScaleFFT;
            const xPos = i * (width / numBins);
            
            ctx.fillStyle = isKeyphasor ? '#ef4444' : '#1e293b'; 
            if (!isKeyphasor) {
                if (Math.abs(currentOrder - 1.0) < 0.1) ctx.fillStyle = '#facc15';
                else if (Math.abs(currentOrder - 2.0) < 0.1) ctx.fillStyle = '#f59e0b'; 
                else if (Math.abs(currentOrder - 3.0) < 0.1) ctx.fillStyle = '#ef4444'; 
                else if (barAmp > amplitude * 0.2) ctx.fillStyle = '#22d3ee'; 
            }

            ctx.fillRect(xPos, fftBaseY - barPixelHeight, barWidth, barPixelHeight);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Spectrum (Orders)`, 10, fftY + 12);
        ctx.fillText(`1X`, (order1Index * (width/numBins)), fftBaseY + 12);
        ctx.fillText(`2X`, (order1Index * 2 * (width/numBins)), fftBaseY + 12);

    }, [amplitude, phase, harmonics, noise, machineRpm, activeAxis, isAnalysisMode, point, isKeyphasor]);

    // Conditional Rendering - Must happen AFTER hooks
    if (!isAnalysisMode || !point) return null;

    return (
        <div className="absolute top-20 left-4 w-96 bg-slate-900/95 border border-cyan-500/30 backdrop-blur-md rounded-lg shadow-2xl pointer-events-auto flex flex-col animate-in fade-in zoom-in-95 duration-200 z-50">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <Activity className="text-cyan-400 w-4 h-4" />
                    <div>
                        <h3 className="text-white text-xs font-bold uppercase">{point.label}</h3>
                        <div className="text-[10px] text-slate-400 font-mono">
                            {isKeyphasor ? 'Trigger Signal' : 'Live Signal Analysis'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Toolbar - Hide for Orbit Mode/KP as they are single axis usually */}
            {!isOrbitMode && !isKeyphasor && (
                <div className="flex p-2 gap-1 bg-slate-800/50">
                    <button onClick={() => setActiveAxis('horizontal')} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold transition-all ${activeAxis === 'horizontal' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}><ArrowRightLeft className="w-3 h-3" /> HOR</button>
                    <button onClick={() => setActiveAxis('vertical')} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold transition-all ${activeAxis === 'vertical' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}><ArrowUpDown className="w-3 h-3" /> VERT</button>
                    <button onClick={() => setActiveAxis('axial')} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold transition-all ${activeAxis === 'axial' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}><Move className="w-3 h-3" /> AXL</button>
                </div>
            )}

            {/* Display Area */}
            <div className="p-4 bg-black/40 relative">
                <canvas 
                    ref={canvasRef} 
                    width={350} 
                    height={250} 
                    className="w-full h-full rounded border border-slate-800"
                />
                
                {/* Stats Overlay */}
                <div className="absolute top-5 right-5 text-right">
                    <div className="text-2xl font-mono text-cyan-400 font-bold">{amplitude.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{isKeyphasor ? 'Volts' : 'Amp'}</div>
                    <div className="text-xs font-mono text-slate-300 mt-1">{phase.toFixed(0)}°</div>
                    <div className="text-[10px] text-slate-500 uppercase">Phase</div>
                </div>
            </div>
            
            <div className="p-2 bg-slate-900 text-[9px] text-slate-500 text-center border-t border-slate-800">
                1x RPM @ {machineRpm} CPM
            </div>
        </div>
    );
};
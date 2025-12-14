import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { ODSMode, OrbitFault, MeasurementPoint } from '../../types';
import { Play, Pause, Activity, Settings2, Eye, EyeOff, CheckCircle2, Target, Gauge, ArrowRightLeft, ArrowUpDown, Move, Table, Download, Upload, X, LineChart, Settings, UploadCloud, Zap, Image as ImageIcon, Plus, Trash2, List, BarChart3, Scan, FileText, Waves } from 'lucide-react';
import { AnalysisWindow } from './AnalysisWindow';
import { OrbitWindow } from './OrbitWindow';
import { OrbitLiveDashboard } from './OrbitLiveDashboard';
import { GoogleGenAI, Type } from "@google/genai";

export const Interface: React.FC = () => {
  const { 
    appMode, setAppMode,
    animationRpm, setAnimationRpm,
    machineRpm, setMachineRpm,
    lineFreq, setLineFreq,
    globalGain, setGlobalGain,
    points, orbitPoints, selectedPointId, updatePoint, setReferencePoint,
    resetToMode, currentMode, currentOrbitFault,
    wireframe, toggleWireframe,
    isPlaying, togglePlay,
    setAllPoints,
    isAnalysisMode, toggleAnalysisMode,
    isSettingsOpen, toggleSettings,
    isUploadModalOpen, toggleUploadModal,
    isOrbitPlotOpen, toggleOrbitPlot,
    isOrbitSimulationVisible, toggleOrbitSimulation
  } = useStore();

  // Determine which list to use based on mode
  const activePoints = appMode === 'ORBIT' ? orbitPoints : points;
  const selectedPoint = activePoints.find(p => p.id === selectedPointId);
  const isProbe = selectedPointId?.startsWith('probe');
  const isKeyphasor = selectedPointId === 'keyphasor';
  
  // UI States
  const [activeAxis, setActiveAxis] = useState<'horizontal' | 'vertical' | 'axial'>('vertical');
  const [showDataManager, setShowDataManager] = useState(false);
  
  // Custom Modal States
  const [customTab, setCustomTab] = useState<'manual' | 'ai'>('manual');
  
  // Manual Input States
  const [manualFund, setManualFund] = useState({ amp: 0, phase: 0 });
  const [manualHarmonics, setManualHarmonics] = useState<{id: number, order: number, amp: number}[]>([]);

  // AI Analyzer States
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Reset tab when selection changes
  useEffect(() => {
      // In Orbit Mode, Probes only use Horizontal (radial) slot for storage
      if (appMode === 'ORBIT') setActiveAxis('horizontal'); 
      else setActiveAxis('vertical');
  }, [selectedPointId, appMode]);

  // Load current point data into Manual Form when modal opens
  useEffect(() => {
      if (isUploadModalOpen && selectedPoint) {
          const comp = selectedPoint[activeAxis];
          setManualFund({ amp: comp.amplitude, phase: comp.phase });
          
          const existing = comp.harmonics?.map((h, i) => ({
              id: Date.now() + i,
              order: h.order,
              amp: parseFloat((h.amplitudeRatio * comp.amplitude).toFixed(2))
          })) || [];
          setManualHarmonics(existing);
      }
  }, [isUploadModalOpen, selectedPoint, activeAxis]);

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (appMode === 'ODS') {
          resetToMode(e.target.value as ODSMode);
      } else {
          resetToMode(e.target.value as OrbitFault);
      }
  };

  const speedOptions = [
      { label: 'SLOW', val: 20 },
      { label: 'NORMAL', val: 110 },
      { label: 'FAST', val: 350 },
  ];
  
  // Helper to update specific component
  const updateComponent = (field: 'amplitude' | 'phase', value: number) => {
      if (!selectedPoint) return;
      
      const component = { ...selectedPoint[activeAxis], [field]: value };
      updatePoint(selectedPoint.id, { [activeAxis]: component });
  };

  // --- MANUAL ENTRY LOGIC ---
  const addHarmonic = () => {
      setManualHarmonics([...manualHarmonics, { id: Date.now(), order: 2.0, amp: 0.0 }]);
  };

  const removeHarmonic = (id: number) => {
      setManualHarmonics(manualHarmonics.filter(h => h.id !== id));
  };

  const updateHarmonic = (id: number, field: 'order' | 'amp', value: number) => {
      setManualHarmonics(manualHarmonics.map(h => h.id === id ? { ...h, [field]: value } : h));
  };

  const applyManualSimulation = () => {
      if (!selectedPoint) return;
      
      const harmonics = manualHarmonics.map(h => ({
          order: h.order,
          // Avoid divide by zero
          amplitudeRatio: manualFund.amp > 0 ? h.amp / manualFund.amp : 0, 
          phaseShift: 0 // Default phase shift for manual peaks
      }));

      updatePoint(selectedPoint.id, {
          [activeAxis]: {
              amplitude: manualFund.amp,
              phase: manualFund.phase,
              harmonics: harmonics,
              noise: 0 // Reset noise on manual override
          }
      });
      toggleUploadModal();
  };

  // --- GEMINI ANALYSIS LOGIC ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setAnalysisResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeSpectrum = async () => {
    if (!selectedImage) return;
    setAnalyzing(true);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const base64Data = selectedImage.split(',')[1];
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: `Analyze this vibration spectrum image. Extract dominant amplitude and harmonics.` }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        amplitude: { type: Type.NUMBER },
                        phase: { type: Type.NUMBER },
                        harmonics: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { order: { type: Type.NUMBER }, amplitudeRatio: { type: Type.NUMBER } }
                            }
                        }
                    }
                }
            }
        });

        if (response.text) {
            const data = JSON.parse(response.text);
            setAnalysisResult(data);
        }
    } catch (error) {
        console.error("Gemini Error:", error);
        alert("Failed to analyze image. Check console for details.");
    } finally {
        setAnalyzing(false);
    }
  };

  const applyAISimulation = () => {
      if (!selectedPoint || !analysisResult) return;
      const updates = {
          amplitude: analysisResult.amplitude || 0,
          phase: analysisResult.phase || 0,
          harmonics: analysisResult.harmonics?.map((h: any) => ({
              order: h.order, amplitudeRatio: h.amplitudeRatio, phaseShift: 0
          })) || []
      };
      updatePoint(selectedPoint.id, { [activeAxis]: updates });
      toggleUploadModal();
  };
  
  // ODS Data Manager functions... (Download/Import same as before, omitted for brevity but logically here)

  const currentComponent = selectedPoint ? selectedPoint[activeAxis] : { amplitude: 0, phase: 0 };
  const unitLabel = appMode === 'ORBIT' ? (isKeyphasor ? 'Volts' : 'µm') : 'mm/s';
  const showPhase = appMode === 'ODS' || isKeyphasor; // Only show Phase control for ODS or Keyphasor

  return (
    <>
    {/* Analyzer Overlays */}
    <AnalysisWindow />
    <OrbitWindow />
    <OrbitLiveDashboard />

    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10">
      {/* Top Left Panel: Global Settings & Faults */}
      <div className="flex flex-col gap-4 pointer-events-auto max-w-xs w-full">
        <div className="bg-slate-900/95 border border-slate-700 p-4 rounded-md backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
            <div className="flex items-center gap-2">
                <Activity className="text-cyan-400 w-5 h-5" />
                <h1 className="text-cyan-400 font-bold tracking-wider text-sm uppercase flex gap-2">
                    <span 
                        onClick={() => setAppMode('ODS')}
                        className={`cursor-pointer hover:text-white transition-colors ${appMode === 'ODS' ? 'text-cyan-400 underline underline-offset-4' : 'text-slate-500'}`}
                    >
                        Pro ODS Simulator
                    </span>
                    <span className="text-slate-600">/</span>
                    <span 
                        onClick={() => setAppMode('ORBIT')}
                        className={`cursor-pointer hover:text-white transition-colors ${appMode === 'ORBIT' ? 'text-cyan-400 underline underline-offset-4' : 'text-slate-500'}`}
                    >
                        Orbit
                    </span>
                </h1>
            </div>
            <button onClick={toggleSettings} className="text-slate-400 hover:text-white" title="Settings">
                <Settings className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-5">
            {/* Fault Library Dropdown */}
            <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Settings2 className="w-3 h-3" /> Fault Condition
                </label>
                <div className="relative">
                    <select 
                        onChange={handleModeChange}
                        value={appMode === 'ODS' ? currentMode : currentOrbitFault}
                        className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded p-2 focus:ring-1 focus:ring-cyan-500 outline-none appearance-none cursor-pointer hover:bg-slate-750 transition-colors"
                    >
                        {appMode === 'ODS' ? (
                            <>
                                <option value={ODSMode.Manual}>Manual Analysis</option>
                                <optgroup label="Unbalance">
                                    <option value={ODSMode.UnbalanceStatic}>Static Unbalance</option>
                                    <option value={ODSMode.UnbalanceCouple}>Couple Unbalance</option>
                                    <option value={ODSMode.UnbalanceDynamic}>Dynamic Unbalance</option>
                                    <option value={ODSMode.UnbalanceOverhung}>Overhung Rotor</option>
                                </optgroup>
                                <optgroup label="Misalignment">
                                    <option value={ODSMode.AngularMisalignment}>Angular Misalignment</option>
                                    <option value={ODSMode.ParallelMisalignment}>Parallel Misalignment (Dominant 2X)</option>
                                    <option value={ODSMode.MisalignmentCombo}>Combined Misalignment</option>
                                </optgroup>
                                <optgroup label="Eccentricity / Bent Shaft">
                                    <option value={ODSMode.BentShaft}>Bent Shaft</option>
                                    <option value={ODSMode.EccentricRotor}>Eccentric Rotor</option>
                                </optgroup>
                                <optgroup label="Mechanical Looseness">
                                    <option value={ODSMode.LoosenessStructural}>Structural Looseness (Type A)</option>
                                    <option value={ODSMode.LoosenessRocking}>Rocking Looseness (Type B)</option>
                                    <option value={ODSMode.LoosenessBearing}>Bearing Loose Fit (Type C)</option>
                                    <option value={ODSMode.SoftFoot}>Soft Foot (2xLF)</option>
                                </optgroup>
                                <optgroup label="Bearings & Resonance">
                                    <option value={ODSMode.BearingWear}>Bearing Wear (Late Stage)</option>
                                    <option value={ODSMode.GearMesh}>Gear Mesh Issue</option>
                                    <option value={ODSMode.ResonanceVert}>Vertical Resonance</option>
                                </optgroup>
                            </>
                        ) : (
                            <>
                                <option value={OrbitFault.Manual}>Manual Config</option>
                                <optgroup label="Common Faults">
                                    <option value={OrbitFault.Unbalance}>Unbalance (1X Circle)</option>
                                    <option value={OrbitFault.Misalignment}>Misalignment (Banana/Ellipse)</option>
                                    <option value={OrbitFault.ShaftCrack}>Shaft Crack (1X + 2X Loop)</option>
                                    <option value={OrbitFault.RotorBow}>Rotor Bow (High 1X)</option>
                                </optgroup>
                                <optgroup label="Fluid Film / Bearings">
                                    <option value={OrbitFault.OilWhirl}>Oil Whirl (0.4X - 0.48X)</option>
                                    <option value={OrbitFault.OilWhip}>Oil Whip (Locked Sub-sync)</option>
                                    <option value={OrbitFault.Preload}>Radial Preload (Flattened)</option>
                                </optgroup>
                                <optgroup label="Transient / Mechanical">
                                    <option value={OrbitFault.Rub}>Rub (Truncated/Bouncing)</option>
                                    <option value={OrbitFault.Looseness}>Mechanical Looseness</option>
                                    <option value={OrbitFault.Resonance}>Resonance (Phase Shift)</option>
                                </optgroup>
                            </>
                        )}
                    </select>
                </div>
            </div>

            {/* Global RPM Controls */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Gauge className="w-3 h-3" /> Animation Speed
                </label>
                <span className="text-xs text-cyan-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">{animationRpm} CPM</span>
              </div>
              <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                  {speedOptions.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setAnimationRpm(opt.val)}
                        className={`flex-1 text-[9px] uppercase font-bold py-1.5 rounded transition-all ${
                            animationRpm === opt.val
                            ? 'bg-cyan-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                          {opt.label}
                      </button>
                  ))}
              </div>
            </div>

            {/* Global Gain */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-slate-400 uppercase font-semibold">Motion Amplification</label>
                <span className="text-xs text-yellow-500 font-mono bg-slate-800 px-1.5 py-0.5 rounded">{globalGain.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.1" max="25" step="0.1" 
                value={globalGain} 
                onChange={(e) => setGlobalGain(Number(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500 hover:accent-yellow-400"
              />
            </div>
            
            <div className="flex gap-2 pt-2">
                 <button 
                    onClick={togglePlay}
                    className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2 rounded transition-all ${
                        isPlaying 
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50' 
                        : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50'
                    }`}
                >
                    {isPlaying ? <><Pause className="w-3 h-3" /> FREEZE</> : <><Play className="w-3 h-3" /> SIMULATE</>}
                </button>
                <button 
                    onClick={toggleWireframe}
                    className={`px-3 flex items-center justify-center rounded border transition-all ${
                        wireframe 
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' 
                        : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'
                    }`}
                    title="Toggle Housing Visibility"
                >
                    {wireframe ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
            </div>
            
            {/* ODS: Analyzer and Data Manager */}
            {appMode === 'ODS' && (
                <>
                    <button 
                        onClick={toggleAnalysisMode}
                        className={`w-full mt-2 flex items-center justify-center gap-2 text-xs font-bold py-2 rounded border transition-all ${
                            isAnalysisMode 
                            ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.5)]' 
                            : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
                        }`}
                    >
                        <LineChart className="w-3 h-3" /> {isAnalysisMode ? 'ANALYZER ACTIVE' : 'ENABLE ANALYZER'}
                    </button>
                    
                    <button 
                        onClick={() => setShowDataManager(true)}
                        className="w-full mt-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded border border-slate-600 transition-all"
                    >
                        <Table className="w-3 h-3" /> DATA MANAGER
                    </button>
                </>
            )}

            {/* ORBIT: Analyzer and Orbit Plot */}
            {appMode === 'ORBIT' && (
                <div className="flex flex-col gap-2 mt-2">
                     <div className="flex gap-2">
                        <button 
                            onClick={toggleOrbitPlot}
                            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-3 rounded border transition-all ${
                                isOrbitPlotOpen
                                ? 'bg-yellow-600 text-white border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
                                : 'bg-slate-800 text-yellow-500 border-slate-600 hover:bg-slate-700'
                            }`}
                        >
                            <Scan className="w-3 h-3" /> OPEN ORBIT PLOT
                        </button>
                        
                        <button 
                            onClick={toggleOrbitSimulation}
                            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-3 rounded border transition-all ${
                                isOrbitSimulationVisible
                                ? 'bg-cyan-600 text-white border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                                : 'bg-slate-800 text-cyan-400 border-slate-600 hover:bg-slate-700'
                            }`}
                        >
                            <Waves className="w-3 h-3" /> SIMULATE ORBIT
                        </button>
                     </div>

                    <button 
                        onClick={toggleAnalysisMode}
                        className={`w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded border transition-all ${
                            isAnalysisMode 
                            ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.5)]' 
                            : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
                        }`}
                    >
                        <LineChart className="w-3 h-3" /> {isAnalysisMode ? 'ANALYZER ACTIVE' : 'ENABLE ANALYZER'}
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Right Panel: Selected Point Details */}
      {selectedPoint && !isAnalysisMode && (
        <div className="absolute top-4 right-4 pointer-events-auto w-72">
             <div className="bg-slate-900/95 border border-yellow-500/50 p-4 rounded-md backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
                    <div className="flex items-center gap-2">
                        <Target className="text-yellow-500 w-4 h-4" />
                        <h2 className="text-yellow-500 font-bold text-xs uppercase tracking-wide">
                            {isKeyphasor ? 'Keyphasor Config' : 'Sensor Config'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleUploadModal}
                            className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                        >
                            <UploadCloud className="w-3 h-3" /> Custom
                        </button>
                        <div className="text-[10px] text-slate-500 font-mono">{selectedPoint.id}</div>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Sensor Name */}
                    <div>
                        <label className="text-[10px] text-slate-400 uppercase font-semibold">Location</label>
                        <div className="text-sm font-medium text-white">{selectedPoint.label}</div>
                    </div>
                    
                    {/* Axis Selector Tabs (Only show for ODS multi-axis points) */}
                    {appMode === 'ODS' && (
                        <div className="flex bg-slate-800 rounded p-1 gap-1">
                            <button 
                                onClick={() => setActiveAxis('horizontal')}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                                    activeAxis === 'horizontal' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <ArrowRightLeft className="w-3 h-3" /> HOR
                            </button>
                            <button 
                                onClick={() => setActiveAxis('vertical')}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                                    activeAxis === 'vertical' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <ArrowUpDown className="w-3 h-3" /> VERT
                            </button>
                            <button 
                                onClick={() => setActiveAxis('axial')}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                                    activeAxis === 'axial' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Move className="w-3 h-3" /> AXIAL
                            </button>
                        </div>
                    )}

                    {/* Amplitude */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-slate-400 uppercase font-semibold">
                                {isKeyphasor ? 'Voltage (Pk-Pk)' : 'Amplitude'} 
                                <span className="text-slate-500 lowercase ml-1">({unitLabel})</span>
                            </label>
                            <input 
                                type="number" 
                                min="0" 
                                max="200" 
                                step="0.1"
                                value={currentComponent.amplitude}
                                onChange={(e) => updateComponent('amplitude', parseFloat(e.target.value) || 0)}
                                className="w-16 text-xs text-white font-mono bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                        <input 
                            type="range" min="0" max={appMode === 'ORBIT' ? 100 : 10} step="0.1" 
                            value={currentComponent.amplitude}
                            onChange={(e) => updateComponent('amplitude', Number(e.target.value))}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"
                        />
                    </div>

                    {/* Phase (Only show if allowed) */}
                    {showPhase && (
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 uppercase font-semibold">
                                    {isKeyphasor ? 'Reference Phase Angle' : 'Phase Angle'}
                                </label>
                                 <div className="flex items-center">
                                    <input 
                                        type="number" 
                                        min="-180" 
                                        max="180" 
                                        step="1"
                                        value={currentComponent.phase}
                                        onChange={(e) => updateComponent('phase', parseFloat(e.target.value) || 0)}
                                        className={`w-12 text-xs text-white font-mono bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded focus:border-cyan-500 focus:outline-none`}
                                    />
                                    <span className="ml-1 text-xs text-slate-500">°</span>
                                </div>
                            </div>
                            <div className="relative w-full h-6 flex items-center">
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-0"></div>
                                <input 
                                    type="range" min="-180" max="180" step="1" 
                                    value={currentComponent.phase}
                                    onChange={(e) => updateComponent('phase', Number(e.target.value))}
                                    className={`w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer z-10 accent-white`}
                                />
                            </div>
                        </div>
                    )}
                    
                    {/* Keyphasor specific note */}
                    {isKeyphasor && (
                         <div className="text-[9px] text-slate-500 italic">
                             Keyphasor sets the T=0 trigger reference for the orbit dot.
                         </div>
                    )}
                </div>
             </div>
        </div>
      )}

      {/* Bottom Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 pointer-events-auto bg-black/50 px-3 py-1 rounded-full backdrop-blur">
        Mouse: Left Click Rotate • Right Click Pan • Scroll Zoom • Click Nodes to Edit • Click Background to Close
      </div>
    </div>
    
    {/* SETTINGS MODAL */}
    {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-sm flex flex-col">
                 <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <Settings className="text-slate-400 w-5 h-5" />
                        <h2 className="text-white font-bold text-sm uppercase">Global Settings</h2>
                    </div>
                    <button onClick={toggleSettings} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                 </div>
                 <div className="p-4 space-y-4">
                     {/* Machine Speed Input */}
                     <div className="space-y-2">
                         <label className="text-xs text-slate-400 uppercase font-bold">Machine Speed (RPM)</label>
                         <input 
                            type="number" 
                            value={machineRpm} 
                            onChange={(e) => setMachineRpm(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none"
                         />
                         <p className="text-[9px] text-slate-500">Calculates harmonic orders (e.g. 2x Line Freq)</p>
                     </div>
                     
                     {/* Line Frequency */}
                     <div className="space-y-2">
                         <label className="text-xs text-slate-400 uppercase font-bold">Line Frequency (Hz)</label>
                         <div className="flex gap-2">
                            {[50, 60].map(freq => (
                                <button 
                                    key={freq}
                                    onClick={() => setLineFreq(freq)}
                                    className={`flex-1 py-2 rounded text-xs font-bold border transition-colors ${
                                        lineFreq === freq 
                                        ? 'bg-cyan-600 border-cyan-500 text-white' 
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {freq} Hz
                                </button>
                            ))}
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    )}

    {/* SIGNAL CONFIGURATION MODAL (CUSTOM / AI) - ADAPTED FOR ORBIT */}
    {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <div className="bg-slate-900 border border-indigo-500/50 rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                 <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <Zap className="text-indigo-400 w-5 h-5" />
                        <h2 className="text-white font-bold text-sm uppercase">Signal Configuration</h2>
                    </div>
                    <button onClick={toggleUploadModal} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                 </div>
                 
                 {/* Tabs */}
                 <div className="flex border-b border-slate-700">
                     <button 
                        onClick={() => setCustomTab('manual')}
                        className={`flex-1 py-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 ${customTab === 'manual' ? 'text-white border-b-2 border-indigo-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                         <List className="w-3 h-3" /> Manual Input
                     </button>
                     <button 
                        onClick={() => setCustomTab('ai')}
                        className={`flex-1 py-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 ${customTab === 'ai' ? 'text-white border-b-2 border-indigo-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                         <Zap className="w-3 h-3" /> AI Analysis
                     </button>
                 </div>
                 
                 <div className="p-4 space-y-4 overflow-y-auto flex-1">
                     
                     {/* --- TAB: MANUAL INPUT --- */}
                     {customTab === 'manual' && (
                         <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                             {/* Fundamental */}
                             <div className="bg-slate-800 p-3 rounded border border-slate-700 space-y-3">
                                 <div className="text-xs font-bold text-cyan-400 uppercase flex items-center gap-2">
                                     <Activity className="w-3 h-3" /> Fundamental (1X)
                                 </div>
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <label className="text-[10px] text-slate-400 uppercase font-semibold">Amplitude ({unitLabel})</label>
                                         <input 
                                            type="number" step="0.1" 
                                            value={manualFund.amp} 
                                            onChange={e => setManualFund({...manualFund, amp: parseFloat(e.target.value) || 0})}
                                            className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs mt-1"
                                         />
                                     </div>
                                     {/* Show Phase Input in Manual Config only if ODS or Keyphasor */}
                                     {(showPhase) && (
                                        <div>
                                            <label className="text-[10px] text-slate-400 uppercase font-semibold">Phase (°)</label>
                                            <input 
                                                type="number" step="1" 
                                                value={manualFund.phase} 
                                                onChange={e => setManualFund({...manualFund, phase: parseFloat(e.target.value) || 0})}
                                                className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-white text-xs mt-1"
                                            />
                                        </div>
                                     )}
                                 </div>
                             </div>

                             {/* Harmonics List */}
                             <div className="space-y-2">
                                 <div className="flex items-center justify-between">
                                     <div className="text-xs font-bold text-yellow-500 uppercase flex items-center gap-2">
                                         <BarChart3 className="w-3 h-3" /> Additional Peaks
                                     </div>
                                     <button 
                                        onClick={addHarmonic}
                                        className="text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded flex items-center gap-1"
                                     >
                                         <Plus className="w-3 h-3" /> Add Peak
                                     </button>
                                 </div>
                                 
                                 <div className="bg-slate-800 rounded border border-slate-700 overflow-hidden">
                                     <div className="grid grid-cols-6 gap-2 p-2 bg-slate-900/50 border-b border-slate-700 text-[9px] text-slate-400 uppercase font-bold">
                                         <div className="col-span-2">Order (X)</div>
                                         <div className="col-span-3">Amplitude ({unitLabel})</div>
                                         <div className="col-span-1 text-center">Action</div>
                                     </div>
                                     {manualHarmonics.length === 0 ? (
                                         <div className="p-4 text-center text-xs text-slate-500 italic">No additional harmonics defined</div>
                                     ) : (
                                         <div className="max-h-40 overflow-y-auto">
                                            {manualHarmonics.map((h) => (
                                                <div key={h.id} className="grid grid-cols-6 gap-2 p-2 border-b border-slate-700/50 items-center hover:bg-slate-700/30">
                                                    <div className="col-span-2">
                                                        <input 
                                                            type="number" step="0.1"
                                                            value={h.order}
                                                            onChange={e => updateHarmonic(h.id, 'order', parseFloat(e.target.value) || 0)}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-xs text-white"
                                                        />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <input 
                                                            type="number" step="0.01"
                                                            value={h.amp}
                                                            onChange={e => updateHarmonic(h.id, 'amp', parseFloat(e.target.value) || 0)}
                                                            className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-xs text-white"
                                                        />
                                                    </div>
                                                    <div className="col-span-1 flex justify-center">
                                                        <button onClick={() => removeHarmonic(h.id)} className="text-red-400 hover:text-red-300">
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                         </div>
                                     )}
                                 </div>
                             </div>

                             <button 
                                onClick={applyManualSimulation}
                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg transition-colors flex items-center justify-center gap-2"
                             >
                                 <CheckCircle2 className="w-4 h-4" /> Simulate Manual Input
                             </button>
                         </div>
                     )}

                     {/* --- TAB: AI ANALYSIS (Preserved) --- */}
                     {customTab === 'ai' && (
                         <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                             {/* ... (Existing AI UI preserved) ... */}
                             {!selectedImage ? (
                                 <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-center gap-2 hover:bg-slate-800/50 transition-colors">
                                     <UploadCloud className="w-10 h-10 text-slate-500" />
                                     <p className="text-sm text-slate-300 font-medium">Upload Vibration Spectrum</p>
                                     <label className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-4 rounded cursor-pointer transition-colors">
                                         Browse Files
                                         <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                     </label>
                                 </div>
                             ) : (
                                 <div className="space-y-4">
                                     <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black aspect-video flex items-center justify-center">
                                         <img src={selectedImage} alt="Spectrum" className="max-h-full max-w-full object-contain" />
                                         <button onClick={() => { setSelectedImage(null); setAnalysisResult(null); }} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X className="w-4 h-4" /></button>
                                     </div>
                                     {!analysisResult && (
                                         <button onClick={analyzeSpectrum} disabled={analyzing} className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold">
                                            {analyzing ? 'Analyzing...' : 'Analyze with Gemini'}
                                         </button>
                                     )}
                                 </div>
                             )}
                             {analysisResult && (
                                 <div className="bg-slate-800/50 border border-slate-700 rounded p-4 space-y-3">
                                     <div className="grid grid-cols-2 gap-2 text-xs">
                                         <div className="text-slate-400">Amplitude:</div><div className="text-white font-mono">{analysisResult.amplitude}</div>
                                         <div className="text-slate-400">Phase:</div><div className="text-white font-mono">{analysisResult.phase}°</div>
                                     </div>
                                     <button onClick={applyAISimulation} className="w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded">Simulate</button>
                                 </div>
                             )}
                         </div>
                     )}
                 </div>
             </div>
        </div>
    )}
    </>
  );
};
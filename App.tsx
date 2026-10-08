import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Camera, Hand, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import * as mpHands from '@mediapipe/hands';
import * as cam from '@mediapipe/camera_utils';
import * as Kalidokit from 'kalidokit';
import { SceneContainer } from './components/HandScene';
import { analyzeHandGesture } from './services/geminiService';
import { Landmark } from './types';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // OPTIMIZATION: Use a Ref for the 3D scene to avoid Re-renders on every frame.
  // This drastically improves FPS.
  const landmarksRef = useRef<Landmark[] | null>(null);
  
  // State is ONLY used for UI visibility, not for the 60fps render loop
  const [isTracking, setIsTracking] = useState(false);
  const [geminiResponse, setGeminiResponse] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Kalidokit Solved Data
  const [solvedData, setSolvedData] = useState<any>(null);

  const onResults = useCallback((results: any) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lms = results.multiHandLandmarks[0];
      
      // Update the Ref directly for the 3D loop (High Performance)
      landmarksRef.current = lms;
      
      // Update UI state only if changed (Low Frequency)
      setIsTracking(prev => !prev ? true : prev);

      // --- KALIDOKIT INTEGRATION ---
      const videoElement = videoRef.current;
      if (videoElement) {
        const handSolver = Kalidokit.Hand || (Kalidokit as any).default?.Hand;
        if (handSolver) {
            const solved = handSolver.solve(lms, results.multiHandedness[0].label === 'Right' ? 'Right' : 'Left');
            
            // Debounce or limit solved data updates if it causes UI lag, 
            // but usually this is fine as it's just text.
            setSolvedData(solved);
        }
      }

    } else {
      landmarksRef.current = null;
      setIsTracking(prev => prev ? false : prev);
      setSolvedData(null);
    }
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const HandsConstructor = mpHands.Hands || (mpHands as any).default?.Hands;
    
    if (!HandsConstructor) {
        setError("Failed to load MediaPipe Hands module.");
        return;
    }

    const hands = new HandsConstructor({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);

    let camera: cam.Camera | null = null;
    
    if (videoElement) {
       const CameraConstructor = cam.Camera || (cam as any).default?.Camera;
       if (CameraConstructor) {
           camera = new CameraConstructor(videoElement, {
            onFrame: async () => {
              if (videoElement.videoWidth) {
                 await hands.send({ image: videoElement });
              }
            },
            width: 1280, // Higher res input for better tracking
            height: 720,
          });
          camera.start().catch(err => {
            setError("Camera access denied. Please check permissions.");
            console.error(err);
          });
       }
    }

    return () => {
      // Cleanup logic if needed
      hands.close();
    };
  }, [onResults]);

  const handleGeminiAnalysis = async () => {
    if (!videoRef.current || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setGeminiResponse(null);

    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoRef.current.videoWidth;
      tempCanvas.height = videoRef.current.videoHeight;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageBase64 = tempCanvas.toDataURL('image/jpeg', 0.8);
        
        const text = await analyzeHandGesture(imageBase64);
        setGeminiResponse(text);
      }
    } catch (e) {
      console.error(e);
      setGeminiResponse("Failed to analyze.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-neutral-900 text-white overflow-hidden font-sans">
      <video
        ref={videoRef}
        className="absolute top-0 left-0 opacity-0 pointer-events-none"
        style={{ width: 0, height: 0 }}
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Main 3D Viewport */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-gray-900 to-black">
        <Canvas 
            camera={{ position: [0, 0.5, 5.5], fov: 45 }} 
            dpr={[1, 2]} // Adapts pixel ratio for performance
            performance={{ min: 0.5 }} // Allows degrading quality for FPS
            shadows
        >
           {/* Pass the Ref, not the State, to avoid React renders */}
           <SceneContainer landmarksRef={landmarksRef} />
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none p-6 flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex justify-between items-start">
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 pointer-events-auto max-w-md shadow-lg">
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center gap-2">
                <Hand className="w-6 h-6 text-cyan-400" />
                Gemini Voxel Hand
              </h1>
              <p className="text-gray-400 text-xs mt-1">
                High-Performance Volumetric Tracking
              </p>
              
              <div className="mt-3 flex items-center gap-2 text-xs font-mono">
                <div className={`w-2 h-2 rounded-full ${isTracking ? 'bg-cyan-500 animate-pulse shadow-[0_0_10px_#06b6d4]' : 'bg-red-500'}`} />
                {isTracking ? "SYSTEM ONLINE" : "SEARCHING..."}
              </div>

              {error && (
                <div className="mt-2 text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </div>
              )}
            </div>

            {solvedData && (
              <div className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 text-xs font-mono text-cyan-200 pointer-events-auto shadow-lg">
                <div className="opacity-70">Confidence</div>
                <div className="text-lg font-bold">{(solvedData.score || 0).toFixed(2)}</div>
              </div>
            )}
        </div>

        {/* Footer / Controls */}
        <div className="flex flex-col items-center justify-end pb-8 gap-4 pointer-events-auto">
          
          {geminiResponse && (
             <div className="mb-4 bg-white/10 backdrop-blur-xl border border-white/20 p-5 rounded-2xl max-w-lg shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-2 mb-2 text-cyan-300 font-bold text-sm tracking-wide uppercase">
                   <Sparkles size={14} /> Gemini Analysis
                </div>
                <p className="text-sm leading-relaxed text-white/90">
                  {geminiResponse}
                </p>
             </div>
          )}

          <button
            onClick={handleGeminiAnalysis}
            disabled={!isTracking || isAnalyzing}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg transition-all duration-300
              ${!isTracking 
                ? 'bg-gray-800/80 text-gray-500 cursor-not-allowed border border-white/5' 
                : 'bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-100 border border-cyan-500/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95 backdrop-blur-md'
              }
            `}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="animate-spin w-5 h-5" />
                Processing...
              </>
            ) : (
              <>
                <Camera className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                Analyze Gesture
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
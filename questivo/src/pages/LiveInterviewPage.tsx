import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import {
    Mic, MicOff, PhoneOff, Loader2, Sparkles, Target,
    Upload, FileText, Briefcase, X, CheckCircle2, Clock
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface FileState {
    file: File;
    name: string;
    size: string;
    progress: number;
    status: 'uploading' | 'success' | 'error';
}

type EngineState = 'IDLE' | 'LISTENING' | 'PARTIAL_TRANSCRIBING' | 'FINAL_TRANSCRIBING' | 'THINKING' | 'GENERATING_VOICE' | 'PLAYING' | 'ERROR';

const INITIAL_ROLES = ['Software Engineer Intern', 'Backend Developer', 'Frontend Developer', 'ML Engineer', 'Data Scientist', 'Full Stack Developer', 'Product Manager'];
const EXPERIENCE_LEVELS = ['Student', 'Intern', 'Fresher', '1–3 Years', '3–5 Years', 'Senior'];

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const LiveInterviewPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();

    // 🔒 AUTHENTICATION MAPPING SECURITY CHECK MATRIX VALUES
    const [authChecked, setAuthChecked] = useState<boolean>(false);

    const [engineState, setEngineState] = useState<EngineState>('IDLE');
    const [statusText, setStatusText] = useState('Awaiting form configurations setup matching parameters...');
    const [interimText, setInterimText] = useState("");
    const [chatLog, setChatLog] = useState<{ sender: 'ai' | 'candidate'; text: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInterviewStarted, setIsInterviewStarted] = useState(false);

    const [role, setRole] = useState('');
    const [experience, setExperience] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [interviewDuration, setInterviewDuration] = useState<number>(15); 
    const [timeRemaining, setTimeRemaining] = useState<number>(900); 

    const [fileState, setFileState] = useState<FileState | null>(null);
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [isSubmittingForm, setIsSubmittingForm] = useState(false);

    const socketRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const vadRef = useRef<any>(null);
    const speechRecognitionRef = useRef<any>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // 🛡️ CRITICAL MATRIX SECURE LAYER RULE: VALIDATE SESSIONS HOOK ON LOAD
    useEffect(() => {
        const verifyAuthenticationSessionToken = async () => {
            try {
                const res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
                if (!res.ok) throw new Error("Verification context handshake rejected.");
                setAuthChecked(true);
            } catch (err) {
                console.error("❌ Unauthorized access profile frame detected. Evicting path.");
                navigate("/signin");
            }
        };
        verifyAuthenticationSessionToken();
    }, [navigate]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatLog, interimText]);

    useEffect(() => {
        if (!isInterviewStarted) return;
        const clockInterval = setInterval(() => {
            setTimeRemaining((prevTime) => {
                if (prevTime <= 1) {
                    clearInterval(clockInterval);
                    handleTerminateSession();
                    return 0;
                }
                const updatedTime = prevTime - 1;
                if (socketRef.current?.connected) {
                    socketRef.current.emit('interview-timer-sync', { timeRemaining: updatedTime });
                }
                return updatedTime;
            });
        }, 1000);
        return () => clearInterval(clockInterval);
    }, [isInterviewStarted]);

    const formatTimeMetric = (secondsTotal: number) => {
        const mins = Math.floor(secondsTotal / 60);
        const secs = secondsTotal % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Native Web Speech Engine Configuration Loop
    useEffect(() => {
        if (!authChecked) return; // Prevent hardware instantiation if handshake is unverified
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            let runningInterimBuffer = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (!event.results[i].isFinal) {
                    runningInterimBuffer += event.results[i][0].transcript;
                }
            }
            if (runningInterimBuffer.trim()) {
                setEngineState('PARTIAL_TRANSCRIBING');
                setStatusText("Streaming localized vector tracks...");
                setInterimText(runningInterimBuffer);
            }
        };

        speechRecognitionRef.current = recognition;
        return () => { try { recognition.abort(); } catch {} };
    }, [authChecked]);

    // VAD Engine Initialization Layer
    useEffect(() => {
        if (!authChecked) return;
        const initializeVAD = async () => {
            try {
                const vadGlobal = (window as any).vad;
                const ortGlobal = (window as any).ort;
                if (!vadGlobal || !ortGlobal) return;

                ortGlobal.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/";

                vadRef.current = await vadGlobal.MicVAD.new({
                    modelURL: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/silero_vad.onnx",
                    workletURL: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.19/dist/vad.worklet.bundle.min.js",
                    onSpeechStart: () => {
                        setEngineState('FINAL_TRANSCRIBING');
                        setStatusText("Capturing user metrics...");
                    },
                    onSpeechEnd: (audio: Float32Array) => {
                        setEngineState('THINKING');
                        setStatusText("Processing transcription matrix...");
                        if (socketRef.current?.connected) {
                            socketRef.current.emit("candidate-voice-stream", audio);
                        }
                        setInterimText("");
                        try { speechRecognitionRef.current?.stop(); } catch {}
                    },
                });
            } catch (e) {
                console.error("❌ VAD Core Execution Failed:", e);
                setEngineState('ERROR');
            }
        };
        initializeVAD();
        return () => { if (vadRef.current) vadRef.current.pause(); };
    }, [authChecked]);

    useEffect(() => {
        if (!authChecked || !sessionId || sessionId.startsWith("session-")) {
            setLoading(false);
            return;
        }
        const fetchSessionData = async () => {
            try {
                const res = await axios.get(`${API}/api/interview/session/${sessionId}`, { withCredentials: true });
                if (res.data?.data) {
                    const data = res.data.data;
                    setRole(data.targetRole || '');
                    setExperience(data.experienceLevel || '');
                    setJobDescription(data.jobDescription || '');
                    if (data.durationMinutes) setInterviewDuration(data.durationMinutes);
                }
            } catch (err) {
                console.log("Setup baseline profile error tracing.");
            } finally {
                setLoading(false);
            }
        };
        fetchSessionData();
    }, [sessionId, authChecked]);

    const transitionToListening = async () => {
        try {
            setEngineState('LISTENING');
            setStatusText("Listening...");
            setInterimText("");
            if (vadRef.current) await vadRef.current.start();
            if (speechRecognitionRef.current) {
                try { speechRecognitionRef.current.start(); } catch {}
            }
        } catch (err) {
            console.error(err);
        }
    };

    const transitionToSilent = async () => {
        try {
            if (vadRef.current) await vadRef.current.pause();
            if (speechRecognitionRef.current) {
                try { speechRecognitionRef.current.stop(); } catch {}
            }
            setInterimText("");
        } catch (err) {}
    };

    const executeLocalFallbackSpeech = async (textToSpeak: string) => {
        console.warn("🚀 [Fallback Execution] Initializing local system hardware speech synthesizer.");
        await transitionToSilent();
        setEngineState('PLAYING');
        setStatusText("AI Agent delivering speech vectors...");

        const synthesisInstance = window.speechSynthesis;
        if (!synthesisInstance) {
            await transitionToListening();
            return;
        }

        synthesisInstance.cancel(); 
        const vocalUtterance = new SpeechSynthesisUtterance(textToSpeak);
        
        const machineVoices = synthesisInstance.getVoices();
        const targetedVoiceMatch = machineVoices.find(v => v.lang.startsWith('en-US') && v.name.includes('Natural')) || machineVoices[0];
        if (targetedVoiceMatch) vocalUtterance.voice = targetedVoiceMatch;

        vocalUtterance.rate = 1.0;
        vocalUtterance.onend = async () => {
            await transitionToListening();
        };
        vocalUtterance.onerror = async () => {
            await transitionToListening();
        };

        synthesisInstance.speak(vocalUtterance);
    };

    const handleFileProcess = (file: File) => {
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
            toast.error('Invalid payload signature formatting format.');
            return;
        }
        setFileState({ file, name: file.name, size: parseFloat((file.size / (1024 * 1024)).toFixed(2)) + ' MB', progress: 100, status: 'success' });
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setIsDragActive(true);
        else if (e.type === 'dragleave') setIsDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileProcess(e.dataTransfer.files[0]);
    };

    const handleStartInterviewFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!role || !experience || !fileState) {
            toast.error("Please configure matching criteria settings parameters.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
        } catch {
            toast.error("Microphone Blocked! Click the 🔒 Lock icon in your address bar, allow permissions, and reload.");
            return;
        }

        setIsSubmittingForm(true);
        setEngineState('IDLE');
        setStatusText("Deploying structural interfaces...");
        const loadingToastId = toast.loading("Deploying pipeline profiles matrix...");
        setTimeRemaining(interviewDuration * 60);

        try {
            const uploadPayload = new FormData();
            uploadPayload.append("resume", fileState.file);
            uploadPayload.append("role", role);
            uploadPayload.append("experience", experience);
            uploadPayload.append("jobDescription", jobDescription);
            uploadPayload.append("durationMinutes", interviewDuration.toString());
            uploadPayload.append("sessionId", sessionId || "");

            const response = await axios.post(`${API}/api/interview/initialize`, uploadPayload, {
                headers: { "Content-Type": "multipart/form-data" },
                withCredentials: true,
            });

            toast.dismiss(loadingToastId);
            const targetSessionId = response.data?.sessionId || sessionId;

            socketRef.current = io(API, {
                transports: ['websocket'],
                upgrade: false,
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 2000
            });

            socketRef.current.on("connect", () => {
                socketRef.current.emit("join-interview-session", targetSessionId);
            });

            socketRef.current.on("engine-status-sync", (data: { state: EngineState, text: string }) => {
                if (data.state) setEngineState(data.state);
                if (data.text) setStatusText(data.text);
            });

            socketRef.current.on("candidate-transcript-final", (data: { sender?: string, text: string }) => {
                setChatLog((prev) => [...prev, { sender: data.sender === 'ai' ? 'ai' : 'candidate', text: data.text }]);
                setInterimText("");
            });

            socketRef.current.on("ai-speech-failover", async (data: { text: string }) => {
                await executeLocalFallbackSpeech(data.text);
            });

            socketRef.current.on("ai-speech-packet", async (audioBufferArray: ArrayBuffer) => {
                try {
                    setEngineState('PLAYING');
                    setStatusText("AI Agent delivering speech vectors...");
                    await transitionToSilent();

                    if (!audioContextRef.current) {
                        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                    }
                    const ctx = audioContextRef.current;
                    if (ctx.state === "suspended") await ctx.resume();

                    const buffer = await ctx.decodeAudioData(audioBufferArray);
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(ctx.destination);
                    currentAudioSourceRef.current = source;

                    source.onended = async () => {
                        currentAudioSourceRef.current = null;
                        await transitionToListening();
                    };

                    source.start(0);
                } catch (err) {
                    console.error("Audio decoding fault. Triggering priority failover stack link:", err);
                    const lastLogEntry = chatLog[chatLog.length - 1];
                    if (lastLogEntry && lastLogEntry.sender === 'ai') {
                        await executeLocalFallbackSpeech(lastLogEntry.text);
                    } else {
                        await transitionToListening();
                    }
                }
            });

            setIsInterviewStarted(true);
            toast.success("Interview session initialized!");
        } catch (err: any) {
            toast.dismiss(loadingToastId);
            setEngineState('ERROR');
            toast.error(err?.response?.data?.error || "Handshake context drop configuration exception.");
        } finally {
            setIsSubmittingForm(false);
        }
    };

    const handleTerminateSession = async () => {
        await transitionToSilent();
        try { currentAudioSourceRef.current?.stop(); } catch {}
        try { window.speechSynthesis.cancel(); } catch {}
        if (socketRef.current) socketRef.current.disconnect();
        if (audioContextRef.current) audioContextRef.current.close();
        navigate(`/interviews/${sessionId}/report`);
    };

    const isFormValid = fileState?.status === 'success' && role !== '' && experience !== '';

    // 🔄 RENDERS THE AUTHENTICATION MATRIX MOCK SPLASH TO REPLICATE VERIFICATION LOOPS
    if (!authChecked || loading) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
            <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
            <p className="text-slate-400 text-sm font-medium tracking-wide">Authenticating Stream Token Matrix...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-blue-500" /> Questivo Live Interview Studio
                    </h1>
                </div>
                {isInterviewStarted && (
                    <div className="flex items-center gap-6">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-sm font-bold transition-all duration-300 ${timeRemaining <= 30 ? 'bg-red-950/40 border-red-500 text-red-400 animate-pulse scale-105' : 'bg-slate-900 border-slate-800 text-slate-200'}`}>
                            <Clock className={`w-4 h-4 ${timeRemaining <= 30 ? 'text-red-400' : 'text-blue-400'}`} />
                            <span>{formatTimeMetric(timeRemaining)}</span>
                        </div>
                        <button onClick={handleTerminateSession} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 text-white">
                            <PhoneOff size={15} /> Terminate Round
                        </button>
                    </div>
                )}
            </div>

            {!isInterviewStarted ? (
                <div className="flex-1 flex items-center justify-center py-6">
                    <form onSubmit={handleStartInterviewFormSubmit} className="w-full max-w-2xl bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl space-y-5 animate-in zoom-in-95 duration-200">
                        <div className="border-b border-slate-800 pb-4 mb-2">
                             <h2 className="text-lg font-bold text-white mt-1">Pre-Interview Matrix Verification Blueprint</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Target Profile Role *</label>
                                <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-medium">
                                    <option value="" disabled>Select target routing parameters...</option>
                                    {INITIAL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Seniority Level *</label>
                                <select value={experience} onChange={(e) => setExperience(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-medium">
                                    <option value="" disabled>Select metrics tier status...</option>
                                    {EXPERIENCE_LEVELS.map(el => <option key={el} value={el}>{el}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Allocated Interview Duration Limit *</label>
                            <select value={interviewDuration} onChange={(e) => setInterviewDuration(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-medium">
                                <option value={5}>5 Minutes (Quick System Diagnostics Testing)</option>
                                <option value={10}>10 Minutes (Standard Technical Screening Sprint)</option>
                                <option value={15}>15 Minutes (Default Advanced Engineering Review)</option>
                                <option value={30}>30 Minutes (Comprehensive Architectural Deep Evaluation)</option>
                            </select>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Resume Ingestion Core System *</label>
                            {!fileState ? (
                                <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`relative group border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[140px] ${isDragActive ? 'border-blue-500 bg-blue-950/40' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}>
                                    <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx" onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])} />
                                    <Upload className="w-6 h-6 text-slate-500 group-hover:scale-105 transition-transform" />
                                    <p className="mt-3 text-xs font-medium text-slate-400">Drag/Drop schema streams data blocks, or <span className="text-blue-500 underline font-semibold">browse transient file systems</span></p>
                                </div>
                            ) : (
                                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4 shadow-inner">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-blue-400 flex-shrink-0"><FileText className="w-5 h-5" /></div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-slate-200 truncate">{fileState.name}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setFileState(null)} className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg border-0 bg-transparent transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Job Specifications (Optional)</label>
                            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste corporate profile requirements details trackers here..." className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 focus:outline-none focus:border-blue-500 resize-none leading-relaxed" />
                        </div>
                        
                        <button type="submit" disabled={!isFormValid || isSubmittingForm} className={`w-full py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 border-0 shadow-lg cursor-pointer ${isFormValid && !isSubmittingForm ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/10' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                            {isSubmittingForm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                            <span>Fire Core Agent Intelligence Ingestion Layer Modules</span>
                        </button>
                    </form>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6 flex-1 items-stretch animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[300px]">
                        <div className={`w-24 h-24 rounded-full bg-slate-800 border-2 flex items-center justify-center shadow-lg mb-4 transition-all duration-300 ${engineState === 'LISTENING' || engineState === 'PARTIAL_TRANSCRIBING' ? 'border-green-500 shadow-green-500/20 scale-105' : engineState === 'THINKING' ? 'border-amber-500 shadow-amber-500/20 animate-pulse' : engineState === 'GENERATING_VOICE' ? 'border-indigo-500 shadow-indigo-500/20 animate-spin duration-1000' : engineState === 'PLAYING' ? 'border-cyan-500 shadow-cyan-500/20 scale-110 border-dashed' : 'border-blue-500 shadow-blue-500/20'}`}>
                            <span className="text-xl font-bold tracking-wider text-blue-400 uppercase">IQ</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800">
                            {(engineState === 'LISTENING' || engineState === 'PARTIAL_TRANSCRIBING' || engineState === 'FINAL_TRANSCRIBING') ? <Mic className="text-green-400 animate-pulse" size={16} /> : <MicOff className="text-red-400" size={16} />}
                            <span className="text-xs font-mono font-medium">{(engineState === 'LISTENING' || engineState === 'PARTIAL_TRANSCRIBING' || engineState === 'FINAL_TRANSCRIBING') ? "MIC ACTIVE" : "MIC MUTED"}</span>
                        </div>
                    </div>
                    
                    <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-full min-h-[400px]">
                        <span className="text-xs font-bold text-slate-400 tracking-wider uppercase border-b border-slate-800 pb-2 mb-3 block">Live Execution Stream Log</span>
                        
                        <div className="space-y-4 overflow-y-auto flex-1 max-h-[450px] pr-2 scrollbar-thin flex flex-col">
                            {chatLog.map((log, i) => (
                                <div key={i} className={`p-4 rounded-xl text-xs max-w-[85%] break-words whitespace-pre-wrap shadow-md ${log.sender === 'ai' ? 'bg-blue-950/50 border border-blue-900/60 text-blue-100 self-start' : 'bg-slate-800 border border-slate-700 text-slate-200 ml-auto'}`}>
                                    <span className="font-bold block mb-1 text-[10px] tracking-wide uppercase text-slate-400">{log.sender === 'ai' ? 'AI Interviewer' : 'You'}</span>
                                    <p className="leading-relaxed text-slate-300">{log.text}</p>
                                </div>
                            ))}
                            {(engineState === 'PARTIAL_TRANSCRIBING' || interimText) && (
                                <div className="p-4 rounded-xl text-xs bg-slate-800/40 border border-slate-700/40 text-slate-400 italic ml-auto max-w-[85%] border-dashed animate-pulse">
                                    <span className="font-bold block mb-1 text-[10px] tracking-wide uppercase text-slate-500">You (Real-time Stream Matrix)...</span>
                                    <p className="leading-relaxed">{interimText || "Typing tokens detected..."}</p>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                        
                        <div className="mt-4 bg-slate-950 border border-slate-800 px-4 py-3 rounded-lg flex items-center gap-3 flex-shrink-0">
                            <span className={`w-2.5 h-2.5 rounded-full bg-blue-500 ${engineState !== 'IDLE' ? 'animate-ping' : ''}`} />
                            <span className="text-xs font-mono text-slate-400 tracking-wide uppercase">Core System Connection Matrix: <span className="text-white font-bold">{statusText}</span></span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
import React, { useState, useRef, useEffect } from 'react';
import {
    FileText, Upload, X, Building2, 
    Sparkles, AlertCircle, CheckCircle2, Loader2, Target, BarChart3, Cpu, Layers, Zap,
    Lightbulb, ListPlus, CheckSquare, 
    Building, Award, Compass, Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';

// --- Global Environment Setup Map ---
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// --- Core Interfaces Definitions ---
interface FileState {
    file: File;
    name: string;
    size: string;
    progress: number;
    status: 'uploading' | 'success' | 'error';
}

interface TargetConfig {
    company: string;
    role: string;
    experience: string;
    jobDescription: string;
}

interface AnalysisResult {
    overallScore: number;
    fileName: string; // Moved to top-level for consistent access
    interviewProbability: number;
    finalVerdict: 'Poor' | 'Average' | 'Strong' | 'Outstanding';
    
    // Core structural blocks
    sections: {
        contactPresent: boolean;
        educationPresent: boolean;
        experiencePresent: boolean;
        projectsPresent: boolean;
        skillsPresent: boolean;
        achievementsPresent: boolean;
        certificationsPresent: boolean;
        summaryPresent: boolean;
    };
    
    // Flattened & structured suggestions object
    suggestions: {
        bulletRewrites: string[];
        projectImprovements: string[];
        metricAdditions: string[];
        resumeOptimization: string;
    };

    skillAnalysis: {
        requiredSkillsFound: string[];
        presentSkillsMatched: string[];
        missingSkillsCrucial: string[];
        redundantSkillsOrFiller: string[];
        skillLevelsDistribution: { skill: string; level: 'Beginner' | 'Intermediate' | 'Advanced' }[];
    };
    roleAlignment: {
        roleFitScore: number;
        companyFitScore: number;
        domainMatchDetails: string;
        techStackAlignmentDetails: string;
        internFresherFitEvaluation: string;
    };
    projectEvaluation: {
        title: string;
        complexityScore: number;
        businessImpactScore: number;
        technicalDepthScore: number;
        productionReadinessScore: number;
        quantificationPresence: boolean;
        critiqueNote: string;
    }[];
    experienceEvaluation: {
        leadershipSignals: string[];
        internshipQuality: string;
        openSourceContributions: string;
        ownershipIndicators: string[];
        initiativeExamples: string[];
        overallImpactSummary: string;
    };
    keywordAnalysis: {
        extractedAtsKeywords: string[];
        missingCrucialKeywords: string[];
        keywordDensityPercentage: number;
        placementOptimizationScore: number;
        recruiterSearchabilityRating: string;
    };
    formatting: {
        lengthCompliance: string;
        spacingIntegrity: string;
        sectionOrderingVerification: string;
        bulletQualityMetric: number;
        atsCompatibilityFlags: string[];
        tableUsageCritique: string;
        iconsUsageCritique: string;
        fontsAndHeadersEvaluation: string;
    };
    readability: {
        clarityIndexScore: number;
        actionVerbDensity: number;
        sentenceQualityEvaluation: string;
        scanningSpeedSeconds: number;
    };
    companySimulation: {
        googleRecruiter: { wouldInterview: 'YES' | 'NO'; reason: string };
        metaRecruiter: { wouldInterview: 'YES' | 'NO'; reason: string };
        amazonRecruiter: { wouldInterview: 'YES' | 'NO'; reason: string };
    };
    strengths: string[];
    weaknesses: string[];
    improvements: {
        quickFixes: string[];
        highImpactChanges: string[];
        skillRecommendations: string[];
        projectRecommendations: string[];
    };
    rewrittenBullets: {
        original: string;
        improved: string;
    }[];
    lintChecks?: any;
}

const INITIAL_COMPANIES = ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple', 'Netflix', 'Generic'];
const INITIAL_ROLES = ['Software Engineer Intern', 'Backend Developer', 'Frontend Developer', 'ML Engineer', 'Data Scientist', 'Full Stack Developer', 'Product Manager'];
const EXPERIENCE_LEVELS = ['Student', 'Intern', 'Fresher', '1–3 Years', '3–5 Years', 'Senior'];

const LOADING_STEPS = [
    'Extracting complete resume string layout buffers...',
    'Parsing granular structural categories (Skills, Experience, Projects)...',
    'Executing deterministic scoring calculation layer loops...',
    'Simulating tier-1 recruiter persona tracking analysis loops...',
    'Compiling holistic rewrite suggestions engine output payload...'
];

export default function ResumeATSPage() {
    // --- Form Functional State Registry ---
    const [fileState, setFileState] = useState<FileState | null>(null);
    const [config, setConfig] = useState<TargetConfig>({ company: 'Generic', role: '', experience: '', jobDescription: '' });
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [loadingStepIdx, setLoadingStepIdx] = useState<number>(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Dynamic Lists Hooks to allow run-time extension insertions
    const [companies, setCompanies] = useState<string[]>(INITIAL_COMPANIES);
    const [roles, setRoles] = useState<string[]>(INITIAL_ROLES);

    // Dynamic Custom Input Toggles State Layer
    const [customCompanyInput, setCustomCompanyInput] = useState<string>('');
    const [customRoleInput, setCustomRoleInput] = useState<string>('');
    const [showCustomCompanyBox, setShowCustomCompanyBox] = useState<boolean>(false);
    const [showCustomRoleBox, setShowCustomRoleBox] = useState<boolean>(false);

    // --- Analytics Receiver Matrix States ---
    const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'alignment' | 'projects' | 'keywords' | 'formatting' | 'simulation' | 'rewrites'>('overview');

    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const navigate = useNavigate();
    // AUTH GUARD
    useEffect(() => {
        const verifyUser = async () => {
            try {
                // Apne auth check endpoint ka use karein
                await axios.get(`${API_BASE_URL}/api/auth/me`, { withCredentials: true });
                setIsCheckingAuth(false);
            } catch (err) {
                toast.error("Please login to access ATS Analyzer");
                navigate("/signup");
            }
        };
        verifyUser();
    }, [navigate]);

   

    useEffect(() => {
        return () => {
            if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        };
    }, [filePreviewUrl]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isAnalyzing) {
            interval = setInterval(() => {
                setLoadingStepIdx((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
            }, 1600);
        } else {
            setLoadingStepIdx(0);
        }
        return () => clearInterval(interval);
    }, [isAnalyzing]);

    const addNewCompanyNode = () => {
        const value = customCompanyInput.trim();
        if (value && !companies.includes(value)) {
            setCompanies([...companies, value]);
            setConfig(prev => ({ ...prev, company: value }));
            setCustomCompanyInput('');
            setShowCustomCompanyBox(false);
        }
    };

    const addNewRoleNode = () => {
        const value = customRoleInput.trim();
        if (value && !roles.includes(value)) {
            setRoles([...roles, value]);
            setConfig(prev => ({ ...prev, role: value }));
            setCustomRoleInput('');
            setShowCustomRoleBox(false);
        }
    };

    const handleFileProcess = (file: File) => {
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
            alert('Invalid document payload format. Ingest high-resolution PDF mappings.');
            return;
        }

        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(URL.createObjectURL(file));

        setFileState({
            file,
            name: file.name,
            size: parseFloat((file.size / (1024 * 1024)).toFixed(2)) + ' MB',
            progress: 100,
            status: 'success'
        });
        setErrorMessage(null);
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

    const handleAnalyze = async () => {
        if (!fileState || fileState.status !== 'success' || !config.role || !config.experience) return;

        setIsAnalyzing(true);
        setErrorMessage(null);
        setAnalysisData(null);

        const formData = new FormData();
        formData.append('resume', fileState.file);
        formData.append('company', config.company);
        formData.append('role', config.role);
        formData.append('experience', config.experience);
        formData.append('jobDescription', config.jobDescription);

        try {
            const response = await fetch(`${API_BASE_URL}/api/resume/analyze`, {
                method: 'POST',
                body: formData,
            });

            const jsonResult = await response.json();

            if (!response.ok) {
                throw new Error(jsonResult.error || 'The system compilation pipeline failed to validate data tokens.');
            }

            const payloadData = jsonResult.data;
            const normalizedResult: AnalysisResult = {
                ...payloadData,
                sections: payloadData.sections || payloadData.lintChecks?.sections || {},
                skillAnalysis: payloadData.skillAnalysis || payloadData.lintChecks?.skillAnalysis || {},
                roleAlignment: payloadData.roleAlignment || payloadData.lintChecks?.roleAlignment || {},
                projectEvaluation: payloadData.projectEvaluation || payloadData.lintChecks?.projectEvaluation || [],
                experienceEvaluation: payloadData.experienceEvaluation || payloadData.lintChecks?.experienceEvaluation || {},
                keywordAnalysis: payloadData.keywordAnalysis || payloadData.lintChecks?.keywordAnalysis || {},
                formatting: payloadData.formatting || payloadData.lintChecks?.formatting || {},
                readability: payloadData.readability || payloadData.lintChecks?.readability || {},
                companySimulation: payloadData.companySimulation || payloadData.lintChecks?.companySimulation || {},
                improvements: payloadData.improvements || payloadData.lintChecks?.improvements || {},
                rewrittenBullets: payloadData.rewrittenBullets || payloadData.lintChecks?.rewrittenBullets || [],
                interviewProbability: payloadData.interviewProbability || payloadData.lintChecks?.interviewProbability || 50,
                finalVerdict: payloadData.finalVerdict || payloadData.lintChecks?.finalVerdict || 'Strong'
            };

            setAnalysisData(normalizedResult);
            setActiveTab('overview');
            setIsAnalyzing(false);
        } catch (err: any) {
            console.error('[Frontend Ingestion Pipeline Crash]:', err);
            setErrorMessage(err.message || 'The backend gateway interface timed out during the orchestration sequence.');
            setIsAnalyzing(false);
        }
    };

    const isFormValid = fileState?.status === 'success' && config.role !== '' && config.experience !== '';
    
     if (isCheckingAuth) {
        return <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] text-white"><Loader2 className="animate-spin w-8 h-8" /></div>;
    }
    return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-800 antialiased selection:bg-blue-500/10 selection:text-blue-900">
            <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

            <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

                {!analysisData ? (
                    <div className="max-w-[1440px] mx-auto space-y-8 bg-white border border-slate-200 p-8 rounded-3xl shadow-sm mt-6">
                        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
                            <div>
                                <div className="flex items-center gap-2 text-blue-600 font-semibold text-xs uppercase tracking-widest mb-1.5">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>AI Diagnostics Architecture</span>
                                </div>
                                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                                    Resume ATS Analysis
                                </h1>
                                <p className="text-sm text-slate-500 mt-1">
                                    Connected Node Gateway Pipeline: <span className="text-blue-600 font-mono text-xs">{API_BASE_URL}</span>
                                </p>
                            </div>
                        </header>

                        {errorMessage && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-sm text-rose-800 animate-in fade-in-50">
                                <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                                <div><span className="font-semibold">Pipeline Execution Blocked:</span> {errorMessage}</div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            <div className="lg:col-span-7 space-y-6">

                                {/* File Upload Area */}
                                <section className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 shadow-sm transition-all duration-300">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><Upload className="w-5 h-5" /></div>
                                        <div>
                                            <h2 className="text-base font-bold text-slate-900">Resume Ingestion System</h2>
                                            <p className="text-xs text-slate-500">Upload your explicit document matrix structure (PDF/DOCX format)</p>
                                        </div>
                                    </div>

                                    {!fileState ? (
                                        <div
                                            onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`relative group border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[190px] ${isDragActive ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                        >
                                            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx" onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])} />
                                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl group-hover:scale-105 transition-transform"><FileText className="w-7 h-7 text-slate-400" /></div>
                                            <p className="mt-4 text-sm font-medium text-slate-700">Drag and drop file data here, or <span className="text-blue-600 underline font-semibold">browse local buffers</span></p>
                                        </div>
                                    ) : (
                                        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
                                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-blue-600 flex-shrink-0"><FileText className="w-6 h-6" /></div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-slate-800 truncate pr-2">{fileState.name}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-xs text-slate-500 font-mono">{fileState.size}</span>
                                                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Payload Validated</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setFileState(null)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg border border-transparent transition-colors"><X className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                </section>

                                {/* Configurations Targets Setup */}
                                <section className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><Target className="w-5 h-5" /></div>
                                        <div>
                                            <h2 className="text-base font-bold text-slate-900">Target Corporate Matrix</h2>
                                            <p className="text-xs text-slate-500">Map evaluation variables dynamically against corporate specifications</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                        {/* Dynamic Company Selection Module */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center"><label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Target Company</label>
                                                <button type="button" onClick={() => setShowCustomCompanyBox(!showCustomCompanyBox)} className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-0.5"><Plus className="w-2.5 h-2.5" /> Custom</button>
                                            </div>
                                            {showCustomCompanyBox ? (
                                                <div className="flex gap-1.5 animate-in slide-in-from-top-1 duration-150">
                                                    <input type="text" placeholder="Add Company..." value={customCompanyInput} onChange={(e) => setCustomCompanyInput(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500" />
                                                    <button type="button" onClick={addNewCompanyNode} className="p-2 bg-blue-600 rounded-xl hover:bg-blue-500 text-white shadow-sm"><CheckSquare className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <select value={config.company} onChange={(e) => setConfig({ ...config, company: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 appearance-none font-medium shadow-sm">
                                                    {companies.map(c => <option key={c} value={c} className="text-slate-700">{c}</option>)}
                                                </select>
                                            )}
                                        </div>

                                        {/* Dynamic Role Selection Module */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center"><label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Target Role *</label>
                                                <button type="button" onClick={() => setShowCustomRoleBox(!showCustomRoleBox)} className="text-[11px] text-blue-600 hover:underline font-semibold flex items-center gap-0.5"><Plus className="w-2.5 h-2.5" /> Custom</button>
                                            </div>
                                            {showCustomRoleBox ? (
                                                <div className="flex gap-1.5 animate-in slide-in-from-top-1 duration-150">
                                                    <input type="text" placeholder="Add Role..." value={customRoleInput} onChange={(e) => setCustomRoleInput(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500" />
                                                    <button type="button" onClick={addNewRoleNode} className="p-2 bg-blue-600 rounded-xl hover:bg-blue-500 text-white shadow-sm"><CheckSquare className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <select value={config.role} onChange={(e) => setConfig({ ...config, role: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 font-medium shadow-sm">
                                                    <option value="" disabled className="text-slate-400">Select target path...</option>
                                                    {roles.map(r => <option key={r} value={r} className="text-slate-700">{r}</option>)}
                                                </select>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Seniority Tier *</label>
                                            <select value={config.experience} onChange={(e) => setConfig({ ...config, experience: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 font-medium shadow-sm">
                                                <option value="" disabled className="text-slate-400">Select tier status...</option>
                                                {EXPERIENCE_LEVELS.map(el => <option key={el} value={el} className="text-slate-700">{el}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Enterprise Job Post Description Markdown Context</label>
                                        <textarea value={config.jobDescription} onChange={(e) => setConfig({ ...config, jobDescription: e.target.value })} placeholder="Paste context tokens or the full markdown job context here..." className="w-full h-36 bg-white border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm resize-none leading-relaxed" />
                                    </div>
                                </section>

                                <div className="bg-slate-100/60 border border-slate-200 p-4 rounded-xl flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2.5 text-slate-500 text-xs"><AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0" /><span>Consumes 1 platform optimization script credit from system balance parameters.</span></div>
                                    <button type="button" disabled={!isFormValid || isAnalyzing} onClick={handleAnalyze} className={`px-6 py-2.5 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all duration-200 flex items-center gap-2 active:scale-98 shadow-sm ${isFormValid && !isAnalyzing ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                                        {isAnalyzing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        <span>Analyze Resume Profile</span>
                                    </button>
                                </div>
                            </div>

                            {/* Loader Sidebar Animation */}
                            <div className="lg:col-span-5 space-y-6">
                                {isAnalyzing ? (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden animate-in zoom-in-95">
                                        <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-500 animate-pulse" />
                                        <div className="flex flex-col items-center justify-center text-center py-8">
                                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl shadow-inner"><Cpu className="w-8 h-8 text-blue-600 animate-spin" /></div>
                                            <h3 className="text-base font-bold text-slate-800 tracking-wide mt-4">ATS Deep Analysis Engine Active</h3>
                                        </div>
                                        <div className="border-t border-slate-100 pt-5 space-y-4">
                                            <div className="flex justify-between items-center text-xs font-mono text-blue-600 px-1 font-semibold"><span>Pipeline Progress</span><span>{Math.round(((loadingStepIdx + 1) / LOADING_STEPS.length) * 100)}%</span></div>
                                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/40"><div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-full transition-all duration-500" style={{ width: `${((loadingStepIdx + 1) / LOADING_STEPS.length) * 100}%` }} /></div>
                                            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2.5 border border-slate-200/60">
                                                {LOADING_STEPS.map((step, idx) => (
                                                    <div key={step} className={`text-xs flex items-start gap-2.5 transition-all ${idx === loadingStepIdx ? 'text-blue-600 font-semibold translate-x-1' : idx < loadingStepIdx ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        <span className="mt-0.5">{idx < loadingStepIdx ? '✓' : idx === loadingStepIdx ? '●' : '○'}</span><span className="truncate">{step}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" />Recruiter Weight Vector Criteria Matrices</h3>
                                        <div className="space-y-3.5 text-xs text-slate-500">
                                            <div>Skill Match Distribution Alignment <span className="float-right font-mono text-blue-600 font-bold">35%</span></div>
                                            <div className="w-full bg-white h-1.5 rounded-full border border-slate-200 shadow-inner"><div className="bg-blue-500 h-full rounded-full w-[35%]" /></div>
                                            <div>Target Role Profile Fit Score <span className="float-right font-mono text-indigo-600 font-bold">20%</span></div>
                                            <div className="w-full bg-white h-1.5 rounded-full border border-slate-200 shadow-inner"><div className="bg-indigo-500 h-full rounded-full w-[20%]" /></div>
                                            <div>Project Complexity Depth Index <span className="float-right font-mono text-purple-600 font-bold">15%</span></div>
                                            <div className="w-full bg-white h-1.5 rounded-full border border-slate-200 shadow-inner"><div className="bg-purple-500 h-full rounded-full w-[15%]" /></div>
                                            <div className="grid grid-cols-4 gap-2 text-center pt-2 font-mono text-[9px] text-slate-400 font-bold">
                                                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">Experience<span className="block text-slate-700 font-bold mt-0.5">10%</span></div>
                                                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">Keywords<span className="block text-slate-700 font-bold mt-0.5">10%</span></div>
                                                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">Formatting<span className="block text-slate-700 font-bold mt-0.5">5%</span></div>
                                                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">Readability<span className="block text-slate-700 font-bold mt-0.5">5%</span></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (

                    /* ======================================================== */
                    /* RESUME WORDED design: LEFT SIDEBAR TABS / RIGHT PREVIEW*/
                    /* ======================================================== */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-100px)] overflow-hidden animate-in fade-in duration-300">

                        {/*  CHANNELS BLOCK LEFT (3/12): THE RESUME WORDED ACCURATE NAVIGATION DIAL */}
                        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 space-y-4 flex flex-col justify-between shadow-sm">
                            <div className="space-y-4">
                                <div className="text-center pb-4 border-b border-slate-100 flex items-center justify-between px-1">
                                    <div className="text-left">
                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ATS Score Matrix</p>
                                        <span className="text-[11px] text-slate-500 font-mono mt-0.5 block truncate max-w-[120px]">{analysisData.fileName}</span>
                                    </div>

                                    {/* Premium circular rating presentation matching second image style profile */}
                                    <div className="relative w-14 h-14 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-full shadow-inner">
                                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                            <circle cx="50" cy="50" r="42" stroke="#E2E8F0" strokeWidth="6" fill="transparent" />
                                            <circle
                                                cx="50" cy="50" r="42"
                                                stroke="#2563EB"
                                                strokeWidth="6"
                                                fill="transparent"
                                                strokeDasharray="263.8"
                                                strokeDashoffset={263.8 - (263.8 * (analysisData.overallScore || 0)) / 100}
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <div className="absolute text-center">
                                            <span className="text-base font-black text-slate-800 font-mono">{analysisData.overallScore}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 block mb-2">Category Audits</span>
                                    {[
                                        { id: 'overview', label: 'Dashboard Overview', icon: BarChart3, color: 'text-blue-600' },
                                        { id: 'skills', label: 'Skill Matrix Weights', icon: Layers, color: 'text-indigo-600' },
                                        { id: 'alignment', label: 'Target Alignment', icon: Target, color: 'text-purple-600' },
                                        { id: 'projects', label: 'Project Technical Depth', icon: Cpu, color: 'text-cyan-600' },
                                        { id: 'keywords', label: 'Keyword Vector Maps', icon: Zap, color: 'text-amber-600' },
                                        { id: 'formatting', label: 'Formatting Compliance', icon: FileText, color: 'text-emerald-600' },
                                        { id: 'simulation', label: 'Recruiter Match', icon: Building2, color: 'text-pink-600' },
                                        { id: 'rewrites', label: 'Granular Bullet Rewrites', icon: Sparkles, color: 'text-violet-600' }
                                    ].map((tabItem) => (
                                        <button
                                            key={tabItem.id} type="button" onClick={() => setActiveTab(tabItem.id as any)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${activeTab === tabItem.id ? 'bg-blue-50 text-blue-600 border-blue-200/60 shadow-sm' : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-800'}`}
                                        >
                                            <tabItem.icon className={`w-4 h-4 ${activeTab === tabItem.id ? 'text-blue-600' : 'text-slate-400'}`} />
                                            <span>{tabItem.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFileState(null);
                                        setAnalysisData(null);
                                    }}
                                    className="w-full py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                                >                  ← Upload New File
                                </button>
                            </div>
                        </div>

                        {/* 📊 CENTRAL DATA SHEET (5/12): CONTENT PRESENTATION BLOCK WITH MULTI LINE ANALYSIS */}
                        <div className="lg:col-span-5 flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

                                {/* OVERVIEW CONTENT VIEW */}
                                {activeTab === 'overview' && (
                                    <div className="space-y-6 animate-in fade-in duration-150 text-slate-700">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Interview Probability</span>
                                                <div className="text-2xl font-mono font-black text-slate-800 mt-1">{analysisData.interviewProbability}%</div>
                                            </div>
                                            <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block">System Verdict</span>
                                                <div className="text-lg font-bold text-blue-600 mt-1.5">{analysisData.finalVerdict || 'Strong'}</div>
                                            </div>
                                        </div>

                                        <div className="bg-blue-50/40 border border-blue-100 p-4 rounded-xl space-y-1.5 text-xs">
                                            <span className="text-blue-700 font-bold block flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> Overarching Placement Summary Assessment</span>
                                            <p className="text-slate-600 leading-relaxed italic">"{analysisData.suggestions?.resumeOptimization || 'Enforce metric transformations cross structural blocks.'}"</p>
                                        </div>

                                        {/* 🛠️ NEW HUD INSIGHT INJECTION 1: Target fit vector matrices lines summary */}
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1.5 text-xs">
                                            <span className="text-slate-700 font-bold block flex items-center gap-1">🎯 Target Fit Vector Matrix</span>
                                            <p className="text-slate-500 leading-relaxed">
                                                Based on the requested profile parameters for a <strong className="text-slate-700">{config.role || 'Engineer'}</strong> at <strong className="text-slate-700">{config.company || 'Generic'}</strong>, your resume text array presents strong structural alignment weights. To bridge the gap, implement the quantitative suggested parameters mapped in the secondary sub-check tab arrays.
                                            </p>
                                        </div>

                                        {/* ATS Section Checklist */}
                                        <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl space-y-2.5">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">ATS Section Processing Checklist</span>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                {[
                                                    { label: 'Contact Details', status: analysisData.sections?.contactPresent },
                                                    { label: 'Education Block', status: analysisData.sections?.educationPresent },
                                                    { label: 'Experience History', status: analysisData.sections?.experiencePresent },
                                                    { label: 'Project Summaries', status: analysisData.sections?.projectsPresent },
                                                    { label: 'Core Skillsets', status: analysisData.sections?.skillsPresent },
                                                    { label: 'Achievements', status: analysisData.sections?.achievementsPresent },
                                                    { label: 'Certifications', status: analysisData.sections?.certificationsPresent },
                                                    { label: 'Profile Summary', status: analysisData.sections?.summaryPresent }
                                                ].map((sec, i) => (
                                                    <div key={i} className="bg-white border border-slate-100 p-2.5 rounded-lg flex items-center justify-between text-[11px] shadow-sm">
                                                        <span className="text-slate-500 font-medium truncate pr-1">{sec.label}</span>
                                                        <span className={`font-black font-mono ${sec.status ? 'text-emerald-600' : 'text-rose-500'}`}>{sec.status ? '✓' : '✖'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-sm">
                                                <span className="text-emerald-600 font-bold text-xs block flex items-center gap-1">✓ Top Document Strengths Matrix</span>
                                                {analysisData.strengths?.slice(0, 5).map((s, i) => <div key={i} className="flex gap-2 text-xs text-slate-600"><span>•</span><p>{s}</p></div>)}
                                            </div>
                                            <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-sm">
                                                <span className="text-rose-600 font-bold text-xs block flex items-center gap-1">⚠️ Corrections & Fixes Demanded</span>
                                                {analysisData.weaknesses?.slice(0, 5).map((w, i) => <div key={i} className="flex gap-2 text-xs text-slate-600"><span>•</span><p>{w}</p></div>)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: SKILLS DEEP LIST CONSTRAINTS */}
                                {activeTab === 'skills' && (
                                    <div className="space-y-5 animate-in fade-in duration-150 text-slate-700">
                                        <div className="bg-white p-4 border border-slate-200 rounded-xl space-y-2.5 shadow-sm">
                                            <span className="text-xs font-bold text-rose-500 uppercase block tracking-wider">🚨 Critical Tech Stack Gaps Missing</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {analysisData.skillAnalysis?.missingSkillsCrucial?.slice(0, 8).map(s => <span key={s} className="bg-rose-50 border border-rose-100 text-rose-700 font-mono text-xs px-2.5 py-1 rounded-lg font-semibold">+ {s}</span>) || <p className="text-slate-400 italic text-xs">None missing</p>}
                                            </div>
                                        </div>

                                        <div className="bg-white p-4 border border-slate-200 rounded-xl space-y-2.5 shadow-sm">
                                            <span className="text-xs font-bold text-blue-600 uppercase block tracking-wider">✓ Found Intersecting Technologies</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {analysisData.skillAnalysis?.requiredSkillsFound?.slice(0, 8).map(s => <span key={s} className="bg-blue-50 border border-blue-100 text-blue-700 font-mono text-xs px-2.5 py-1 rounded-lg font-semibold">{s}</span>) || <p className="text-slate-400 italic text-xs">None mapped</p>}
                                            </div>
                                        </div>

                                        <div className="bg-white p-4 border border-slate-200 rounded-xl space-y-2.5 shadow-sm">
                                            <span className="text-xs font-bold text-slate-500 uppercase block tracking-wider">Filler / Redundant Jargon Mapped</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {analysisData.skillAnalysis?.redundantSkillsOrFiller?.slice(0, 6).map(s => <span key={s} className="bg-slate-50 border border-slate-100 text-slate-500 font-mono text-xs px-2 py-0.5 rounded">{s}</span>)}
                                            </div>
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            <span className="text-xs font-bold text-slate-500 uppercase px-1 block">Parsed Skill Competency Densities</span>
                                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-2">
                                                {analysisData.skillAnalysis?.skillLevelsDistribution?.slice(0, 8).map((item, idx) => (
                                                    <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm flex justify-between items-center">
                                                        <span className="font-mono truncate text-slate-700 font-medium">{item.skill}</span>
                                                        <span className="text-[9px] bg-slate-50 px-1.5 py-0.5 rounded font-black text-slate-400 border border-slate-100">{item.level}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: TARGET FIT CONTEXTS */}
                                {activeTab === 'alignment' && (
                                    <div className="space-y-4 animate-in fade-in duration-150 text-xs text-slate-700">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl text-center">
                                                <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">Role Fit Vector</span>
                                                <div className="text-2xl font-mono font-black text-blue-600 mt-1">{analysisData.roleAlignment?.roleFitScore || 0}%</div>
                                            </div>
                                            <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl text-center">
                                                <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">Company Fit Factor</span>
                                                <div className="text-2xl font-mono font-black text-indigo-600 mt-1">{analysisData.roleAlignment?.companyFitScore || 0}%</div>
                                            </div>
                                        </div>
                                        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-1"><strong className="text-blue-600 block uppercase text-[9px] tracking-wider font-bold">Domain Vector Analysis</strong><p className="text-slate-600 leading-relaxed">{analysisData.roleAlignment?.domainMatchDetails}</p></div>
                                        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-1"><strong className="text-indigo-600 block uppercase text-[9px] tracking-wider font-bold">Tech Stack Specific Alignment</strong><p className="text-slate-600 leading-relaxed">{analysisData.roleAlignment?.techStackAlignmentDetails}</p></div>
                                        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-1"><strong className="text-slate-500 block uppercase text-[9px] tracking-wider font-bold">Seniority Fit Evaluation</strong><p className="text-slate-600 leading-relaxed">{analysisData.roleAlignment?.internFresherFitEvaluation}</p></div>
                                    </div>
                                )}

                                {/* TAB 4: PROJECTS LIST EVALUATION */}
                                {activeTab === 'projects' && (
                                    <div className="space-y-4 animate-in fade-in duration-150 text-slate-700">
                                        {analysisData.projectEvaluation?.map((proj, idx) => (
                                            <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-sm">
                                                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1"><Award className="w-3.5 h-3.5 text-blue-600" /> {proj.title}</h4>
                                                    <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-black font-mono ${proj.quantificationPresence ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{proj.quantificationPresence ? 'Quantified Pass' : 'Lacks impact numbers'}</span>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono font-bold">
                                                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-slate-400">Complexity: <strong className="text-slate-700">{proj.complexityScore}/10</strong></div>
                                                    <div className="bg-slate-900/5 p-1.5 rounded-lg border border-slate-100 text-slate-400">Impact: <strong className="text-slate-700">{proj.businessImpactScore}/10</strong></div>
                                                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-slate-400">Depth: <strong className="text-slate-700">{proj.technicalDepthScore}/10</strong></div>
                                                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-slate-400">Readiness: <strong className="text-slate-700">{proj.productionReadinessScore}/10</strong></div>
                                                </div>
                                                <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-100">"Assessment: {proj.critiqueNote}"</p>
                                            </div>
                                        )) || <p className="text-xs text-slate-400 italic">No dynamic project blocks parsed.</p>}
                                    </div>
                                )}

                                {/* TAB 5: KEYWORD ANALYTICS CORES */}
                                {activeTab === 'keywords' && (
                                    <div className="space-y-6 animate-in fade-in duration-150 text-slate-700">
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl"><span className="text-[9px] text-slate-400 block uppercase font-bold">Density Ratio</span><strong className="text-base font-mono text-blue-600 font-black">{analysisData.keywordAnalysis?.keywordDensityPercentage || 0}%</strong></div>
                                            <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl"><span className="text-[9px] text-slate-400 block uppercase font-bold">Placement Optimization</span><strong className="text-base font-mono text-indigo-600 font-black">{analysisData.keywordAnalysis?.placementOptimizationScore || 0}/100</strong></div>
                                            <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl"><span className="text-[9px] text-slate-400 block uppercase font-bold">Search Rating</span><strong className="text-xs font-black text-emerald-600 block mt-1.5">{analysisData.keywordAnalysis?.recruiterSearchabilityRating}</strong></div>
                                        </div>

                                        <div className="space-y-3 text-xs">
                                            <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-1.5 shadow-sm"><strong className="text-blue-600 block uppercase text-[10px] font-bold">Extracted ATS Index Tokens</strong><div className="flex flex-wrap gap-1">{analysisData.keywordAnalysis?.extractedAtsKeywords?.slice(0, 10).map(k => <span key={k} className="bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono font-medium text-[11px]">{k}</span>)}</div></div>
                                            <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-1.5 shadow-sm"><strong className="text-rose-500 block uppercase text-[10px] font-bold">Missing Ingestion Search Tokens</strong><div className="flex flex-wrap gap-1">{analysisData.keywordAnalysis?.missingCrucialKeywords?.slice(0, 10).map(k => <span key={k} className="bg-rose-50/60 border border-rose-100 px-2 py-0.5 rounded text-rose-700 font-mono font-semibold text-[11px]">+ {k}</span>)}</div></div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 6: LAYOUT COMPLIANCE AUDIT CORES */}
                                {activeTab === 'formatting' && (
                                    <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 text-xs shadow-sm animate-in fade-in duration-150 text-slate-700">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                                            <div className="space-y-2.5">
                                                <div><span className="text-slate-400 text-[10px] uppercase font-bold">Length Compliance</span><p className="text-slate-700 font-semibold mt-0.5">{analysisData.formatting?.lengthCompliance}</p></div>
                                                <div><span className="text-slate-400 text-[10px] uppercase font-bold">White Margins Flow</span><p className="text-slate-700 font-semibold mt-0.5">{analysisData.formatting?.spacingIntegrity}</p></div>
                                                <div><span className="text-slate-400 text-[10px] uppercase font-bold">Section Processing Hierarchy</span><p className="text-slate-700 font-semibold mt-0.5">{analysisData.formatting?.sectionOrderingVerification}</p></div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div><span className="text-slate-400 text-[10px] uppercase font-bold">Table/Grid Usage Critique</span><p className="text-slate-700 font-semibold mt-0.5">{analysisData.formatting?.tableUsageCritique}</p></div>
                                                <div><span className="text-slate-400 text-[10px] uppercase font-bold">Asset Icon / Font Size Sizing</span><p className="text-slate-700 font-semibold mt-0.5">{analysisData.formatting?.fontsAndHeadersEvaluation}</p></div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center bg-slate-50 p-3 border border-slate-100 rounded-xl">
                                            <span className="text-slate-500 font-bold">Bullet Points Quality Index</span>
                                            <strong className="font-mono text-blue-600 font-black text-sm">{analysisData.formatting?.bulletQualityMetric}/100</strong>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 7: PERSONAS MATCH SIMULATION ROWS */}
                                {activeTab === 'simulation' && (
                                    <div className="space-y-3 animate-in fade-in duration-150 text-slate-700">
                                        {[
                                            { name: 'Google Team Router', target: analysisData.companySimulation?.googleRecruiter },
                                            { name: 'Meta Infrastructure Allocator', target: analysisData.companySimulation?.metaRecruiter },
                                            { name: 'Amazon Operations Selector', target: analysisData.companySimulation?.amazonRecruiter }
                                        ].map((rec, idx) => (
                                            <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-2 shadow-sm">
                                                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5"><span className="text-[11px] font-bold text-slate-800 flex items-center gap-1"><Building className="w-3.5 h-3.5 text-slate-400" /> {rec.name}</span><span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded ${rec.target?.wouldInterview === 'YES' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>{rec.target?.wouldInterview || 'NO'}</span></div>
                                                <p className="text-[11px] text-slate-500 italic leading-relaxed">"{rec.target?.reason || 'Threshold evaluation parameter mismatch.'}"</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* TAB 8: AI DATA BULLETS TRANSFORMATION ENGINES */}
                                {activeTab === 'rewrites' && (
                                    <div className="space-y-4 animate-in fade-in duration-150 text-slate-700">
                                        <div className="space-y-3">
                                            {analysisData.rewrittenBullets?.slice(0, 5).map((item, i) => (
                                                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs shadow-sm">
                                                    <div className="text-slate-400 line-through bg-slate-50 p-2 rounded border border-slate-100">"{item.original}"</div>
                                                    <div className="text-blue-700 bg-blue-50/40 p-2 rounded border border-blue-100 font-semibold">"{item.improved}"</div>
                                                </div>
                                            )) || <p className="text-xs text-slate-400 italic">Bullets match formatting constraints perfectly.</p>}
                                        </div>
                                        <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl text-xs space-y-2">
                                            <span className="font-bold text-indigo-600 uppercase text-[10px] block flex items-center gap-1"><Compass className="w-3.5 h-3.5" /> Core Functional Roadmap Suggestions</span>
                                            {analysisData.improvements?.projectRecommendations?.slice(0, 5).map((r, i) => <p key={i} className="text-slate-600 font-medium">• {r}</p>)}
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* ACTION CALL TRANSITIONS BUTTON FOOTERS CONTROLLER BOUNDS */}
                            <div className="bg-slate-50 border-t border-slate-200 p-4 flex gap-3 justify-end flex-shrink-0">
                                <button type="button" className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl transition-all shadow-sm"><ListPlus className="w-4 h-4 text-slate-400" /> Recommend Roadmaps</button>
                                <button type="button" className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-xs font-bold text-white rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-100"><Sparkles className="w-4 h-4" /> Start AI Mock Interview</button>
                            </div>
                        </div>

                        {/* 🖥️ RIGHT PANEL CONTAINER (4/12): FIXED HIGH RESOLUTION ORIGINAL FILE VIEW FRAME */}
                        <div className="lg:col-span-4 bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden flex flex-col relative h-full shadow-inner">
                            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                                <span className="text-xs font-mono font-bold text-slate-500 flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-blue-500" /> Source File Previewer Layer
                                </span>
                            </div>
                            <div className="flex-1 bg-slate-200">
                                {filePreviewUrl ? (
                                    <iframe src={`${filePreviewUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-0 select-none bg-white" title="Ingested Data View Panel" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 font-medium"><AlertCircle className="w-5 h-5 mb-1 text-slate-300" />Preview payload url detached</div>
                                )}
                            </div>
                        </div>

                    </div>
                )}

            </div>
        </div>
    );
}
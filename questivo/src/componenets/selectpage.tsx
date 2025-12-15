// src/components/GenerateTestPage.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  BookOpen, 
  Clock, 
  BarChart, 
  Layers, 
  Languages, 
  RefreshCw, 
  Zap,
  CheckCircle2,
  AlertCircle,
  Search, // Added Search Icon
  X       // Added Close Icon
} from "lucide-react";

// --- TYPES ---
type ExamTopic = {
  id: string;
  name: string;
  code?: string | null;
  order?: number | null;
};

type ExamCategory = {
  id: string;
  name: string;
  code?: string | null;
};

type ServerGenerateResponse = {
  success: boolean;
  sessionId?: string;
  count?: number;
  error?: string;
};

type Message = { type: "error" | "success"; text: string } | null;

// --- CONFIG ---
const API =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
  (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
  "http://localhost:4000";

const CATEGORY_BASE = `${API}/api/category`;
const TOPIC_BASE = `${API}/api/cate_topics`;
const TEST_BASE = `${API}/api`;

export default function GenerateTestPage() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState(false);
  
  const [categories, setCategories] = useState<ExamCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  
  const [topics, setTopics] = useState<ExamTopic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState(""); // <--- NEW SEARCH STATE
  
  const [numQuestions, setNumQuestions] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [sessionType, setSessionType] = useState<"practice" | "pyq" | "mock">("practice");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [examTypeText, setExamTypeText] = useState<string>("");
  
  const [message, setMessage] = useState<Message>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const allowedMediums = [
    "English",
    "Hindi",
    "Hinglish",
    "Bilingual (English+Hindi)"
  ] as const;
  
  type Medium = typeof allowedMediums[number];
  const [medium, setMedium] = useState<Medium | "">("English");

  // --- FILTER TOPICS LOGIC ---
  const filteredTopics = useMemo(() => {
    return topics.filter((t) => 
      t.name.toLowerCase().includes(topicSearch.toLowerCase())
    );
  }, [topics, topicSearch]);

  // --- AUTH CHECK ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
        if (!res.ok) throw new Error("Not authenticated");
        setAuthChecked(true);
      } catch (err) {
        navigate("/signin");
      }
    };
    checkAuth();
  }, [navigate]);

  // --- FETCH CATEGORIES ---
  useEffect(() => {
    if (authChecked) fetchCategories();
  }, [authChecked]);

  async function fetchCategories() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${CATEGORY_BASE}/exam-categories`);
      if (!res.ok) throw new Error("Failed to load exam categories");
      const data = (await res.json()) as ExamCategory[];
      setCategories(data || []);
      if (data?.length) {
        const first = data[0];
        const idOrCode = first.code ?? first.id;
        setSelectedCategory(idOrCode);
        setExamTypeText(first.name);
        await fetchTopicsForExam(idOrCode);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message ?? "Unknown error loading categories" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchTopicsForExam(codeOrId: string) {
    setLoading(true);
    setMessage(null);
    setTopics([]);
    setSelectedTopics([]);
    setTopicSearch(""); // Reset search when category changes
    try {
      const res = await fetch(`${TOPIC_BASE}/exam-categories/${encodeURIComponent(codeOrId)}/topics`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to load topics for exam");
      }
      const json = await res.json();
      const list = Array.isArray(json.topics) ? json.topics : [];
      setTopics(list);
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message ?? "Unknown error loading topics" });
    } finally {
      setLoading(false);
    }
  }

  function toggleTopic(name: string) {
    setSelectedTopics((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  // Handle Select All (Only selects visible filtered topics)
  function handleSelectAll() {
    const visibleTopicNames = filteredTopics.map(t => t.name);
    const allVisibleSelected = visibleTopicNames.every(name => selectedTopics.includes(name));

    if (allVisibleSelected) {
      // Unselect all visible
      setSelectedTopics(prev => prev.filter(name => !visibleTopicNames.includes(name)));
    } else {
      // Select all visible (merge with existing selection)
      const newSelection = new Set([...selectedTopics, ...visibleTopicNames]);
      setSelectedTopics(Array.from(newSelection));
    }
  }

  async function onCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const codeOrId = e.target.value;
    setSelectedCategory(codeOrId);
    const cat = categories.find((c) => c.code === codeOrId || c.id === codeOrId);
    setExamTypeText(cat?.name ?? "");
    await fetchTopicsForExam(codeOrId);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!examTypeText) return setMessage({ type: "error", text: "Choose an exam category" });
    if (!selectedTopics.length) return setMessage({ type: "error", text: "Select at least one topic" });
    if (numQuestions <= 0) return setMessage({ type: "error", text: "numQuestions must be > 0" });

    const payload: any = {
      examType: examTypeText,
      topics: selectedTopics,
      numQuestions,
      difficulty,
      sessionType,
      durationMinutes,
    };

    if (medium && allowedMediums.includes(medium as Medium)) {
      payload.medium = medium;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${TEST_BASE}/tests/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ServerGenerateResponse;

      if (!res.ok || !json.success) {
        throw new Error(json?.error ?? "Failed to generate test");
      }

      const sessionId = json.sessionId!;
      window.location.href = `/tests/${encodeURIComponent(sessionId)}`;
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message ?? "Unknown error generating test" });
    } finally {
      setSubmitting(false);
    }
  }

  // --- RENDER ---
  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-slate-500 font-medium">Authenticating...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        {/* Header Section */}
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4"
          >
            <Sparkles className="h-8 w-8 text-indigo-600" />
          </motion.div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            Generate Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Perfect Mock Test</span>
          </h1>
          <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">
            Customize your practice session with AI-curated questions tailored to your syllabus and difficulty level.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 h-2 w-full" />
          
          <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-10">
            
            {/* Top Grid: Category & Topic Selection */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              {/* Left Column: Exam Selection */}
              <div className="lg:col-span-1 space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <BookOpen className="h-4 w-4 text-indigo-500" /> Exam Category
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={onCategoryChange}
                      className="block w-full rounded-xl border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-slate-700 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all appearance-none font-medium cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.code ?? c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                  <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Quick Tip
                  </h4>
                  <p className="text-xs text-blue-600 leading-relaxed">
                    Selecting specific topics helps the AI focus on your weak areas. For a full exam simulation, select all topics.
                  </p>
                </div>
              </div>

              {/* Right Column: Topic Selection (With Search) */}
              <div className="lg:col-span-2">
                
                {/* Header Row: Label & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Layers className="h-4 w-4 text-indigo-500" /> Select Topics
                  </label>
                  
                  {topics.length > 0 && (
                     <button 
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto"
                    >
                      {filteredTopics.every(t => selectedTopics.includes(t.name)) && filteredTopics.length > 0
                        ? "Deselect All Visible" 
                        : "Select All Visible"}
                    </button>
                  )}
                </div>

                {/* Search Bar */}
                <div className="relative mb-4 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search topics..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    className="block w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-700 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all outline-none"
                  />
                  {topicSearch && (
                    <button
                      type="button"
                      onClick={() => setTopicSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Topics Grid */}
                <div className="bg-slate-50 rounded-2xl p-2 border border-slate-200 min-h-[280px]">
                  {loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                      <div className="animate-spin h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mb-3"></div>
                      <span className="text-sm font-medium">Fetching syllabus...</span>
                    </div>
                  ) : topics.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                       <span className="text-sm">No topics available for this category.</span>
                    </div>
                  ) : filteredTopics.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                       <Search className="h-8 w-8 mb-2 opacity-50" />
                       <span className="text-sm">No topics match "{topicSearch}"</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                      {filteredTopics.map((t) => {
                        const isSelected = selectedTopics.includes(t.name);
                        return (
                          <motion.div
                            key={t.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => toggleTopic(t.name)}
                            className={`
                              cursor-pointer relative flex items-center p-3 rounded-xl border transition-all duration-200
                              ${isSelected 
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200" 
                                : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
                              }
                            `}
                          >
                            <div className={`
                              w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 transition-colors shrink-0
                              ${isSelected ? "border-white bg-white/20" : "border-slate-300"}
                            `}>
                              {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                            </div>
                            <span className="text-sm font-medium truncate">{t.name}</span>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="text-right mt-2 text-xs text-slate-500 font-medium">
                  {selectedTopics.length} selected
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full" />

            {/* Bottom Grid: Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Question Count */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2 group-focus-within:text-indigo-600 transition-colors">
                  <BarChart className="h-4 w-4" /> Questions
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="block w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-slate-700 font-semibold focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all outline-none"
                />
              </div>

              {/* Difficulty */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2 group-focus-within:text-indigo-600 transition-colors">
                  <Zap className="h-4 w-4" /> Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="block w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-slate-700 font-medium focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all outline-none cursor-pointer"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="mixed">Mixed (Adaptive)</option>
                </select>
              </div>

              {/* Session Type */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2 group-focus-within:text-indigo-600 transition-colors">
                  <Layers className="h-4 w-4" /> Mode
                </label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value as any)}
                  className="block w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-slate-700 font-medium focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all outline-none cursor-pointer"
                >
                  <option value="practice">Practice Mode</option>
                  <option value="pyq">Previous Year Qs</option>
                  <option value="mock">Full Mock Test</option>
                </select>
              </div>

              {/* Time Duration */}
              <div className="group">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2 group-focus-within:text-indigo-600 transition-colors">
                  <Clock className="h-4 w-4" /> Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="block w-full rounded-xl border-slate-200 bg-slate-50 py-3 px-4 text-slate-700 font-medium focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all outline-none cursor-pointer"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={90}>1 Hour 30 Min</option>
                  <option value={180}>3 Hours</option>
                </select>
              </div>
            </div>

             {/* Language / Medium */}
             <div className="group">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2 group-focus-within:text-indigo-600 transition-colors">
                  <Languages className="h-4 w-4" /> Language Medium
                </label>
                <div className="flex gap-4">
                  {allowedMediums.map((m) => (
                    <label key={m} className="cursor-pointer">
                      <input 
                        type="radio" 
                        name="medium" 
                        value={m} 
                        checked={medium === m}
                        onChange={(e) => setMedium(e.target.value as any)}
                        className="peer sr-only"
                      />
                      <div className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium transition-all peer-checked:border-indigo-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-hover:border-indigo-300">
                        {m}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${message.type === "error" ? "bg-red-50 text-red-700 border border-red-100" : "bg-green-50 text-green-700 border border-green-100"}`}
                >
                  {message.type === "error" ? <AlertCircle className="h-5 w-5"/> : <CheckCircle2 className="h-5 w-5"/>}
                  {message.text}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-indigo-200 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                    Generating Test...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" /> Generate Test
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTopics([]);
                  setNumQuestions(20);
                  setDifficulty("mixed");
                  setSessionType("practice");
                  setMedium("English");
                  setDurationMinutes(60); 
                  setTopicSearch(""); // Reset Search too
                }}
                className="px-6 py-4 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-5 w-5" /> Reset
              </button>
            </div>
            
          </form>
        </div>
      </motion.div>
    </div>
  );
}
// src/components/GenerateTestPage.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import CourseRequestModal from "./CourseRequestModal";
import PremiumDialog from "./PremiumDialog";
import { useAudience } from "./AudienceProvider";

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
  /** What the server actually built, which is not always what was requested:
   *  a "pyq" request falls back to a generated paper when the shelf is empty. */
  servedAs?: "practice" | "pyq" | "mock";
  /** Human-readable explanation of that substitution, when one happened. */
  notice?: string;
};

type Message = { type: "error" | "success"; text: string } | null;

// --- CONFIG ---
const API= import.meta.env.VITE_API_URL || 'http://localhost:4000';


const CATEGORY_BASE = `${API}/api/category`;
const TOPIC_BASE = `${API}/api/cate_topics`;
const TEST_BASE = `${API}/api`;

/**
 * Find the category a caller asked for.
 *
 * Callers arrive with whatever identifier they hold: an exam code from
 * lib/exams.ts ("NTA_JEE_MAIN_2025"), a category id, or a display name typed
 * into ?exam=. Exact identifiers win; the loose pass exists so a code that
 * merely prefixes the stored one still lands on the right exam rather than
 * silently falling through to whatever the API happened to return first.
 */
function matchCategory(list: ExamCategory[], wanted?: string | null): ExamCategory | undefined {
  const want = String(wanted ?? "").trim().toLowerCase();
  if (!want) return undefined;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(want);
  if (!target) return undefined;

  return (
    list.find((c) => c.code?.toLowerCase() === want || c.id.toLowerCase() === want) ||
    list.find((c) => norm(c.code || "") === target || norm(c.name) === target) ||
    // Only for targets long enough to be specific — "ssc" would match a dozen.
    (target.length >= 4
      ? list.find(
          (c) => norm(c.code || "").includes(target) || norm(c.name).includes(target)
        )
      : undefined)
  );
}

export default function GenerateTestPage() {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * The exam the visitor already chose before arriving here.
   *
   * The homepage cards and every exam landing page navigate with
   * `state.selectedExam`, and lib/seo.ts advertises `?exam=` as the site's
   * SearchAction target. Neither was ever read: the page always selected
   * whatever category the API listed first, so "Generate a free JEE Main mock
   * test" reliably opened on an unrelated exam.
   */
  const navState = location.state as {
    selectedExam?: string;
    mode?: string;
    topics?: string[];
  } | null;
  const requestedExam =
    navState?.selectedExam ?? new URLSearchParams(location.search).get("exam");

  /**
   * Chapters the caller already chose — the chapter index on an exam page
   * sends the one whose "generate" icon was clicked. Without this the visitor
   * picks a chapter, lands here, and has to find it again in a list of twenty.
   */
  const requestedTopics = Array.isArray(navState?.topics) ? navState.topics : [];

  /**
   * Which paper the caller wanted. Exam pages send "pyq" from the free
   * previous-year button and "practice" from the AI one, so the page opens on
   * the mode the visitor already clicked rather than making them find the
   * selector and click again.
   */
  const requestedMode = navState?.mode === "practice" || navState?.mode === "mock"
    ? navState.mode
    : "pyq";

  const [loading, setLoading] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState(false);
  
  const [categories, setCategories] = useState<ExamCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  
  const [topics, setTopics] = useState<ExamTopic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState(""); // <--- NEW SEARCH STATE
  
  const [numQuestions, setNumQuestions] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  // Previous year questions are the default paper, not an alternative to the
  // AI one. The server serves them when they exist and generates a paper in
  // the official pattern when they do not, so this default costs a candidate
  // nothing when the shelf is empty.
  const [sessionType, setSessionType] = useState<"practice" | "pyq" | "mock">(requestedMode);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [examTypeText, setExamTypeText] = useState<string>("");
  
  const [showCourseRequest, setShowCourseRequest] = useState(false);
  /** Set when the API refuses with 402 — see the submit handler. */
  const [premiumReason, setPremiumReason] = useState<string | null>(null);

  /**
   * Track filtering for the exam dropdown.
   *
   * The category table holds 61 exams. A JEE aspirant scrolling past Delhi
   * Police and SSC JE to reach theirs is the same noise problem the track
   * chooser exists to solve, so the list narrows to their track — with a switch
   * to see everything, because the full catalogue is the point of this page for
   * anyone who came here to explore.
   */
  const { audience, visibleExams, lockedToTrack } = useAudience();
  const [showAllCategories, setShowAllCategories] = useState(false);

  const listedCategories = useMemo(() => {
    // `showAllCategories` cannot widen the list for a locked candidate: the
    // toggle that sets it is hidden from them, and honouring a stale `true`
    // here would reopen the whole catalogue after a track change.
    if (!audience || (showAllCategories && !lockedToTrack)) return categories;
    const matched = visibleExams
      .map((e) => matchCategory(categories, e.code))
      .filter((c): c is ExamCategory => Boolean(c));
    // Never return an empty list: a track whose exams are missing from the
    // category table would otherwise leave the visitor with no way to choose
    // anything at all.
    if (!matched.length) return categories;
    // An explicit request for an off-track exam beats the track — but only for
    // a visitor who is not locked to one. Clicking "generate an SSC paper" is a
    // stronger, more recent signal than a track chosen on a previous visit, so
    // an undecided visitor gets the whole catalogue rather than having the exam
    // swapped out from under them. For a locked candidate the same line was a
    // hole: any ?exam= in the URL reopened all 61 exams.
    if (!lockedToTrack && requestedExam && !matchCategory(matched, requestedExam)) return categories;
    return matched;
  }, [categories, audience, showAllCategories, lockedToTrack, visibleExams, requestedExam]);

  /**
   * Keep the selection inside the list that is actually on screen.
   *
   * The track arrives from localStorage one effect after the categories arrive
   * from the API, so the dropdown can narrow underneath an already-made
   * selection. Without this the <select> would show a blank value bound to an
   * option that is no longer rendered.
   */
  useEffect(() => {
    if (!listedCategories.length || !selectedCategory) return;
    if (listedCategories.some((c) => (c.code ?? c.id) === selectedCategory)) return;
    const target = matchCategory(listedCategories, requestedExam) ?? listedCategories[0];
    const idOrCode = target.code ?? target.id;
    setSelectedCategory(idOrCode);
    setExamTypeText(target.name);
    fetchTopicsForExam(idOrCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listedCategories]);

  const [message, setMessage] = useState<Message>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  // Held true while the fallback notice is on screen and the redirect is
  // pending, so the button cannot be pressed a second time in that window.
  const [redirecting, setRedirecting] = useState<boolean>(false);

  const allowedMediums = [
    "English",
    "Hindi",
    "Hinglish",
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
        // Honour the exam the visitor already picked; fall back to the first
        // only when they arrived here cold.
        const chosen = matchCategory(data, requestedExam) ?? data[0];
        const idOrCode = chosen.code ?? chosen.id;
        setSelectedCategory(idOrCode);
        setExamTypeText(chosen.name);
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

      // Preselect whatever chapter the caller arrived with.
      //
      // The chapter index speaks in syllabus unit names while this list comes
      // from the category table, so they are matched loosely rather than by
      // equality. When nothing matches — the two vocabularies do diverge — the
      // chapter is put in the search box instead, so the visitor sees what was
      // being asked for rather than an unexplained empty selection.
      if (requestedTopics.length) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matched = list
          .filter((t: ExamTopic) =>
            requestedTopics.some((want) => {
              const a = norm(t.name);
              const b = norm(want);
              return a === b || (a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a)));
            })
          )
          .map((t: ExamTopic) => t.name);

        if (matched.length) setSelectedTopics(matched);
        else setTopicSearch(requestedTopics[0]);
      }
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

      const json = (await res.json()) as ServerGenerateResponse & {
        suggestion?: string;
        canRequestCourse?: boolean;
      };

      if (!res.ok || !json.success) {
        /**
         * 402 — the operator turned AI generation off.
         *
         * PremiumRoute normally stops anyone reaching this form at all, but it
         * reads the switch once on page load. A tab left open across a restart,
         * or a switch flipped while someone was choosing topics, lands here
         * instead. Showing the upgrade dialog is the same answer the route
         * would have given, rather than a raw "Payment Required" in a toast.
         */
        if (res.status === 402) {
          setPremiumReason(
            (json as any)?.reason ||
              "AI paper generation is not available on the free plan right now."
          );
          return;
        }
        // Retained for deploy skew only: the frontend and the API ship
        // separately, so a browser on the new build can still meet an old
        // server that rejects an empty PYQ shelf instead of falling back.
        if (sessionType === "pyq" && (res.status === 409 || res.status === 400)) {
          setSessionType("practice");
          setMessage({
            type: "error",
            text: `${json?.error ?? "No previous year questions available."} ${
              json?.suggestion ?? ""
            } Switched to an AI paper — press Generate Test again.`.trim(),
          });
          if (json?.canRequestCourse) setShowCourseRequest(true);
          return;
        }
        throw new Error(json?.error ?? "Failed to generate test");
      }

      const sessionId = json.sessionId!;
      const target = `/tests/${encodeURIComponent(sessionId)}`;

      // The server may have served a different kind of paper than was asked
      // for — previous year questions when they exist, a generated paper when
      // they do not. Say which one arrived before the test opens; a candidate
      // who believes they are sitting a real paper must not be handed an
      // invented one without being told.
      if (json.notice) {
        setRedirecting(true);
        setMessage({ type: "success", text: `${json.notice} Opening your test…` });
        setTimeout(() => {
          window.location.href = target;
        }, 2600);
        return;
      }

      window.location.href = target;
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
                      {listedCategories.map((c) => (
                        <option key={c.id} value={c.code ?? c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                    </div>
                  </div>
                  {/* Both toggles are hidden from a candidate locked to a
                      track — the dropdown is then exactly their exams, and
                      the way to change that is the profile. Admins and
                      undecided visitors keep the switch. */}
                  {!lockedToTrack && audience && categories.length > listedCategories.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories(true)}
                      className="mt-2 text-xs font-semibold text-indigo-600 underline"
                    >
                      Show all {categories.length} exams
                    </button>
                  )}
                  {!lockedToTrack && audience && showAllCategories && (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories(false)}
                      className="mt-2 text-xs font-semibold text-indigo-600 underline"
                    >
                      Show only my {audience.label.toLowerCase()} exams
                    </button>
                  )}
                </div>

                <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                  <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Quick Tip
                  </h4>
                  <p className="text-xs text-blue-600 leading-relaxed">
                    Selecting specific topics helps the AI focus on your weak areas. For a full exam simulation, select all topics.
                  </p>
                </div>

                {/* The moment a visitor scans the dropdown and does not find
                    their exam is the moment to catch the request — not a
                    footer link they will never scroll to. */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <h4 className="text-sm font-bold text-slate-800">
                    Can't find your exam?
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Tell us which one you're preparing for and we'll add it. Requests are
                    prioritised by how many people ask for the same exam.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCourseRequest(true)}
                    className="mt-3 text-xs font-bold text-indigo-600 underline"
                  >
                    Request a course
                  </button>
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
                  {/* Listed first because it is the default, and labelled so
                      the free option is identifiable before it is chosen. */}
                  <option value="pyq">Previous Year Qs — free</option>
                  <option value="practice">Practice Mode — AI</option>
                  <option value="mock">Full Mock Test — AI</option>
                </select>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  {sessionType === "pyq"
                    ? "Real questions from past papers, assembled instantly and free. If none are stored for this exam yet, you'll get an AI paper in the official pattern instead."
                    : "Written fresh by AI in the official exam pattern. Slower than previous year questions, and it uses generation credits."}
                </p>
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
                disabled={submitting || redirecting}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-indigo-200 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
              >
                {submitting || redirecting ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                    {redirecting ? "Opening your test…" : "Generating Test..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    {sessionType === "pyq" ? "Start Previous Year Paper" : "Generate Test"}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTopics([]);
                  setNumQuestions(20);
                  setDifficulty("mixed");
                  setSessionType("pyq");
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

          {/* Rendered outside the generate form, and in the browser's top layer:
              a <form> nested inside another <form> is invalid HTML and the inner
              one gets dropped, so the request would have submitted the
              test-generation form instead. */}
          <CourseRequestModal
            open={showCourseRequest}
            onClose={() => setShowCourseRequest(false)}
          />

          {/* Shown only if the switch moved under a session that was already
              on this page — the route guard catches every other case. */}
          <PremiumDialog
            open={premiumReason !== null}
            onClose={() => setPremiumReason(null)}
            feature="AI paper generation"
          />
        </div>
      </motion.div>
    </div>
  );
}
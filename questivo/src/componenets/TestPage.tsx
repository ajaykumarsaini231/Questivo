"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type OptionLetter = "A" | "B" | "C" | "D";

type Question = {
  id: string;
  indexInSession: number;
  examType?: string;
  topic?: string;
  difficulty?: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  imageUrl?: string | null;
};

type ReviewItem = {
  questionId: string;
  indexInSession: number;
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  selectedOption: string | null;
  correctOption: string | null;
  isCorrect: boolean;
  explanation?: string | null;
  answeredAt?: string | null;
};

type QuestionApiResponse = {
  success: boolean;
  question?: Question;
  meta?: { index: number; totalQuestions: number };
  error?: string;
};

type SubmitResult = {
  success: boolean;
  totalQuestions: number;
  attempted: number;
  correct: number;
  scorePercent: number;
  breakdown?: ReviewItem[];
  error?: string;
};

type AnswerMap = Record<string, OptionLetter | undefined>;
type IndexToIdMap = Record<number, string>;

interface TestRunnerProps {
  sessionId?: string;
  durationMinutes?: number;
  apiBase?: string;
}

export default function TestRunner({
  sessionId: sessionIdProp,
  durationMinutes = 60,
  apiBase,
}: TestRunnerProps) {
  const RUNTIME_API =
    apiBase ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
    "http://localhost:4000";

  console.log(RUNTIME_API);
  const API_BASE = `${RUNTIME_API.replace(/\/$/, "")}/api`;

  const sessionId = useMemo(() => {
    if (sessionIdProp) return sessionIdProp;
    try {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const parts = path.split("/").filter(Boolean);
      const idx = parts.indexOf("tests");
      if (idx >= 0 && parts.length > idx + 1) return decodeURIComponent(parts[idx + 1]);
      return "";
    } catch {
      return "";
    }
  }, [sessionIdProp]);

  const [currentIndex, setCurrentIndex] = useState<number>(1);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [indexToQuestionId, setIndexToQuestionId] = useState<IndexToIdMap>({});
  const [visitedIndices, setVisitedIndices] = useState<Set<number>>(new Set());
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [breakdown, setBreakdown] = useState<ReviewItem[] | null>(null);

  // initialize remainingSeconds with prop default; may be overwritten by server meta
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationMinutes * 60);

  // confirmation modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"end" | "submit" | null>(null);
  const [modalInput, setModalInput] = useState("");

  function openConfirm(action: "end" | "submit") {
    setModalAction(action);
    setModalInput("");
    setModalOpen(true);
  }

  function closeConfirm() {
    setModalOpen(false);
    setModalInput("");
    setModalAction(null);
  }

  async function confirmAction() {
    const expected = modalAction === "end" ? "END TEST" : "SUBMIT TEST";
    if (modalInput.trim().toUpperCase() !== expected) return;
    if (modalAction === "end") {
      setRemainingSeconds(0);
      closeConfirm();
      await submitAllAnswers();
    } else if (modalAction === "submit") {
      closeConfirm();
      await submitAllAnswers();
    }
  }

  // <-- NEW: fetch session meta once to initialize duration (only time-related change)
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function fetchSessionMeta() {
      try {
        const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(sessionId)}`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || !json.success) {
          // don't treat missing meta as fatal — keep local defaults
          return;
        }

        // duration priority: meta.durationMinutes -> session.durationMinutes -> default prop
        const serverDuration =
          json.meta?.durationMinutes ?? json.session?.durationMinutes ?? null;
        if (!cancelled && serverDuration != null) {
          const dm = Number(serverDuration) || durationMinutes;
          setRemainingSeconds(dm * 60);
        }

        // optionally set totalQuestions if server provided numQuestions or questions length
        const serverTotal =
          json.session?.numQuestions ?? (Array.isArray(json.questions) ? json.questions.length : null);
        if (!cancelled && serverTotal != null) {
          setTotalQuestions(Number(serverTotal));
        }
      } catch (err) {
        // ignore — keep local defaults
        console.warn("Failed to fetch session meta for timer initialization:", err);
      }
    }

    fetchSessionMeta();

    return () => {
      cancelled = true;
    };
    // only run once per sessionId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function fetchQuestion(index: number) {
    if (!sessionId) {
      setError("Invalid sessionId");
      return;
    }
    setLoadingQuestion(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(sessionId)}/questions/${index}`);
      const json = (await res.json()) as QuestionApiResponse;
      if (!res.ok || !json.success || !json.question) {
        setError(json?.error ?? "Failed to load question");
        setQuestion(null);
        return;
      }
      setQuestion(json.question);
      setTotalQuestions(json.meta?.totalQuestions ?? null);
      setIndexToQuestionId((prev) => ({ ...prev, [json.question!.indexInSession]: json.question!.id }));
      setVisitedIndices((prev) => new Set([...Array.from(prev), json.question!.indexInSession]));
    } catch (err) {
      console.error(err);
      setError("Network error while loading question");
      setQuestion(null);
    } finally {
      setLoadingQuestion(false);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    fetchQuestion(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, currentIndex]);

  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          void submitAllAnswers();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function handleOptionSelect(opt: OptionLetter) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: opt }));
  }

  function handleClearResponse() {
    if (!question) return;
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[question.id];
      return copy;
    });
  }

  function handlePrevious() {
    if (currentIndex > 1) setCurrentIndex((p) => p - 1);
  }

  function handleSaveAndNext() {
    if (totalQuestions && currentIndex < totalQuestions) setCurrentIndex((p) => p + 1);
  }

  function handleMarkForReviewAndNext() {
    setMarkedForReview((prev) => new Set([...Array.from(prev), currentIndex]));
    if (totalQuestions && currentIndex < totalQuestions) setCurrentIndex((p) => p + 1);
  }

  function handlePaletteClick(index: number) {
    setCurrentIndex(index);
  }

  function getStatusForIndex(index: number): "notVisited" | "notAnswered" | "answered" | "marked" {
    if (markedForReview.has(index)) return "marked";
    if (!visitedIndices.has(index)) return "notVisited";
    const qid = indexToQuestionId[index];
    if (qid && answers[qid]) return "answered";
    return "notAnswered";
  }

  async function submitAllAnswers() {
    if (!sessionId) {
      setError("Invalid sessionId");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payloadAnswers = Object.entries(answers).map(([questionId, selectedOption]) => ({
        questionId,
        selectedOption,
      }));

     const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(sessionId)}/submit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // 🔥 THIS IS THE KEY
  body: JSON.stringify({ answers: payloadAnswers }),
});


      const json = (await res.json()) as SubmitResult;
      if (!res.ok || !json.success) {
        setError(json?.error ?? "Failed to submit test");
        return;
      }

      setResult({
        success: true,
        totalQuestions: json.totalQuestions,
        attempted: json.attempted,
        correct: json.correct,
        scorePercent: json.scorePercent,
      });

      setRemainingSeconds(0);

      if (json.breakdown && Array.isArray(json.breakdown)) {
        setBreakdown(json.breakdown);
        return;
      }

      try {
        const r = await fetch(`${API_BASE}/tests/${encodeURIComponent(sessionId)}/result`);
        const resJson = await r.json();
        if (r.ok && resJson.success) {
          if (Array.isArray(resJson.breakdown)) {
            setBreakdown(resJson.breakdown);
          } else {
            setBreakdown(null);
          }

          setResult({
            success: true,
            totalQuestions: resJson.total ?? json.totalQuestions,
            attempted: resJson.attempted ?? json.attempted,
            correct: resJson.correct ?? json.correct,
            scorePercent: resJson.scorePercent ?? json.scorePercent,
          });
        } else {
          setBreakdown(null);
        }
      } catch (err) {
        console.error("Error fetching result after submit:", err);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while submitting test");
    } finally {
      setSubmitting(false);
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  function openResultPage() {
    if (!sessionId) return;
    window.location.href = `/tests/${encodeURIComponent(sessionId)}/result`;
  }

  if (result || breakdown) {
    const total = result?.totalQuestions ?? breakdown?.length ?? 0;
    const attempted = result?.attempted ?? (breakdown ? breakdown.filter((b) => b.selectedOption).length : 0);
    const correct = result?.correct ?? (breakdown ? breakdown.filter((b) => b.isCorrect).length : 0);
    const scorePercent = result?.scorePercent ?? (total ? Math.round((correct / total) * 100) : 0);

    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow">
          <div className="flex items-start justify-between">
            <h2 className="text-2xl font-semibold mb-4">Test Summary</h2>
            <div className="flex gap-2">
              <button onClick={openResultPage} className="px-3 py-1 border rounded text-sm cursor-pointer">Open full result page</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div className="p-3 bg-slate-50 rounded">Total Questions: <strong className="block text-lg">{total}</strong></div>
            <div className="p-3 bg-slate-50 rounded">Attempted: <strong className="block text-lg">{attempted}</strong></div>
            <div className="p-3 bg-slate-50 rounded">Correct: <strong className="block text-lg">{correct}</strong></div>
            <div className="p-3 bg-slate-50 rounded">Score: <strong className="block text-lg">{scorePercent}%</strong></div>
          </div>

          {breakdown ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Review (Your answers)</h3>
              {breakdown.map((b) => (
                <div key={b.questionId} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-slate-600">Q{b.indexInSession}</div>
                      <div className="font-medium mt-1">{b.questionText}</div>
                    </div>
                    <div className="text-sm">
                      {b.isCorrect ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded">Correct</span>
                      ) : b.selectedOption ? (
                        <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded">Incorrect</span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">Not Attempted</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {(["A", "B", "C", "D"] as OptionLetter[]).map((opt) => {
                      const optText = opt === "A" ? b.options.A : opt === "B" ? b.options.B : opt === "C" ? b.options.C : b.options.D;
                      const isSelected = b.selectedOption === opt;
                      const isCorrectOpt = b.correctOption === opt;
                      const classes = isCorrectOpt ? "border-emerald-400 bg-emerald-50" : isSelected ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white";

                      return (
                        <div key={opt} className={`p-2 rounded border ${classes} flex items-center justify-between`}>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-sm bg-slate-100">{opt}</div>
                            <div className="text-sm">{optText}</div>
                          </div>
                          <div className="text-xs text-slate-600">{isCorrectOpt ? "Answer" : isSelected ? "Your choice" : ""}</div>
                        </div>
                      );
                    })}
                  </div>

                  {b.explanation ? <div className="mt-3 text-sm text-slate-700 bg-slate-50 p-3 rounded">{b.explanation}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-600">Review not available.</div>
          )}
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white p-6">
        <div className="bg-white p-6 rounded-xl shadow-lg max-w-xl text-center">
          <h2 className="text-xl font-semibold">Invalid session</h2>
          <p className="text-sm text-red-600 mt-2">SessionId not found in URL or props.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-white pb-12">
      <header className="bg-white shadow sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold">N</div>
            <div>
              <div className="text-lg font-semibold">NTA Mock Test</div>
              <div className="text-xs text-slate-500">Session: <span className="font-medium">{sessionId}</span></div>
            </div>
          </div>

          <div className="flex-1">
            <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
              <motion.div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                style={{ width: `${totalQuestions ? (currentIndex / totalQuestions) * 100 : 0}%` }}
                initial={{ width: 0 }}
                animate={{ width: totalQuestions ? `${(currentIndex / totalQuestions) * 100}%` : "0%" }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <div className="text-xs text-slate-500 mt-1">Question {currentIndex}{totalQuestions ? ` of ${totalQuestions}` : ""}</div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600">Time Left</div>
            <div className="font-mono bg-slate-800 text-white px-3 py-1 rounded">{formatTime(remainingSeconds)}</div>

            <button onClick={openResultPage} className="text-xs border px-3 py-1 rounded">View Result</button>

            <button onClick={() => openConfirm("end")} className="text-xs bg-rose-600 text-white px-3 py-1 rounded cursor-pointer disabled:cursor-not-allowed">End Now</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 grid grid-cols-12 gap-6">
        <section className="col-span-8">
          <motion.article
            className="bg-white rounded-2xl shadow-lg p-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold">Q. {question?.indexInSession ?? currentIndex}</h3>
                <div className="text-sm text-slate-500">{question?.topic ?? ""}</div>
              </div>

              <div className="text-sm text-slate-600">Difficulty: <span className="font-medium">{question?.difficulty ?? "-"}</span></div>
            </div>

            <div className="mt-4 prose max-w-none">
              {loadingQuestion ? (
                <div className="text-sm text-slate-500">Loading question…</div>
              ) : error ? (
                <div className="text-sm text-rose-600">{error}</div>
              ) : question ? (
                <>
                  <div className="text-base leading-relaxed">{question.questionText}</div>

                  {question.imageUrl ? (
                    <div className="mt-4 flex justify-center">
                      <img src={question.imageUrl} alt={`Question ${question.indexInSession} figure`} className="max-h-48 object-contain rounded-md shadow" />
                    </div>
                  ) : null}

                  <div className="mt-6 grid grid-cols-1 gap-3">
                    {(["A", "B", "C", "D"] as OptionLetter[]).map((opt) => {
                      const text = opt === "A" ? question.optionA : opt === "B" ? question.optionB : opt === "C" ? question.optionC : question.optionD;
                      const selected = answers[question.id] === opt;
                      return (
                        <motion.label
                          key={opt}
                          htmlFor={`q-${question.id}-${opt}`}
                          className={`flex items-start gap-4 p-4 rounded-xl border transition-shadow cursor-pointer ${
                            selected ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white"
                          }`}
                          whileHover={{ y: -2 }}
                        >
                          <input
                            id={`q-${question.id}-${opt}`}
                            type="radio"
                            name={`q-${question.id}`}
                            value={opt}
                            checked={selected}
                            onChange={() => handleOptionSelect(opt)}
                            className="mt-1 h-4 w-4 cursor-pointer"
                          />

                          <div>
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-sm bg-slate-100">{opt}</div>
                              <div className="font-medium">{text}</div>
                            </div>
                          </div>
                        </motion.label>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <button onClick={handleClearResponse} className="px-4 py-2 border rounded-md text-sm cursor-pointer">Clear</button>
                    <button onClick={handleMarkForReviewAndNext} className="px-4 py-2 border rounded-md text-sm cursor-pointer">Mark & Next</button>
                    <button onClick={handleSaveAndNext} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm cursor-pointer">Save & Next</button>

                    <div className="flex-1" />

                    <button onClick={handlePrevious} disabled={currentIndex === 1} className="px-4 py-2 border rounded-md text-sm cursor-pointer disabled:cursor-not-allowed">Previous</button>
                    <button onClick={() => openConfirm("submit")} disabled={submitting} className="px-4 py-2 bg-rose-600 text-white rounded-md text-sm cursor-pointer disabled:cursor-not-allowed">
                      {submitting ? "Submitting…" : "Submit Test"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">No question loaded.</div>
              )}
            </div>
          </motion.article>
        </section>

        <aside className="col-span-4">
          <div className="sticky top-28 space-y-4">
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">Question Palette</h4>
                <div className="text-xs text-slate-500">Tap a number to jump</div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {totalQuestions ? (
                  Array.from({ length: totalQuestions }, (_, i) => i + 1).map((index) => {
                    const status = getStatusForIndex(index);
                    let bg = "bg-gray-200";
                    if (status === "notVisited") bg = "bg-gray-300";
                    if (status === "notAnswered") bg = "bg-rose-200";
                    if (status === "answered") bg = "bg-emerald-200";
                    if (status === "marked") bg = "bg-amber-200";

                    const isCurrent = index === currentIndex;
                    return (
                      <button
                        key={index}
                        onClick={() => handlePaletteClick(index)}
                        className={`h-10 rounded-full flex items-center justify-center text-sm font-medium ${bg} ${isCurrent ? "ring-2 ring-indigo-600 scale-105" : ""} transform transition cursor-pointer`}
                      >
                        {index}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500 col-span-5">Loading palette…</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-4">
              <h4 className="font-semibold mb-3">Legend</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="w-5 h-5 inline-block bg-gray-300 rounded" /> Not Visited</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 inline-block bg-rose-200 rounded" /> Not Answered</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 inline-block bg-emerald-200 rounded" /> Answered</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 inline-block bg-amber-200 rounded" /> Marked</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-4 text-sm">
              <div className="mb-2 font-semibold">Quick Info</div>
              <div className="text-slate-600">Visited: <strong>{visitedIndices.size}</strong></div>
              <div className="text-slate-600">Marked: <strong>{Array.from(markedForReview).length}</strong></div>
              <div className="mt-3">
                <button onClick={() => { setVisitedIndices(new Set()); setAnswers({}); setMarkedForReview(new Set()); }} className="text-xs text-rose-600 cursor-pointer">Reset local state</button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <div className="fixed left-0 right-0 bottom-6 flex justify-center md:hidden">
        <div className="bg-white shadow rounded-full px-4 py-2 flex items-center gap-3">
          <div className="text-sm">{currentIndex}/{totalQuestions ?? "?"}</div>
          <button onClick={() => openConfirm("submit")} className="px-4 py-2 bg-rose-600 text-white rounded-full text-sm cursor-pointer">Submit</button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Confirm {modalAction === "end" ? "End Test" : "Submit Test"}</h3>
            <p className="text-sm text-slate-600 mb-4">Type <span className="font-mono">{modalAction === "end" ? "END TEST" : "SUBMIT TEST"}</span> below to confirm.</p>
            <input
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              className="w-full border px-3 py-2 rounded mb-4"
              placeholder={modalAction === "end" ? "Type END TEST to confirm" : "Type SUBMIT TEST to confirm"}
            />
            <div className="flex items-center gap-3 justify-end">
              <button onClick={closeConfirm} className="px-4 py-2 border rounded cursor-pointer">Cancel</button>
              <button
                disabled={modalInput.trim().toUpperCase() !== (modalAction === "end" ? "END TEST" : "SUBMIT TEST")}
                onClick={confirmAction}
                className="px-4 py-2 bg-rose-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

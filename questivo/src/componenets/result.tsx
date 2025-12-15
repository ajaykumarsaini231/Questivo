"use client";

import  { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

type BreakdownItem = {
  questionId: string;
  indexInSession: number;
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  selectedOption: string | null;
  correctOption: string | null;
  isCorrect: boolean;
  explanation?: string | null;
};

type ApiResponse = {
  success: boolean;
  total?: number;
  attempted?: number;
  correct?: number;
  scorePercent?: number;
  breakdown?: BreakdownItem[];
  error?: string;
};

export default function ResultPage() {
  const { sessionId } = useParams(); // <-- IMPORTANT FIX
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // -------- SAME API_BASE LOGIC YOU USE IN TestRunner ----------
  const RUNTIME_API =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
    "http://localhost:4000";

  const API_BASE = `${RUNTIME_API.replace(/\/$/, "")}/api`;

  const RESULT_API = `${API_BASE}/tests/${encodeURIComponent(sessionId!)}/result`;

  useEffect(() => {
    async function fetchResult() {
      setLoading(true);
      try {
        const res = await fetch(RESULT_API);
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(json.error ?? "Failed to fetch result");
        } else {
          setData(json);
        }
      } catch {
        setError("Network error while fetching result");
      }
      setLoading(false);
    }

    if (sessionId) fetchResult();
  }, [sessionId]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  const total = data?.total ?? data?.breakdown?.length ?? 0;
  const attempted = data?.attempted ?? data?.breakdown?.filter((b) => b.selectedOption).length ?? 0;
  const correct = data?.correct ?? data?.breakdown?.filter((b) => b.isCorrect).length ?? 0;
  const scorePercent = data?.scorePercent ?? (total ? Math.round((correct / total) * 100) : 0);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-semibold mb-4">Test Summary</h1>

        <div className="grid grid-cols-2 gap-4">
          <Summary label="Total Questions" value={total} />
          <Summary label="Attempted" value={attempted} />
          <Summary label="Correct" value={correct} />
          <Summary label="Score" value={`${scorePercent}%`} />
        </div>

        <h2 className="text-lg font-semibold mt-6 mb-2">Review (Your answers)</h2>

        <div className="space-y-4">
          {data?.breakdown?.map((b) => (
            <QuestionReview key={b.questionId} item={b} />
          ))}
        </div>

        <a href={`/tests/${sessionId}`} className="mt-4 inline-block px-4 py-2 border rounded">
          Back to Test
        </a>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: any }) {
  return (
    <div className="p-4 bg-slate-50 rounded">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function QuestionReview({ item }: { item: BreakdownItem }) {
  const notAttempted = !item.selectedOption;

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-500">Q{item.indexInSession}</div>
          <p className="font-medium mt-1">{item.questionText}</p>
        </div>

        {notAttempted ? (
          <span className="text-xs px-2 py-1 bg-slate-100 rounded">Not Attempted</span>
        ) : item.isCorrect ? (
          <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded">Correct</span>
        ) : (
          <span className="text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded">Incorrect</span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {(["A", "B", "C", "D"] as const).map((opt) => {
          const text = item.options[opt];
          const isSelected = item.selectedOption === opt;
          const isCorrect = item.correctOption === opt;

          const base = "p-3 rounded border flex items-center justify-between";
          const classes = isCorrect
            ? `${base} border-emerald-400 bg-emerald-50`
            : isSelected
            ? `${base} border-rose-400 bg-rose-50`
            : `${base} border-slate-200`;

          return (
            <div key={opt} className={classes}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-semibold">
                  {opt}
                </div>
                <div className="text-sm">{text}</div>
              </div>

              <div className="text-xs text-slate-600">
                {isCorrect ? "Answer" : isSelected ? "Your choice" : ""}
              </div>
            </div>
          );
        })}
      </div>

      {item.explanation && (
        <div className="mt-3 p-3 bg-slate-50 rounded text-sm">{item.explanation}</div>
      )}
    </div>
  );
}

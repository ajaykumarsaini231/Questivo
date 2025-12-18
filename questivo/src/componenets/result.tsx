import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, AlertCircle, ArrowLeft, BarChart3, HelpCircle, BookOpen } from "lucide-react";
import Header from "./Header"
// --- Types ---
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
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- API Configuration (No external helper) ---
  const RUNTIME_API =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
    "http://localhost:4000";

  const API_BASE = `${RUNTIME_API.replace(/\/$/, "")}/api`;
  const RESULT_API = `${API_BASE}/tests/${encodeURIComponent(sessionId || "")}/result`;

  // --- Fetch Data ---
  useEffect(() => {
    async function fetchResult() {
      if (!sessionId) return;
      
      setLoading(true);
      try {
        const res = await fetch(RESULT_API);
        const json = await res.json();
        
        if (!res.ok || !json.success) {
          setError(json.error || "Failed to fetch result");
        } else {
          setData(json);
        }
      } catch (err) {
        console.error(err);
        setError("Network error while fetching result");
      } finally {
        setLoading(false);
      }
    }

    fetchResult();
  }, [sessionId, RESULT_API]);

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-slate-500">
        Loading Result...
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Results</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/" className="text-blue-600 hover:underline">Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  // --- Calculations ---
  const total = data?.total ?? data?.breakdown?.length ?? 0;
  const attempted = data?.attempted ?? data?.breakdown?.filter((b) => b.selectedOption).length ?? 0;
  const correct = data?.correct ?? data?.breakdown?.filter((b) => b.isCorrect).length ?? 0;
  const scorePercent = data?.scorePercent ?? (total ? Math.round((correct / total) * 100) : 0);

  // --- Main Render ---
  return (
    <>
      <Header />
      <div className="min-h-screen bg-slate-50 p-6 animate-in fade-in duration-300">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="text-blue-600" /> Test Summary
            </h1>
            <Link to={`/tests/${sessionId}`} className="flex items-center text-sm font-medium text-slate-500 hover:text-blue-600">
               <ArrowLeft size={16} className="mr-1"/> Back to Test
            </Link>
          </div>

          {/* Score Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard 
                label="Total Questions" 
                value={total} 
                icon={<HelpCircle size={20} className="text-blue-500"/>} 
            />
            <SummaryCard 
                label="Attempted" 
                value={attempted} 
                icon={<div className="w-5 h-5 rounded-full border-2 border-orange-400 text-orange-400 flex items-center justify-center text-[10px] font-bold">A</div>} 
            />
            <SummaryCard 
                label="Correct Answers" 
                value={correct} 
                icon={<CheckCircle size={20} className="text-emerald-500"/>} 
            />
            <SummaryCard 
              label="Accuracy" 
              value={`${scorePercent}%`} 
              highlight 
              icon={<div className="text-lg font-bold text-blue-600">%</div>}
            />
          </div>

          {/* Detailed Review Section */}
          <h2 className="text-lg font-semibold text-slate-700 mt-8">Detailed Review</h2>

          <div className="space-y-6">
            {data?.breakdown?.map((b) => (
              <QuestionReview key={b.questionId} item={b} />
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

// --- Helper Components ---

function SummaryCard({ label, value, icon, highlight }: { label: string; value: any; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${highlight ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

function QuestionReview({ item }: { item: BreakdownItem }) {
  const notAttempted = !item.selectedOption;

  return (
    <div className="border border-slate-200 rounded-xl p-6 bg-white shadow-sm">
      {/* Question Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Question {item.indexInSession}</span>
          <p className="font-medium text-slate-800 mt-1 text-lg">{item.questionText}</p>
        </div>

        {/* Status Badge */}
        {notAttempted ? (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-slate-100 text-slate-600 font-medium rounded-full border border-slate-200">
            <AlertCircle size={14}/> Not Attempted
          </span>
        ) : item.isCorrect ? (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 font-medium rounded-full border border-emerald-100">
            <CheckCircle size={14}/> Correct
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-rose-50 text-rose-700 font-medium rounded-full border border-rose-100">
            <XCircle size={14}/> Incorrect
          </span>
        )}
      </div>

      {/* Options List */}
      <div className="space-y-2.5">
        {(["A", "B", "C", "D"] as const).map((opt) => {
          const text = item.options[opt];
          const isSelected = item.selectedOption === opt;
          const isCorrect = item.correctOption === opt;

          let containerClass = "p-3 rounded-lg border flex items-center justify-between transition-all ";
          
          if (isCorrect) {
            containerClass += "border-emerald-500 bg-emerald-50/50";
          } else if (isSelected) {
            containerClass += "border-rose-400 bg-rose-50/50";
          } else {
            containerClass += "border-slate-100 bg-white hover:bg-slate-50";
          }

          return (
            <div key={opt} className={containerClass}>
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    isCorrect ? "bg-emerald-500 text-white" : 
                    isSelected ? "bg-rose-500 text-white" : 
                    "bg-slate-100 text-slate-500"
                }`}>
                  {opt}
                </div>
                <div className={`text-sm ${isCorrect || isSelected ? "font-medium text-slate-800" : "text-slate-600"}`}>{text}</div>
              </div>

              <div className="text-xs font-semibold px-2">
                {isCorrect && <span className="text-emerald-600">Correct Answer</span>}
                {isSelected && !isCorrect && <span className="text-rose-600">Your Answer</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explanation Box */}
      {item.explanation && (
        <div className="mt-5 p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
            <h4 className="text-xs font-bold text-blue-600 uppercase mb-1 flex items-center gap-2">
                <BookOpen size={14} /> Explanation
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed">{item.explanation}</p>
        </div>
      )}
    </div>
  );
}
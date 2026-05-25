import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { 
  ArrowLeft, CheckCircle, XCircle,  Printer, FileText, CheckSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import SafeMathRenderer from '../componenets/SafeMathRenderer';

export const SessionDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await api.get(`/sessions/${id}`);
        setSession(res.data.data);
      } catch (err) {
        toast.error("Session not found");
        navigate('/admin/sessions');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id, navigate]);

  const triggerNativePrint = (mode: 'paper-only' | 'full-solutions') => {
    const root = document.documentElement;

    const existingStyle = document.getElementById('questivo-print-override-engine');
    if (existingStyle) existingStyle.remove();

    root.classList.toggle('print-clean-paper', mode === 'paper-only');
    root.classList.toggle('print-solutions-key', mode === 'full-solutions');

    const styleOverride = document.createElement('style');
    styleOverride.id = 'questivo-print-override-engine';
    styleOverride.innerHTML = `
      @page {
        size: A4 portrait !important;
        margin: 12mm 10mm 12mm 10mm !important;
      }
      @media print {
        html, body, #root, main, [class*="layout"], [class*="app"], [class*="container"] {
          background: #ffffff !important;
          color: #000000 !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          overflow-x: visible !important;
          overflow-y: visible !important;
          position: static !important;
          display: block !important;
          padding: 0 !important;
          margin: 0 !important;
          width: auto !important;
          max-width: none !important;
          box-shadow: none !important;
          transform: none !important;
        }

        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-size: 11pt !important;
        }

        .no-print, header, nav, aside, button, .toast, [class*="sidebar"], [class*="Navbar"] {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          height: 0 !important;
          width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        .print-only-title {
          display: block !important;
          visibility: visible !important;
        }

        .print-clean-paper .hide-on-clean-paper {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          height: 0 !important;
        }

        .exam-question-card {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          padding: 14pt !important;
          margin: 0 0 16pt 0 !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 6pt !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }

        .exam-question-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          margin-bottom: 12pt !important;
          break-after: avoid !important;
          page-break-after: avoid !important;
        }

        .exam-options-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 10pt !important;
          margin-top: 14pt !important;
          width: 100% !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        .exam-option-item {
          display: flex !important;
          align-items: center !important;
          gap: 8pt !important;
          padding: 12pt !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 5pt !important;
          background: #ffffff !important;
          break-inside: avoid !important;
          overflow: visible !important;
          min-height: 36pt !important;
        }

        /* Border validation indicator blocks */
        .print-solutions-key .border-green-200 { border-color: #10b981 !important; background: #f0fdf4 !important; }
        .print-solutions-key .border-red-200 { border-color: #ef4444 !important; background: #fef2f2 !important; }
        .print-solutions-key .text-green-700 { color: #15803d !important; }
        .print-solutions-key .text-red-700 { color: #b91c1c !important; }
        .print-solutions-key .bg-green-50\\/50 { background-color: #f0fdf4 !important; }
        .print-solutions-key .bg-red-50\\/50 { background-color: #fef2f2 !important; }
        .print-solutions-key .border-green-500 { border-color: #22c55e !important; }
        .print-solutions-key .border-red-500 { border-color: #ef4444 !important; }

        .print-clean-paper .strip-color-on-clean {
          border: 1px solid #cbd5e1 !important;
          background: #ffffff !important;
          color: #1e293b !important;
          box-shadow: none !important;
          font-weight: normal !important;
          outline: none !important;
        }

        .exam-explanation-box {
          margin-top: 12pt !important;
          padding: 14pt !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 4pt !important;
          background: #f8fafc !important;
          break-inside: avoid !important;
        }

        /* ===== KATEX NATIVE TYPOGRAPHY FIX: STOPS HORIZONTAL OVERLAP LINES ===== */
        .math-render {
          display: block !important;
          overflow: visible !important;
          line-height: normal !important; /* Critical: Stops lines overlapping over stacked components */
          margin-bottom: 4pt !important;
        }

        .katex, .katex * {
          overflow: visible !important;
          max-width: none !important;
          white-space: nowrap !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }

        .katex-display {
          display: block !important;
          overflow: visible !important;
          margin: 14pt 0 !important;
          text-align: center !important;
          width: 100% !important;
        }

        /* Native dynamic padding adjustments to prevent vector and radical clipping */
        .katex .base, .katex .vlist, .katex .vlist-t, .katex .mfrac, .katex .sqrt, .katex .op-symbol, .katex .mopen, .katex .mclose {
          display: inline-block !important;
          overflow: visible !important;
          height: auto !important;
          vertical-align: middle !important;
          padding: 6px 0 !important; /* Adds isolated safe vertical breathing room */
          margin: 2px 0 !important;
        }
        
        .katex .sqrt .sqrt-sign {
          top: 2px !important;
        }

        /* Clear underline artifact paths created during text wrap transitions */
        .katex .line {
          border-bottom: none !important;
        }

        .text-base {
          font-size: 11pt !important;
          line-height: 1.6 !important;
        }

        .rounded-xl {
          border-radius: 6pt !important;
        }
      }
    `;
    document.head.appendChild(styleOverride);

    setTimeout(() => {
      window.print();
    }, 400);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Session Details...</div>;
  if (!session) return null;

  const totalQuestions = session.questions?.length || 0;
  const correctCount = session.answers?.filter((a: any) => a.isCorrect).length || 0;
  const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="space-y-6 id-session-container animate-in fade-in duration-300">
      
      <style>{`
        .print-only-title { display: none; }
      `}</style>

      {/* Back Button (no-print) */}
      <button
        onClick={() => navigate('/admin/sessions')}
        className="no-print flex items-center text-gray-500 hover:text-blue-600 transition-colors cursor-pointer border-0 bg-transparent"
      >
        <ArrowLeft size={20} className="mr-2" /> Back to Sessions
      </button>

      {/* 🖨️ ACTION CONTROLS TOOLKIT PANEL */}
      <div className="no-print bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-5 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-semibold flex items-center gap-2 text-base">
            <Printer size={18} className="text-blue-400" /> Document Printing Toolkit
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">Export pristine text models into physical hardcopies or local PDF storage items.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => triggerNativePrint('paper-only')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-bold px-4 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg cursor-pointer transition-colors"
          >
            <FileText size={15} /> Question Paper Only
          </button>
          <button
            onClick={() => triggerNativePrint('full-solutions')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-bold px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer transition-colors"
          >
            <CheckSquare size={15} /> Full Answer Key / Solutions
          </button>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto space-y-6">

        {/* 📊 METRICS SCORE PANEL */}
        <div className="hide-on-clean-paper bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">Session Report & Answer Evaluation</h1>
              <p className="text-gray-500 text-sm flex items-center gap-2">
                Session Hash ID: <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{session.id}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-bold text-gray-800">{session.user?.name || "Guest Candidate"}</div>
                <div className="text-xs text-gray-500">{session.user?.email}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-bold text-gray-400 uppercase">Total Items</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold text-gray-800">{totalQuestions}</span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-bold text-gray-400 uppercase">Evaluated Score</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold text-gray-800">{correctCount} / {totalQuestions}</span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-bold text-gray-400 uppercase">Accuracy</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold text-green-600">{scorePercentage}%</span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-bold text-gray-400 uppercase">Session Date</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-semibold text-gray-700">{new Date(session.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 📋 PAPERS MAIN DOCUMENT BANNER */}
        <div className="print-only-title text-center border-b-2 border-slate-300 pb-4 mb-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 uppercase">Examination Question Paper</h2>
          <div className="text-sm font-semibold text-slate-500 mt-1">Total Questions: {totalQuestions} | Max Target Count Pool</div>
        </div>

        <h3 className="text-xl font-bold text-gray-800 mt-8 no-print">Response Analysis</h3>

        {/* --- MAIN QUESTION REVIEW SEQUENCE CONTAINER --- */}
        <div className="space-y-6">
          {session.questions.map((q: any, index: number) => {
            const answer = session.answers.find((a: any) => a.questionId === q.id);
            const isCorrect = answer?.isCorrect;
            const hasAnswered = !!answer;

            let responseBorder = "border-gray-200";
            if (hasAnswered) {
              responseBorder = isCorrect ? "border-green-200" : "border-red-200";
            }

            return (
              <div
                key={q.id}
                className={`bg-white rounded-xl border p-6 exam-question-card ${responseBorder}`}
              >
                <div className="flex justify-between items-center exam-question-header">
                  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                    Question {index + 1}
                  </span>

                  {hasAnswered && (
                    <div className="flex-shrink-0 hide-on-clean-paper">
                      {isCorrect ? (
                        <span className="flex items-center gap-1 text-green-600 text-sm font-bold bg-green-50 px-3 py-1 rounded-full">
                          <CheckCircle size={16} /> Correct
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500 text-sm font-bold bg-red-50 px-3 py-1 rounded-full">
                          <XCircle size={16} /> Incorrect
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="
                  text-base
                  font-medium
                  text-gray-800
                  mb-4
                  leading-relaxed
                  break-words
                  math-render
                  "
                >
                  <SafeMathRenderer text={q.questionText} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 exam-options-grid">
                  {['A', 'B', 'C', 'D'].map((opt) => {
                    const optionKey = `option${opt}`;
                    const optionText = q[optionKey];

                    let styleClasses = "border-gray-100 bg-white text-gray-600";
                    let activeMarkingClass = "";

                    if (answer?.selectedOption === opt) {
                      styleClasses = isCorrect
                        ? "border-green-500 bg-green-50/50 text-green-700 ring-1 ring-green-500 font-medium"
                        : "border-red-500 bg-red-50/50 text-red-700 ring-1 ring-red-500 font-medium";
                      activeMarkingClass = "hide-on-clean-paper";
                    }
                    else if (q.correctOption === opt && !isCorrect) {
                      styleClasses = "border-green-500 bg-white text-green-700 border-dashed border-2 font-medium";
                      activeMarkingClass = "hide-on-clean-paper";
                    }

                    return (
                      <div
                        key={opt}
                        className={`p-3 rounded-lg border text-sm flex items-center gap-3 transition-colors exam-option-item ${styleClasses} ${activeMarkingClass ? 'strip-color-on-clean' : ''}`}
                      >
                        <span className="font-bold flex-shrink-0">{opt}.</span>
                        
                        <div className="overflow-visible math-render flex-1">
                          <SafeMathRenderer text={optionText} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <div className="hide-on-clean-paper mt-3 p-4 bg-blue-50/60 rounded-lg border border-blue-100 text-sm text-blue-800 leading-relaxed exam-explanation-box">
                    <span className="font-bold block mb-1">Detailed Explanation:</span>
                    <SafeMathRenderer text={q.explanation} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
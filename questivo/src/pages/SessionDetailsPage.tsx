// src/pages/SessionDetailsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { 
  ArrowLeft, CheckCircle, XCircle, Clock, 
  HelpCircle, User, Award, AlertCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Session Details...</div>;
  if (!session) return null;

  // Calculate stats manually since backend might just send raw lists
  const totalQuestions = session.questions?.length || 0;
//   const answeredCount = session.answers?.length || 0;
  const correctCount = session.answers?.filter((a: any) => a.isCorrect).length || 0;
  const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Back Button */}
      <button 
        onClick={() => navigate('/admin/sessions')} 
        className="flex items-center text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" /> Back to Sessions
      </button>

      {/* --- Summary Header Card --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6 mb-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-1">Session Report</h1>
                <p className="text-gray-500 text-sm flex items-center gap-2">
                    ID: <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{session.id}</span>
                </p>
            </div>
            <div className="flex items-center gap-3">
                 <div className="text-right">
                    <div className="font-bold text-gray-800">{session.user?.name || "Guest User"}</div>
                    <div className="text-xs text-gray-500">{session.user?.email}</div>
                 </div>
                 <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                    <User size={24} />
                 </div>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Total Questions</p>
                <div className="flex items-center gap-2 mt-1">
                    <HelpCircle size={20} className="text-blue-500"/>
                    <span className="text-xl font-bold text-gray-800">{totalQuestions}</span>
                </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Score</p>
                <div className="flex items-center gap-2 mt-1">
                    <Award size={20} className={scorePercentage >= 50 ? "text-green-500" : "text-orange-500"}/>
                    <span className="text-xl font-bold text-gray-800">{correctCount} / {totalQuestions}</span>
                </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Accuracy</p>
                <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xl font-bold ${scorePercentage >= 50 ? "text-green-600" : "text-red-500"}`}>
                        {scorePercentage}%
                    </span>
                </div>
            </div>
             <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Created At</p>
                <div className="flex items-center gap-2 mt-1">
                    <Clock size={20} className="text-purple-500"/>
                    <span className="text-sm font-semibold text-gray-700">
                        {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                </div>
            </div>
        </div>
      </div>

      {/* --- Detailed Question Review --- */}
      <h3 className="text-xl font-bold text-gray-800 mt-8">Response Analysis</h3>
      <div className="space-y-4">
        {session.questions.map((q: any, index: number) => {
            // Find the user's answer for this specific question
            const answer = session.answers.find((a: any) => a.questionId === q.id);
            const isCorrect = answer?.isCorrect;
            const hasAnswered = !!answer;

            return (
                <div key={q.id} className={`bg-white rounded-xl border p-6 transition-all ${
                    hasAnswered 
                        ? (isCorrect ? "border-green-200 shadow-green-50" : "border-red-200 shadow-red-50")
                        : "border-gray-200 opacity-75"
                }`}>
                    <div className="flex justify-between items-start mb-4">
                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                            Q{index + 1}
                        </span>
                        {hasAnswered ? (
                            isCorrect ? (
                                <span className="flex items-center gap-1 text-green-600 text-sm font-bold bg-green-50 px-3 py-1 rounded-full">
                                    <CheckCircle size={16} /> Correct
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-red-500 text-sm font-bold bg-red-50 px-3 py-1 rounded-full">
                                    <XCircle size={16} /> Incorrect
                                </span>
                            )
                        ) : (
                             <span className="flex items-center gap-1 text-gray-400 text-sm font-bold bg-gray-50 px-3 py-1 rounded-full">
                                <AlertCircle size={16} /> Skipped
                            </span>
                        )}
                    </div>

                    <p className="text-lg font-medium text-gray-800 mb-4">{q.questionText}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Options Display */}
                        {['A', 'B', 'C', 'D'].map((opt) => {
                            const optionKey = `option${opt}`; // e.g. optionA
                            const optionText = q[optionKey];
                            
                            // Determine style based on correctness
                            let style = "border-gray-200 bg-white text-gray-600";
                            
                            // If this was the selected answer
                            if (answer?.selectedOption === opt) {
                                style = isCorrect 
                                    ? "border-green-500 bg-green-50 text-green-700 ring-1 ring-green-500" 
                                    : "border-red-500 bg-red-50 text-red-700 ring-1 ring-red-500";
                            } 
                            // If this IS the correct answer (but user didn't pick it)
                            else if (q.correctOption === opt && !isCorrect) {
                                style = "border-green-500 bg-white text-green-700 border-dashed border-2";
                            }

                            return (
                                <div key={opt} className={`p-3 rounded-lg border text-sm flex gap-3 ${style}`}>
                                    <span className="font-bold">{opt}.</span>
                                    <span>{optionText}</span>
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Explanation */}
                    {q.explanation && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
                            <span className="font-bold block mb-1">Explanation:</span>
                            {q.explanation}
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
};
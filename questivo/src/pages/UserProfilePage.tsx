// src/pages/UserProfilePage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, Mail, Phone, Calendar, Shield, BookOpen, Clock, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

export const UserProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get(`/users/${id}`);
        setUser(res.data.data);
      } catch (err) {
        toast.error("User not found");
        navigate('/admin/users');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id, navigate]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Profile...</div>;
  if (!user) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header / Back Button */}
      <button 
        onClick={() => navigate('/admin/users')} 
        className="flex items-center text-gray-500 hover:text-blue-600 transition-colors mb-4"
      >
        <ArrowLeft size={20} className="mr-2" /> Back to Users
      </button>

      {/* --- Profile Header Card --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-32 relative"></div>
        <div className="px-8 pb-8">
          <div className="relative flex justify-between items-end -mt-12 mb-6">
            <div className="flex items-end gap-6">
                <div className="w-24 h-24 bg-white rounded-full p-1 shadow-lg">
                    <div className="w-full h-full bg-slate-200 rounded-full flex items-center justify-center text-slate-400 text-2xl font-bold uppercase">
                        {user.name?.[0] || 'U'}
                    </div>
                </div>
                <div className="mb-1">
                    <h1 className="text-3xl font-bold text-gray-800">{user.name || "Unnamed User"}</h1>
                    <p className="text-gray-500 flex items-center gap-2">
                        {user.email} 
                        {user.isVerified && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">Verified</span>}
                    </p>
                </div>
            </div>
            <div className="flex flex-col items-end">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold mb-2 uppercase tracking-wider ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-600'}`}>
                    {user.role}
                </span>
                <span className="text-xs text-gray-400">ID: {user.id}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4 border-t border-gray-100">
            <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Contact & Info</h4>
                <div className="flex items-center gap-3 text-gray-700">
                    <Mail size={18} className="text-blue-500"/> {user.email}
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                    <Phone size={18} className="text-blue-500"/> {user.phone || "No Phone"}
                </div>
                <div className="flex items-center gap-3 text-gray-700 capitalize">
                    <Globe size={18} className="text-blue-500"/> {user.preferredMedium} Medium
                </div>
            </div>

            <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Account Details</h4>
                <div className="flex items-center gap-3 text-gray-700">
                    <Calendar size={18} className="text-orange-500"/> Joined: {new Date(user.createdAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                    <Shield size={18} className="text-orange-500"/> Provider: {user.authProvider}
                </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">Bio</h4>
                <p className="text-sm text-gray-600 italic">
                    {user.bio || "No bio information provided by this user."}
                </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- Activity History Section --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Clock size={20} /> Generated Sessions History
            </h3>
            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                {user.sessions?.length || 0} Total Sessions
            </span>
        </div>
        
        <table className="w-full text-left">
            <thead className="bg-white text-gray-500 text-xs uppercase font-semibold border-b">
                <tr>
                    <th className="px-6 py-4">Session Date</th>
                    <th className="px-6 py-4">Category / Type</th>
                    <th className="px-6 py-4">Questions</th>
                    <th className="px-6 py-4">Difficulty</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {user.sessions && user.sessions.length > 0 ? (
                    user.sessions.map((session: any) => (
                        <tr key={session.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-600">
                                {new Date(session.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                                <span className="flex items-center gap-2 text-gray-800 font-medium">
                                    <BookOpen size={16} className="text-blue-500"/> 
                                    {session.examCategory?.name || session.examType}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                                {session._count?.questions || session.numQuestions} Qs
                            </td>
                            <td className="px-6 py-4">
                                <span className={`text-xs uppercase font-bold px-2 py-1 rounded border ${
                                    session.difficulty === 'hard' ? 'border-red-200 bg-red-50 text-red-600' :
                                    session.difficulty === 'medium' ? 'border-yellow-200 bg-yellow-50 text-yellow-600' :
                                    'border-green-200 bg-green-50 text-green-600'
                                }`}>
                                    {session.difficulty}
                                </span>
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                            No sessions generated yet.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};
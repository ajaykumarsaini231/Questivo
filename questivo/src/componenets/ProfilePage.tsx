import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  User, Mail, Calendar, Shield, BookOpen, 
  Trophy, Target, BarChart2, Clock, 
  RefreshCw, Eye, Settings, Save, Lock, Image as ImageIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
// --- CONFIG ---
const API_BASE = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
    "http://localhost:4000"; 

// --- TYPES ---
interface UserProfile {
  name: string;
  email: string;
  authProvider: "LOCAL" | "GOOGLE" | "FACEBOOK";
  photoUrl: string | null;
  bio: string | null;
  preferredMedium: string;
  createdAt: string;
}

interface UserStats {
  totalGenerated: number;
  totalAttempted: number;
  averageScore: number;
  bestScore: number;
  attemptedTests:number;
}

interface TestHistory {
  sessionId: string;
  examType: string;
  createdAt: string;
  scorePercent: number;
  medium: string;
}

// --- MAIN COMPONENT ---
export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings'>('overview');
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<TestHistory[]>([]);

  // Settings Form State
  const [photoUrl, setPhotoUrl] = useState(''); 
  const [bio, setBio] = useState('');
  const [medium, setMedium] = useState('english');
  
  // Password Reset State
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  // --- FETCH DATA ---
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      // ✅ CHANGED: Pointing to the correct User Router endpoint
      const { data } = await axios.get(`${API_BASE}/api/user/me`, { withCredentials: true });
      
      if (data.success) {
        setUser(data.user);
        setStats(data.stats);
        
        // Map backend 'recentTests' to frontend 'history'
        setHistory(data.recentTests || []);
        
        // Init form state
        setBio(data.user.bio || '');
        setPhotoUrl(data.user.photoUrl || '');
        setMedium(data.user.preferredMedium || 'english');
      }
    } catch (err) {
      console.error("Profile Load Error:", err);
      toast.error("Failed to load profile. Please login again.");
      // Optional: navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  // --- UPDATE PROFILE HANDLER ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading("Saving changes...");
    
    try {
        const payload = {
            bio: bio,
            preferredMedium: medium,
            photoUrl: photoUrl
        };

        // ✅ ACTUAL API CALL
        const { data } = await axios.put(
            `${API_BASE}/api/user/profile`, 
            payload, 
            { withCredentials: true }
        );

        if (data.success) {
            // Update local state immediately
            setUser(prev => prev ? { ...prev, ...payload } : null);
            toast.success("Profile updated successfully!");
        } else {
            toast.error(data.message || "Update failed");
        }
    } catch (error) {
        console.error("Update Error:", error);
        toast.error("Failed to connect to server");
    } finally {
        toast.dismiss(loadingToast);
    }
  };

  // --- PASSWORD RESET HANDLER ---
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!oldPass || !newPass) return toast.error("Please fill all password fields");
    
    // Placeholder for password update API
    // await axios.post(`${API_BASE}/api/user/change-password`, { oldPass, newPass });
    
    toast.success("Password functionality coming soon!");
    setOldPass(''); setNewPass('');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 font-sans">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="max-w-6xl mx-auto space-y-6">

        {/* --- HEADER CARD --- */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <div className="h-32 bg-gradient-to-r from-indigo-600 to-purple-600 relative">
            <div className="absolute -bottom-12 left-6 sm:left-10">
              <div className="relative group">
                <img 
                  src={user?.photoUrl || `https://ui-avatars.com/api/?name=${user?.name}&background=random`} 
                  alt="Profile" 
                  className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-white shadow-md object-cover bg-white"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user?.name}`; }}
                />
                <div className="absolute bottom-2 right-2 h-4 w-4 sm:h-5 sm:w-5 bg-green-500 border-2 border-white rounded-full" title="Online"></div>
              </div>
            </div>
          </div>
          
          <div className="pt-16 pb-6 px-6 sm:px-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{user?.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 mt-2">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-slate-400" /> {user?.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" /> Joined {new Date(user!.createdAt).toLocaleDateString()}
                </span>
                <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                  user?.authProvider === 'LOCAL' 
                    ? 'bg-slate-100 text-slate-600 border-slate-200' 
                    : 'bg-blue-50 text-blue-600 border-blue-100'
                }`}>
                  <Shield className="h-3 w-3" /> {user?.authProvider}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md"
            >
              <Settings className="h-4 w-4" /> Edit Profile
            </button>
          </div>
        </div>

        {/* --- STATS ROW --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Tests Generated" 
            value={stats?.totalGenerated || 0} 
            icon={<BookOpen className="text-blue-600" />} 
            bg="bg-blue-50" 
          />
          <StatCard 
            label="Tests Attempted" 
            value={stats?.attemptedTests || 0} // Matches backend response key
            icon={<Target className="text-green-600" />} 
            bg="bg-green-50" 
          />
          <StatCard 
            label="Average Score" 
            value={`${stats?.averageScore || 0}%`} // Matches backend response key
            icon={<BarChart2 className="text-violet-600" />} 
            bg="bg-violet-50" 
          />
          <StatCard 
            label="Best Score" 
            value={`${stats?.bestScore || 0}%`} 
            icon={<Trophy className="text-amber-500" />} 
            bg="bg-amber-50" 
          />
        </div>

        {/* --- MAIN CONTENT TABS --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px] overflow-hidden">
          
          {/* Tabs Header */}
          <div className="flex border-b border-slate-200 overflow-x-auto">
            <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <TabButton label="Test History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            <TabButton label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>

          {/* Tab Content */}
          <div className="p-4 sm:p-8">
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <h3 className="text-lg font-bold text-slate-800 mb-5">Recent Activity</h3>
                {history.length > 0 ? (
                  <div className="space-y-3">
                    {history.slice(0, 5).map((test) => (
                      <HistoryRow key={test.sessionId} test={test} navigate={navigate} />
                    ))}
                  </div>
                ) : (
                  <EmptyState navigate={navigate} />
                )}
              </motion.div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-800">All Tests</h3>
                  <button onClick={fetchProfile} className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1.5 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </button>
                </div>
                {history.length > 0 ? (
                  <div className="space-y-3">
                    {history.map((test) => (
                      <HistoryRow key={test.sessionId} test={test} navigate={navigate} />
                    ))}
                  </div>
                ) : (
                  <EmptyState navigate={navigate} />
                )}
              </motion.div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="grid md:grid-cols-2 gap-12">
                
                {/* General Settings */}
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <User className="h-5 w-5 text-indigo-500" />
                    <h3 className="text-lg font-bold text-slate-800">General Info</h3>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
                    <input disabled value={user?.name} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed font-medium" />
                    <p className="text-xs text-slate-400 mt-1">Name cannot be changed manually.</p>
                  </div>

                  {/* Photo URL Input */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Profile Photo</label>
                    <div className="flex gap-4 items-start">
                        <img 
                            src={photoUrl || `https://ui-avatars.com/api/?name=${user?.name}`} 
                            alt="Preview"
                            className="h-12 w-12 rounded-full object-cover border border-slate-200 flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user?.name}`; }}
                        />
                        <div className="flex-1 w-full">
                            <div className="relative">
                                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                                <input 
                                    type="text"
                                    value={photoUrl}
                                    onChange={(e) => setPhotoUrl(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                                    placeholder="https://example.com/photo.jpg"
                                />
                            </div>
                        </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Preferred Language</label>
                    <div className="relative">
                        <select 
                        value={medium} 
                        onChange={(e) => setMedium(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none cursor-pointer"
                        >
                        <option value="english">English</option>
                        <option value="hindi">Hindi</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Bio</label>
                    <textarea 
                      value={bio} 
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      placeholder="Tell us about your study goals..."
                    />
                  </div>
                  
                  <button  type="submit" className="w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform active:scale-95">
                    <Save className="h-4 w-4" /> Save Changes
                  </button>
                </form>

                {/* Security Settings */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <Lock className="h-5 w-5 text-indigo-500" />
                        <h3 className="text-lg font-bold text-slate-800">Security</h3>
                    </div>

                    {user?.authProvider === 'LOCAL' ? (
                    <form onSubmit={handlePasswordReset} className="space-y-4">
                        <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Current Password</label>
                        <input 
                            type="password" 
                            value={oldPass}
                            onChange={(e) => setOldPass(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="••••••••"
                        />
                        </div>
                        <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
                        <input 
                            type="password" 
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="••••••••"
                        />
                        </div>

                        <button className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all shadow-lg shadow-slate-200">
                        Update Password
                        </button>
                    </form>
                    ) : (
                    <div className="bg-blue-50/50 p-8 rounded-2xl border border-blue-100 flex flex-col items-center justify-center text-center h-64">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                            <Shield className="h-8 w-8 text-blue-500" />
                        </div>
                        <h4 className="font-bold text-blue-900 text-lg">Managed by {user?.authProvider}</h4>
                        <p className="text-sm text-blue-600 mt-2 max-w-xs leading-relaxed">
                        Your account security is managed by your social login provider. You don't need to manage a password here.
                        </p>
                    </div>
                    )}
                </div>

              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SUB COMPONENTS ---

const StatCard = ({ label, value, icon, bg }: any) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5 hover:shadow-md transition-all duration-300">
    <div className={`p-4 rounded-xl ${bg} flex-shrink-0`}>
      {React.cloneElement(icon, { className: `h-6 w-6 ${icon.props.className}` })}
    </div>
    <div>
      <p className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">{label}</p>
      <h3 className="text-2xl font-black text-slate-800">{value}</h3>
    </div>
  </div>
);

const TabButton = ({ label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
      active 
        ? 'border-indigo-600 text-indigo-600 bg-indigo-50/10' 
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }`}
  >
    {label}
  </button>
);

const HistoryRow = ({ test, navigate }: any) => (
  <div className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all duration-300 gap-4">
    <div className="flex items-start sm:items-center gap-4">
      <div className={`mt-1.5 sm:mt-0 h-3 w-3 rounded-full flex-shrink-0 ${test.scorePercent >= 50 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
      <div>
        <h4 className="font-bold text-slate-800 text-lg group-hover:text-indigo-700 transition-colors">{test.examType}</h4>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
          <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md font-medium"><Clock className="h-3 w-3"/> {new Date(test.createdAt).toLocaleDateString()}</span>
          <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md font-bold uppercase text-[10px] tracking-wide">{test.medium}</span>
        </div>
      </div>
    </div>
    
    <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pl-7 sm:pl-0 border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
      <div className="text-left sm:text-right">
        <span className="block text-xl font-black text-slate-900">{test.scorePercent ?? 0}%</span>
        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Score</span>
      </div>
      
      <div className="flex gap-2">
        <button 
          onClick={() => navigate(`/tests/${test.sessionId}/result`)}
          className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100" 
          title="View Result"
        >
          <Eye className="h-5 w-5" />
        </button>
        <button 
          onClick={() => navigate(`/tests/${test.sessionId}`)}
          className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100" 
          title="Retake Test"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
);

const EmptyState = ({ navigate }: any) => (
  <div className="text-center py-16 flex flex-col items-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
    <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
      <BookOpen className="h-8 w-8 text-indigo-400" />
    </div>
    <h3 className="text-lg font-bold text-slate-900">No tests taken yet</h3>
    <p className="text-slate-500 mb-6 max-w-xs mx-auto leading-relaxed">Generate your first test to start tracking your performance analytics and progress.</p>
    <button 
      onClick={() => navigate('/GenerateTestPage')}
      className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 transform hover:-translate-y-0.5"
    >
      Create New Test
    </button>
  </div>
);
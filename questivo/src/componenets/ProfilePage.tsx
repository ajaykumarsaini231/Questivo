import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  User, Mail, Calendar, Shield, BookOpen, 
  Trophy, Target, BarChart2, Clock, 
  RefreshCw, Eye, Settings, Save, Lock
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// --- CONFIG ---
const API_BASE = "http://localhost:4000"; // Update port if needed

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
}

interface TestHistory {
  id: string;
  examName: string;
  date: string;
  score: number;
  difficulty: string;
  status: 'Completed' | 'Incomplete';
}

// --- COMPONENTS ---

export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings'>('overview');
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<TestHistory[]>([]);

  // Settings Form State
  const [bio, setBio] = useState('');
  const [medium, setMedium] = useState('english');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  // Fetch Data
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/api/auth/stats`, { withCredentials: true });
      if (data.success) {
        setUser(data.user);
        setStats(data.stats);
        setHistory(data.history);
        
        // Init form state
        setBio(data.user.bio || '');
        setMedium(data.user.preferredMedium || 'english');
      }
    } catch (err) {
      toast.error("Failed to load profile");
      navigate('/signup');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.loading("Updating...");
    // Implement API call to update bio/medium here
    setTimeout(() => { toast.dismiss(); toast.success("Profile Updated!"); }, 1000);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!oldPass || !newPass) return toast.error("Fill all fields");
    
    // Implement API call for password reset
    toast.success("Password changed successfully!");
    setOldPass(''); setNewPass('');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* --- HEADER CARD --- */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <div className="h-32 bg-gradient-to-r from-indigo-600 to-violet-600 relative">
            <div className="absolute -bottom-12 left-8">
              <div className="relative">
                <img 
                  src={user?.photoUrl || `https://ui-avatars.com/api/?name=${user?.name}&background=random`} 
                  alt="Profile" 
                  className="h-24 w-24 rounded-full border-4 border-white shadow-md object-cover bg-white"
                />
                <div className="absolute bottom-1 right-1 h-5 w-5 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
            </div>
          </div>
          
          <div className="pt-14 pb-6 px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{user?.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" /> {user?.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Joined {new Date(user!.createdAt).toLocaleDateString()}
                </span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  user?.authProvider === 'LOCAL' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  <Shield className="h-3 w-3" /> {user?.authProvider}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Settings className="h-4 w-4" /> Edit Profile
            </button>
          </div>
        </div>

        {/* --- STATS ROW --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            label="Tests Generated" 
            value={stats?.totalGenerated || 0} 
            icon={<BookOpen className="text-blue-600" />} 
            bg="bg-blue-50" 
          />
          <StatCard 
            label="Tests Attempted" 
            value={stats?.totalAttempted || 0} 
            icon={<Target className="text-green-600" />} 
            bg="bg-green-50" 
          />
          <StatCard 
            label="Average Score" 
            value={`${stats?.averageScore}%`} 
            icon={<BarChart2 className="text-violet-600" />} 
            bg="bg-violet-50" 
          />
          <StatCard 
            label="Best Score" 
            value={`${stats?.bestScore}%`} 
            icon={<Trophy className="text-amber-500" />} 
            bg="bg-amber-50" 
          />
        </div>

        {/* --- MAIN CONTENT TABS --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px]">
          
          {/* Tabs Header */}
          <div className="flex border-b border-slate-200">
            <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <TabButton label="Test History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            <TabButton label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>

          {/* Tab Content */}
          <div className="p-6">
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Activity</h3>
                {history.length > 0 ? (
                  <div className="space-y-3">
                    {history.slice(0, 5).map((test) => (
                      <HistoryRow key={test.id} test={test} navigate={navigate} />
                    ))}
                  </div>
                ) : (
                  <EmptyState navigate={navigate} />
                )}
              </motion.div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-800">All Tests</h3>
                  <button onClick={fetchProfile} className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1">
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </button>
                </div>
                {history.length > 0 ? (
                  <div className="space-y-3">
                    {history.map((test) => (
                      <HistoryRow key={test.id} test={test} navigate={navigate} />
                    ))}
                  </div>
                ) : (
                  <EmptyState navigate={navigate} />
                )}
              </motion.div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-10">
                
                {/* General Settings */}
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <User className="h-5 w-5 text-indigo-500" /> General Info
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <input disabled value={user?.name} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Language (Medium)</label>
                    <select 
                      value={medium} 
                      onChange={(e) => setMedium(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      <option value="english">English</option>
                      <option value="hindi">Hindi</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
                    <textarea 
                      value={bio} 
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                      placeholder="Tell us about your preparation..."
                    />
                  </div>
                  
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
                    <Save className="h-4 w-4" /> Save Changes
                  </button>
                </form>

                {/* Password Reset (Only for LOCAL auth) */}
                {user?.authProvider === 'LOCAL' ? (
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <Lock className="h-5 w-5 text-indigo-500" /> Change Password
                    </h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                      <input 
                        type="password" 
                        value={oldPass}
                        onChange={(e) => setOldPass(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                      <input 
                        type="password" 
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>

                    <button className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors">
                      Update Password
                    </button>
                  </form>
                ) : (
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex flex-col items-center justify-center text-center h-full">
                    <Shield className="h-10 w-10 text-blue-500 mb-3" />
                    <h4 className="font-bold text-blue-800">Managed by {user?.authProvider}</h4>
                    <p className="text-sm text-blue-600 mt-1">
                      Your security is managed by your provider. You don't need a password here.
                    </p>
                  </div>
                )}

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
  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`p-3 rounded-lg ${bg}`}>
      {React.cloneElement(icon, { className: `h-6 w-6 ${icon.props.className}` })}
    </div>
    <div>
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
    </div>
  </div>
);

const TabButton = ({ label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
      active 
        ? 'border-indigo-600 text-indigo-600' 
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`}
  >
    {label}
  </button>
);

const HistoryRow = ({ test, navigate }: any) => (
  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors">
    <div className="flex items-center gap-4">
      <div className={`h-2 w-2 rounded-full ${test.score >= 50 ? 'bg-green-500' : 'bg-red-500'}`} />
      <div>
        <h4 className="font-bold text-slate-800">{test.examName}</h4>
        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3"/> {new Date(test.date).toLocaleDateString()}</span>
          <span className="px-1.5 py-0.5 bg-slate-200 rounded">{test.difficulty}</span>
        </div>
      </div>
    </div>
    
    <div className="flex items-center gap-4">
      <div className="text-right hidden sm:block">
        <span className="block text-xl font-bold text-slate-900">{test.score}%</span>
        <span className="text-xs text-slate-500">Score</span>
      </div>
      
      <div className="flex gap-2">
        <button 
          onClick={() => navigate(`/tests/${test.id}/result`)}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" 
          title="View Result"
        >
          <Eye className="h-5 w-5" />
        </button>
        <button 
          onClick={() => navigate(`/tests/${test.id}`)}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" 
          title="Retake Test"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
);

const EmptyState = ({ navigate }: any) => (
  <div className="text-center py-12 flex flex-col items-center">
    <div className="bg-slate-100 p-4 rounded-full mb-4">
      <BookOpen className="h-8 w-8 text-slate-400" />
    </div>
    <h3 className="text-lg font-medium text-slate-900">No tests taken yet</h3>
    <p className="text-slate-500 mb-6 max-w-xs mx-auto">Generate your first test to start tracking your performance analytics.</p>
    <button 
      onClick={() => navigate('/GenerateTestPage')}
      className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
    >
      Create New Test
    </button>
  </div>
);
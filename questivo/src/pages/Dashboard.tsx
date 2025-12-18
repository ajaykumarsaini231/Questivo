// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Users, BookOpen, PlayCircle, Clock, User } from 'lucide-react';

// --- Stat Card Component ---
const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`p-4 rounded-full ${color} bg-opacity-10`}>
      <Icon size={32} className={color.replace('bg-', 'text-')} />
    </div>
    <div>
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
    </div>
  </div>
);

export const Dashboard = () => {
  // State for stats counts
  const [stats, setStats] = useState({ users: 0, sessions: 0, categories: 0, pending: 0 });
  // State for recent sessions table
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Counts
        const statsRes = await api.get('/stats');
        setStats(statsRes.data.data);

        // 2. Fetch Recent Sessions (Re-using your existing sessions endpoint with limit)
        const sessionsRes = await api.get('/sessions?page=1&limit=5'); 
        setRecentSessions(sessionsRes.data.data);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-800">Dashboard Overview</h2>
      
      {/* --- Top Stats Cards --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Users" value={stats.users} icon={Users} color="bg-blue-500" />
        <StatCard title="Total Sessions" value={stats.sessions} icon={PlayCircle} color="bg-green-500" />
        <StatCard title="Categories" value={stats.categories} icon={BookOpen} color="bg-purple-500" />
        <StatCard title="Pending Users" value={stats.pending} icon={Clock} color="bg-orange-500" />
      </div>

      {/* --- Recent Activity Section (Replaced Placeholder) --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">Recently Created Sessions</h3>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Latest 5</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-gray-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Exam Category</th>
                <th className="px-6 py-3">Questions</th>
                <th className="px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading activity...</td></tr>
              ) : recentSessions.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No sessions found.</td></tr>
              ) : (
                recentSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 text-sm">
                            {session.user?.name || "Guest / Anonymous"}
                          </p>
                          <p className="text-xs text-gray-500">{session.user?.email || "No email"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-md border border-purple-100">
                        {session.examCategory?.name || session.examType || "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <span className="font-medium">{session._count?.questions || 0}</span> Questions
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(session.createdAt).toLocaleDateString()} 
                      <span className="text-gray-400 text-xs ml-1">
                        {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
// src/pages/PendingUsersPage.tsx
import { useEffect, useState } from 'react';
import { api, handleApiError } from '../lib/api';
import { Trash2, Clock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export const PendingUsersPage = () => {
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    try {
      setLoading(true);
      const res = await api.get('/pending-users');
      setPendingUsers(res.data.data);
    } catch (err) { toast.error("Failed to load data"); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPending(); }, []);

  const handleDelete = async (email: string) => {
    if (!window.confirm(`Delete pending request for ${email}?`)) return;
    try {
      await api.delete(`/pending-users/${email}`);
      toast.success("Request removed");
      fetchPending();
    } catch (err) { toast.error(handleApiError(err)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-slate-800">Pending Registrations</h2>
            <p className="text-gray-500 mt-1">Users who have OTPs but haven't verified yet.</p>
        </div>
        <button onClick={fetchPending} className="p-2 bg-white border rounded-lg hover:bg-gray-50 text-gray-600">
            <RefreshCw size={20} />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-amber-50 border-b border-amber-100 text-amber-800 text-sm uppercase font-semibold">
            <tr>
              <th className="px-6 py-4">Email (ID)</th>
              <th className="px-6 py-4">Temp Name</th>
              <th className="px-6 py-4">OTP Expires At</th>
              <th className="px-6 py-4">Created At</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : pendingUsers.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No pending users found.</td></tr>
            ) : pendingUsers.map((user) => (
              <tr key={user.email} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-800">{user.email}</td>
                <td className="px-6 py-4 text-gray-600">{user.name || "N/A"}</td>
                <td className="px-6 py-4 text-red-500 text-sm flex items-center gap-2">
                    <Clock size={14}/> {new Date(user.otpExpiresAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-gray-500 text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleDelete(user.email)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Delete Request">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
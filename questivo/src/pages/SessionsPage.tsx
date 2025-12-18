// src/pages/SessionsPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, handleApiError } from '../lib/api';
import { 
  FileText, Trash2, Eye, ChevronLeft, ChevronRight, 
  Calendar, User, Layers, CheckSquare, Square, AlertTriangle, X 
} from 'lucide-react';
import toast from 'react-hot-toast';

export const SessionsPage = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/sessions?page=${page}&limit=10`);
      setSessions(res.data.data);
      const total = res.data.meta.total;
      setTotalPages(Math.ceil(total / 10));
      setSelectedIds([]); 
    } catch (err) {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [page]);

  // --- Selection Logic ---

  const toggleSelectAll = () => {
    if (selectedIds.length === sessions.length) {
      setSelectedIds([]); 
    } else {
      setSelectedIds(sessions.map(s => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(itemId => itemId !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  // --- NEW: Custom Toast Confirmation Helper ---
  
  const showDeleteConfirmation = (count: number, onConfirm: () => void) => {
    toast.custom((t) => (
      <div className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
        <div className="flex-1 w-0 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 pt-0.5">
               <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                 <AlertTriangle className="h-6 w-6 text-red-600" />
               </div>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">
                Delete {count > 1 ? `${count} Sessions` : 'Session'}?
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Are you sure you want to delete this? This action cannot be undone.
              </p>
              <div className="mt-3 flex gap-3">
                 <button
                    onClick={() => {
                        toast.dismiss(t.id);
                        onConfirm(); // Execute deletion
                    }}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
                 >
                    Delete
                 </button>
                 <button
                    onClick={() => toast.dismiss(t.id)}
                    className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                 >
                    Cancel
                 </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex border-l border-gray-200">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-600 hover:text-gray-500 focus:outline-none"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    ), { duration: 5000 }); // Toast stays for 5 seconds
  };


  // --- Updated Delete Handlers ---

  const handleDelete = (id: string) => {
    // Call our new custom toast instead of window.confirm
    showDeleteConfirmation(1, async () => {
        try {
            await api.delete(`/sessions/${id}`);
            toast.success("Session deleted successfully");
            fetchSessions();
        } catch (err) {
            toast.error(handleApiError(err));
        }
    });
  };

  const handleBulkDelete = () => {
    // Call our new custom toast
    showDeleteConfirmation(selectedIds.length, async () => {
        try {
            await Promise.all(selectedIds.map(id => api.delete(`/sessions/${id}`)));
            toast.success(`${selectedIds.length} sessions deleted`);
            setSelectedIds([]);
            fetchSessions();
        } catch (err) {
            toast.error("Some deletions failed");
            fetchSessions();
        }
    });
  };

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Test Sessions</h2>
          <p className="text-gray-500 mt-1">Monitor all generated tests and attempts</p>
        </div>
      </div>

      {/* --- BULK ACTION BAR --- */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg flex justify-between items-center animate-in slide-in-from-top-2 duration-200 sticky top-4 z-10">
          <div className="flex items-center gap-3 font-medium">
             <span className="bg-white/20 px-2 py-1 rounded text-sm">{selectedIds.length} Selected</span>
             <span>Actions:</span>
          </div>
          <div className="flex gap-3">
             <button 
                onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 hover:bg-white/10 rounded-md text-sm transition-colors"
             >
                Cancel
             </button>
             <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 bg-white text-blue-600 px-4 py-1.5 rounded-md text-sm font-bold hover:bg-gray-100 transition-colors shadow-sm"
             >
                <Trash2 size={16} /> Delete Selected
             </button>
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-gray-100 text-gray-500 text-sm uppercase font-semibold">
              <tr>
                <th className="px-6 py-4 w-12">
                   <button onClick={toggleSelectAll} className="flex items-center text-gray-400 hover:text-blue-600">
                      {sessions.length > 0 && selectedIds.length === sessions.length ? (
                        <CheckSquare size={20} className="text-blue-600" />
                      ) : (
                        <Square size={20} />
                      )}
                   </button>
                </th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Exam Info</th>
                <th className="px-6 py-4">Questions</th>
                <th className="px-6 py-4">Date Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Loading sessions...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No sessions recorded yet.</td></tr>
              ) : sessions.map((session) => {
                const isSelected = selectedIds.includes(session.id);
                return (
                  <tr 
                    key={session.id} 
                    onClick={() => navigate(`/admin/sessions/${session.id}`)}
                    className={`transition-colors cursor-pointer group ${
                        isSelected ? "bg-blue-50/60 hover:bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                       <button onClick={() => toggleSelectOne(session.id)} className="flex items-center">
                          {isSelected ? (
                             <CheckSquare size={20} className="text-blue-600" />
                          ) : (
                             <Square size={20} className="text-gray-300 hover:text-blue-400" />
                          )}
                       </button>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2 rounded-full text-blue-600">
                          <User size={18} />
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{session.user?.name || "Anonymous/Guest"}</div>
                          <div className="text-xs text-gray-500">{session.user?.email || "No Email"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Layers size={16} className="text-purple-500"/>
                          <span className="text-gray-700 font-medium">
                            {session.examCategory?.name || session.examType || "General"}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block border ${
                          session.difficulty === 'HARD' ? 'bg-red-50 text-red-600 border-red-100' : 
                          session.difficulty === 'MEDIUM' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
                          'bg-green-50 text-green-600 border-green-100'
                        }`}>
                          {session.difficulty || 'Normal'}
                        </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-medium text-sm">
                          <FileText size={14} /> {session._count?.questions || session.numQuestions} Qs
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                          <Calendar size={14}/>
                          {new Date(session.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-400 pl-6 mt-0.5">
                          {new Date(session.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/sessions/${session.id}`); }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="Delete Session"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-gray-600 text-sm disabled:opacity-50 hover:text-blue-600">
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm font-medium text-gray-600">Page {page} of {totalPages || 1}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-gray-600 text-sm disabled:opacity-50 hover:text-blue-600">
              Next <ChevronRight size={16} />
            </button>
        </div>
      </div>
    </div>
  );
};
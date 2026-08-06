// src/pages/UsersPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, handleApiError } from "../lib/api";
import {
  Search,
  Trash2,
  Edit2,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  X,
  Save,
  UserPlus,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Per-account switch for the AI paper writer.
 *
 * WHAT IT ACTUALLY MOVES
 *
 * PATCH /api/admin/users/:id/entitlements, which adds or removes "aiGeneration"
 * from that user's `entitlements` column. On their next request that decides
 * four things at once: whether POST /api/tests/generate answers or returns 402,
 * whether /GenerateTestPage renders its form or a lock screen, whether
 * "Generate Test" appears in their navigation, and where every "generate a
 * paper" button on the site sends them. All four read the same
 * GET /api/features, so they cannot disagree.
 *
 * WHAT IT DOES NOT MOVE
 *
 * The site-wide default. PREMIUM_AI_GENERATION in the API's environment decides
 * for everyone with nothing granted here, and this switch can only OPEN the
 * feature for one person, never close it. While that variable is `on` the
 * feature is free for everybody and this control is beside the point — it is
 * for the normal case, where generation is paid and a named account has been
 * given it.
 *
 * WHY IT IS FIXED ON FOR ADMINS
 *
 * The server grants every entitlement to `admin` and `superadmin` by role, so a
 * switch that appeared to be off for them would be lying — they can generate
 * either way. It is shown as on and disabled rather than hidden, because a blank
 * cell reads as "not loaded yet".
 */
const AiAccessToggle = ({
  user,
  onChanged,
}: {
  user: any;
  onChanged: (entitlements: string[]) => void;
}) => {
  const [busy, setBusy] = useState(false);

  const byRole = user.role === "admin" || user.role === "superadmin";
  const on = byRole || (user.entitlements ?? []).includes("aiGeneration");
  const who = user.name || user.email || "this user";

  const toggle = async (e: React.MouseEvent) => {
    // The whole row is a link to the profile. Without this, granting access
    // also navigates away from the list you were working through.
    e.stopPropagation();
    if (byRole || busy) return;

    const granted = !on;
    setBusy(true);
    try {
      const res = await api.patch(`/users/${user.id}/entitlements`, {
        feature: "aiGeneration",
        granted,
      });
      // Take the list the server returned rather than assuming ours is now
      // right: it normalises the column, and if two admins are editing the same
      // account this is the state that actually exists.
      onChanged(res.data?.data?.entitlements ?? []);
      toast.success(
        granted ? `AI generation enabled for ${who}` : `AI generation disabled for ${who}`
      );
    } catch (err) {
      // Deliberately not optimistic. A switch that flips and then flips back is
      // worse than one that waits: the admin has already moved on believing the
      // grant was made.
      toast.error(handleApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`AI paper generation for ${who}`}
        title={
          byRole
            ? `${user.role}s can always generate AI papers`
            : on
              ? "Click to remove AI paper generation"
              : "Click to allow AI paper generation"
        }
        disabled={byRole || busy}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
          on ? "bg-indigo-600" : "bg-gray-300"
        } ${byRole || busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-xs font-medium text-gray-500">
        {byRole ? `By ${user.role}` : on ? "Allowed" : "Off"}
      </span>
    </div>
  );
};

export const UsersPage = () => {
  const navigate = useNavigate();

  // --- Data State ---
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // --- Modal & Form State ---
  const initialFormState = {
    name: "",
    email: "",
    phone: "",
    role: "user",
    isVerified: true,
    preferredMedium: "english",
    bio: "",
    password: "",
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [formData, setFormData] = useState<any>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Fetch Users ---
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get(
        `/users?page=${page}&limit=10&search=${search}`
      );
      setUsers(res.data.data);
      setTotalPages(res.data.meta.pages);
    } catch (err) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Debounce Search & Pagination Effect
  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), 300);
    return () => clearTimeout(timer);
  }, [page, search]);

  // --- Actions ---

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure? This action cannot be undone.")) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("User deleted");
      fetchUsers();
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const openCreateModal = () => {
    setModalMode("create");
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setModalMode("edit");
    setEditingId(user.id);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role,
      isVerified: user.isVerified,
      preferredMedium: user.preferredMedium || "english",
      bio: user.bio || "",
      password: "", // Keep empty unless changing
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalMode === "create") {
        await api.post("/users", formData);
        toast.success("User created successfully");
      } else {
        // Prepare payload: Remove password if it's empty (don't overwrite with empty string)
        const payload = { ...formData };
        if (!payload.password) delete payload.password;

        await api.put(`/users/${editingId}`, payload);
        toast.success("User updated successfully");
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* --- Page Header --- */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-3xl font-bold text-slate-800">User Management</h2>

        <div className="flex gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 md:flex-none">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search users..."
              className="pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Add User Button */}
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-all"
          >
            <UserPlus size={18} />{" "}
            <span className="hidden md:inline">Add User</span>
          </button>
        </div>
      </div>

      {/* --- Data Table --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead className="bg-slate-50 border-b border-gray-100 text-gray-500 text-sm uppercase font-semibold">
            <tr>
              <th className="px-6 py-4">User Info</th>
              <th className="px-6 py-4">Role & Auth</th>
              <th className="px-6 py-4">Profile Details</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-500" />
                  AI Access
                </span>
              </th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-gray-400"
                >
                  No users found matching your search.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  // 1. Navigate on row click
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  // 2. Add pointer cursor
                  className="hover:bg-gray-50 transition-colors group cursor-pointer"
                >
                  {/* User Info Column */}
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-800 text-base">
                      {user.name || "N/A"}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                    {user.phone && (
                      <div className="text-xs text-gray-400 mt-1">
                        {user.phone}
                      </div>
                    )}
                  </td>

                  {/* Role Column */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          user.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {user.role}
                      </span>
                      <span className="text-xs text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        {user.authProvider}
                      </span>
                    </div>
                  </td>

                  {/* Profile Details Column */}
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="capitalize mb-1">
                      <span className="text-gray-400 text-xs uppercase mr-2">
                        Medium:
                      </span>
                      {user.preferredMedium}
                    </div>
                    {user.bio ? (
                      <div
                        className="truncate w-32 text-xs text-gray-400 italic"
                        title={user.bio}
                      >
                        "{user.bio}"
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">No bio</span>
                    )}
                  </td>

                  {/* Status Column */}
                  <td className="px-6 py-4">
                    {user.isVerified ? (
                      <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                        <CheckCircle size={16} /> Verified
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500 text-sm font-medium">
                        <XCircle size={16} /> Pending
                      </div>
                    )}
                  </td>

                  {/* AI Access Column — see AiAccessToggle for what it moves. */}
                  <td className="px-6 py-4">
                    <AiAccessToggle
                      user={user}
                      onChanged={(entitlements) =>
                        // Patch the one row rather than refetching the page.
                        // A refetch re-runs the search and the pagination, and
                        // a row that jumps or disappears under the cursor mid-
                        // way through granting access to a list of people is
                        // how the wrong account gets the grant.
                        setUsers((prev) =>
                          prev.map((u) => (u.id === user.id ? { ...u, entitlements } : u))
                        )
                      }
                    />
                  </td>

                  {/* Actions Column */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {/* View Profile (Optional now, since row clicks, but good for clarity) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Stop row click
                          navigate(`/admin/users/${user.id}`);
                        }}
                        className="p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 rounded-full transition-colors"
                        title="View Full Profile"
                      >
                        <Eye size={18} />
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // 3. STOP PROPAGATION (Don't navigate)
                          openEditModal(user);
                        }}
                        className="p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors"
                        title="Edit User"
                      >
                        <Edit2 size={18} />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // 3. STOP PROPAGATION (Don't navigate)
                          handleDelete(user.id);
                        }}
                        className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors"
                        title="Delete User"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* --- Pagination Controls --- */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 text-sm disabled:opacity-50 hover:bg-gray-50 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft size={16} /> Previous
          </button>

          <span className="text-sm font-medium text-gray-600">
            Page {page} of {totalPages}
          </span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 text-sm disabled:opacity-50 hover:bg-gray-50 hover:text-blue-600 transition-colors"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ================= MODAL FORM ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all scale-100">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-slate-800">
                {modalMode === "create" ? "Add New User" : "Edit User Details"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-200 p-1 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 disabled:bg-gray-100 disabled:text-gray-500"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    disabled={modalMode === "edit"}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Bio / Notes
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 h-24 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    value={formData.bio}
                    onChange={(e) =>
                      setFormData({ ...formData, bio: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Password{" "}
                    {modalMode === "edit" && (
                      <span className="text-gray-400 font-normal normal-case">
                        (Leave blank to keep current)
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    placeholder={
                      modalMode === "create" ? "Required" : "••••••••"
                    }
                    className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Role
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Language
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.preferredMedium}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          preferredMedium: e.target.value,
                        })
                      }
                    >
                      <option value="english">English</option>
                      <option value="hindi">Hindi</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4">
                  <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                      checked={formData.isVerified}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isVerified: e.target.checked,
                        })
                      }
                    />
                    <span className="font-medium text-gray-700">
                      Mark Account as Verified
                    </span>
                  </label>
                </div>

                <div className="pt-4 flex gap-3 mt-auto">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 font-medium shadow-md"
                  >
                    <Save size={18} />{" "}
                    {modalMode === "create" ? "Create User" : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

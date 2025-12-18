import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, BookOpen, FileText, 
  LogOut, UserCog, Menu, X, ChevronRight 
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { api } from '../lib/api'; // Your configured Axios instance

// --- Sidebar Item Component (Elegant Style) ---
const SidebarItem = ({ 
  to, 
  icon: Icon, 
  label, 
  onClick 
}: { 
  to: string; 
  icon: any; 
  label: string;
  onClick?: () => void;
}) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `group flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 ease-in-out mx-3 mb-1 ${
        isActive 
          ? 'bg-indigo-50 text-indigo-600 font-semibold shadow-sm ring-1 ring-indigo-100' 
          : 'text-slate-500 hover:bg-gray-50 hover:text-slate-900'
      }`
    }
  >
    {({ isActive }) => (
      <>
        <div className="flex items-center gap-3">
          <Icon 
            size={20} 
            className={`transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`} 
          />
          <span>{label}</span>
        </div>
        {isActive && <ChevronRight size={16} className="text-indigo-400 animate-in slide-in-from-left-1" />}
      </>
    )}
  </NavLink>
);

export const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  // --- YOUR UPDATED LOGOUT LOGIC ---
  const handleLogout = async () => {
    const loadingToast = toast.loading("Logging out...");
    
    try {
      // Trying to hit the specific auth logout endpoint
      // NOTE: If your 'api' has baseURL set to '/api/admin', 
      // you might need to use a relative path like '../../auth/logout' 
      // or just ensure your backend has an admin logout route.
      await api.post("/logout"); // Ideally pointing to /api/admin/logout or /api/auth/logout
      
    } catch (err) {
      console.warn("Logout API failed, continuing cleanup");
    }

    // Cleanup Local State
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    
    // If you have a global context (setUser), you would call it here too.
    // e.g., setUser(null);

    toast.dismiss(loadingToast);
    toast.success("Logged out successfully");

    // Navigate to Signin (Standard for Admins)
    navigate("/signin", { replace: true });
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden relative font-sans text-slate-600">
      
      {/* ================= MOBILE OVERLAY ================= */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-100 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:inset-auto
        `}
      >
        {/* Header (Logo) */}
        <div className="p-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
              Quistivo<span className="text-indigo-600">.</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide mt-1 uppercase">Admin Workspace</p>
          </div>
          <button onClick={closeSidebar} className="md:hidden p-2 text-slate-400 hover:bg-slate-50 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-hide">
          <div className="px-6 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Main Menu</div>
          
          <SidebarItem to="/admin/dashboard" icon={LayoutDashboard} label="Dashboard" onClick={closeSidebar} />
          <SidebarItem to="/admin/users" icon={Users} label="Users" onClick={closeSidebar} />
          <SidebarItem to="/admin/pending-users" icon={UserCog} label="Requests" onClick={closeSidebar} />
          
          <div className="px-6 mt-6 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Content</div>
          
          <SidebarItem to="/admin/categories" icon={BookOpen} label="Categories" onClick={closeSidebar} />
          <SidebarItem to="/admin/sessions" icon={FileText} label="Test Sessions" onClick={closeSidebar} />
        </nav>

        {/* Logout Section */}
        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="group flex items-center justify-between w-full px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">Sign Out</span>
            </div>
          </button>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Mobile Header (Only visible on small screens) */}
        <div className="md:hidden bg-white/80 backdrop-blur-md border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-30">
           <span className="font-bold text-lg text-slate-800">Admin Panel</span>
           <button onClick={toggleSidebar} className="p-2 text-slate-600 hover:bg-gray-100 rounded-lg">
             <Menu size={24} />
           </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-10 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      <Toaster 
        position="top-right" 
        toastOptions={{
          className: 'text-sm font-medium',
          style: {
            background: '#333',
            color: '#fff',
            borderRadius: '8px',
          },
        }}
      />
    </div>
  );
};
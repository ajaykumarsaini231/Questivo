import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Sparkles } from "lucide-react";
import axios from "axios";

/* ================= TYPES ================= */

interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
}

/* ================= AXIOS ================= */

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  "http://localhost:4000";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

/* ================= COMPONENT ================= */

const Header: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [typedText, setTypedText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navigate = useNavigate();

  /* ===== AUTH CHECK (COOKIE → USER) ===== */
  // useEffect(() => {
  //   const fetchMe = async () => {
  //     try {
  //       const res = await api.get("/api/auth/me");
  //       setUser(res.data.user);
  //     } catch {
  //       setUser(null);
  //     }
  //   };
  //   fetchMe();
  // }, []);

  useEffect(() => {
  api.get("/api/auth/me")
    .then(res => {
      console.log("ME API USER:", res.data.user);
      setUser(res.data.user);
    })
    .catch(err => {
      console.error("ME API ERROR:", err.response?.status);
      setUser(null);
    });
}, []);


  /* ===== TYPING EFFECT ===== */
  useEffect(() => {
    if (!user) return;

    const name = user.name.split(" ")[0];
    const text = `Welcome, ${name}`;
    let i = 0;
    let timer: any;

    const type = () => {
      setTypedText(text.slice(0, i++));
      if (i <= text.length) timer = setTimeout(type, 80);
    };

    type();
    return () => clearTimeout(timer);
  }, [user]);

  /* ===== LOGOUT ===== */
 const handleLogout = async () => {
  try {
    await api.post(
      "/api/auth/logout",
      {},
      {
        withCredentials: true, 
      }
    );
  } catch (err) {
    console.warn("Logout API failed, continuing cleanup");
  }

  setUser(null);
  setTypedText("");
  localStorage.removeItem("user");

  navigate("/", { replace: true });
};


  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900">Quistivo</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <a href="/#exams" className="text-sm text-slate-600 hover:text-indigo-600">
            Exam Categories
          </a>
          <a href="/#features" className="text-sm text-slate-600 hover:text-indigo-600">
            How it Works
          </a>
        </nav>

        {/* Desktop Auth */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden lg:block">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-indigo-600">{typedText}</p>
              </div>

              <div
                className="cursor-pointer"
                onClick={() => navigate("/profile")}
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px]">
                  <img
                    src={
                      user.photoUrl ||
                      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200"
                    }
                    className="h-full w-full rounded-full object-cover border-2 border-white"
                  />
                </div>
              </div>

              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <Link to="/signin" className="text-sm text-slate-600 hover:text-indigo-600">
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-indigo-600 px-5 py-2 text-sm text-white"
              >
                Sign up free
              </Link>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
};

export default Header;

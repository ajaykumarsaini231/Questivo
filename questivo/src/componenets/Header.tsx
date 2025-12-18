import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  LogOut,
  Sparkles,
  LogIn,
  UserPlus,
  BookOpen,
  Layers,
  User,
} from "lucide-react";
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
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_URL) ||
  (typeof process !== "undefined" &&
    (process.env as any).NEXT_PUBLIC_API_URL) ||
  (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
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
    api
      .get("/api/auth/me")
      .then((res) => {
        console.log("ME API USER:", res.data.user);
        setUser(res.data.user);
      })
      .catch((err) => {
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
          <a
            href="/#exams"
            className="text-sm text-slate-600 hover:text-indigo-600"
          >
            Exam Categories
          </a>
          <a
            href="/#features"
            className="text-sm text-slate-600 hover:text-indigo-600"
          >
            How it Works
          </a>
          <a
            href="/GenerateTestPage"
            className="text-sm text-slate-600 hover:text-indigo-600"
          >
            Generate Test
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

              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/signin"
                className="text-sm text-slate-600 hover:text-indigo-600"
              >
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
        <button
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </button>
      </div>
      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="absolute top-full left-0 z-50 w-full border-t border-slate-100 bg-white/95 shadow-xl backdrop-blur-md md:hidden">
          <div className="flex flex-col gap-2 p-4">
            {/* --- Navigation Links --- */}
            <div className="flex flex-col gap-1">
              <a
                href="/#exams"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Layers className="h-4 w-4" />
                Exam Categories
              </a>

              <a
                href="/#features"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <BookOpen className="h-4 w-4" />
                How it Works
              </a>
              <a
                href="/GenerateTestPage"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <BookOpen className="h-4 w-4" />
                Generate Test
              </a>
            </div>

            {/* --- Divider --- */}
            <div className="my-2 h-px w-full bg-slate-100" />

            {/* --- Auth Section --- */}
            <div>
              {user ? (
                // Logged In State
                <div
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="cursor-pointer rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-slate-100 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user.name}
                      </p>
                      <p className="truncate text-xs font-medium text-indigo-600">
                        {typedText}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Logged Out State
                <div className="flex flex-col gap-3">
                  <Link
                    to="/signin"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition-transform active:scale-95"
                  >
                    <LogIn className="h-4 w-4" />
                    Log in
                  </Link>

                  <Link
                    to="/signup"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-95 hover:bg-indigo-700"
                  >
                    <UserPlus className="h-4 w-4" />
                    Sign up free
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;

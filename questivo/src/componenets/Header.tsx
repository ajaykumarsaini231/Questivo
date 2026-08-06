import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  SlidersHorizontal,
} from "lucide-react";
import { useAudience } from "./AudienceProvider";
import type { FeatureId } from "../lib/audience";
import { AI_GENERATOR_PATH, useAiGenerator } from "../lib/premium";
/* ================= TYPES ================= */

interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
}

/* ================= AXIOS ================= */

import { createApiClient } from '../lib/api';
import { clearSessionToken } from '../lib/session';

const api = createApiClient();

/* ================= NAV ================= */

type NavLink = {
  label: string;
  href: string;
  /** Homepage section anchor rather than its own route. */
  hash?: string;
  /** Also treat these path prefixes as this link being current. */
  match?: string[];
  /** Hidden unless the visitor's track includes this feature. Links with no
   *  feature are core navigation and are shown to everyone. */
  feature?: FeatureId;
  /** Hidden unless the API would actually serve this visitor the AI writer. */
  aiOnly?: boolean;
};

const NAV_LINKS: NavLink[] = [
  // A real route, not a homepage anchor: this is the exam directory, and it
  // stays highlighted while the visitor is on any individual exam page.
  { label: "Exam Categories", href: "/exams", match: ["/mock-test"] },
  { label: "How it Works", href: "/#features", hash: "#features" },
  // The archive, not the generator: a candidate looking for "previous year
  // questions" wants a specific paper, not a paper assembled to a spec.
  { label: "Previous Year Papers", href: "/pyq", feature: "pyq" },
  /**
   * Shown to whoever may actually use it, and to nobody else.
   *
   * This used to hang off SHOW_AI_GENERATOR — a constant compiled into the
   * bundle, which meant the menu could not move without a frontend deploy and
   * had no way of knowing what the API would allow. It said the feature did not
   * exist while /api/features said it was for sale and an admin could grant it
   * to a named account, so the one person who HAD been granted it still could
   * not find it in the menu. Now the menu reads the same switch as the route
   * guard and the endpoint.
   */
  { label: "Generate Test", href: AI_GENERATOR_PATH, aiOnly: true },
  { label: "Resume ATS Score", href: "/resume_ats_score", feature: "resumeAts" },
  { label: "AI Interview Studio", href: "/interviews", feature: "aiInterview" },
];

/**
 * Is this link the page the user is on?
 *
 * Section links are only current while actually on the homepage at that anchor;
 * marking "Exam Categories" active on every page would make the indicator
 * meaningless. Route links also match their sub-paths, so an exam detail page
 * still highlights the section it belongs to.
 */
function isActive(link: NavLink, pathname: string, hash: string): boolean {
  if (link.match?.some((p) => pathname.startsWith(p))) return true;
  if (link.hash) return pathname === "/" && hash === link.hash;
  return pathname === link.href || pathname.startsWith(link.href + "/");
}

/* ================= COMPONENT ================= */

const Header: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [typedText, setTypedText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navigate = useNavigate();
  // Drives the current-page indicator in the nav.
  const { pathname, hash } = useLocation();

  // Off-track tools drop out of the nav entirely. Before the stored choice has
  // been read `can()` returns true for everything, so the prerendered header
  // carries every link and no crawler sees a reduced menu.
  const { can, audience, isAdmin, reopenChoice } = useAudience();
  // The AI writer is not a track feature — it is a paid one, and whether this
  // particular account holds it is the server's answer, not a property of the
  // exams they sit. Both filters apply to the same list so the menu cannot
  // offer something either of them would refuse.
  const aiGenerator = useAiGenerator();
  const navLinks = NAV_LINKS.filter(
    (l) => (!l.feature || can(l.feature)) && (!l.aiOnly || aiGenerator.allowed)
  );

  const trackLabel =
    isAdmin && !audience
      ? "Admin view"
      : isAdmin
        ? `Preview: ${audience?.label}`
        : (audience?.label ?? "");

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
    // The server's Set-Cookie clears the cookie; this is the other carrier, and
    // it is only reachable from here. Without it the bearer token outlives the
    // logout and the next /me answers as the user who just left.
    clearSessionToken();

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
          <span className="text-xl font-bold text-slate-900">Questivo</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const active = isActive(link, pathname, hash);
            // Section links live on the homepage, so they stay <a> to let the
            // browser handle the hash jump. Real routes use <Link>, which was
            // the other bug here: plain <a href> forced a full page reload on
            // every nav click, throwing away the SPA and re-downloading the app.
            const cls = [
              "relative text-sm transition-colors",
              active
                ? "font-semibold"
                : "text-slate-600 hover:text-indigo-600",
            ].join(" ");
            const style = active ? { color: "var(--c-brand)" } : undefined;
            const underline = active ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-[21px] left-0 h-[3px] w-full rounded-t"
                style={{ background: "var(--c-brand)" }}
              />
            ) : null;

            return link.hash ? (
              <a
                key={link.label}
                href={link.href}
                className={cls}
                style={style}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
                {underline}
              </a>
            ) : (
              <Link
                key={link.label}
                to={link.href}
                className={cls}
                style={style}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
                {underline}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Auth */}
        <div className="hidden md:flex items-center gap-4">
          {/* The way back out of a track. A filter with no visible off switch
              is indistinguishable from a broken site, so whichever narrowing
              is in force says so and can be undone in one click. */}
          {(audience || isAdmin) && (
            <button
              type="button"
              onClick={reopenChoice}
              className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 lg:inline-flex"
              style={{ borderColor: "var(--c-border)", color: "var(--c-text-muted)" }}
              // The icon carries "this is adjustable" on its own. A trailing
              // "change" ran into the label and read as part of the track name.
              title="Change what Questivo shows you"
              aria-label={`Showing ${trackLabel}. Change what Questivo shows you`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
              {trackLabel}
            </button>
          )}
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

              <Link
                to="/my-reports"
                className="hidden text-sm text-slate-600 hover:text-indigo-600 lg:block"
              >
                My reports
              </Link>

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
              <Link
                to="/exams"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Layers className="h-4 w-4" />
                Exam Categories
              </Link>

              <a
                href="/#features"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <BookOpen className="h-4 w-4" />
                How it Works
              </a>
              {can("pyq") && (
                <Link
                  to="/pyq"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <Layers className="h-4 w-4" />
                  Previous Year Papers
                </Link>
              )}
              {/* Same switch as the desktop nav above — the two menus must not
                  disagree about what this visitor can have. */}
              {aiGenerator.allowed && (
                <a
                  href={AI_GENERATOR_PATH}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <BookOpen className="h-4 w-4" />
                  Generate Test
                </a>
              )}
              {/* Same track filter as the desktop nav — the two menus must not
                  disagree about what the site offers. */}
              {can("resumeAts") && (
                <Link
                  to="/resume_ats_score"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <BookOpen className="h-4 w-4" />
                  Resume ATS Score
                </Link>
              )}
              {can("aiInterview") && (
                <Link
                  to="/interviews"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <BookOpen className="h-4 w-4" />
                  AI Interview Studio
                </Link>
              )}

              {(audience || isAdmin) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    reopenChoice();
                  }}
                  className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                  <Layers className="h-4 w-4" />
                  Showing: {trackLabel}
                  <span className="ml-auto text-xs underline opacity-70">Change</span>
                </button>
              )}
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

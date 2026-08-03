import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

/* ─────────────────────────────────────────────────────────────────────────
   EAGER vs LAZY
   The build was shipping one 1,070 kB chunk, which is the single worst thing
   on the page for Core Web Vitals — and Core Web Vitals feed ranking.

   The split rule is not "big vs small", it is "prerendered vs not":
   scripts/prerender.mjs writes real markup into #root for /, /GenerateTestPage,
   /resume_ats_score and every /mock-test/* page, and main.tsx hydrates it. A
   lazy route would render a Suspense fallback on that first pass and throw the
   prerendered HTML away, causing a visible flash and a hydration mismatch.
   So every prerendered route stays eager; everything else is split out.
   ───────────────────────────────────────────────────────────────────────── */

// --- Eager: prerendered routes + chrome ---
import Header from "./componenets/Header";
import Seo from "./componenets/Seo";
import HomePage from "./componenets/HomePage";
import GenerateTestPage from "./componenets/selectpage";
import ResumeATSPage from "./pages/Resume_score";
import ExamLandingPage from "./pages/ExamLandingPage";
import NotFoundPage from "./pages/NotFoundPage";

// --- Lazy: never prerendered, and these carry the heavy dependencies ---
// katex + react-markdown (~250 kB) live behind the test runner and result pages.
const TestRunner = lazy(() => import("./componenets/TestPage"));
const ResultPage = lazy(() => import("./componenets/result"));
// react-icons is only used by the auth screen.
const Signup = lazy(() => import("./componenets/SignupPage"));
const ProfilePage = lazy(() => import("./componenets/ProfilePage"));
// socket.io-client only matters here.
const LiveInterviewPage = lazy(() =>
  import("./pages/LiveInterviewPage").then((m) => ({ default: m.LiveInterviewPage }))
);

// --- Lazy: admin console. No public visitor ever loads this. ---
const AdminRequireAuth = lazy(() =>
  import("./componenets/AdminRequireAuth").then((m) => ({ default: m.AdminRequireAuth }))
);
const AdminLayout = lazy(() =>
  import("./componenets/AdminLayout").then((m) => ({ default: m.AdminLayout }))
);
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const UsersPage = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const CategoriesPage = lazy(() =>
  import("./pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage }))
);
const UserProfilePage = lazy(() =>
  import("./pages/UserProfilePage").then((m) => ({ default: m.UserProfilePage }))
);
const SessionsPage = lazy(() =>
  import("./pages/SessionsPage").then((m) => ({ default: m.SessionsPage }))
);
const SessionDetailsPage = lazy(() =>
  import("./pages/SessionDetailsPage").then((m) => ({ default: m.SessionDetailsPage }))
);
const PendingUsersPage = lazy(() =>
  import("./pages/PendingUsersPage").then((m) => ({ default: m.PendingUsersPage }))
);

/** Shown only while a split chunk downloads — never on a prerendered route. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
        <span className="text-sm text-slate-500">Loading…</span>
      </div>
    </div>
  );
}

/* ================= APP CONTENT ================= */
// Exported so the prerender script can mount the same tree inside a
// StaticRouter without pulling in BrowserRouter.
export function AppContent() {
  const location = useLocation();

  // 🛠️ MODIFIED: Added "/interviews/" in the header suppression block matrix
  const hideHeader =
    location.pathname === "/signin" ||
    location.pathname === "/signup" ||
    location.pathname.startsWith("/tests/") ||
    location.pathname.startsWith("/interviews/") || // Voice page clean layout lock
    location.pathname.startsWith("/admin");

  return (
    <>
      <Seo />
      {!hideHeader && <Header />}

      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* ================= PUBLIC ROUTES ================= */}
        <Route path="/" element={<HomePage />} />
        <Route path="/GenerateTestPage" element={<GenerateTestPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/resume_ats_score" element={<ResumeATSPage />} />
        <Route path="/mock-test/:slug" element={<ExamLandingPage />} />

        {/* ================= AUTH ROUTES ================= */}
        <Route path="/signin" element={<Signup />} />
        <Route path="/signup" element={<Signup />} />

        {/* ================= TEST FLOW ================= */}
        <Route path="/tests/:sessionId" element={<TestRunner />} />
        <Route path="/tests/:sessionId/result" element={<ResultPage />} />

        {/* Dynamic Route mapping */}
<Route path="/interviews/:sessionId" element={<LiveInterviewPage />} />

<Route path="/interviews" element={<Navigate to={`/interviews/session-${Math.random().toString(36).substring(2, 9)}`} replace />} />

        {/* ================= PROTECTED ADMIN ROUTES ================= */}
        <Route element={<AdminRequireAuth />}>
          
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserProfilePage />} />
            
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="sessions/:id" element={<SessionDetailsPage />} />
            
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="pending-users" element={<PendingUsersPage />} />
          </Route>

        </Route>

        {/* ================= FALLBACK =================
            Renders a real 404 rather than redirecting to "/". A redirect makes
            every mistyped or dead URL answer 200 with homepage content, which
            Google classifies as a soft 404 and can drag down crawling of the
            whole site. NotFoundPage carries noindex via lib/seo.ts. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </>
  );
}

/* ================= ROOT ================= */
export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
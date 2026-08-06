import { Suspense, lazy, useRef } from "react";
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
// Track selection wraps every route, so all three stay eager. AudienceGate
// renders nothing at all until the stored choice has been read, which keeps it
// out of the prerendered markup.
import { AudienceProvider, useAudience } from "./componenets/AudienceProvider";
import AudienceGate from "./componenets/AudienceGate";
import FeatureGate from "./componenets/FeatureGate";
// Eager, like the other route wrappers: it decides whether a route renders at
// all, so it cannot itself arrive in a lazy chunk after the page has painted.
import PremiumRoute from "./componenets/PremiumRoute";
import HomePage from "./componenets/HomePage";
import GenerateTestPage from "./componenets/selectpage";
import ResumeATSPage from "./pages/Resume_score";
import ExamLandingPage from "./pages/ExamLandingPage";
import ExamsIndexPage from "./pages/ExamsIndexPage";
// Eager because /pyq is prerendered and indexable. It was lazy while the
// archive was an unpromoted screen, and when /pyq was promoted the prerender
// dutifully wrote out... the Suspense spinner, because a lazy component renders
// its fallback under renderToString. An indexable page whose HTML says
// "Loading…" is worth nothing to exactly the AI crawlers this whole prerender
// step exists for. See the split rule above: prerendered implies eager.
import PyqPapersPage from "./pages/PyqPapersPage";
// Geo landing pages. Eager for the reason stated in the split rule above:
// every one of them is prerendered and indexable, and a lazy route renders its
// Suspense fallback under renderToString — which would write "Loading…" into
// the HTML of the ~100 pages this whole section exists to get crawled.
import CityPracticePage, { CityIndexPage } from "./pages/CityPracticePage";
import CollegePage, { CollegeIndexPage } from "./pages/CollegePage";
import NotFoundPage from "./pages/NotFoundPage";

// --- Lazy: never prerendered, and these carry the heavy dependencies ---
// katex + react-markdown (~250 kB) live behind the test runner and result pages.
const TestRunner = lazy(() => import("./componenets/TestPage"));
const ResultPage = lazy(() => import("./componenets/result"));
// Previous year papers. The picker itself is eager and prerendered (imported
// above); these two are not. The setup flow is noindex, so the prerender step
// writes its <head> but never renders its body — nothing to throw away — and
// the player is only ever reached by a candidate who has chosen a paper.
const ExamSetupPage = lazy(() => import("./pages/ExamSetupPage"));
const PyqPaperRunner = lazy(() => import("./pages/PyqPaperRunner"));
// Reopening a saved sitting. Shares the result view with the player above, so
// it costs nothing beyond its own fetch.
const PyqAttemptReview = lazy(() => import("./pages/PyqAttemptReview"));
// react-icons is only used by the auth screen.
const Signup = lazy(() => import("./componenets/SignupPage"));
const ProfilePage = lazy(() => import("./componenets/ProfilePage"));
// Saved ATS reports + interview transcripts. Private, so never prerendered.
const MyReportsPage = lazy(() => import("./pages/MyReportsPage"));
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
const PyqAdminPage = lazy(() =>
  import("./pages/PyqAdminPage").then((m) => ({ default: m.PyqAdminPage }))
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

/**
 * Entry point for /interviews, which mints a session id and redirects.
 *
 * It cannot simply be a gated <Navigate>: the gate needs the stored track
 * before it can decide anything, and a bare <Navigate> would have already
 * redirected during that first render. So this waits for `ready`, then either
 * shows the gate or performs the redirect.
 *
 * The session id is generated in a ref rather than inline in the route element,
 * where it was recomputed on every render of the tree.
 */
function InterviewEntry() {
  const { ready, can } = useAudience();
  const sessionId = useRef<string | null>(null);
  if (!sessionId.current) {
    sessionId.current = `session-${Math.random().toString(36).substring(2, 9)}`;
  }

  if (!ready) return <RouteFallback />;

  const redirect = <Navigate to={`/interviews/${sessionId.current}`} replace />;
  if (can("aiInterview")) return redirect;

  return (
    <FeatureGate feature="aiInterview" title="AI interview studio">
      {redirect}
    </FeatureGate>
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
      {/* Suppressed wherever the header is: a full-screen question has no place
          in front of an auth screen, a running test or the admin console. */}
      {!hideHeader && <AudienceGate />}

      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* ================= PUBLIC ROUTES ================= */}
        <Route path="/" element={<HomePage />} />
        {/* The AI writer. Behind the server's switch, not a frontend constant:
            PREMIUM_AI_GENERATION in the API's environment moves this route, the
            menu entry, the badge, every "generate a paper" call to action and
            the endpoint together — and a per-account grant made from Admin →
            Users moves all of the same things for one person. While it is shut
            the page never renders its form; it points at the free PYQ-backed
            builder at /pyq/setup instead, which is a paper the visitor can
            actually have. See lib/premium.ts. */}
        <Route
          path="/GenerateTestPage"
          element={
            <PremiumRoute feature="aiGeneration" title="AI paper generation">
              <GenerateTestPage />
            </PremiumRoute>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/my-reports" element={<MyReportsPage />} />
        {/* Career tools are gated by track rather than removed from the router:
            the gate explains itself and still lets a determined visitor
            through. See FeatureGate for why a 404 would be the wrong answer. */}
        <Route
          path="/resume_ats_score"
          element={
            <FeatureGate feature="resumeAts" title="ATS resume checker">
              <ResumeATSPage />
            </FeatureGate>
          }
        />
        <Route path="/exams" element={<ExamsIndexPage />} />
        <Route path="/mock-test/:slug" element={<ExamLandingPage />} />

        {/* ================= GEO LANDING PAGES =================
            Two hubs and their children. Index routes are declared first so
            "/practice" is never taken for a city slug, the same ordering rule
            /pyq/setup follows below. Data and the doorway-page reasoning live
            in lib/geo.ts; the SEO entries are generated in lib/seo.ts. */}
        <Route path="/practice" element={<CityIndexPage />} />
        <Route path="/practice/:citySlug" element={<CityPracticePage />} />
        <Route path="/college" element={<CollegeIndexPage />} />
        <Route path="/college/:collegeSlug" element={<CollegePage />} />

        {/* ================= PREVIOUS YEAR PAPERS =================
            Separate from the generator flow above on purpose. A PYQ is one
            specific paper sat on one specific day, so the only thing the
            candidate chooses is which — never topics, count or difficulty. */}
        <Route path="/pyq" element={<PyqPapersPage />} />
        {/* The guided flow — exam, then kind, then whatever filters that exam
            actually supports. Declared before "/pyq/:paperId" so "setup" is
            never taken for a paper id. */}
        <Route path="/pyq/setup" element={<ExamSetupPage />} />
        <Route path="/test-setup" element={<ExamSetupPage />} />
        {/* Declared before "/pyq/:paperId" so "attempt" is never taken for a
            paper id and run as a paper. */}
        <Route path="/pyq/attempt/:attemptId" element={<PyqAttemptReview />} />
        <Route path="/pyq/:paperId" element={<PyqPaperRunner />} />

        {/* ================= AUTH ROUTES ================= */}
        <Route path="/signin" element={<Signup />} />
        <Route path="/signup" element={<Signup />} />

        {/* ================= TEST FLOW ================= */}
        <Route path="/tests/:sessionId" element={<TestRunner />} />
        <Route path="/tests/:sessionId/result" element={<ResultPage />} />

        {/* Dynamic Route mapping */}
<Route path="/interviews/:sessionId" element={<LiveInterviewPage />} />

<Route path="/interviews" element={<InterviewEntry />} />

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

            {/* The PYQ question bank. Both paths render the same screen: the
                editor is a drawer over the table, so "/pyq/:id" is the table
                with that row open — which keeps the queue visible behind it,
                makes a row a shareable link, and makes Back close the drawer
                rather than leave the screen. */}
            <Route path="pyq" element={<PyqAdminPage />} />
            <Route path="pyq/:id" element={<PyqAdminPage />} />
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
      <AudienceProvider>
        <AppContent />
      </AudienceProvider>
    </BrowserRouter>
  );
}
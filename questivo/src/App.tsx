import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

// --- Existing Components ---
import Header from "./componenets/Header";
import GenerateTestPage from "./componenets/selectpage";
import TestRunner from "./componenets/TestPage";
import ResultPage from "./componenets/result";
import Signup from "./componenets/SignupPage";
import HomePage from "./componenets/HomePage";
import ProfilePage from "./componenets/ProfilePage";
import { PendingUsersPage } from "./pages/PendingUsersPage";

// --- Admin Components ---
import { AdminLayout } from "./componenets/AdminLayout";
import { Dashboard } from "./pages/Dashboard";
import { UsersPage } from "./pages/UsersPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { SessionsPage } from "./pages/SessionsPage";
import { SessionDetailsPage } from "./pages/SessionDetailsPage";

// --- NEW IMPORT ---
import { AdminRequireAuth } from "./componenets/AdminRequireAuth"; 

/* ================= APP CONTENT ================= */
function AppContent() {
  const location = useLocation();

  const hideHeader =
    location.pathname === "/signin" ||
    location.pathname === "/signup" ||
    location.pathname.startsWith("/tests/") ||
    location.pathname.startsWith("/admin");

  return (
    <>
      {!hideHeader && <Header />}

      <Routes>
        {/* ================= PUBLIC ROUTES ================= */}
        <Route path="/" element={<HomePage />} />
        <Route path="/GenerateTestPage" element={<GenerateTestPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* ================= AUTH ROUTES ================= */}
        <Route path="/signin" element={<Signup />} />
        <Route path="/signup" element={<Signup />} />

        {/* ================= TEST FLOW ================= */}
        <Route path="/tests/:sessionId" element={<TestRunner />} />
        <Route path="/tests/:sessionId/result" element={<ResultPage />} />

        {/* ================= PROTECTED ADMIN ROUTES ================= */}
        {/* 1. Wrap Admin Routes in the Auth Guard */}
        <Route element={<AdminRequireAuth />}>
          
          {/* 2. Then render the Layout */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserProfilePage />} />
            
            {/* Note: You had duplicate 'sessions' routes in your code. I fixed it here. */}
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="sessions/:id" element={<SessionDetailsPage />} />
            
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="pending-users" element={<PendingUsersPage />} />
          </Route>

        </Route>

        {/* ================= FALLBACK ================= */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
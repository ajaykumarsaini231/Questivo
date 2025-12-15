import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Header from "./componenets/Header";
import GenerateTestPage from "./componenets/selectpage";
import TestRunner from "./componenets/TestPage";
import ResultPage from "./componenets/result";
import Signup from "./componenets/SignupPage";
import HomePage from "./componenets/HomePage";
import ProfilePage from "./componenets/ProfilePage";

/* ================= APP CONTENT ================= */
function AppContent() {
  const location = useLocation();

  /*
    Header HIDE rules:
    - /signin
    - /signup
    - /tests/:sessionId   (test running)
  */
  const hideHeader =
    location.pathname.startsWith("/tests/") ||
    location.pathname === "/signin" ||
    location.pathname === "/signup";

  return (
    <>
      {!hideHeader && <Header />}

      <Routes>
        {/* Public / Normal Pages */}
        <Route path="/" element={<HomePage />} />
        <Route path="/GenerateTestPage" element={<GenerateTestPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Auth */}
        <Route path="/signin" element={<Signup />} />
        <Route path="/signup" element={<Signup />} />

        {/* Test Flow */}
        <Route path="/tests/:sessionId" element={<TestRunner />} />
        <Route path="/tests/:sessionId/result" element={<ResultPage />} />

        {/* Fallback */}
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

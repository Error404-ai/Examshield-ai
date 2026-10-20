/**
 * App.tsx
 * Root component with routing and auth context
 */

import React from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Navbar } from "./components/common/Navbar";
import { ProtectedRoute } from "./components/common/ProtectedRoutes";
import { UserRole } from "./types";

// Pages
import { LandingPage } from "./pages/Landing/LandingPage";
import { LoginPage } from "./pages/Auth/LoginPage";
import { RegisterPage } from "./pages/Auth/RegisterPage";
import { StudentDashboard } from "./pages/Dashboard/StudentDashboard";
import { AdminDashboard } from "./pages/Dashboard/AdminDashboard";
import { CreateExamPage } from "./pages/Admin/CreateExamPage";
import { ExamReviewPage } from "./pages/Admin/ExamReviewPage";
import { ExamPage } from "./pages/Exam/ExamPage";
import { ResultPage } from "./pages/Exam/ResultPage";
import { StudentResultsPage } from "./pages/Exam/StudentResultsPage";

const App: React.FC = () => {
  const { user, isLoading, logout } = useAuth();

  const homeFor = (role: UserRole) =>
    role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard";

  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
      <div className="relative isolate flex min-h-screen flex-col">
        {/* Soft teal glow + faint grid behind the top of every app page */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px]">
          <div className="absolute inset-0 bg-[radial-gradient(60rem_22rem_at_50%_-6rem,rgba(14,116,144,0.13),transparent_70%)]" />
          <div className="bg-grid-light absolute inset-0 [-webkit-mask-image:linear-gradient(to_bottom,black,transparent_85%)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        </div>
        {/* Navbar everywhere except the exam, the auth pages and the logged-out landing page */}
        <Routes>
          <Route path="/student/exam/*" element={null} />
          <Route path="/login" element={null} />
          <Route path="/register" element={null} />
          <Route
            path="/"
            element={user ? <Navbar user={user} onLogout={logout} /> : null}
          />
          <Route path="*" element={<Navbar user={user} onLogout={logout} />} />
        </Routes>

        <main className="flex-1">
          <Routes>
            {/* Public */}
            <Route
              path="/"
              element={
                isLoading ? null : user ? (
                  <Navigate to={homeFor(user.role)} replace />
                ) : (
                  <LandingPage />
                )
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Student */}
            <Route
              path="/student/dashboard"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.STUDENT}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/exam/:examId"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.STUDENT}>
                  <ExamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/results/:sessionId"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.STUDENT}>
                  <ResultPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/results"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.STUDENT}>
                  <StudentResultsPage />
                </ProtectedRoute>
              }
            />

            {/* Admin */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.ADMIN}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/new"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.ADMIN}>
                  <CreateExamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/:examId/edit"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.ADMIN}>
                  <CreateExamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/:examId/review"
              element={
                <ProtectedRoute user={user} isLoading={isLoading} requiredRole={UserRole.ADMIN}>
                  <ExamReviewPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      </MotionConfig>
    </BrowserRouter>
  );
};

export default App;
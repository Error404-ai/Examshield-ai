/**
 * App.tsx
 * Root component with routing and auth context
 */

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Navbar } from "./components/common/Navbar";
import { ProtectedRoute } from "./components/common/ProtectedRoutes";
import { UserRole } from "./types";

// Pages
import { LoginPage } from "./pages/Auth/LoginPage";
import { RegisterPage } from "./pages/Auth/RegisterPage";
import { StudentDashboard } from "./pages/Dashboard/StudentDashboard";
import { AdminDashboard } from "./pages/Dashboard/AdminDashboard";
import { ExamPage } from "./pages/Exam/ExamPage";
import { ResultPage } from "./pages/Exam/ResultPage";

const App: React.FC = () => {
  const { user, isLoading, logout } = useAuth();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Show navbar only outside exam page */}
        <Routes>
          <Route path="/student/exam/*" element={null} />
          <Route
            path="*"
            element={<Navbar user={user} onLogout={logout} />}
          />
        </Routes>

        <main className="flex-1">
          <Routes>
            {/* Public */}
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
                  <StudentDashboard />
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

            {/* Default redirect */}
            <Route
              path="/"
              element={
                user ? (
                  <Navigate
                    to={user.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard"}
                    replace
                  />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
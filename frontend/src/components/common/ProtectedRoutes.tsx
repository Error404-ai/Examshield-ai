/**
 * ProtectedRoute Component
 * Redirects unauthenticated users; enforces role-based access
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { User, UserRole } from "../../types";

interface ProtectedRouteProps {
  user: User | null;
  isLoading: boolean;
  requiredRole?: UserRole;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  user,
  isLoading,
  requiredRole,
  children,
}) => {
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && user.role !== requiredRole) {
    const fallback = user.role === UserRole.ADMIN ? "/admin/dashboard" : "/student/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};
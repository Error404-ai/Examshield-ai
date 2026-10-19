/**
 * Utility Functions
 */

import { AlertSeverity, SessionStatus } from "../types";

// ============ Formatting ============

export const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatDateTime = (iso: string): string => {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export const formatPercentage = (value: number): string => `${value.toFixed(1)}%`;

// ============ Exam / Session Helpers ============

export const getSessionStatusLabel = (status: SessionStatus): string => {
  const map: Record<SessionStatus, string> = {
    [SessionStatus.ONGOING]: "In Progress",
    [SessionStatus.SUBMITTED]: "Submitted",
    [SessionStatus.EXPIRED]: "Expired",
    [SessionStatus.PROCTORING_FAILED]: "Proctoring Failed",
  };
  return map[status] ?? status;
};

export const getSessionStatusColor = (status: SessionStatus): string => {
  const map: Record<SessionStatus, string> = {
    [SessionStatus.ONGOING]: "text-indigo-700",
    [SessionStatus.SUBMITTED]: "text-green-700",
    [SessionStatus.EXPIRED]: "text-amber-700",
    [SessionStatus.PROCTORING_FAILED]: "text-red-700",
  };
  return map[status] ?? "text-gray-600";
};

export const getAlertSeverityColor = (severity: AlertSeverity): string => {
  const map: Record<AlertSeverity, string> = {
    [AlertSeverity.LOW]: "text-gray-700 bg-gray-50 border border-gray-200",
    [AlertSeverity.MEDIUM]: "text-amber-900 bg-amber-50 border border-amber-200",
    [AlertSeverity.HIGH]: "text-orange-900 bg-orange-50 border border-orange-200",
    [AlertSeverity.CRITICAL]: "text-red-800 bg-red-50 border border-red-200",
  };
  return map[severity] ?? "text-gray-700 bg-gray-50 border border-gray-200";
};

export const getRecommendationColor = (action: string): string => {
  const map: Record<string, string> = {
    approve: "text-green-800 bg-green-50 border border-green-200",
    review: "text-amber-900 bg-amber-50 border border-amber-200",
    reject: "text-red-800 bg-red-50 border border-red-200",
  };
  return map[action] ?? "text-gray-700 bg-gray-50 border border-gray-200";
};

// ============ Validation ============

export const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const validatePassword = (password: string): string | null => {
  if (password.length < 6) return "Password must be at least 6 characters";
  return null;
};

// ============ Error Handling ============

/**
 * Always returns a plain string. FastAPI sends 422 errors as an array of
 * objects ({type, loc, msg, ...}); rendering that directly crashes React
 * (error #31), so we flatten it into readable text.
 */
export const getErrorMessage = (error: unknown): string => {
  const err = error as {
    response?: { data?: { detail?: unknown; message?: string } };
    message?: string;
  };
  const detail = err?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => {
        const field = (d?.loc ?? []).filter((p: string) => p !== "body").join(".");
        const msg = typeof d?.msg === "string" ? d.msg : "Invalid value";
        return field ? `${field}: ${msg}` : msg;
      })
      .join("; ");
  }

  const fallback = err?.response?.data?.message || err?.message;
  return typeof fallback === "string" ? fallback : "Something went wrong";
};

// ============ Score Helpers ============

export const getScoreGrade = (percentage: number): string => {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
};

export const getScoreColor = (percentage: number): string => {
  if (percentage >= 75) return "text-green-700";
  if (percentage >= 50) return "text-amber-700";
  return "text-red-700";
};
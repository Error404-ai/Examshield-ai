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
    [SessionStatus.ONGOING]: "text-cyan-400",
    [SessionStatus.SUBMITTED]: "text-emerald-400",
    [SessionStatus.EXPIRED]: "text-amber-400",
    [SessionStatus.PROCTORING_FAILED]: "text-rose-400",
  };
  return map[status] ?? "text-slate-400";
};

export const getAlertSeverityColor = (severity: AlertSeverity): string => {
  const map: Record<AlertSeverity, string> = {
    [AlertSeverity.LOW]: "text-cyan-300 bg-cyan/10 border border-cyan/20",
    [AlertSeverity.MEDIUM]: "text-amber-300 bg-amber/10 border border-amber/20",
    [AlertSeverity.HIGH]: "text-orange-300 bg-orange-500/10 border border-orange-500/20",
    [AlertSeverity.CRITICAL]: "text-rose-300 bg-rose/10 border border-rose/20",
  };
  return map[severity] ?? "text-slate-300 bg-white/5 border border-white/10";
};

export const getRecommendationColor = (action: string): string => {
  const map: Record<string, string> = {
    approve: "text-emerald-300 bg-emerald/10 border border-emerald/20",
    review: "text-amber-300 bg-amber/10 border border-amber/20",
    reject: "text-rose-300 bg-rose/10 border border-rose/20",
  };
  return map[action] ?? "text-slate-300 bg-white/5 border border-white/10";
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
  if (percentage >= 75) return "text-emerald-400";
  if (percentage >= 50) return "text-amber-400";
  return "text-rose-400";
};
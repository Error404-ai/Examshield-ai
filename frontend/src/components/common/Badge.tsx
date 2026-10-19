import React from "react";
import clsx from "clsx";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral" | "violet";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

// "violet" is kept so existing callers still compile; it uses the app accent
const badgeVariants: Record<BadgeVariant, string> = {
  success: "bg-green-50 text-green-800 border-green-200",
  error: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-indigo-50 text-indigo-800 border-indigo-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
  violet: "bg-indigo-50 text-indigo-800 border-indigo-200",
};

const dotColors: Record<BadgeVariant, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  warning: "bg-amber-600",
  info: "bg-indigo-600",
  neutral: "bg-gray-500",
  violet: "bg-indigo-600",
};

export const Badge: React.FC<BadgeProps> = ({ variant = "neutral", dot, children, className }) => (
  <span
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
      badgeVariants[variant],
      className
    )}
  >
    {dot && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", dotColors[variant])} />}
    {children}
  </span>
);

// ── Alert ──────────────────────────────────────────────

interface AlertProps {
  variant?: "error" | "warning" | "info" | "success";
  children: React.ReactNode;
  onDismiss?: () => void;
}

const alertStyles: Record<string, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-indigo-200 bg-indigo-50 text-indigo-900",
  success: "border-green-200 bg-green-50 text-green-800",
};

export const Alert: React.FC<AlertProps> = ({ variant = "info", children, onDismiss }) => (
  <div
    role={variant === "error" ? "alert" : "status"}
    className={clsx("flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm", alertStyles[variant])}
  >
    <span className="flex-1">{children}</span>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-current opacity-60 hover:opacity-100"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )}
  </div>
);
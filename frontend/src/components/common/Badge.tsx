/**
 * Badge Component
 */

import React from "react";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral";

const badgeClasses: Record<BadgeVariant, string> = {
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  warning: "bg-yellow-100 text-yellow-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-gray-100 text-gray-700",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "neutral", children, className = "" }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClasses[variant]} ${className}`}
  >
    {children}
  </span>
);

/**
 * Alert Component
 */

type AlertVariant = "success" | "error" | "warning" | "info";

const alertClasses: Record<AlertVariant, string> = {
  success: "bg-green-50 border-green-400 text-green-800",
  error: "bg-red-50 border-red-400 text-red-800",
  warning: "bg-yellow-50 border-yellow-400 text-yellow-800",
  info: "bg-blue-50 border-blue-400 text-blue-800",
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ variant = "info", title, children, className = "" }) => (
  <div className={`rounded-lg border-l-4 p-4 ${alertClasses[variant]} ${className}`}>
    {title && <p className="font-semibold mb-1">{title}</p>}
    <div className="text-sm">{children}</div>
  </div>
);
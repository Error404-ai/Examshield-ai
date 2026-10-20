import React from "react";
import clsx from "clsx";

// "cyan" and "emerald" are kept so existing callers still compile
type Variant = "primary" | "secondary" | "danger" | "ghost" | "cyan" | "emerald";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  glow?: boolean; // ignored, kept for compatibility
  children: React.ReactNode;
}

const primary = "bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600 hover:border-indigo-700";

const variantClasses: Record<Variant, string> = {
  primary,
  cyan: primary,
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50",
  danger: "bg-white text-red-700 border border-red-300 hover:bg-red-50",
  ghost: "text-indigo-700 border border-transparent hover:bg-indigo-50",
  emerald: "bg-white text-green-700 border border-green-300 hover:bg-green-50",
};

const sizeClasses: Record<Size, string> = {
  xs: "px-2.5 py-1 text-xs gap-1",
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-base gap-2",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  glow: _glow,
  icon,
  iconRight,
  children,
  className,
  type = "button",
  ...props
}) => (
  <button
    type={type}
    {...props}
    disabled={disabled || loading}
    className={clsx(
      "inline-flex items-center justify-center rounded-lg font-medium transition-all active:translate-y-px",
      "disabled:cursor-not-allowed disabled:opacity-50",
      variantClasses[variant],
      sizeClasses[size],
      className
    )}
  >
    {loading ? (
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    ) : (
      icon && <span className="shrink-0">{icon}</span>
    )}
    <span>{children}</span>
    {iconRight && !loading && <span className="shrink-0">{iconRight}</span>}
  </button>
);
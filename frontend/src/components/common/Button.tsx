import React from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "cyan" | "emerald";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children: React.ReactNode;
  glow?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-violet text-white hover:bg-violet-400 hover:shadow-glow-violet border border-violet/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none",
  secondary:
    "glass text-slate-200 hover:bg-white/[0.07] border-white/10 disabled:opacity-40",
  danger:
    "bg-rose/90 text-white hover:bg-rose hover:shadow-glow-rose border border-rose/30 disabled:opacity-40",
  ghost:
    "text-violet-400 hover:bg-violet/10 border border-transparent hover:border-violet/20 disabled:opacity-40",
  cyan:
    "bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/25 hover:shadow-glow-cyan disabled:opacity-40",
  emerald:
    "bg-emerald/10 text-emerald-400 hover:bg-emerald/20 border border-emerald/25 disabled:opacity-40",
};

const sizeClasses: Record<Size, string> = {
  xs: "px-2.5 py-1 text-xs gap-1",
  sm: "px-3.5 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  glow = false,
  icon,
  iconRight,
  children,
  className = "",
  onClick,
  ...props
}) => {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      {...(props as any)}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "relative inline-flex items-center justify-center rounded-xl font-medium",
        "transition-all duration-200 focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-violet/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {loading ? (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {iconRight && !loading && (
        <span className="shrink-0">{iconRight}</span>
      )}
    </motion.button>
  );
};
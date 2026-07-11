import React from "react";
import clsx from "clsx";
import { motion } from "framer-motion";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral" | "violet";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const badgeVariants: Record<BadgeVariant, string> = {
  success: "bg-emerald/10 text-emerald-400 border border-emerald/20",
  error: "bg-rose/10 text-rose-400 border border-rose/20",
  warning: "bg-amber/10 text-amber-400 border border-amber/20",
  info: "bg-cyan/10 text-cyan-400 border border-cyan/20",
  neutral: "bg-white/5 text-slate-400 border border-white/10",
  violet: "bg-violet/10 text-violet-300 border border-violet/20",
};

const dotColors: Record<BadgeVariant, string> = {
  success: "bg-emerald",
  error: "bg-rose",
  warning: "bg-amber",
  info: "bg-cyan",
  neutral: "bg-slate-500",
  violet: "bg-violet",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  dot,
  children,
  className,
}) => (
  <span
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
      badgeVariants[variant],
      className
    )}
  >
    {dot && (
      <span className={clsx("h-1.5 w-1.5 rounded-full shrink-0", dotColors[variant])} />
    )}
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
  error: "glass-rose text-rose-300",
  warning: "glass-amber text-amber-300",
  info: "glass-cyan text-cyan-300",
  success: "glass-emerald text-emerald-300",
};

const alertIcons: Record<string, string> = {
  error: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  warning: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
};

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  children,
  onDismiss,
}) => (
  <motion.div
    initial={{ opacity: 0, y: -8, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: 0.98 }}
    className={clsx(
      "flex items-start gap-3 rounded-xl p-3.5 text-sm",
      alertStyles[variant]
    )}
  >
    <svg
      className="h-4 w-4 mt-0.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={alertIcons[variant]} />
    </svg>
    <span className="flex-1">{children}</span>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )}
  </motion.div>
);
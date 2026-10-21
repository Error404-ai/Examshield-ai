/**
 * Small shared pieces for the admin and student dashboards:
 * icons, count-up numbers, reveal animation, score bars, loader, time helpers.
 * Only uses React, framer-motion and core Tailwind classes.
 */

import React, { useEffect, useState } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";

// ── Icons (outline paths) ────────────────────────────────────────────────────

export const ICONS = {
  camera: [
    "M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z",
    "M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z",
  ],
  shield: [
    "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  ],
  sparkles: [
    "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
  ],
  eye: [
    "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z",
    "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  ],
  wifi: [
    "M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z",
  ],
  expand: [
    "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15",
  ],
  users: [
    "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  ],
  document: [
    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  ],
  chart: [
    "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  ],
  clock: ["M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"],
  check: ["M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"],
  warning: [
    "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  ],
  arrow: ["M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"],
} as const;

export const Icon: React.FC<{ name: keyof typeof ICONS; className?: string }> = ({
  name,
  className = "h-5 w-5",
}) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    {ICONS[name].map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

// ── Motion helpers ───────────────────────────────────────────────────────────

export const CountUp: React.FC<{
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}> = ({ value, decimals = 0, suffix = "", className }) => {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span className={`tabular-nums ${className ?? ""}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
};

export const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};

// ── Small UI pieces ──────────────────────────────────────────────────────────

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#0E7490]">
    <span className="h-px w-8 bg-[#0E7490]" />
    {children}
  </p>
);

export const ScoreBar: React.FC<{ pct: number }> = ({ pct }) => {
  const reduce = useReducedMotion();
  const safe = Math.max(0, Math.min(100, pct));
  const color = safe >= 60 ? "bg-emerald-500" : safe >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${safe}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
};

export const PageLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0E7490] border-t-transparent" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  </div>
);

export const gridBackground: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(14,116,144,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(14,116,144,0.06) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
};

// ── Time helper ──────────────────────────────────────────────────────────────

export const timeAgo = (iso?: string): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
};
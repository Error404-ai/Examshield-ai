/**
 * Small motion helpers shared by the app pages.
 * Reveal: fade + rise on mount. CountUp: numbers count up once.
 * Both respect prefers-reduced-motion.
 */

import React, { useEffect, useState } from "react";
import { animate, motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}

export const Reveal: React.FC<RevealProps> = ({ children, delay = 0, y = 14, className }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay, ease }}
  >
    {children}
  </motion.div>
);

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** "63.2%" -> counts 0 -> 63.2 and keeps the "%"; non-numeric values render as-is */
export const CountUp: React.FC<{ value: number | string; duration?: number }> = ({
  value,
  duration = 0.9,
}) => {
  const text = String(value);
  const match = text.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  const target = match ? parseFloat(match[1]) : NaN;
  const decimals = match && match[1].includes(".") ? match[1].split(".")[1].length : 0;
  const suffix = match ? match[2] : "";

  const [shown, setShown] = useState<number>(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    if (prefersReducedMotion()) {
      setShown(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [target, duration]);

  if (Number.isNaN(target)) return <>{text}</>;
  return (
    <>
      {shown.toFixed(decimals)}
      {suffix}
    </>
  );
};

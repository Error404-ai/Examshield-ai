import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  icon,
  iconRight,
  className = "",
  id,
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-slate-300"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
            {icon}
          </div>
        )}
        <motion.div
          animate={{
            boxShadow: focused
              ? error
                ? "0 0 0 2px rgba(244,63,94,0.4), 0 0 12px rgba(244,63,94,0.15)"
                : "0 0 0 2px rgba(124,58,237,0.45), 0 0 16px rgba(124,58,237,0.15)"
              : "0 0 0 0px transparent",
          }}
          transition={{ duration: 0.15 }}
          className="w-full rounded-xl"
        >
          <input
            id={inputId}
            className={clsx(
              "w-full rounded-xl py-2.5 text-sm text-slate-100 placeholder:text-slate-600",
              "bg-white/[0.04] border border-white/[0.09]",
              "transition-colors duration-150",
              "focus:outline-none focus:border-violet/50",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-rose/50 bg-rose/5",
              icon ? "pl-10" : "pl-4",
              iconRight ? "pr-10" : "pr-4",
              className
            )}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
        </motion.div>
        {iconRight && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500">
            {iconRight}
          </div>
        )}
      </div>
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-rose-400 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 7a1 1 0 110-2 1 1 0 010 2z"/>
            </svg>
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-slate-500"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

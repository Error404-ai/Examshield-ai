import React from "react";
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
  className,
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  const messageId = inputId ? `${inputId}-message` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-800">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={clsx(
            "w-full rounded-lg border bg-white py-2.5 text-sm text-gray-900 placeholder:text-gray-400",
            "transition-colors focus:outline-none focus:ring-2",
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
              : "border-gray-300 focus:border-indigo-600 focus:ring-indigo-600/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            icon ? "pl-10" : "pl-3.5",
            iconRight ? "pr-10" : "pr-3.5",
            className
          )}
          {...props}
        />
        {iconRight && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{iconRight}</div>
        )}
      </div>
      {error ? (
        <p id={messageId} className="text-xs text-red-700">{error}</p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-gray-600">{hint}</p>
      ) : null}
    </div>
  );
};
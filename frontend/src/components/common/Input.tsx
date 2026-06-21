/**
 * Input Component
 */

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, hint, className = "", id, ...props }) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={`
          w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
          disabled:bg-gray-50 disabled:text-gray-500
          ${error ? "border-red-400 focus:ring-red-400" : "border-gray-300"}
          ${className}
        `}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
};
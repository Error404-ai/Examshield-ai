/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core palette
        navy: {
          950: "#04080F",
          900: "#0A0F1E",
          800: "#0F172A",
          700: "#1E2A45",
          600: "#2A3A5C",
          500: "#374B73",
        },
        violet: {
          950: "#2E1065",
          DEFAULT: "#7C3AED",
          400: "#A78BFA",
          300: "#C4B5FD",
          glow: "rgba(124,58,237,0.35)",
        },
        cyan: {
          DEFAULT: "#06B6D4",
          glow: "rgba(6,182,212,0.3)",
          400: "#22D3EE",
        },
        amber: {
          DEFAULT: "#F59E0B",
          glow: "rgba(245,158,11,0.3)",
        },
        emerald: {
          DEFAULT: "#10B981",
          glow: "rgba(16,185,129,0.3)",
        },
        rose: {
          DEFAULT: "#F43F5E",
          glow: "rgba(244,63,94,0.3)",
        },
        glass: {
          DEFAULT: "rgba(255,255,255,0.04)",
          border: "rgba(255,255,255,0.08)",
          hover: "rgba(255,255,255,0.07)",
          strong: "rgba(255,255,255,0.10)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(var(--tw-gradient-stops))",
        "hero-grid":
          "linear-gradient(rgba(124,58,237,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.06) 1px, transparent 1px)",
        "card-shine":
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 60%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        "glow-violet": "0 0 20px rgba(124,58,237,0.4), 0 0 40px rgba(124,58,237,0.15)",
        "glow-cyan": "0 0 20px rgba(6,182,212,0.4), 0 0 40px rgba(6,182,212,0.15)",
        "glow-emerald": "0 0 20px rgba(16,185,129,0.35)",
        "glow-rose": "0 0 20px rgba(244,63,94,0.35)",
        "glow-amber": "0 0 20px rgba(245,158,11,0.35)",
        glass: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
        "glass-lg": "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
        card: "0 4px 24px rgba(0,0,0,0.3)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "spin-slow": "spin 3s linear infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "scan-line": "scanLine 2s linear infinite",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
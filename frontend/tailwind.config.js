/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Landing page (dark) palette
        navy: {
          950: "#04080F",
          900: "#0A0F1E",
          800: "#0F172A",
          700: "#1E2A45",
          600: "#2A3A5C",
          500: "#374B73",
        },
        cyan: { DEFAULT: "#06B6D4", 400: "#22D3EE" },
        amber: { DEFAULT: "#F59E0B" },
        rose: { DEFAULT: "#F43F5E" },

        // App accent. Existing pages use indigo-*, so remapping it here
        // restyles them without touching every file. Deep teal-blue: reads
        // well on white and ties back to the cyan on the landing page.
        indigo: {
          50: "#ECF8FB",
          100: "#CFEFF6",
          200: "#A5E0EE",
          300: "#6CCBE2",
          400: "#2EB0CE",
          500: "#0E93B3",
          600: "#0E7490",
          700: "#155E75",
          800: "#164E63",
          900: "#134152",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      // Flatter shapes and almost no shadow: structure comes from borders
      borderRadius: {
        lg: "0.375rem",
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      boxShadow: {
        sm: "none",
        md: "0 1px 2px rgba(15,23,42,0.06)",
        lg: "0 4px 16px rgba(15,23,42,0.10)",
      },
    },
  },
  plugins: [],
};
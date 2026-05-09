"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { motion } from "framer-motion";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Read from localStorage on mount
    const stored = localStorage.getItem("kindred-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
      applyTheme(stored);
    }
  }, []);

  function applyTheme(t: Theme) {
    const root = document.documentElement;
    if (t === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  }

  function setTheme(t: Theme) {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem("kindred-theme", t);
  }

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Toggle Component ──────────────────────────────────────────────────────────

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      id="theme-toggle"
      onClick={toggle}
      className="relative w-14 h-7 rounded-full border transition-all duration-300 overflow-hidden"
      style={{
        background: theme === "dark"
          ? "rgba(255,255,255,0.05)"
          : "rgba(59,130,246,0.15)",
        borderColor: theme === "dark"
          ? "rgba(255,255,255,0.1)"
          : "rgba(59,130,246,0.3)",
      }}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {/* Track decorations */}
      <div className="absolute inset-0 flex items-center justify-between px-1.5">
        {/* Sun icon (for light mode side) */}
        <svg
          viewBox="0 0 24 24"
          className={`w-3.5 h-3.5 transition-opacity duration-300 fill-none stroke-current stroke-2 ${
            theme === "light" ? "text-amber-400 opacity-100" : "text-white/20 opacity-40"
          }`}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>

        {/* Moon icon (for dark mode side) */}
        <svg
          viewBox="0 0 24 24"
          className={`w-3.5 h-3.5 transition-opacity duration-300 fill-none stroke-current stroke-2 ${
            theme === "dark" ? "text-indigo-300 opacity-100" : "text-black/20 opacity-40"
          }`}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </div>

      {/* Sliding knob */}
      <motion.div
        className="absolute top-[3px] w-[20px] h-[20px] rounded-full shadow-md"
        animate={{
          left: theme === "dark" ? "3px" : "27px",
          backgroundColor: theme === "dark" ? "#818cf8" : "#f59e0b",
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

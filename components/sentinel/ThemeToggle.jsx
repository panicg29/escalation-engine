"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={`sentinel-card-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--sentinel-surface-hover)] ${className}`}
    >
      {isDark ? (
        <Sun className="sentinel-text-secondary h-4 w-4" />
      ) : (
        <Moon className="sentinel-text-secondary h-4 w-4" />
      )}
    </button>
  );
}

"use client";

import { useTheme } from "./ThemeProvider";

export function SentinelThemeRoot({ children }) {
  const { isDark, mounted } = useTheme();

  return (
    <div
      className={`sentinel-theme min-h-screen transition-colors ${
        !mounted || isDark ? "dark" : ""
      } bg-[var(--sentinel-bg)] sentinel-text-primary`}
    >
      {children}
    </div>
  );
}

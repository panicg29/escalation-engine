"use client";

import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

export function SentinelShell({ children, title, subtitle }) {
  return (
    <div className="flex min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.05),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.12),transparent)]" />

      <div className="flex w-full flex-col lg:flex-row">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden">
          {(title || subtitle) && (
            <header className="sentinel-divider flex items-start justify-between gap-4 border-b px-6 py-6 lg:px-8">
              <div>
                {title && (
                  <h1 className="sentinel-text-primary text-xl font-semibold tracking-tight">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="sentinel-text-muted mt-1 text-sm">{subtitle}</p>
                )}
              </div>
              <ThemeToggle />
            </header>
          )}
          <div className="px-6 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

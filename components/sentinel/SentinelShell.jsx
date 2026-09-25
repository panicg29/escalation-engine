"use client";

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function SentinelShell({
  children,
  title,
  subtitle,
  showWorkspace = true,
  titleClassName = "",
  subtitleClassName = "",
  bareBackground = false,
  headerClassName = "",
}) {
  return (
    <div className="min-h-screen pt-20">
      {!bareBackground && (
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.05),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.12),transparent)]" />
      )}

      <main>
        {(title || subtitle) && (
          <header
            className={`sentinel-divider border-b px-6 py-6 lg:px-8 ${headerClassName}`.trim()}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                {title && (
                  <h1
                    className={
                      titleClassName ||
                      "sentinel-text-primary text-xl font-semibold tracking-tight"
                    }
                  >
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p
                    className={
                      subtitleClassName || "sentinel-text-muted mt-1 text-sm"
                    }
                  >
                    {subtitle}
                  </p>
                )}
              </div>
              {showWorkspace && (
                <div className="w-full max-w-xs lg:w-64">
                  <WorkspaceSwitcher compact />
                </div>
              )}
            </div>
          </header>
        )}
        <div className="px-6 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

"use client";

import { Suspense } from "react";
import WorkspacesPage from "./WorkspacesClient";

export default function WorkspacesRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[240px] items-center justify-center text-sm text-[var(--sentinel-text-muted)]">
          Loading workspaces…
        </div>
      }
    >
      <WorkspacesPage />
    </Suspense>
  );
}

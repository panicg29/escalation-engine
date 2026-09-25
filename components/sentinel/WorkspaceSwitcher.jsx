"use client";

import Link from "next/link";
import { Building2, Loader2, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

export function WorkspaceSwitcher({ compact = false, variant = "sidebar" }) {
  const {
    workspaces,
    activeTeamId,
    activeWorkspace,
    loading,
    setActiveTeamId,
    connectWorkspace,
  } = useWorkspace();
  const isHeader = variant === "header";

  if (loading) {
    return (
      <div className={`sentinel-card-inset flex items-center gap-2 rounded-lg ${compact || isHeader ? "px-3 py-2" : "px-3 py-2.5"}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
        <span className="sentinel-text-muted text-xs">Loading workspaces…</span>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <button
        type="button"
        onClick={connectWorkspace}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500"
      >
        <Plus className="h-3.5 w-3.5" />
        Connect Workspace
      </button>
    );
  }

  if (isHeader) {
    return (
      <div className="flex items-center gap-2">
        <select
          value={activeTeamId || ""}
          onChange={(e) => setActiveTeamId(e.target.value || null)}
          className="sentinel-input max-w-[200px] rounded-lg px-2.5 py-1.5 text-xs"
          aria-label="Workspace"
        >
          {workspaces.map((ws) => (
            <option key={ws.teamId} value={ws.teamId}>
              {ws.teamName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={connectWorkspace}
          className="sentinel-btn-ghost rounded-lg px-2 py-1.5 text-[10px] font-medium"
        >
          + Add
        </button>
        <Link
          href="/sentinel/workspaces"
          className="sentinel-btn-ghost rounded-lg px-2 py-1.5 text-[10px] font-medium"
        >
          Manage
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${compact ? "" : ""}`}>
      <label className="sentinel-text-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        <Building2 className="h-3 w-3" />
        Workspace
      </label>
      <select
        value={activeTeamId || ""}
        onChange={(e) => setActiveTeamId(e.target.value || null)}
        className="sentinel-input w-full rounded-lg px-2.5 py-2 text-xs"
      >
        {workspaces.map((ws) => (
          <option key={ws.teamId} value={ws.teamId}>
            {ws.teamName}
          </option>
        ))}
      </select>
      {!compact && activeWorkspace && (
        <p className="sentinel-text-muted truncate font-mono text-[10px]">
          {activeWorkspace.teamId}
          {activeWorkspace.incomingChannelName
            ? ` · #${activeWorkspace.incomingChannelName.replace(/^#/, "")}`
            : ""}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={connectWorkspace}
          className="sentinel-btn-ghost flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium"
        >
          + Add
        </button>
        <Link
          href="/sentinel/workspaces"
          className="sentinel-btn-ghost flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] font-medium"
        >
          Manage
        </Link>
      </div>
    </div>
  );
}

export function WorkspaceGate({ children }) {
  const { activeTeamId, loading, workspaces, connectWorkspace, error } =
    useWorkspace();

  if (loading) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        <p className="sentinel-text-muted text-sm">Loading workspace context…</p>
      </div>
    );
  }

  if (workspaces.length === 0 || !activeTeamId) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--sentinel-border)] px-6 text-center">
        <Building2 className="sentinel-text-muted mb-3 h-8 w-8" />
        <h2 className="sentinel-text-primary text-sm font-semibold">
          Connect a Slack workspace
        </h2>
        <p className="sentinel-text-muted mt-2 max-w-md text-xs leading-relaxed">
          Sentinel isolates alerts, feedback, and few-shot learning per workspace.
          Connect Slack via OAuth to start receiving triage events for that team.
        </p>
        {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
        <button
          type="button"
          onClick={connectWorkspace}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          Connect Workspace
        </button>
        <p className="sentinel-text-muted mt-3 text-[10px]">
          Requires <code className="rounded bg-[var(--sentinel-surface-inset)] px-1">SLACK_CLIENT_ID</code> and{" "}
          <code className="rounded bg-[var(--sentinel-surface-inset)] px-1">SLACK_CLIENT_SECRET</code>
        </p>
      </div>
    );
  }

  return children;
}

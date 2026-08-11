"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

export default function WorkspacesClient() {
  const searchParams = useSearchParams();
  const {
    activeTeamId,
    error,
    setActiveTeamId,
    refreshWorkspaces,
    connectWorkspace,
  } = useWorkspace();

  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  const loadAllWorkspaces = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load workspaces.");
      setWorkspaces(data.workspaces || []);
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Failed to load workspaces." });
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllWorkspaces();
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connected) {
      setBanner({
        type: "success",
        message: `Workspace ${connected} connected successfully.`,
      });
      setActiveTeamId(connected);
      refreshWorkspaces();
      loadAllWorkspaces();
    } else if (oauthError) {
      setBanner({
        type: "error",
        message: `OAuth failed: ${oauthError}`,
      });
    }
  }, [searchParams, setActiveTeamId, refreshWorkspaces]);

  const handleDisconnect = async (teamId) => {
    const confirmed = window.confirm(
      `Disconnect and uninstall Sentinel from this Slack workspace?\n\nThis revokes the app in Slack and stops processing new messages. Historical alerts and feedback are kept.`
    );
    if (!confirmed) return;

    setDisconnecting(teamId);
    try {
      const res = await fetch(
        `/api/workspaces?teamId=${encodeURIComponent(teamId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disconnect.");

      if (teamId === activeTeamId) {
        const remaining = workspaces.filter((w) => w.teamId !== teamId);
        setActiveTeamId(remaining[0]?.teamId || null);
      }

      await refreshWorkspaces();
      await loadAllWorkspaces();
      const uninstallNote = data.slackUninstall?.ok
        ? "App uninstalled from Slack."
        : data.slackUninstall?.attempted
          ? "Marked inactive locally (Slack uninstall may have already completed)."
          : "Workspace marked inactive.";
      setBanner({ type: "success", message: uninstallNote });
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Disconnect failed." });
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <SentinelShell
      title="Workspaces"
      subtitle="Connect and manage Slack workspaces — data is isolated per team"
    >
      {(banner || error) && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            (banner?.type || "error") === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          }`}
        >
          {banner?.message || error}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="sentinel-text-muted text-xs">
          Each workspace keeps its own alerts, feedback library, and few-shot embeddings.
        </p>
        <button
          type="button"
          onClick={connectWorkspace}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          Connect Workspace
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16">
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          <span className="sentinel-text-muted text-sm">Loading…</span>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--sentinel-border)]">
          <Building2 className="sentinel-text-muted mb-3 h-8 w-8" />
          <p className="sentinel-text-muted text-sm">No workspaces connected yet.</p>
          <button
            type="button"
            onClick={connectWorkspace}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Plus className="h-4 w-4" />
            Add to Slack
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {workspaces.map((ws) => {
            const isSelected = ws.teamId === activeTeamId;
            const isConnected = ws.connected !== false && ws.status !== "inactive";
            return (
              <li
                key={ws.teamId}
                className={`sentinel-panel flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between ${
                  isSelected && isConnected ? "ring-1 ring-violet-500/40" : ""
                } ${!isConnected ? "opacity-70" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-4 w-4 text-violet-500" />
                    <h3 className="sentinel-text-primary text-sm font-semibold">
                      {ws.teamName}
                    </h3>
                    {isSelected && isConnected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Selected
                      </span>
                    )}
                    {isConnected ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        Connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-400/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="sentinel-text-muted mt-1 font-mono text-[11px]">
                    {ws.teamId}
                  </p>
                  {ws.incomingChannelName && (
                    <p className="sentinel-text-muted mt-0.5 text-[11px]">
                      Channel: #{ws.incomingChannelName.replace(/^#/, "")}
                    </p>
                  )}
                  {ws.targetUserName ? (
                    <p className="sentinel-text-muted mt-0.5 text-[11px]">
                      Notifications: {ws.targetUserName}
                    </p>
                  ) : isConnected ? (
                    <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                      Reconnect workspace to set your notification target
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {isConnected && !isSelected && (
                    <button
                      type="button"
                      onClick={() => setActiveTeamId(ws.teamId)}
                      className="sentinel-btn-ghost rounded-lg px-3 py-2 text-xs font-medium"
                    >
                      Switch to
                    </button>
                  )}
                  {!isConnected && (
                    <button
                      type="button"
                      onClick={connectWorkspace}
                      className="sentinel-btn-ghost rounded-lg px-3 py-2 text-xs font-medium"
                    >
                      Reconnect
                    </button>
                  )}
                  {isConnected && (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(ws.teamId)}
                      disabled={disconnecting === ws.teamId}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                    >
                      {disconnecting === ws.teamId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Disconnect
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SentinelShell>
  );
}

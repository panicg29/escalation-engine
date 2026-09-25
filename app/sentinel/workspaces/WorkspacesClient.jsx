"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { SentinelSilkPageFrame } from "@/components/sentinel/SentinelSilkPageFrame";
import { SilkSectionHeader } from "@/components/sentinel/SilkSectionHeader";
import { SpotlightCard } from "@/components/react-bits/SpotlightCard";
import { PillBadge } from "@/components/react-bits/PillBadge";
import { ShinyButton } from "@/components/react-bits/ShinyButton";
import { SILK_GLASS_BAR } from "@/lib/sentinel/silkPageStyles";
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
    <SentinelSilkPageFrame
      title="Workspaces"
      subtitle="Connect and manage Slack workspaces — data is isolated per team"
      showWorkspace={false}
    >
      {(banner || error) && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm font-semibold ${
            (banner?.type || "error") === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          }`}
        >
          {banner?.message || error}
        </div>
      )}

      <div className={`${SILK_GLASS_BAR} mb-6`}>
        <p className="text-sm font-bold text-[var(--silk-text-muted)]">
          Each workspace keeps its own alerts, feedback library, and few-shot embeddings.
        </p>
        <ShinyButton variant="primary" size="sm" onClick={connectWorkspace}>
          <Plus className="h-4 w-4" />
          Connect Workspace
        </ShinyButton>
      </div>

      {loading ? (
        <SpotlightCard glass spotlightIntensity={0.2}>
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            <span className="text-sm font-semibold text-[var(--silk-text-muted)]">Loading…</span>
          </div>
        </SpotlightCard>
      ) : workspaces.length === 0 ? (
        <SpotlightCard glass spotlightIntensity={0.25}>
          <div className="flex min-h-[220px] flex-col items-center justify-center">
            <Building2 className="mb-3 h-10 w-10 text-[var(--silk-text-muted)]" />
            <p className="text-sm font-bold text-[var(--silk-text-muted)]">No workspaces connected yet.</p>
            <ShinyButton variant="primary" size="sm" className="mt-4" onClick={connectWorkspace}>
              <Plus className="h-4 w-4" />
              Add to Slack
            </ShinyButton>
          </div>
        </SpotlightCard>
      ) : (
        <div className="space-y-4">
          <SilkSectionHeader
            icon={Building2}
            title="Connected workspaces"
            description="Switch active workspace or manage Slack connections"
            iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          />
          <ul className="space-y-3">
            {workspaces.map((ws) => {
              const isSelected = ws.teamId === activeTeamId;
              const isConnected = ws.connected !== false && ws.status !== "inactive";
              return (
                <li key={ws.teamId}>
                  <SpotlightCard
                    glass
                    spotlightIntensity={0.2}
                    className={`!p-0 ${isSelected && isConnected ? "ring-1 ring-violet-500/40" : ""} ${!isConnected ? "opacity-80" : ""}`}
                  >
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Building2 className="h-4 w-4 text-violet-500" />
                          <h3 className="text-sm font-extrabold text-[var(--silk-text-strong)]">
                            {ws.teamName}
                          </h3>
                          {isSelected && isConnected && (
                            <PillBadge variant="success" size="sm" animated={false} showDot={false}>
                              Selected
                            </PillBadge>
                          )}
                          {isConnected ? (
                            <PillBadge variant="success" size="sm" animated={false}>
                              Connected
                            </PillBadge>
                          ) : (
                            <PillBadge variant="warning" size="sm" animated={false} showDot={false}>
                              Disconnected
                            </PillBadge>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-[11px] font-bold text-[var(--silk-text-muted)]">
                          {ws.teamId}
                        </p>
                        {ws.incomingChannelName && (
                          <p className="mt-0.5 text-[11px] font-semibold text-[var(--silk-text-muted)]">
                            Channel: #{ws.incomingChannelName.replace(/^#/, "")}
                          </p>
                        )}
                        {ws.targetUserName ? (
                          <p className="mt-0.5 text-[11px] font-semibold text-[var(--silk-text-muted)]">
                            Notifications: {ws.targetUserName}
                          </p>
                        ) : isConnected ? (
                          <p className="mt-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            Reconnect workspace to set your notification target
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {isConnected && !isSelected && (
                          <ShinyButton variant="outline" size="sm" onClick={() => setActiveTeamId(ws.teamId)}>
                            Switch to
                          </ShinyButton>
                        )}
                        {!isConnected && (
                          <ShinyButton variant="outline" size="sm" onClick={connectWorkspace}>
                            Reconnect
                          </ShinyButton>
                        )}
                        {isConnected && (
                          <ShinyButton
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisconnect(ws.teamId)}
                            disabled={disconnecting === ws.teamId}
                            className="!text-rose-600 hover:!border-rose-500/40 dark:!text-rose-400"
                          >
                            {disconnecting === ws.teamId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Disconnect
                          </ShinyButton>
                        )}
                      </div>
                    </div>
                  </SpotlightCard>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SentinelSilkPageFrame>
  );
}

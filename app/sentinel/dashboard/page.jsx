"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, Clock, PencilLine, User } from "lucide-react";
import { BentoStatCard } from "@/components/sentinel/BentoStatCard";
import { EngineStatus } from "@/components/sentinel/EngineStatus";
import { FeedbackModal } from "@/components/sentinel/FeedbackModal";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy, fadeUp } from "@/lib/sentinel/motion";
import { formatAlertMessageText } from "@/lib/slack/formatMessageDisplayClient";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

const TABS = [
  { id: "all", label: "All Activity" },
  { id: "Escalate", label: "Escalate" },
  { id: "Log", label: "Log" },
  { id: "Mute", label: "Mute" },
];

const TRIAGE_SOURCE_TAGS = {
  exact: {
    label: "Cache",
    className: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
  },
  semantic: {
    label: "Few-shot",
    className: "bg-violet-500/15 text-violet-700 ring-violet-500/25 dark:text-violet-400",
  },
  llm: {
    label: "AI",
    className: "bg-zinc-400/20 text-zinc-600 ring-zinc-400/30 dark:text-zinc-400",
  },
};

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function buildStats(alerts) {
  const total = alerts.length;
  const escalate = alerts.filter((a) => a.classification === "Escalate").length;
  const log = alerts.filter((a) => a.classification === "Log").length;
  const mute = alerts.filter((a) => a.classification === "Mute").length;
  const noisePct = total ? Math.round((mute / total) * 1000) / 10 : 0;

  return [
    { id: "messages", label: "Messages Analyzed", value: String(total), delta: "Live from MongoDB", trend: "up", span: "col-span-1 md:col-span-2" },
    { id: "escalations", label: "Active Escalations", value: String(escalate), delta: escalate ? `${escalate} critical` : "None", trend: escalate ? "alert" : "neutral", span: "col-span-1" },
    { id: "noise", label: "Noise Reduction", value: `${noisePct}%`, delta: `${mute} muted`, trend: "up", span: "col-span-1" },
    { id: "logged", label: "Logged Actions", value: String(log), delta: "Actionable items", trend: "neutral", span: "col-span-1 md:col-span-2" },
    { id: "stream", label: "Stream Status", value: "SSE", delta: "Real-time push", trend: "up", span: "col-span-1" },
  ];
}

export default function SentinelDashboardPage() {
  const { activeTeamId, activeWorkspace } = useWorkspace();
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [feedbackAlert, setFeedbackAlert] = useState(null);
  const seenRef = useRef(new Set());

  const mergeAlert = useCallback((alert) => {
    if (!alert?.id) return;
    if (alert.provisional || alert.eventKind === "pipeline_start") return;
    if (alert.eventKind === "resolution_attempt") return;
    if (activeTeamId && alert.teamId && alert.teamId !== activeTeamId) return;
    setAlerts((prev) => {
      const exists = prev.some((a) => a.id === alert.id);
      if (!exists) {
        seenRef.current.add(alert.id);
        return [alert, ...prev];
      }
      return prev.map((a) => (a.id === alert.id ? { ...a, ...alert } : a));
    });
  }, [activeTeamId]);

  useEffect(() => {
    if (!activeTeamId) {
      setAlerts([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    seenRef.current = new Set();
    setAlerts([]);

    fetch(`/api/alerts?teamId=${encodeURIComponent(activeTeamId)}`)
      .then((res) => res.json())
      .then((data) => {
        const items = data.alerts || [];
        items.forEach((a) => seenRef.current.add(a.id));
        setAlerts(items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const source = new EventSource(
      `/api/slack/events?teamId=${encodeURIComponent(activeTeamId)}`
    );
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        mergeAlert(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    };
    return () => source.close();
  }, [activeTeamId, mergeAlert]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return alerts;
    return alerts.filter((a) => a.classification === activeTab);
  }, [alerts, activeTab]);

  const counts = useMemo(
    () => ({
      all: alerts.length,
      Escalate: alerts.filter((a) => a.classification === "Escalate").length,
      Log: alerts.filter((a) => a.classification === "Log").length,
      Mute: alerts.filter((a) => a.classification === "Mute").length,
    }),
    [alerts]
  );

  const breakdown = useMemo(() => {
    const total = alerts.length || 1;
    return ["Escalate", "Log", "Mute"].map((label) => ({
      label,
      count: alerts.filter((a) => a.classification === label).length,
      pct: Math.round((alerts.filter((a) => a.classification === label).length / total) * 100),
    }));
  }, [alerts]);

  const stats = useMemo(() => buildStats(alerts), [alerts]);

  return (
    <SentinelShell title="Command Dashboard" subtitle="Unified view of triage performance and system health">
      <WorkspaceGate>
      <FeedbackModal
        open={!!feedbackAlert}
        alert={feedbackAlert}
        teamId={activeTeamId}
        onClose={() => setFeedbackAlert(null)}
        onSuccess={(updated) => {
          if (updated?.id) {
            mergeAlert(updated);
          }
        }}
      />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <EngineStatus />
        <div className="sentinel-text-muted flex items-center gap-2 text-xs">
          <Activity className={`h-3.5 w-3.5 ${connected ? "text-emerald-500 dark:text-emerald-400" : "text-[var(--sentinel-text-muted)]"}`} />
          {connected ? "SSE stream connected" : "Connecting stream…"}
          {!loading && ` · ${alerts.length} records`}
          {activeWorkspace && ` · ${activeWorkspace.teamName}`}
        </div>
      </div>

      <div className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((stat, index) => (
          <BentoStatCard key={stat.id} stat={stat} index={index} />
        ))}

        <motion.div
          {...fadeUp}
          transition={{ ...springSnappy, delay: 0.3 }}
          className="sentinel-panel col-span-1 rounded-xl p-5 md:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="sentinel-text-secondary flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-violet-500 dark:text-violet-400" />
              Classification Breakdown
            </div>
            <span className="sentinel-text-muted text-xs">Live</span>
          </div>
          <div className="space-y-3">
            {breakdown.map((row) => {
              const styles = CLASSIFICATION_STYLES[row.label];
              return (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className={styles.accent}>{row.label}</span>
                    <span className="sentinel-text-muted">{row.pct}% · {row.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--sentinel-surface-inset)]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${row.pct}%` }}
                      transition={{ ...springSnappy, delay: 0.4 }}
                      className={`h-full rounded-full ${styles.dot}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ ...springSnappy, delay: 0.35 }}
          className="sentinel-panel col-span-1 rounded-xl p-5 md:col-span-3"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="sentinel-text-secondary text-sm font-medium">Recent Activity</h2>
            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="relative rounded-lg px-3 py-1.5 text-xs font-medium"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="dashboard-tab-active"
                        className="sentinel-tab-active absolute inset-0 rounded-lg"
                        transition={springSnappy}
                      />
                    )}
                    <span className={`relative flex items-center gap-1.5 ${isActive ? "sentinel-text-primary" : "sentinel-text-muted"}`}>
                      {tab.label}
                      <span className="rounded-full bg-[var(--sentinel-surface-inset)] px-1.5 py-0.5 text-[10px]">{counts[tab.id]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <p className="sentinel-text-muted py-8 text-center text-sm">Loading alerts…</p>
          ) : filtered.length === 0 ? (
            <p className="sentinel-text-muted py-8 text-center text-sm">No activity in this category.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {filtered.slice(0, 12).map((alert) => {
                const styles = CLASSIFICATION_STYLES[alert.classification];
                const sourceTag = TRIAGE_SOURCE_TAGS[alert.triageSource];
                return (
                  <li
                    key={alert.id}
                    className={`sentinel-card-inset rounded-lg p-3 ${styles.border}`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="sentinel-text-secondary line-clamp-2 text-xs">
                        {formatAlertMessageText(alert)}
                      </p>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${styles.badge}`}>
                          {alert.classification}
                        </span>
                        {alert.correctedAt && (
                          <span className="text-[9px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
                            Corrected
                          </span>
                        )}
                        {sourceTag && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1 ${sourceTag.className}`}>
                            {sourceTag.label}
                            {alert.triageSource === "semantic" && alert.similarityScores != null && (
                              <span className="ml-1 font-mono normal-case">
                                {(alert.similarityScores * 100).toFixed(0)}%
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="sentinel-text-muted flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /><span>{alert.userName || "Team member"}</span></span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(alert.timestamp)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeedbackAlert(alert)}
                        aria-label="Correct classification"
                        className="sentinel-text-muted rounded p-1 transition-colors hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </div>
      </WorkspaceGate>
    </SentinelShell>
  );
}

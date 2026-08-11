"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Loader2, PencilLine, Radio, Trash2 } from "lucide-react";
import { FeedbackModal } from "@/components/sentinel/FeedbackModal";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { springSnappy } from "@/lib/sentinel/motion";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { formatAlertMessageText } from "@/lib/slack/formatMessageDisplayClient";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

const PROCESSING_HOLD_MS = 1200;

const BADGE = {
  Escalate: CLASSIFICATION_STYLES.Escalate.badge,
  Log: CLASSIFICATION_STYLES.Log.badge,
  Mute: CLASSIFICATION_STYLES.Mute.badge,
};

const ROW_ACCENT = {
  Escalate: "border-l-rose-500",
  Log: "border-l-amber-500",
  Mute: "border-l-zinc-400 dark:border-l-slate-600",
};

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ConfirmModal({ open, title, onConfirm, onCancel, busy }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSnappy}
        className="sentinel-panel relative w-full max-w-sm rounded-xl p-5 shadow-xl"
      >
        <p className="sentinel-text-primary text-sm font-medium">{title}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="sentinel-btn-ghost rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function VerdictCell({ alert }) {
  const { stage, classification } = alert;

  if (stage === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 animate-pulse">
        Ingesting from Slack…
      </span>
    );
  }
  if (stage === 2) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-500 dark:text-violet-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        LLM Processing…
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${BADGE[classification] || BADGE.Mute}`}
    >
      {classification}
    </span>
  );
}

function AlertRow({ alert, onDelete, onCorrect, deletingId }) {
  const isFinal = !alert.stage || alert.stage === 3;
  const isProcessing = alert.stage != null && alert.stage < 3;
  const accent = isFinal ? ROW_ACCENT[alert.classification] || ROW_ACCENT.Mute : "border-l-blue-500";
  const isDeleting = deletingId === alert.id;
  const messageText = formatAlertMessageText(alert);

  return (
    <motion.tr
      layout
      initial={isProcessing ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: isDeleting ? 0.5 : 1, y: 0 }}
      transition={springSnappy}
      className={`border-l-2 ${accent} sentinel-hover transition-colors ${
        alert.stage && alert.stage < 3 ? "bg-blue-500/5" : ""
      }`}
    >
      <td className="sentinel-text-muted whitespace-nowrap px-4 py-3 text-xs">
        {formatTime(alert.timestamp)}
      </td>
      <td className="sentinel-text-secondary whitespace-nowrap px-4 py-3 text-xs">
        {alert.userName || "Team member"}
      </td>
      <td className="max-w-md px-4 py-3 text-sm">
        <p className="sentinel-text-primary">{isFinal ? messageText : "—"}</p>
        {isFinal && alert.reasoning && (
          <p className="sentinel-text-muted mt-1 line-clamp-2 text-xs">{alert.reasoning}</p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <VerdictCell alert={alert} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCorrect(alert)}
            disabled={isDeleting || isProcessing}
            aria-label="Correct classification"
            className="sentinel-text-muted rounded-lg p-2 transition-colors hover:bg-violet-500/10 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-violet-400"
          >
            <PencilLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(alert)}
            disabled={isDeleting || isProcessing}
            aria-label="Delete alert"
            className="sentinel-text-muted rounded-lg p-2 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

export default function SentinelFeedPage() {
  const { activeTeamId } = useWorkspace();
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [modal, setModal] = useState(null);
  const [feedbackAlert, setFeedbackAlert] = useState(null);
  const [busy, setBusy] = useState(false);
  const seenRef = useRef(new Set());
  const timersRef = useRef([]);

  const runPipeline = useCallback((alert) => {
    if (!alert?.id || seenRef.current.has(alert.id)) return;
    if (activeTeamId && alert.teamId && alert.teamId !== activeTeamId) return;
    seenRef.current.add(alert.id);

    setAlerts((prev) => [{ ...alert, stage: 1 }, ...prev.filter((a) => a.id !== alert.id)]);

    timersRef.current.push(
      setTimeout(() => {
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, stage: 2 } : a)));
        timersRef.current.push(
          setTimeout(() => {
            setAlerts((prev) =>
              prev.map((a) => (a.id === alert.id ? { ...a, stage: 3 } : a))
            );
          }, PROCESSING_HOLD_MS)
        );
      }, 350)
    );
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
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    fetch(`/api/alerts?teamId=${encodeURIComponent(activeTeamId)}`)
      .then((res) => res.json())
      .then((data) => {
        const items = (data.alerts || []).map((a) => ({ ...a, stage: 3 }));
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
        const alert = JSON.parse(event.data);
        if (alert?.provisional || alert?.eventKind === "pipeline_start") return;
        if (activeTeamId && alert.teamId && alert.teamId !== activeTeamId) return;
        if (seenRef.current.has(alert.id)) {
          setAlerts((prev) =>
            prev.map((a) => (a.id === alert.id ? { ...a, ...alert, stage: a.stage ?? 3 } : a))
          );
        } else {
          runPipeline(alert);
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      source.close();
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [activeTeamId, runPipeline]);

  const deleteOne = async (id) => {
    setDeletingId(id);
    const res = await fetch(
      `/api/alerts/${encodeURIComponent(id)}?teamId=${encodeURIComponent(activeTeamId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error("Delete failed");
    seenRef.current.delete(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const deleteAll = async () => {
    const res = await fetch(
      `/api/alerts?teamId=${encodeURIComponent(activeTeamId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error("Clear failed");
    seenRef.current.clear();
    setAlerts([]);
  };

  const handleConfirm = async () => {
    if (!modal) return;
    setBusy(true);
    try {
      if (modal.type === "one") await deleteOne(modal.id);
      else await deleteAll();
      setModal(null);
    } catch {
      /* keep modal open on failure */
    } finally {
      setBusy(false);
      setDeletingId(null);
    }
  };

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

  const tabs = [
    { id: "all", label: "All Activity" },
    { id: "Escalate", label: "Escalate" },
    { id: "Log", label: "Log" },
    { id: "Mute", label: "Mute" },
  ];

  return (
    <SentinelShell
      title="Live Slack Ingest & Triage"
      subtitle="Persistent activity log — stored by category, updated in real time"
    >
      <WorkspaceGate>
      <ConfirmModal
        open={!!modal}
        title={modal?.type === "all" ? "Clear all activity?" : "Delete this alert?"}
        onConfirm={handleConfirm}
        onCancel={() => !busy && setModal(null)}
        busy={busy}
      />

      <FeedbackModal
        open={!!feedbackAlert}
        alert={feedbackAlert}
        teamId={activeTeamId}
        onClose={() => setFeedbackAlert(null)}
        onSuccess={(updated) => {
          if (updated?.id) {
            setAlerts((prev) =>
              prev.map((a) => (a.id === updated.id ? { ...a, ...updated, stage: a.stage ?? 3 } : a))
            );
          }
        }}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: counts.all, color: "sentinel-text-primary" },
            { label: "Escalate", value: counts.Escalate, color: "text-rose-600 dark:text-rose-400" },
            { label: "Log", value: counts.Log, color: "text-amber-600 dark:text-amber-400" },
            { label: "Mute", value: counts.Mute, color: "sentinel-text-muted" },
          ].map((s) => (
            <div
              key={s.label}
              className="sentinel-card rounded-lg px-4 py-3"
            >
              <p className="sentinel-text-muted text-[10px] font-medium uppercase tracking-wider">{s.label}</p>
              <p className={`mt-0.5 text-2xl font-semibold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="sentinel-divider flex flex-wrap items-center justify-between gap-2 border-b pb-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="relative rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {isActive && (
                    <motion.span
                      layoutId="feed-tab-active"
                      className="sentinel-tab-active absolute inset-0 rounded-lg"
                      transition={springSnappy}
                    />
                  )}
                  <span
                    className={`relative flex items-center gap-2 ${
                      isActive ? "sentinel-text-primary" : "sentinel-text-muted"
                    }`}
                  >
                    {tab.label}
                    <span className="rounded-full bg-[var(--sentinel-surface-inset)] px-1.5 py-0.5 text-[10px] font-semibold">
                      {counts[tab.id] ?? 0}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {alerts.length > 0 && (
              <button
                type="button"
                onClick={() => setModal({ type: "all" })}
                className="sentinel-btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:border-rose-500/40 hover:text-rose-500"
              >
                Clear all
              </button>
            )}
            <span className="sentinel-text-muted flex items-center gap-1.5 text-[11px]">
              <Radio className="h-3 w-3" />
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-[var(--sentinel-text-muted)]"}`} />
              {connected ? "Live" : "Connecting…"}
            </span>
          </div>
        </div>

        <div className="sentinel-panel overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sentinel-table-head border-b text-[11px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Time</span>
                  </th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="sentinel-table-divide">
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="sentinel-text-muted px-4 py-12 text-center text-sm">
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="sentinel-text-muted px-4 py-12 text-center text-sm">
                        {activeTab === "all" ? "No activity yet" : `No ${activeTab} alerts`}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        deletingId={deletingId}
                        onDelete={(a) => setModal({ type: "one", id: a.id })}
                        onCorrect={(a) => setFeedbackAlert(a)}
                      />
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </WorkspaceGate>
    </SentinelShell>
  );
}

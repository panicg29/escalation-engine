"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Loader2, PencilLine, Trash2 } from "lucide-react";
import { FeedbackModal } from "@/components/sentinel/FeedbackModal";
import { SentinelSilkPageFrame } from "@/components/sentinel/SentinelSilkPageFrame";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { SpotlightCard } from "@/components/react-bits/SpotlightCard";
import { PillBadge, LiveBadge } from "@/components/react-bits/PillBadge";
import { ShinyButton } from "@/components/react-bits/ShinyButton";
import { SILK_GLASS_BAR } from "@/lib/sentinel/silkPageStyles";
import { springSnappy } from "@/lib/sentinel/motion";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { formatAlertMessageText } from "@/lib/slack/formatMessageDisplayClient";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

const PROCESSING_HOLD_MS = 1200;
const PAGE_SIZE = 20;

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

const STATUS_BADGE = {
  pending: "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  resolved: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
  escalated: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-400",
  escalating: "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-400",
  closed: "bg-zinc-400/20 text-zinc-600 ring-zinc-400/30 dark:text-zinc-400",
};

const STATUS_OPTIONS = [
  { id: "all", label: "All statuses" },
  { id: "pending", label: "Pending" },
  { id: "resolved", label: "Resolved" },
  { id: "escalating", label: "Escalating" },
  { id: "escalated", label: "Escalated" },
  { id: "closed", label: "Closed" },
];

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
        className="sentinel-glass-bar relative w-full max-w-sm rounded-xl p-5 shadow-xl"
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

function PaginationBar({ pagination, onPageChange, loading }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="sentinel-divider flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p className="sentinel-text-muted text-xs">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={loading || page <= 1}
          className="sentinel-btn-ghost inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <span className="sentinel-text-secondary text-xs font-medium">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={loading || page >= totalPages}
          className="sentinel-btn-ghost inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
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

function StatusCell({ status }) {
  const label = status || "resolved";
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${STATUS_BADGE[label] || STATUS_BADGE.resolved}`}
    >
      {label}
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
      <td className="whitespace-nowrap px-4 py-3">
        <StatusCell status={alert.status} />
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

function matchesFilters(alert, classificationTab, statusFilter) {
  if (classificationTab !== "all" && alert.classification !== classificationTab) return false;
  if (statusFilter !== "all" && alert.status !== statusFilter) return false;
  return true;
}

export default function SentinelDashboardPage() {
  const { activeTeamId } = useWorkspace();
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({
    classification: { all: 0, Escalate: 0, Log: 0, Mute: 0 },
    status: { all: 0, pending: 0, resolved: 0, escalated: 0, escalating: 0, closed: 0 },
  });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [modal, setModal] = useState(null);
  const [feedbackAlert, setFeedbackAlert] = useState(null);
  const [busy, setBusy] = useState(false);
  const seenRef = useRef(new Set());
  const timersRef = useRef([]);
  const filtersRef = useRef({ activeTab: "all", statusFilter: "all", page: 1 });

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

  const fetchAlerts = useCallback(async (teamId, nextPage, classification, status) => {
    const params = new URLSearchParams({
      teamId,
      page: String(nextPage),
      limit: String(PAGE_SIZE),
    });
    if (classification !== "all") params.set("classification", classification);
    if (status !== "all") params.set("status", status);

    const res = await fetch(`/api/alerts?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load alerts");

    const items = (data.alerts || []).map((a) => ({ ...a, stage: 3 }));
    return {
      items,
      pagination: data.pagination || null,
      counts: data.counts || {
        classification: { all: 0, Escalate: 0, Log: 0, Mute: 0 },
        status: { all: 0, pending: 0, resolved: 0, escalated: 0, escalating: 0, closed: 0 },
      },
    };
  }, []);

  useEffect(() => {
    filtersRef.current = { activeTab, statusFilter, page };
  }, [activeTab, statusFilter, page]);

  useEffect(() => {
    if (!activeTeamId) {
      setAlerts([]);
      setPagination(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    seenRef.current = new Set();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    fetchAlerts(activeTeamId, page, activeTab, statusFilter)
      .then(({ items, pagination: pg, counts: nextCounts }) => {
        items.forEach((a) => seenRef.current.add(a.id));
        setAlerts(items);
        setPagination(pg);
        setCounts(nextCounts);
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

        const { activeTab: tab, statusFilter: status, page: currentPage } = filtersRef.current;
        const fitsFilters = matchesFilters(alert, tab, status);

        if (seenRef.current.has(alert.id)) {
          setAlerts((prev) =>
            prev.map((a) => (a.id === alert.id ? { ...a, ...alert, stage: a.stage ?? 3 } : a))
          );
          return;
        }

        seenRef.current.add(alert.id);

        if (currentPage === 1 && fitsFilters) {
          runPipeline(alert);
          setCounts((prev) => ({
            classification: {
              ...prev.classification,
              all: prev.classification.all + 1,
              [alert.classification]:
                (prev.classification[alert.classification] || 0) + 1,
            },
            status: {
              ...prev.status,
              all: prev.status.all + 1,
              [alert.status || "resolved"]:
                (prev.status[alert.status || "resolved"] || 0) + 1,
            },
          }));
          setPagination((prev) =>
            prev
              ? {
                  ...prev,
                  total: prev.total + 1,
                  totalPages: Math.max(1, Math.ceil((prev.total + 1) / prev.limit)),
                }
              : prev
          );
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
  }, [activeTeamId, page, activeTab, statusFilter, fetchAlerts, runPipeline]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const handleStatusChange = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const deleteOne = async (id) => {
    setDeletingId(id);
    const res = await fetch(
      `/api/alerts/${encodeURIComponent(id)}?teamId=${encodeURIComponent(activeTeamId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error("Delete failed");
    seenRef.current.delete(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setPagination((prev) =>
      prev
        ? {
            ...prev,
            total: Math.max(0, prev.total - 1),
            totalPages: Math.max(1, Math.ceil(Math.max(0, prev.total - 1) / prev.limit)),
          }
        : prev
    );
  };

  const deleteAll = async () => {
    const res = await fetch(
      `/api/alerts?teamId=${encodeURIComponent(activeTeamId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error("Clear failed");
    seenRef.current.clear();
    setAlerts([]);
    setPagination(null);
    setCounts({
      classification: { all: 0, Escalate: 0, Log: 0, Mute: 0 },
      status: { all: 0, pending: 0, resolved: 0, escalated: 0, escalating: 0, closed: 0 },
    });
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

  const classificationCounts = counts.classification;
  const statusCounts = counts.status;

  const tabs = [
    { id: "all", label: "All Activity" },
    { id: "Escalate", label: "Escalate" },
    { id: "Log", label: "Log" },
    { id: "Mute", label: "Mute" },
  ];

  const statCards = useMemo(
    () => [
      { label: "Total", value: classificationCounts.all, color: "sentinel-text-primary" },
      { label: "Escalate", value: classificationCounts.Escalate, color: "text-rose-600 dark:text-rose-400" },
      { label: "Log", value: classificationCounts.Log, color: "text-amber-600 dark:text-amber-400" },
      { label: "Mute", value: classificationCounts.Mute, color: "sentinel-text-muted" },
    ],
    [classificationCounts]
  );

  return (
    <SentinelSilkPageFrame
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

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statCards.map((s) => (
            <SpotlightCard key={s.label} glass spotlightIntensity={0.25} className="!p-0">
              <div className="px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--silk-text-muted)]">
                  {s.label}
                </p>
                <p className={`mt-1 text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              </div>
            </SpotlightCard>
          ))}
        </div>

        <div className={`${SILK_GLASS_BAR} !mb-0 flex-wrap items-center justify-between`}>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className="relative rounded-lg px-4 py-2 text-sm font-bold"
                >
                  {isActive && (
                    <motion.span
                      layoutId="dashboard-tab-active"
                      className="sentinel-tab-active absolute inset-0 rounded-lg"
                      transition={springSnappy}
                    />
                  )}
                  <span
                    className={`relative flex items-center gap-2 ${
                      isActive ? "text-[var(--silk-text-strong)]" : "text-[var(--silk-text-muted)]"
                    }`}
                  >
                    {tab.label}
                    <span className="rounded-full bg-[var(--silk-glass-bg-strong)] px-1.5 py-0.5 text-[10px] font-bold">
                      {classificationCounts[tab.id] ?? 0}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--silk-text-muted)]">
              Status
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="sentinel-input rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-violet-500/40"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({statusCounts[opt.id] ?? 0})
                  </option>
                ))}
              </select>
            </label>

            {classificationCounts.all > 0 && (
              <ShinyButton variant="outline" size="sm" onClick={() => setModal({ type: "all" })}>
                Clear all
              </ShinyButton>
            )}
            {connected ? (
              <LiveBadge>Live</LiveBadge>
            ) : (
              <PillBadge variant="warning" size="sm" animated={false} showDot={false}>
                Connecting…
              </PillBadge>
            )}
          </div>
        </div>

        <SpotlightCard glass spotlightIntensity={0.2} className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sentinel-table-head border-b text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Time</span>
                  </th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="sentinel-table-divide">
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-[var(--silk-text-muted)]">
                        Loading…
                      </td>
                    </tr>
                  ) : alerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-[var(--silk-text-muted)]">
                        {activeTab === "all" && statusFilter === "all"
                          ? "No activity yet"
                          : "No alerts match the current filters"}
                      </td>
                    </tr>
                  ) : (
                    alerts.map((alert) => (
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
          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            loading={loading}
          />
        </SpotlightCard>
      </div>
      </WorkspaceGate>
    </SentinelSilkPageFrame>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hash,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { BentoStatCard } from "@/components/sentinel/BentoStatCard";
import { FeedbackEditModal } from "@/components/sentinel/FeedbackEditModal";
import { SentinelSilkPageFrame } from "@/components/sentinel/SentinelSilkPageFrame";
import { SilkSectionHeader } from "@/components/sentinel/SilkSectionHeader";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { SpotlightCard } from "@/components/react-bits/SpotlightCard";
import { ShinyButton } from "@/components/react-bits/ShinyButton";
import { SILK_GLASS_BAR } from "@/lib/sentinel/silkPageStyles";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy } from "@/lib/sentinel/motion";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

const PAGE_SIZE = 20;

const TABS = [
  { id: "all", label: "All" },
  { id: "Escalate", label: "Escalate" },
  { id: "Log", label: "Log" },
  { id: "Mute", label: "Mute" },
];

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateHash(hash) {
  if (!hash || hash.length < 12) return hash || "—";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function buildStats(counts) {
  const total = counts.all || 0;
  const escalate = counts.Escalate || 0;
  const embedded = counts.embedded || 0;

  return [
    {
      id: "total",
      label: "Stored Corrections",
      value: String(total),
      delta: "Exact-match + few-shot set",
      trend: "up",
      span: "col-span-1 md:col-span-2",
    },
    {
      id: "escalate",
      label: "Escalate Examples",
      value: String(escalate),
      delta: total ? `${Math.round((escalate / total) * 100)}% of set` : "—",
      trend: escalate ? "alert" : "neutral",
      span: "col-span-1",
    },
    {
      id: "embedded",
      label: "Embedded Vectors",
      value: String(embedded),
      delta: "Semantic similar-message matching",
      trend: "up",
      span: "col-span-1",
    },
  ];
}

function PaginationBar({ pagination, onPageChange, loading }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="sentinel-divider flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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

export default function SentinelFeedbackPage() {
  const { activeTeamId } = useWorkspace();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({ all: 0, Escalate: 0, Log: 0, Mute: 0, embedded: 0 });
  const [modal, setModal] = useState({ open: false, mode: "edit", entry: null });
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const loadFeedback = useCallback(async () => {
    if (!activeTeamId) {
      setFeedback([]);
      setPagination(null);
      setLoading(false);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        teamId: activeTeamId,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (activeTab !== "all") params.set("userOverride", activeTab);

      const res = await fetch(`/api/feedback?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load feedback.");
      setFeedback(data.feedback || []);
      setPagination(data.pagination || null);
      setCounts(data.counts || { all: 0, Escalate: 0, Log: 0, Mute: 0, embedded: 0 });
    } catch (err) {
      setError(err?.message || "Failed to load feedback.");
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, page, activeTab]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const stats = useMemo(() => buildStats(counts), [counts]);

  const handleSaved = (saved) => {
    if (!saved?.id) {
      loadFeedback();
      return;
    }
    loadFeedback();
  };

  const handleDelete = async (entry) => {
    const confirmed = window.confirm(
      `Delete this correction?\n\n"${entry.originalText.slice(0, 80)}${entry.originalText.length > 80 ? "…" : ""}"\n\nIt will be removed from exact-match cache and semantic few-shot retrieval.`
    );
    if (!confirmed) return;

    setDeletingId(entry.id);
    setError("");
    try {
      const res = await fetch(
        `/api/feedback/${entry.id}?teamId=${encodeURIComponent(activeTeamId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete feedback.");
      setFeedback((prev) => prev.filter((f) => f.id !== entry.id));
      setCounts((prev) => ({
        ...prev,
        all: Math.max(0, prev.all - 1),
        [entry.userOverride]: Math.max(0, (prev[entry.userOverride] || 0) - 1),
        embedded: Math.max(
          0,
          (prev.embedded || 0) - (entry.embeddingDimensions > 0 ? 1 : 0)
        ),
      }));
      setPagination((prev) =>
        prev
          ? {
              ...prev,
              total: Math.max(0, prev.total - 1),
              totalPages: Math.max(1, Math.ceil(Math.max(0, prev.total - 1) / prev.limit)),
            }
          : prev
      );
    } catch (err) {
      setError(err?.message || "Failed to delete feedback.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "Clear all feedback corrections for this workspace? This cannot be undone."
    );
    if (!confirmed) return;

    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/feedback?teamId=${encodeURIComponent(activeTeamId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear feedback.");
      setFeedback([]);
      setPagination(null);
      setCounts({ all: 0, Escalate: 0, Log: 0, Mute: 0, embedded: 0 });
      setPage(1);
    } catch (err) {
      setError(err?.message || "Failed to clear feedback.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SentinelSilkPageFrame
      title="Feedback Library"
      subtitle="Manage user corrections that power exact-match cache and semantic few-shot triage"
    >
      <WorkspaceGate>
      <FeedbackEditModal
        open={modal.open}
        mode={modal.mode}
        entry={modal.entry}
        teamId={activeTeamId}
        onClose={() => setModal({ open: false, mode: "edit", entry: null })}
        onSuccess={handleSaved}
      />

      <div className={`${SILK_GLASS_BAR} mb-6`}>
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--silk-text-muted)]">
          <Brain className="h-4 w-4 text-violet-500 dark:text-violet-400" />
          {loading ? "Loading corrections…" : `${counts.all} correction${counts.all === 1 ? "" : "s"} in library`}
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.all > 0 && (
            <ShinyButton variant="outline" size="sm" onClick={handleClearAll}>
              Clear all
            </ShinyButton>
          )}
          <ShinyButton
            variant="primary"
            size="sm"
            onClick={() => setModal({ open: true, mode: "create", entry: null })}
          >
            <Plus className="h-4 w-4" />
            Add correction
          </ShinyButton>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="mb-6 grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((stat, index) => (
          <SpotlightCard key={stat.id} glass spotlightIntensity={0.2} className={`!p-0 ${stat.span}`}>
            <BentoStatCard stat={stat} index={index} embedded />
          </SpotlightCard>
        ))}
      </div>

      <SpotlightCard glass spotlightIntensity={0.25}>
        <SilkSectionHeader
          icon={Brain}
          title="Correction records"
          description="Few-shot examples used for exact hash and semantic triage"
          iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        />

        <div className="mb-5 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className="relative rounded-lg px-3 py-2 text-xs font-bold"
              >
                {isActive && (
                  <motion.span
                    layoutId="feedback-tab-active"
                    className="sentinel-tab-active absolute inset-0 rounded-lg"
                    transition={springSnappy}
                  />
                )}
                <span
                  className={`relative flex items-center gap-1.5 ${isActive ? "text-[var(--silk-text-strong)]" : "text-[var(--silk-text-muted)]"}`}
                >
                  {tab.label}
                  <span className="rounded-full bg-[var(--silk-glass-bg-strong)] px-1.5 py-0.5 text-[10px] font-bold">
                    {counts[tab.id] ?? 0}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm font-semibold text-[var(--silk-text-muted)]">Loading feedback…</p>
        ) : feedback.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-[var(--silk-text-muted)]">
            {activeTab === "all"
              ? "No corrections yet. Add one from an alert or use “Add correction” above."
              : `No ${activeTab} corrections`}
          </p>
        ) : (
          <ul className="space-y-3">
            {feedback.map((entry) => {
              const styles = CLASSIFICATION_STYLES[entry.userOverride] || CLASSIFICATION_STYLES.Mute;
              const isDeleting = deletingId === entry.id;

              return (
                <li
                  key={entry.id}
                  className={`sentinel-card-inset rounded-lg p-4 ${styles.border}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-relaxed text-[var(--silk-text-strong)]">
                        {entry.originalText}
                      </p>
                      {entry.userReasoning && (
                        <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--silk-text-muted)]">
                          {entry.userReasoning}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-[var(--silk-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(entry.timestamp)}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Hash className="h-3 w-3" />
                          {truncateHash(entry.textHash)}
                        </span>
                        {entry.embeddingDimensions > 0 && (
                          <span>{entry.embeddingDimensions}d embedding</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${styles.badge}`}
                      >
                        {entry.userOverride}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setModal({ open: true, mode: "edit", entry })
                          }
                          disabled={isDeleting}
                          aria-label="Edit correction"
                          className="rounded-lg p-2 text-[var(--silk-text-muted)] transition-colors hover:bg-violet-500/10 hover:text-violet-600 disabled:opacity-50 dark:hover:text-violet-400"
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          disabled={isDeleting}
                          aria-label="Delete correction"
                          className="rounded-lg p-2 text-[var(--silk-text-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <PaginationBar
          pagination={pagination}
          onPageChange={setPage}
          loading={loading}
        />
      </SpotlightCard>
      </WorkspaceGate>
    </SentinelSilkPageFrame>
  );
}

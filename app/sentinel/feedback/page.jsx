"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Clock,
  Hash,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { BentoStatCard } from "@/components/sentinel/BentoStatCard";
import { FeedbackEditModal } from "@/components/sentinel/FeedbackEditModal";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy, fadeUp } from "@/lib/sentinel/motion";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

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

function buildStats(items) {
  const total = items.length;
  const escalate = items.filter((f) => f.userOverride === "Escalate").length;
  const embedded = items.filter((f) => f.embeddingDimensions > 0).length;

  return [
    {
      id: "total",
      label: "Stored Corrections",
      value: String(total),
      delta: "Few-shot training set",
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
      delta: "Semantic Tier 2 ready",
      trend: "up",
      span: "col-span-1",
    },
  ];
}

export default function SentinelFeedbackPage() {
  const { activeTeamId } = useWorkspace();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [modal, setModal] = useState({ open: false, mode: "edit", entry: null });
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const loadFeedback = useCallback(async () => {
    if (!activeTeamId) {
      setFeedback([]);
      setLoading(false);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/feedback?teamId=${encodeURIComponent(activeTeamId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load feedback.");
      setFeedback(data.feedback || []);
    } catch (err) {
      setError(err?.message || "Failed to load feedback.");
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return feedback;
    return feedback.filter((f) => f.userOverride === activeTab);
  }, [feedback, activeTab]);

  const counts = useMemo(
    () => ({
      all: feedback.length,
      Escalate: feedback.filter((f) => f.userOverride === "Escalate").length,
      Log: feedback.filter((f) => f.userOverride === "Log").length,
      Mute: feedback.filter((f) => f.userOverride === "Mute").length,
    }),
    [feedback]
  );

  const stats = useMemo(() => buildStats(feedback), [feedback]);

  const handleSaved = (saved) => {
    if (!saved?.id) {
      loadFeedback();
      return;
    }
    setFeedback((prev) => {
      const exists = prev.some((f) => f.id === saved.id);
      if (exists) {
        return prev.map((f) => (f.id === saved.id ? saved : f));
      }
      return [saved, ...prev];
    });
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
    } catch (err) {
      setError(err?.message || "Failed to delete feedback.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SentinelShell
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

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="sentinel-text-muted flex items-center gap-2 text-xs">
          <Brain className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
          {loading ? "Loading corrections…" : `${feedback.length} correction${feedback.length === 1 ? "" : "s"} in library`}
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, mode: "create", entry: null })}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          Add correction
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="mb-6 grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((stat, index) => (
          <BentoStatCard key={stat.id} stat={stat} index={index} />
        ))}
      </div>

      <motion.div
        {...fadeUp}
        transition={springSnappy}
        className="sentinel-panel rounded-xl p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="sentinel-text-secondary text-sm font-medium">Correction records</h2>
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
                      layoutId="feedback-tab-active"
                      className="sentinel-tab-active absolute inset-0 rounded-lg"
                      transition={springSnappy}
                    />
                  )}
                  <span
                    className={`relative flex items-center gap-1.5 ${isActive ? "sentinel-text-primary" : "sentinel-text-muted"}`}
                  >
                    {tab.label}
                    <span className="rounded-full bg-[var(--sentinel-surface-inset)] px-1.5 py-0.5 text-[10px]">
                      {counts[tab.id]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <p className="sentinel-text-muted py-8 text-center text-sm">Loading feedback…</p>
        ) : filtered.length === 0 ? (
          <p className="sentinel-text-muted py-8 text-center text-sm">
            No corrections yet. Add one from an alert or use &ldquo;Add correction&rdquo; above.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((entry) => {
              const styles = CLASSIFICATION_STYLES[entry.userOverride] || CLASSIFICATION_STYLES.Mute;
              const isDeleting = deletingId === entry.id;

              return (
                <li
                  key={entry.id}
                  className={`sentinel-card-inset rounded-lg p-4 ${styles.border}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="sentinel-text-primary text-sm leading-relaxed">
                        {entry.originalText}
                      </p>
                      {entry.userReasoning && (
                        <p className="sentinel-text-muted mt-2 text-xs leading-relaxed">
                          {entry.userReasoning}
                        </p>
                      )}
                      <div className="sentinel-text-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
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
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${styles.badge}`}
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
                          className="sentinel-text-muted rounded-lg p-2 transition-colors hover:bg-violet-500/10 hover:text-violet-600 disabled:opacity-50 dark:hover:text-violet-400"
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          disabled={isDeleting}
                          aria-label="Delete correction"
                          className="sentinel-text-muted rounded-lg p-2 transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
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
      </motion.div>
      </WorkspaceGate>
    </SentinelShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy } from "@/lib/sentinel/motion";
import { formatAlertMessageText } from "@/lib/slack/formatMessageDisplayClient";

const OPTIONS = ["Escalate", "Log", "Mute"];

export function FeedbackModal({ open, alert, onClose, onSuccess, teamId }) {
  const [userOverride, setUserOverride] = useState("Mute");
  const [userReasoning, setUserReasoning] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !alert) return;
    setUserOverride(alert.classification || "Mute");
    setUserReasoning("");
    setError("");
    setBusy(false);
  }, [open, alert]);

  if (!open || !alert) return null;

  const styles = CLASSIFICATION_STYLES[alert.classification] || CLASSIFICATION_STYLES.Mute;
  const scopedTeamId = teamId || alert.teamId;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    if (!scopedTeamId) {
      setError("No active workspace selected.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/slack/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: alert.id,
          teamId: scopedTeamId,
          originalText: alert.text,
          userOverride,
          userReasoning: userReasoning.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save feedback.");
      }

      onSuccess?.(data.alert || { ...alert, classification: userOverride, reasoning: userReasoning.trim(), correctedAt: new Date().toISOString() });
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to save feedback.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <motion.form
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSnappy}
        onSubmit={handleSubmit}
        className="sentinel-panel relative w-full max-w-md rounded-xl p-5 shadow-xl"
      >
        <h2 className="sentinel-text-primary text-sm font-semibold">Correct classification</h2>
        <p className="sentinel-text-muted mt-1 text-xs">
          Your correction is stored immediately for exact repeats. Similar wording uses embeddings when available. Saving still works if embedding fails.
        </p>

        <div className="sentinel-card-inset mt-4 rounded-lg p-3">
          <p className="sentinel-text-secondary text-sm leading-relaxed">
            {formatAlertMessageText(alert)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="sentinel-text-muted text-[10px] uppercase tracking-wide">Current</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${styles.badge}`}>
              {alert.classification}
            </span>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="sentinel-text-primary mb-1.5 block text-xs font-medium">Correct verdict</span>
          <select
            value={userOverride}
            onChange={(e) => setUserOverride(e.target.value)}
            disabled={busy}
            className="sentinel-input w-full rounded-lg px-3 py-2 text-sm"
          >
            {OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="sentinel-text-primary mb-1.5 block text-xs font-medium">Why this classification?</span>
          <textarea
            value={userReasoning}
            onChange={(e) => setUserReasoning(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="Explain the reasoning so the model learns from this example…"
            className="sentinel-input w-full resize-none rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p className="mt-3 text-xs text-rose-500">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="sentinel-btn-ghost rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Saving…" : "Save correction"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

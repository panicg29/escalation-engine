"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { springSnappy } from "@/lib/sentinel/motion";

const OPTIONS = ["Escalate", "Log", "Mute"];

const EMPTY = {
  originalText: "",
  userOverride: "Mute",
  userReasoning: "",
};

export function FeedbackEditModal({
  open,
  entry,
  mode = "edit",
  onClose,
  onSuccess,
  teamId,
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isCreate = mode === "create";

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setForm(EMPTY);
    } else if (entry) {
      setForm({
        originalText: entry.originalText || "",
        userOverride: entry.userOverride || "Mute",
        userReasoning: entry.userReasoning || "",
      });
    }
    setError("");
    setBusy(false);
  }, [open, entry, isCreate]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    const scopedTeamId = teamId || entry?.teamId;
    if (!scopedTeamId) {
      setError("No active workspace selected.");
      setBusy(false);
      return;
    }

    const payload = {
      teamId: scopedTeamId,
      originalText: form.originalText.trim(),
      userOverride: form.userOverride,
      userReasoning: form.userReasoning.trim(),
    };

    if (!payload.originalText) {
      setError("Message text is required.");
      setBusy(false);
      return;
    }

    try {
      const url = isCreate
        ? `/api/feedback?teamId=${encodeURIComponent(scopedTeamId)}`
        : `/api/feedback/${entry.id}?teamId=${encodeURIComponent(scopedTeamId)}`;
      const method = isCreate ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save feedback.");
      }

      onSuccess?.(data.feedback);
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
        className="sentinel-panel relative w-full max-w-lg rounded-xl p-5 shadow-xl"
      >
        <h2 className="sentinel-text-primary text-sm font-semibold">
          {isCreate ? "Add correction" : "Edit correction"}
        </h2>
        <p className="sentinel-text-muted mt-1 text-xs">
          {isCreate
            ? "Create a new few-shot example for exact-match cache and semantic triage."
            : "Changes re-embed the message when text is edited, keeping the triage pipeline in sync."}
        </p>

        <label className="mt-4 block">
          <span className="sentinel-text-primary mb-1.5 block text-xs font-medium">
            Message text
          </span>
          <textarea
            value={form.originalText}
            onChange={(e) => setForm((prev) => ({ ...prev, originalText: e.target.value }))}
            disabled={busy}
            rows={3}
            placeholder="The exact Slack message users might send…"
            className="sentinel-input w-full resize-none rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-3 block">
          <span className="sentinel-text-primary mb-1.5 block text-xs font-medium">
            Correct verdict
          </span>
          <select
            value={form.userOverride}
            onChange={(e) => setForm((prev) => ({ ...prev, userOverride: e.target.value }))}
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
          <span className="sentinel-text-primary mb-1.5 block text-xs font-medium">
            Reasoning
          </span>
          <textarea
            value={form.userReasoning}
            onChange={(e) => setForm((prev) => ({ ...prev, userReasoning: e.target.value }))}
            disabled={busy}
            rows={3}
            placeholder="Why this classification is correct…"
            className="sentinel-input w-full resize-none rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}

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
            {busy ? "Saving…" : isCreate ? "Add correction" : "Save changes"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

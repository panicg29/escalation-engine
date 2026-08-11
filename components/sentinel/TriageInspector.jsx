"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Code2 } from "lucide-react";

const TIER_STYLES = {
  1: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400",
  3: "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-400",
};

export function TriageInspector({ debug }) {
  const [open, setOpen] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  if (!debug) {
    return (
      <p className="sentinel-text-muted mt-3 border-t border-[var(--sentinel-border)] pt-3 text-xs">
        No triage debug payload (legacy alert).
      </p>
    );
  }

  const tierClass = TIER_STYLES[debug.tier] || TIER_STYLES[3];

  return (
    <div className="mt-4 border-t border-[var(--sentinel-border)] pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sentinel-text-secondary flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Code2 className="h-3.5 w-3.5 text-violet-500" />
        Triage inspector
        <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold normal-case ring-1 ${tierClass}`}>
          {debug.tierLabel || `Tier ${debug.tier}`}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="sentinel-text-muted text-[11px] leading-relaxed">
            OpenRouter calls run on the server — they never appear in the browser Network tab.
            This panel shows the exact payload from the SSE stream after each Slack message is triaged.
          </p>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetaItem label="Text hash" value={debug.textHash?.slice(0, 12) + "…"} mono />
            <MetaItem label="LLM called" value={debug.llmSkipped ? "No (cache hit)" : "Yes"} />
            <MetaItem label="Model" value={debug.model || "—"} mono />
            <MetaItem label="Few-shot examples" value={String(debug.fewShotExampleCount ?? 0)} />
          </div>

          {debug.matchedFeedback && (
            <div className="sentinel-card-inset rounded-lg p-3">
              <p className="sentinel-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wide">
                Matched feedback (Tier 1)
              </p>
              <p className="sentinel-text-secondary text-xs">&ldquo;{debug.matchedFeedback.originalText}&rdquo;</p>
              <p className="sentinel-text-muted mt-1 text-[11px]">
                Override: <strong>{debug.matchedFeedback.userOverride}</strong>
                {debug.matchedFeedback.userReasoning && ` — ${debug.matchedFeedback.userReasoning}`}
              </p>
            </div>
          )}

          {debug.similarityScores?.length > 0 && (
            <div className="sentinel-card-inset rounded-lg p-3">
              <p className="sentinel-text-muted mb-2 text-[10px] font-semibold uppercase tracking-wide">
                Semantic matches (Tier 2)
              </p>
              <ul className="space-y-1.5">
                {debug.similarityScores.map((row) => (
                  <li key={row.textHash} className="sentinel-text-secondary text-[11px]">
                    <span className="font-mono text-violet-600 dark:text-violet-400">
                      {(row.score * 100).toFixed(1)}%
                    </span>
                    {" · "}
                    {row.userOverride}
                    {" · "}
                    <span className="sentinel-text-muted line-clamp-1">&ldquo;{row.originalText}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {debug.llmRequest && (
            <div className="sentinel-card-inset rounded-lg p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="sentinel-text-muted text-[10px] font-semibold uppercase tracking-wide">
                  LLM request payload
                </p>
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="sentinel-text-muted text-[10px] hover:text-violet-600 dark:hover:text-violet-400"
                >
                  {showRaw ? "Show formatted" : "Show raw JSON"}
                </button>
              </div>

              {showRaw ? (
                <pre className="sentinel-text-secondary max-h-64 overflow-auto rounded bg-[var(--sentinel-surface-hover)] p-2 font-mono text-[10px] leading-relaxed">
                  {JSON.stringify(debug.llmRequest, null, 2)}
                </pre>
              ) : (
                <div className="max-h-64 space-y-2 overflow-auto">
                  {debug.llmRequest.messages?.map((msg, i) => (
                    <div key={i}>
                      <p className="sentinel-text-muted mb-0.5 text-[10px] font-semibold uppercase">
                        {msg.role}
                      </p>
                      <pre className="sentinel-text-secondary whitespace-pre-wrap rounded bg-[var(--sentinel-surface-hover)] p-2 font-mono text-[10px] leading-relaxed">
                        {msg.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value, mono = false }) {
  return (
    <div className="sentinel-card-inset rounded-lg px-3 py-2">
      <p className="sentinel-text-muted text-[10px] uppercase tracking-wide">{label}</p>
      <p className={`sentinel-text-primary mt-0.5 text-xs ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

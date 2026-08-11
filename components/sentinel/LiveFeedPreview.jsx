"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Hash } from "lucide-react";
import { LIVE_PREVIEW_MESSAGES, CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy, fadeUp } from "@/lib/sentinel/motion";

export function LiveFeedPreview() {
  const [index, setIndex] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProcessing(true);
      const timer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % LIVE_PREVIEW_MESSAGES.length);
        setProcessing(false);
      }, 900);
      return () => clearTimeout(timer);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  const current = LIVE_PREVIEW_MESSAGES[index];
  const styles = CLASSIFICATION_STYLES[current.classification];

  return (
    <div className="sentinel-card relative overflow-hidden rounded-2xl p-1">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.05),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.08),transparent_50%)]" />

      <div className="relative rounded-xl bg-[var(--sentinel-surface-inset)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="sentinel-text-muted flex items-center gap-2 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-500" />
            </span>
            Live Feed Preview
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-400 dark:ring-violet-500/25">
            <Bot className="h-3 w-3" />
            AI Triage
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            {...fadeUp}
            transition={springSnappy}
            className={`sentinel-card-inset rounded-lg p-4 ${styles.border} ${styles.glow}`}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="sentinel-text-primary text-sm leading-relaxed">
                {current.text}
              </p>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${styles.badge}`}
              >
                {current.classification}
              </span>
            </div>
            <div className="sentinel-text-muted flex items-center gap-3 text-[11px]">
              <span className="font-mono">{current.user}</span>
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {current.channel.replace("#", "")}
              </span>
              <span>{current.timestamp}</span>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-4 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--sentinel-surface-hover)]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-500 dark:from-violet-500 dark:to-violet-400"
              animate={{ width: processing ? "100%" : "0%" }}
              transition={{ duration: processing ? 0.85 : 0.3, ease: "easeOut" }}
            />
          </div>
          <span className="text-[10px] font-medium text-violet-700 dark:text-violet-400/80">
            {processing ? "Classifying…" : "Ready"}
          </span>
        </div>

        <div className="mt-3 flex gap-2">
          {LIVE_PREVIEW_MESSAGES.slice(0, 4).map((msg, i) => (
            <div
              key={msg.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i === index % 4 ? "bg-violet-600 dark:bg-violet-500" : "bg-[var(--sentinel-surface-hover)]"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

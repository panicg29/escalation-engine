"use client";

import { motion } from "framer-motion";

export function EngineStatus({ compact = false }) {
  return (
    <div
      className={`sentinel-card-inset flex items-center gap-2.5 rounded-lg ${
        compact ? "px-3 py-2.5" : "px-4 py-3"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 dark:bg-emerald-400"
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600 shadow-[0_0_10px_2px_rgba(16,185,129,0.35)] dark:bg-emerald-400 dark:shadow-[0_0_12px_2px_rgba(52,211,153,0.5)]" />
      </span>
      <div>
        <div className="sentinel-text-secondary text-xs font-medium">
          Engine: <span className="text-emerald-600 dark:text-emerald-400">Active</span>
        </div>
        {!compact && (
          <div className="sentinel-text-muted text-[10px]">
            OpenRouter · gpt-4o-mini · 99.7% uptime
          </div>
        )}
      </div>
    </div>
  );
}

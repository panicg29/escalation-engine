"use client";

import { motion } from "framer-motion";
import { Clock, Hash, User } from "lucide-react";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy, fadeUp } from "@/lib/sentinel/motion";

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AlertFeedCard({ alert, index }) {
  const styles = CLASSIFICATION_STYLES[alert.classification];

  return (
    <motion.article
      layout
      {...fadeUp}
      transition={{ ...springSnappy, delay: Math.min(index * 0.04, 0.24) }}
      className={`group rounded-xl border bg-zinc-900/50 p-4 backdrop-blur-sm ${styles.border} ${styles.glow} ${
        alert.classification === "Mute" ? "opacity-75" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-zinc-200">{alert.text}</p>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${styles.badge}`}
        >
          {alert.classification}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <User className="h-3 w-3" />
          <span className="font-mono text-zinc-500">{alert.userId}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Hash className="h-3 w-3" />
          {alert.channel}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          {formatTimestamp(alert.timestamp)}
        </span>
        {alert.urgencyScore != null && (
          <span className={`ml-auto font-mono ${styles.accent}`}>
            Score {alert.urgencyScore}/10
          </span>
        )}
      </div>
    </motion.article>
  );
}

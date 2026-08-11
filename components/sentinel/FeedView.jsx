"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FEED_ALERTS } from "@/lib/sentinel/mockData";
import { springSnappy } from "@/lib/sentinel/motion";
import { AlertFeedCard } from "./AlertFeedCard";

const TABS = [
  { id: "all", label: "All Alerts", count: FEED_ALERTS.length },
  {
    id: "Escalate",
    label: "Escalate",
    count: FEED_ALERTS.filter((a) => a.classification === "Escalate").length,
  },
  {
    id: "Log",
    label: "Log",
    count: FEED_ALERTS.filter((a) => a.classification === "Log").length,
  },
  {
    id: "Mute",
    label: "Mute",
    count: FEED_ALERTS.filter((a) => a.classification === "Mute").length,
  },
];

export function FeedView() {
  const [activeTab, setActiveTab] = useState("all");

  const filtered = useMemo(() => {
    if (activeTab === "all") return FEED_ALERTS;
    return FEED_ALERTS.filter((a) => a.classification === activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-zinc-800/60 pb-4">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="relative rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId="feed-tab-active"
                  className="absolute inset-0 rounded-lg bg-zinc-800 ring-1 ring-zinc-700/60"
                  transition={springSnappy}
                />
              )}
              <span
                className={`relative flex items-center gap-2 ${
                  isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive
                      ? "bg-zinc-700 text-zinc-300"
                      : "bg-zinc-900 text-zinc-600"
                  }`}
                >
                  {tab.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <motion.div layout className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {filtered.map((alert, index) => (
            <AlertFeedCard key={alert.id} alert={alert} index={index} />
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-600">
          No alerts in this category.
        </div>
      )}
    </div>
  );
}

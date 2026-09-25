"use client";

import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, Minus } from "lucide-react";
import { springSnappy, fadeUp } from "@/lib/sentinel/motion";

const TREND_ICONS = {
  up: TrendingUp,
  alert: AlertTriangle,
  neutral: Minus,
};

const TREND_COLORS = {
  up: "text-emerald-600 dark:text-emerald-400",
  alert: "text-rose-600 dark:text-rose-400",
  neutral: "text-[var(--silk-text-muted,var(--sentinel-text-muted))]",
};

export function BentoStatCard({ stat, index, embedded = false }) {
  const TrendIcon = TREND_ICONS[stat.trend] || Minus;
  const trendColor = TREND_COLORS[stat.trend] || TREND_COLORS.neutral;

  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/4 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--silk-text-muted,var(--sentinel-text-muted))]">
          {stat.label}
        </p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--silk-text-strong,var(--sentinel-text-primary))]">
          {stat.value}
        </p>
        <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${trendColor}`}>
          <TrendIcon className="h-3.5 w-3.5" strokeWidth={2} />
          <span>{stat.delta}</span>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className={`group relative overflow-hidden p-5 ${stat.span}`}>
        {content}
      </div>
    );
  }

  return (
    <motion.div
      {...fadeUp}
      transition={{ ...springSnappy, delay: index * 0.06 }}
      whileHover={{ scale: 1.01 }}
      className={`sentinel-card group relative overflow-hidden rounded-xl p-5 backdrop-blur-sm ${stat.span}`}
    >
      {content}
    </motion.div>
  );
}

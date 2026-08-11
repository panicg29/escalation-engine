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
  neutral: "text-[var(--sentinel-text-muted)]",
};

export function BentoStatCard({ stat, index }) {
  const TrendIcon = TREND_ICONS[stat.trend] || Minus;
  const trendColor = TREND_COLORS[stat.trend] || TREND_COLORS.neutral;

  return (
    <motion.div
      {...fadeUp}
      transition={{ ...springSnappy, delay: index * 0.06 }}
      whileHover={{ scale: 1.01 }}
      className={`sentinel-card group relative overflow-hidden rounded-xl p-5 backdrop-blur-sm ${stat.span}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/4 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <p className="sentinel-text-muted text-xs font-medium uppercase tracking-wider">
          {stat.label}
        </p>
        <p className="sentinel-text-primary mt-2 text-3xl font-semibold tracking-tight">
          {stat.value}
        </p>
        <div className={`mt-2 flex items-center gap-1.5 text-xs ${trendColor}`}>
          <TrendIcon className="h-3.5 w-3.5" strokeWidth={2} />
          <span>{stat.delta}</span>
        </div>
      </div>
    </motion.div>
  );
}

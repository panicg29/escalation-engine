"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, VolumeX, Zap } from "lucide-react";
import { springSnappy, fadeUp } from "@/lib/sentinel/motion";

const ICON_MAP = {
  Zap,
  VolumeX,
  ArrowUpRight,
};

export function FeatureCard({ feature, index }) {
  const Icon = ICON_MAP[feature.icon];

  return (
    <motion.article
      {...fadeUp}
      transition={{ ...springSnappy, delay: index * 0.08 }}
      whileHover={{ y: -3 }}
      className="sentinel-card group relative overflow-hidden rounded-xl p-6 transition-shadow hover:shadow-md dark:hover:shadow-[0_0_40px_-12px_rgba(139,92,246,0.25)]"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 ring-1 ring-violet-500/30 transition-opacity group-hover:opacity-100"
        transition={springSnappy}
      />

      <div className="relative">
        <div className="mb-4 inline-flex rounded-lg bg-[var(--sentinel-surface-inset)] p-2.5 ring-1 ring-[var(--sentinel-border)] transition-colors group-hover:bg-violet-500/10 group-hover:ring-violet-500/25">
          <Icon className="sentinel-text-secondary h-5 w-5 transition-colors group-hover:text-violet-600 dark:group-hover:text-violet-400" strokeWidth={1.75} />
        </div>
        <h3 className="sentinel-text-primary mb-2 text-base font-semibold tracking-tight">
          {feature.title}
        </h3>
        <p className="sentinel-text-muted text-sm leading-relaxed">{feature.description}</p>
      </div>
    </motion.article>
  );
}

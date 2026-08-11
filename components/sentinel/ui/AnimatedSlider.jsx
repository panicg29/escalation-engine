"use client";

import { motion } from "framer-motion";
import { springSnappy } from "@/lib/sentinel/motion";

export function AnimatedSlider({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  unit = "",
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="sentinel-card rounded-xl p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="sentinel-text-primary text-sm font-medium">{label}</div>
          {description && (
            <p className="sentinel-text-muted mt-1 text-xs leading-relaxed">
              {description}
            </p>
          )}
        </div>
        <span className="font-mono text-sm text-violet-600 dark:text-violet-400">
          {value}
          {unit}
        </span>
      </div>

      <div className="relative">
        <div className="h-1.5 rounded-full bg-[var(--sentinel-surface-inset)]">
          <motion.div
            className="absolute top-0 h-1.5 rounded-full bg-gradient-to-r from-violet-600 to-violet-500 dark:from-violet-600 dark:to-violet-400"
            style={{ width: `${pct}%` }}
            transition={springSnappy}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="sentinel-range absolute inset-0 h-1.5 w-full cursor-pointer opacity-0"
        />
        <motion.div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-violet-500 bg-[var(--sentinel-surface-raised)] shadow-[0_0_10px_rgba(139,92,246,0.35)] dark:border-violet-400 dark:bg-zinc-950"
          style={{ left: `calc(${pct}% - 8px)` }}
          transition={springSnappy}
        />
      </div>

      <div className="sentinel-text-muted mt-2 flex justify-between text-[10px]">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

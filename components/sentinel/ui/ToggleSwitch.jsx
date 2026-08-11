"use client";

import { motion } from "framer-motion";
import { springSnappy } from "@/lib/sentinel/motion";

export function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <label className="sentinel-card flex cursor-pointer items-start justify-between gap-4 rounded-xl p-4 transition-colors hover:bg-[var(--sentinel-surface-hover)]">
      <div>
        <div className="sentinel-text-primary text-sm font-medium">{label}</div>
        {description && (
          <p className="sentinel-text-muted mt-1 text-xs leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-violet-600" : "bg-[var(--sentinel-surface-inset)]"
        }`}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[var(--sentinel-surface-raised)] shadow-sm dark:bg-zinc-200"
          animate={{ x: checked ? 20 : 0 }}
          transition={springSnappy}
        />
      </button>
    </label>
  );
}

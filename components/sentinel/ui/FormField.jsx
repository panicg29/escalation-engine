"use client";

import { motion } from "framer-motion";
import { springSnappy } from "@/lib/sentinel/motion";

export function FormField({
  label,
  description,
  type = "text",
  value,
  onChange,
  placeholder,
}) {
  return (
    <label className="block">
      <span className="sentinel-text-primary mb-1.5 block text-sm font-medium">
        {label}
      </span>
      {description && (
        <span className="sentinel-text-muted mb-2 block text-xs">{description}</span>
      )}
      <motion.div whileFocus={{ scale: 1.005 }} transition={springSnappy}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="sentinel-input w-full rounded-lg px-4 py-2.5 text-sm transition-shadow"
        />
      </motion.div>
    </label>
  );
}

export function FormTextarea({
  label,
  description,
  value,
  onChange,
  placeholder,
  rows = 3,
}) {
  return (
    <label className="block">
      <span className="sentinel-text-primary mb-1.5 block text-sm font-medium">
        {label}
      </span>
      {description && (
        <span className="sentinel-text-muted mb-2 block text-xs">{description}</span>
      )}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="sentinel-input w-full resize-none rounded-lg px-4 py-2.5 text-sm transition-shadow"
      />
    </label>
  );
}

"use client";

import { motion } from "framer-motion";
import React, { useRef, useState, useCallback } from "react";
import { clsx } from "clsx";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
  spotlightIntensity?: number;
  minimal?: boolean;
  glass?: boolean;
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(120, 119, 198, 0.15)",
  spotlightSize = 300,
  spotlightIntensity = 0.8,
  minimal = false,
  glass = false,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePosition({ x, y });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  return (
    <motion.div
      ref={cardRef}
      className={clsx(
        "group relative overflow-hidden rounded-xl border transition-colors duration-200",
        glass
          ? "sentinel-glass-card"
          : minimal
            ? "sentinel-panel border-[var(--sentinel-border)] bg-[var(--sentinel-surface-raised)]"
            : "rounded-2xl border-white/10 bg-white/5 backdrop-blur-md hover:border-white/20 hover:bg-white/10 dark:border-slate-700/50 dark:bg-slate-900/40 dark:hover:border-slate-600/50 dark:hover:bg-slate-900/60",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={
        minimal || glass
          ? undefined
          : {
              y: -4,
              scale: 1.02,
              transition: { duration: 0.2, ease: "easeOut" },
            }
      }
    >
      {/* Spotlight Effect */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          background: isHovering
            ? `radial-gradient(${spotlightSize}px circle at ${mousePosition.x}px ${mousePosition.y}px, ${spotlightColor}, transparent 70%)`
            : "transparent",
          opacity: isHovering ? spotlightIntensity : 0,
        }}
      />

      {/* Glassmorphic Border Glow */}
      {!minimal && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-white/10" />
      )}
      
      {/* Content */}
      <div className={clsx("relative z-10", minimal || glass ? "p-5" : "p-6")}>
        {children}
      </div>

      {/* Subtle Inner Glow */}
      {!minimal && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/5 via-transparent to-emerald-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-violet-400/10 dark:to-emerald-400/10" />
      )}
    </motion.div>
  );
}
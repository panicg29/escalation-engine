"use client";

import { motion } from "framer-motion";
import React from "react";
import { clsx } from "clsx";

interface PillBadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  showDot?: boolean;
  dotPulse?: boolean;
  className?: string;
}

export function PillBadge({
  children,
  variant = "primary",
  size = "md",
  animated = true,
  showDot = true,
  dotPulse = true,
  className = "",
}: PillBadgeProps) {
  const variantStyles = {
    primary: {
      bg: "bg-violet-500/10 dark:bg-violet-500/15",
      border: "border-violet-500/30 dark:border-violet-500/40",
      text: "text-violet-700 dark:text-violet-300",
      dot: "bg-violet-500",
      gradient: "from-violet-500/50 via-violet-400/50 to-violet-500/50",
    },
    success: {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      border: "border-emerald-500/30 dark:border-emerald-500/40",
      text: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500",
      gradient: "from-emerald-500/50 via-emerald-400/50 to-emerald-500/50",
    },
    warning: {
      bg: "bg-amber-500/10 dark:bg-amber-500/15",
      border: "border-amber-500/30 dark:border-amber-500/40",
      text: "text-amber-700 dark:text-amber-300",
      dot: "bg-amber-500",
      gradient: "from-amber-500/50 via-amber-400/50 to-amber-500/50",
    },
    error: {
      bg: "bg-red-500/10 dark:bg-red-500/15",
      border: "border-red-500/30 dark:border-red-500/40",
      text: "text-red-700 dark:text-red-300",
      dot: "bg-red-500",
      gradient: "from-red-500/50 via-red-400/50 to-red-500/50",
    },
    info: {
      bg: "bg-blue-500/10 dark:bg-blue-500/15",
      border: "border-blue-500/30 dark:border-blue-500/40",
      text: "text-blue-700 dark:text-blue-300",
      dot: "bg-blue-500",
      gradient: "from-blue-500/50 via-blue-400/50 to-blue-500/50",
    },
  };

  const sizeStyles = {
    sm: {
      padding: "px-2.5 py-1",
      text: "text-xs",
      dot: "h-1.5 w-1.5",
      gap: "gap-1.5",
    },
    md: {
      padding: "px-3 py-1.5",
      text: "text-xs",
      dot: "h-2 w-2",
      gap: "gap-2",
    },
    lg: {
      padding: "px-4 py-2",
      text: "text-sm",
      dot: "h-2.5 w-2.5",
      gap: "gap-2.5",
    },
  };

  const currentVariant = variantStyles[variant];
  const currentSize = sizeStyles[size];

  return (
    <motion.div
      className={clsx(
        "relative inline-flex items-center rounded-full border backdrop-blur-sm",
        currentVariant.bg,
        currentVariant.border,
        currentVariant.text,
        currentSize.padding,
        currentSize.text,
        currentSize.gap,
        "font-medium tracking-wide",
        className
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Animated Border Gradient */}
      {animated && (
        <motion.div
          className={clsx(
            "absolute -inset-0.5 rounded-full bg-gradient-to-r opacity-60 blur-sm",
            currentVariant.gradient
          )}
          animate={{
            rotate: [0, 360],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      )}

      {/* Backdrop */}
      <div className={clsx(
        "absolute inset-0 rounded-full backdrop-blur-md",
        currentVariant.bg
      )} />

      {/* Content */}
      <div className="relative z-10 flex items-center gap-inherit">
        {showDot && (
          <motion.div
            className={clsx(
              "rounded-full",
              currentVariant.dot,
              currentSize.dot
            )}
            animate={dotPulse ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.8, 1],
            } : {}}
            transition={dotPulse ? {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            } : {}}
          />
        )}
        {children}
      </div>

      {/* Subtle Inner Glow */}
      <div className={clsx(
        "absolute inset-0 rounded-full bg-gradient-to-br opacity-20",
        currentVariant.gradient
      )} />
    </motion.div>
  );
}

// Preset variations for common use cases
export function StatusBadge({
  status,
  children,
  ...props
}: {
  status: "online" | "offline" | "warning" | "error";
  children: React.ReactNode;
} & Omit<PillBadgeProps, "variant">) {
  const variantMap = {
    online: "success",
    offline: "info",
    warning: "warning",
    error: "error",
  } as const;

  return (
    <PillBadge variant={variantMap[status]} {...props}>
      {children}
    </PillBadge>
  );
}

export function LiveBadge({
  children,
  ...props
}: {
  children: React.ReactNode;
} & Omit<PillBadgeProps, "variant" | "animated" | "dotPulse">) {
  return (
    <PillBadge 
      variant="error" 
      animated 
      dotPulse 
      {...props}
    >
      {children}
    </PillBadge>
  );
}
"use client";

import { motion } from "framer-motion";
import React, { useState } from "react";
import { clsx } from "clsx";

interface ShinyButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export function ShinyButton({
  children,
  onClick,
  href,
  className = "",
  variant = "primary",
  size = "md",
  disabled = false,
  type = "button",
}: ShinyButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const baseClasses = clsx(
    "relative inline-flex items-center justify-center font-semibold transition-all duration-200 overflow-hidden group",
    "focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
    {
      // Variants
      "bg-violet-600 text-white shadow-lg shadow-violet-500/25 hover:bg-violet-500 hover:shadow-violet-500/40":
        variant === "primary",
      "bg-slate-200 text-slate-900 shadow-sm hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600":
        variant === "secondary",
      "border border-violet-500/20 bg-transparent text-violet-600 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-400 dark:hover:bg-violet-500/10":
        variant === "outline",
      
      // Sizes
      "rounded-lg px-4 py-2 text-sm gap-2": size === "sm",
      "rounded-lg px-5 py-2.5 text-sm gap-2": size === "md",
      "rounded-xl px-6 py-3 text-base gap-2.5": size === "lg",
      
      // States
      "opacity-50 cursor-not-allowed": disabled,
      "cursor-pointer": !disabled,
    },
    className
  );

  const shimmerVariants = {
    initial: { x: "-100%" },
    hover: {
      x: "100%",
      transition: {
        duration: 0.6,
        ease: "easeInOut",
      },
    },
  };

  const buttonVariants = {
    initial: { scale: 1 },
    hover: { scale: 1.03 },
    tap: { scale: 0.97 },
  };

  const ButtonComponent = href ? motion.a : motion.button;

  return (
    <ButtonComponent
      href={href}
      onClick={disabled ? undefined : onClick}
      type={href ? undefined : type}
      className={baseClasses}
      variants={buttonVariants}
      initial="initial"
      whileHover={!disabled ? "hover" : undefined}
      whileTap={!disabled ? "tap" : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={disabled}
    >
      {/* Shimmer Effect */}
      <motion.div
        className="absolute inset-0 -z-10"
        variants={shimmerVariants}
        animate={isHovered && !disabled ? "hover" : "initial"}
      >
        <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/10" />
      </motion.div>

      {/* Glow Effect */}
      <div 
        className={clsx(
          "absolute inset-0 -z-20 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          {
            "bg-violet-500/20 blur-xl": variant === "primary",
            "bg-slate-500/20 blur-xl": variant === "secondary",
            "bg-violet-500/10 blur-lg": variant === "outline",
          }
        )}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center gap-inherit">
        {children}
      </span>
    </ButtonComponent>
  );
}

// Preset variations for common use cases
export function PrimaryShinyButton({
  children,
  className = "",
  ...props
}: Omit<ShinyButtonProps, "variant"> & { children: React.ReactNode }) {
  return (
    <ShinyButton variant="primary" className={className} {...props}>
      {children}
    </ShinyButton>
  );
}

export function SecondaryShinyButton({
  children,
  className = "",
  ...props
}: Omit<ShinyButtonProps, "variant"> & { children: React.ReactNode }) {
  return (
    <ShinyButton variant="secondary" className={className} {...props}>
      {children}
    </ShinyButton>
  );
}

export function OutlineShinyButton({
  children,
  className = "",
  ...props
}: Omit<ShinyButtonProps, "variant"> & { children: React.ReactNode }) {
  return (
    <ShinyButton variant="outline" className={className} {...props}>
      {children}
    </ShinyButton>
  );
}
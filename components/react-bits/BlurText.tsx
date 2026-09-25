"use client";

import { motion } from "framer-motion";
import React from "react";
import { clsx } from "clsx";

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  animateBy?: "words" | "characters";
}

export function BlurText({
  text,
  className = "",
  delay = 0,
  duration = 0.6,
  animateBy = "words",
}: BlurTextProps) {
  const segments = animateBy === "words" ? text.split(" ") : text.split("");
  const spacer = animateBy === "words" ? " " : "";

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
        delayChildren: delay,
      },
    },
  };

  const segmentVariants = {
    hidden: {
      opacity: 0,
      filter: "blur(8px)",
      y: 20,
    },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        duration,
        ease: [0.25, 0.46, 0.45, 0.94], // Custom easing curve
      },
    },
  };

  return (
    <motion.span
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={clsx("inline-block", className)}
    >
      {segments.map((segment, index) => (
        <motion.span
          key={index}
          variants={segmentVariants}
          className="inline-block"
          style={{
            display: animateBy === "words" ? "inline-block" : "inline",
          }}
        >
          {segment}
          {index < segments.length - 1 && spacer}
        </motion.span>
      ))}
    </motion.span>
  );
}

// Preset variations for common use cases
export function BlurTextHeading({
  children,
  className = "",
  ...props
}: {
  children: string;
  className?: string;
} & Partial<BlurTextProps>) {
  return (
    <BlurText
      text={children}
      className={clsx("text-4xl font-bold tracking-tight", className)}
      animateBy="words"
      duration={0.8}
      {...props}
    />
  );
}

export function BlurTextSubheading({
  children,
  className = "",
  ...props
}: {
  children: string;
  className?: string;
} & Partial<BlurTextProps>) {
  return (
    <BlurText
      text={children}
      className={clsx("text-lg text-slate-600 dark:text-slate-400", className)}
      animateBy="words"
      duration={0.6}
      delay={0.2}
      {...props}
    />
  );
}
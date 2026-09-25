"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import React from "react";

interface AnimatedGridBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function AnimatedGridBackground({ 
  children, 
  className = "" 
}: AnimatedGridBackgroundProps) {
  const { scrollYProgress } = useScroll();
  const meshY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const orbRotate = useTransform(scrollYProgress, [0, 1], [0, 360]);

  return (
    <div className={`relative min-h-screen overflow-hidden bg-slate-50 dark:bg-[#090a0f] ${className}`}>
      {/* SVG Grid Pattern */}
      <div className="absolute inset-0 -z-20">
        <svg
          className="h-full w-full opacity-30 dark:opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-slate-300 dark:text-slate-700"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Ambient Floating Orbs */}
      <motion.div 
        style={{ y: meshY, rotateZ: orbRotate }} 
        className="pointer-events-none absolute inset-0 -z-10"
      >
        {/* Primary Violet Orb */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-radial from-violet-500/20 via-violet-500/10 to-transparent blur-[120px] dark:from-violet-600/30 dark:via-violet-600/15"
        />
        
        {/* Secondary Rose Orb */}
        <motion.div
          animate={{
            scale: [1.1, 1, 1.1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2,
          }}
          className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-gradient-radial from-rose-500/15 via-rose-500/8 to-transparent blur-[100px] dark:from-rose-600/20 dark:via-rose-600/10"
        />
        
        {/* Tertiary Emerald Orb */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4,
          }}
          className="absolute bottom-0 left-0 h-[450px] w-[350px] rounded-full bg-gradient-radial from-emerald-500/15 via-emerald-500/8 to-transparent blur-[90px] dark:from-emerald-600/25 dark:via-emerald-600/10"
        />
        
        {/* Additional Accent Orbs */}
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, -30, 0],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/4 left-1/4 h-[200px] w-[200px] rounded-full bg-gradient-radial from-blue-500/20 via-blue-500/10 to-transparent blur-[60px] dark:from-blue-600/25 dark:via-blue-600/12"
        />
      </motion.div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
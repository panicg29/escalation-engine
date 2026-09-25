"use client";

import Threads from "@/components/Threads";
import { useTheme } from "@/components/sentinel/ThemeProvider";

const LIGHT_THREADS = [0.07, 0.08, 0.1];
const DARK_THREADS = [1, 1, 1];

export function PipelineThreads() {
  const { isDark } = useTheme();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[68%] z-0 h-[min(55vh,520px)] w-screen -translate-y-1/2"
      aria-hidden
    >
      <Threads
        color={isDark ? DARK_THREADS : LIGHT_THREADS}
        amplitude={1}
        distance={0}
        enableMouseInteraction
      />
    </div>
  );
}

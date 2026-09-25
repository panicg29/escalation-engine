"use client";

import FloatingLines from "@/components/FloatingLines";
import { useTheme } from "@/components/sentinel/ThemeProvider";

const ENABLED_WAVES = ["top", "middle", "bottom"];
const LINE_COUNT = [5, 7, 5];
const LINE_DISTANCE = [10, 8, 7];
const BOTTOM_WAVE = { x: 2.0, y: -0.7, rotate: -1 };

const LIGHT_GRADIENT = ["#c7d2fe", "#ddd6fe", "#e2e8f0"];
const DARK_GRADIENT = ["#6366f1", "#7c3aed", "#64748b"];

export function PipelineFloatingLines() {
  const { isDark } = useTheme();

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 h-[100dvh] w-screen ${
        isDark ? "opacity-40" : "opacity-30"
      }`}
      aria-hidden
    >
      <FloatingLines
        key={isDark ? "dark" : "light"}
        enabledWaves={ENABLED_WAVES}
        lineCount={LINE_COUNT}
        lineDistance={LINE_DISTANCE}
        bottomWavePosition={BOTTOM_WAVE}
        linesGradient={isDark ? DARK_GRADIENT : LIGHT_GRADIENT}
        mixBlendMode="screen"
        animationSpeed={0.5}
        interactive
        parallax
        bendRadius={5}
        bendStrength={-0.35}
        parallaxStrength={0.1}
      />
    </div>
  );
}

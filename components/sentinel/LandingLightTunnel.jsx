"use client";

import dynamic from "next/dynamic";

const LightTunnel = dynamic(() => import("@/components/react-bits/LightTunnel"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black" aria-hidden />,
});

export function LandingLightTunnel() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 bg-black" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <LightTunnel
          cableColor="#A855F7"
          pulseColor="#A855F7"
          tunnelColor="#5227FF"
          tunnelOpacity={0}
          speed={0.1}
          flowDirection="outward"
          pulseSpeed={2}
          pulseLength={0.28}
          pulseBlend={1}
          pulseWidth={1}
          cableCount={20}
          thickness={0.35}
          rimWidth={0.15}
          waviness={0.3}
          sway={0.5}
          size={1.0}
          centerX={0.0}
          centerY={0.0}
          glow={1.0}
          fadeNear={0.5}
          fadeFar={2}
          brightness={1.0}
          colorVariance
          grain
          grainIntensity={0.05}
          opacity={1.0}
          mouseInteraction
          mouseStrength={0.1}
        />
      </div>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-white/[0.06] dark:bg-black/25"
        aria-hidden
      />
    </>
  );
}

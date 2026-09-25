"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const Silk = dynamic(() => import("@/components/react-bits/Silk"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#e8ecf2] dark:bg-[#1e293b]" aria-hidden />
  ),
});

const SILK_ROUTES = [
  "/sentinel/dashboard",
  "/sentinel/feedback",
  "/sentinel/workspaces",
  "/sentinel/rules",
];

export function isSilkRoute(pathname) {
  return SILK_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function SentinelSilkBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[#e8ecf2] dark:bg-[#0c0e14]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <Silk speed={5} scale={1} color="#94a3b8" noiseIntensity={2} rotation={0} />
      </div>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-white/42 dark:bg-black/20"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-white/30 via-white/15 to-white/35 dark:from-black/30 dark:via-transparent dark:to-black/50"
        aria-hidden
      />
    </>
  );
}

/** Stays mounted across Dashboard / Feedback / Workspaces / Rules so WebGL does not restart. */
export function SentinelPersistentSilk() {
  const pathname = usePathname() || "";
  if (!isSilkRoute(pathname)) return null;
  return <SentinelSilkBackdrop />;
}

export function SentinelSilkBackground({ children }) {
  return (
    <div className="sentinel-silk-page relative min-h-screen">
      <SentinelSilkBackdrop />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

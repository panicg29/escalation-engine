"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SentinelLogo } from "./SentinelLogo";
import { NAV_ITEMS } from "@/lib/sentinel/mockData";
import { ThemeToggle } from "./ThemeToggle";

function isActivePath(pathname, href) {
  if (href === "/sentinel") return pathname === "/sentinel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState(null);
  const links = NAV_ITEMS.filter((item) => item.href !== "/sentinel");
  const activePath = pendingHref || pathname;
  const navigating = Boolean(pendingHref && pendingHref !== pathname);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    let index = 0;
    let timer = 0;
    const prefetchNext = () => {
      if (index >= hrefs.length) return;
      router.prefetch(hrefs[index]);
      index += 1;
      timer = window.setTimeout(prefetchNext, 40);
    };
    timer = window.setTimeout(prefetchNext, 80);
    return () => window.clearTimeout(timer);
  }, [router]);

  const navLinkClass = (href) => {
    const isActive = isActivePath(activePath, href);
    return `rounded-full px-3.5 py-1.5 text-xs transition-colors ${
      isActive
        ? "bg-white/80 font-semibold text-zinc-900 shadow-sm dark:bg-white/15 dark:text-white"
        : "text-zinc-700 hover:bg-white/80 dark:text-zinc-200 dark:hover:bg-white/15"
    }`;
  };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-50 px-4">
      {navigating && (
        <div
          className="absolute inset-x-8 top-0 h-0.5 overflow-hidden rounded-full bg-violet-500/20"
          aria-hidden
        >
          <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500/80" />
        </div>
      )}
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link
          href="/sentinel"
          prefetch
          onClick={() => setPendingHref("/sentinel")}
          className="flex items-center gap-2 rounded-full border border-white/40 bg-white/50 px-3 py-2 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
        >
          <SentinelLogo className="h-5 w-5" />
          <span className="pr-1 text-xs font-bold uppercase tracking-[0.18em]">Sentinel</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/40 bg-white/50 p-1 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/10 md:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onMouseEnter={() => router.prefetch(item.href)}
              onClick={() => setPendingHref(item.href)}
              className={navLinkClass(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ThemeToggle className="!h-8 !w-8 !rounded-full !border border-white/40 bg-white/50 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/10" />
      </div>

      <nav className="pointer-events-auto mx-auto mt-2 flex max-w-6xl flex-wrap items-center justify-center gap-1 rounded-full border border-white/40 bg-white/50 p-1 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/10 md:hidden">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onClick={() => setPendingHref(item.href)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              isActivePath(activePath, item.href)
                ? "bg-white/80 font-semibold text-zinc-900 shadow-sm dark:bg-white/15 dark:text-white"
                : "text-zinc-700 dark:text-zinc-200"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

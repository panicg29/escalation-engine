"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/sentinel/mockData";
import { springSnappy } from "@/lib/sentinel/motion";
import { EngineStatus } from "./EngineStatus";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const ICONS = {
  LayoutDashboard,
  Radio,
  MessageSquare,
  Building2,
  GitBranch,
  SlidersHorizontal,
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sentinel-sidebar flex h-full w-full flex-col border-r backdrop-blur-xl lg:w-64 lg:shrink-0">
      <div className="sentinel-divider flex items-center gap-2.5 border-b px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/12 ring-1 ring-violet-500/25 dark:bg-violet-500/15 dark:ring-violet-500/30">
          <Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={2} />
        </div>
        <div>
          <div className="sentinel-text-primary text-sm font-semibold tracking-tight">
            Escalation Engine
          </div>
          <div className="sentinel-text-muted text-[10px] font-medium uppercase tracking-widest">
            Alert Triage
          </div>
        </div>
      </div>

      <div className="sentinel-divider border-b px-3 py-3">
        <WorkspaceSwitcher compact />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = pathname === item.href;

          return (
            <Link key={item.href} href={item.href} className="relative block">
              {isActive && (
                <motion.span
                  layoutId="sentinel-nav-active"
                  className="sentinel-tab-active absolute inset-0 rounded-lg"
                  transition={springSnappy}
                />
              )}
              <span
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "sentinel-text-primary"
                    : "sentinel-text-muted hover:sentinel-text-secondary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="sentinel-divider border-t px-4 py-4">
        <EngineStatus compact />
      </div>
    </aside>
  );
}

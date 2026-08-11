"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Shield, Sparkles } from "lucide-react";
import { FeatureCard } from "@/components/sentinel/FeatureCard";
import { LiveFeedPreview } from "@/components/sentinel/LiveFeedPreview";
import { ThemeToggle } from "@/components/sentinel/ThemeToggle";
import { FEATURES } from "@/lib/sentinel/mockData";
import { fadeUp, springSnappy } from "@/lib/sentinel/motion";

export default function SentinelLandingPage() {
  const { scrollYProgress } = useScroll();
  const meshY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <motion.div style={{ y: meshY }} className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-1/3 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[100px] dark:bg-violet-600/20" />
        <div className="absolute top-1/4 right-0 h-[400px] w-[400px] rounded-full bg-rose-500/5 blur-[80px] dark:bg-rose-600/10" />
        <div className="absolute bottom-0 left-0 h-[350px] w-[500px] rounded-full bg-emerald-500/5 blur-[80px] dark:bg-emerald-600/8" />
      </motion.div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/sentinel" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/25 dark:bg-violet-500/15 dark:ring-violet-500/30">
            <Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={2} />
          </div>
          <div>
            <span className="sentinel-text-primary text-sm font-semibold tracking-tight">
              Sentinel
            </span>
            <p className="sentinel-text-muted text-[10px] uppercase tracking-widest">Escalation Engine</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/sentinel/dashboard"
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500"
          >
            Open Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8 lg:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
          <div>
            <motion.div
              {...fadeUp}
              transition={springSnappy}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/8 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI-native alert triage for Slack
            </motion.div>

            <motion.h1
              {...fadeUp}
              transition={{ ...springSnappy, delay: 0.05 }}
              className="sentinel-text-primary text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl"
            >
              Stop alert fatigue.
              <span className="mt-1 block bg-gradient-to-r from-violet-600 via-violet-500 to-emerald-600 bg-clip-text text-transparent dark:from-violet-400 dark:via-violet-300 dark:to-emerald-400">
                Start intelligent escalation.
              </span>
            </motion.h1>

            <motion.p
              {...fadeUp}
              transition={{ ...springSnappy, delay: 0.1 }}
              className="sentinel-text-secondary mt-5 max-w-lg text-base leading-relaxed"
            >
              Classify every Slack message in real time — mute noise, log actionable
              items, and escalate critical blockers before they become incidents.
            </motion.p>

            <motion.div
              {...fadeUp}
              transition={{ ...springSnappy, delay: 0.15 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/sentinel/dashboard"
                className="group inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-500/20 transition-all hover:bg-violet-500"
              >
                Launch Command Center
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/sentinel/feed"
                className="sentinel-btn-ghost inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
              >
                View Live Feed
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springSnappy, delay: 0.2 }}
          >
            <LiveFeedPreview />
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={springSnappy}
          className="mb-8 text-center"
        >
          <h2 className="sentinel-text-primary text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for teams drowning in notifications
          </h2>
          <p className="sentinel-text-secondary mx-auto mt-2 max-w-xl text-sm">
            Three pillars of intelligent alert management.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>
      </section>

      <footer className="sentinel-divider border-t px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="sentinel-text-muted text-xs">Sentinel · Escalation Engine</p>
          <Link href="/sentinel/rules" className="sentinel-text-muted text-xs hover:text-violet-600 dark:hover:text-violet-400">
            Rules Studio
          </Link>
        </div>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SentinelLogo } from "@/components/sentinel/SentinelLogo";

import ScrollReveal from "@/components/ScrollReveal";
import FadeContent from "@/components/FadeContent";
import Magnet from "@/components/Magnet";
import StarBorder from "@/components/StarBorder";
import CardSwap, { Card } from "@/components/react-bits/CardSwap";
import RotatingText from "@/components/RotatingText";
import { PillBadge } from "@/components/react-bits/PillBadge";
import { ShinyButton } from "@/components/react-bits/ShinyButton";
import { LandingLightTunnel } from "@/components/sentinel/LandingLightTunnel";

const DEMO = [
  {
    from: "Maya · #general",
    text: "Nice work this week, everyone.",
    label: "Skip",
    tone: "Stays in the chat. Nobody gets a tap.",
    color: "bg-zinc-800 text-zinc-100",
  },
  {
    from: "Jules · #product",
    text: "Can someone look at this tomorrow?",
    label: "Save",
    tone: "Useful later. Not a reason to interrupt.",
    color: "bg-amber-700 text-amber-50",
  },
  {
    from: "Ravi · #incidents",
    text: "Checkout is down in every region.",
    label: "Wake",
    tone: "This is the fire. Someone needs to move.",
    color: "bg-rose-700 text-rose-50",
  },
];

const FAQS = [
  {
    q: "What does Sentinel actually do?",
    a: "It watches your team's workspace messages and only interrupts a human when something looks like a real problem.",
  },
  {
    q: "Does it replace our chat app?",
    a: "No. People keep talking where they already talk. Sentinel just decides what deserves a tap.",
  },
  {
    q: "What gets through?",
    a: "Things that are breaking, blocking customers, or cannot wait until morning. You set that bar in Rules.",
  },
  {
    q: "Can we change how strict it is?",
    a: "Yes. Open Rules and decide what should be skipped, saved, or woken. No rebuild required.",
  },
  {
    q: "Where do we start?",
    a: "Open the dashboard to see triage decisions as they happen.",
  },
];

const DECISION_CARDS = [
  {
    label: "Skip",
    title: "Leave it.",
    example: "“Nice work this week, everyone.”",
    className: "border-white/15 bg-[#111113]",
    labelClass: "text-zinc-400",
  },
  {
    label: "Save",
    title: "Not now.",
    example: "“Can someone look at this tomorrow?”",
    className: "border-amber-300/25 bg-[#1a1408]",
    labelClass: "text-amber-200/80",
  },
  {
    label: "Wake",
    title: "Move.",
    example: "“Checkout is down in every region.”",
    className: "border-rose-400/30 bg-[#1a0d12]",
    labelClass: "text-rose-200/80",
  },
];

function AnimatedChatDemo() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [decided, setDecided] = useState(false);
  const current = DEMO[index];

  useEffect(() => {
    setTyped("");
    setDecided(false);
    let i = 0;
    let decideTimer;
    let nextTimer;
    const typer = setInterval(() => {
      i += 1;
      setTyped(current.text.slice(0, i));
      if (i >= current.text.length) {
        clearInterval(typer);
        decideTimer = setTimeout(() => setDecided(true), 240);
        nextTimer = setTimeout(() => setIndex((n) => (n + 1) % DEMO.length), 2000);
      }
    }, 16);
    return () => {
      clearInterval(typer);
      clearTimeout(decideTimer);
      clearTimeout(nextTimer);
    };
  }, [index, current.text]);

  return (
    <div
      data-no-fluid
      className="landing-glass-panel-strong w-full max-w-2xl rounded-[28px] p-4 text-left"
    >
      <div className="mb-3 flex items-center justify-between px-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--landing-text-soft)]">
          Incoming
        </p>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Sorting
        </span>
      </div>
      <div className="relative min-h-[168px] overflow-hidden rounded-2xl bg-black/30 px-4 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.from}
            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-xs font-medium text-[var(--landing-text-soft)]">{current.from}</p>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-[var(--landing-text)]">
              {typed}
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] bg-white/50" />
            </p>
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-3 left-4 right-4">
          <AnimatePresence mode="wait">
            {decided && (
              <motion.div
                key={current.label}
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="landing-glass-panel flex items-center justify-between gap-3 rounded-2xl px-3 py-2"
              >
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${current.color}`}
                >
                  {current.label}
                </span>
                <p className="text-xs font-medium text-[var(--landing-text-muted)]">{current.tone}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-semibold text-[var(--landing-text)]"
      >
        {q}
        <span className="text-xl text-[var(--landing-text-soft)]">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <p className="pb-5 text-sm font-medium leading-relaxed text-[var(--landing-text-muted)]">{a}</p>
      )}
    </div>
  );
}

export default function SentinelLandingPage() {
  return (
    <div className="landing-tunnel-page relative isolate min-h-screen overflow-x-hidden">
      <LandingLightTunnel />

      <section className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-5 pb-20 pt-28 text-center sm:px-8 sm:pb-24 sm:pt-32">
        <h1 className="landing-heading max-w-4xl text-5xl leading-[1.05] sm:text-7xl">
          <span className="block">Quiet the noise —</span>
          <span className="block">
            the{" "}
            <RotatingText
              texts={["signal", "fire", "priority", "truth"]}
              rotationInterval={2800}
              splitBy="words"
              staggerDuration={0}
              animatePresenceMode="wait"
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              mainClassName="!inline-flex overflow-hidden pb-[0.08em] pr-[0.28em] align-bottom italic text-violet-300"
            />{" "}
            comes through
          </span>
        </h1>

        <p className="landing-body mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl">
          Sentinel watches workspace chat and only taps a human when something is actually on fire.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3" data-no-fluid>
          <Link
            href="/sentinel/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-violet-500/20 transition hover:bg-zinc-100"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/sentinel/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/15"
          >
            Learn more
          </Link>
        </div>

        <div className="mt-12 flex w-full justify-center">
          <AnimatedChatDemo />
        </div>
      </section>

      <section id="sort" className="relative z-10 mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="landing-glass-panel rounded-[32px] p-6 sm:p-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative h-[360px] w-full sm:h-[400px]">
              <CardSwap
                width={420}
                height={280}
                cardDistance={50}
                verticalDistance={70}
                delay={1800}
                pauseOnHover={false}
                easing="linear"
                skewAmount={6}
                dropDistance={90}
              >
                {DECISION_CARDS.map((card) => (
                  <Card key={card.label} className={`p-7 text-left text-white ${card.className}`}>
                    <p className={`text-xs font-bold uppercase tracking-[0.2em] ${card.labelClass}`}>
                      {card.label}
                    </p>
                    <p className="mt-4 text-3xl font-bold">{card.title}</p>
                    <p className="mt-3 text-sm text-zinc-400">{card.example}</p>
                  </Card>
                ))}
              </CardSwap>
            </div>
            <FadeContent duration={700}>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--landing-text-soft)]">
                The only three answers
              </p>
              <h2 className="landing-heading mt-3 text-3xl sm:text-5xl">Same room. Three exits.</h2>
              <p className="landing-body mt-4 max-w-md text-base leading-relaxed">
                Skip it, save it, or wake someone. The deck cycles those decisions — no extra explanation
                needed.
              </p>
              <Link
                href="/sentinel/dashboard"
                className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-violet-300 hover:text-violet-200"
              >
                Watch it live on the dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </FadeContent>
          </div>
        </div>
      </section>

      <section data-no-fluid className="relative z-20 px-5 py-16 sm:px-8 sm:py-24">
        <div className="landing-glass-panel mx-auto max-w-3xl rounded-[32px] p-6 sm:p-8">
          <h2 className="landing-heading mb-6 text-3xl sm:text-4xl">Answers to your questions</h2>
          {FAQS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 sm:py-24">
        <ScrollReveal
          baseOpacity={0.2}
          baseRotation={1}
          textClassName="landing-heading text-3xl sm:text-5xl"
        >
          Let the chat talk. You only hear the fire.
        </ScrollReveal>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3" data-no-fluid>
          <Magnet padding={28} magnetStrength={4}>
            <StarBorder as={Link} href="/sentinel/dashboard" color="#7c3aed" speed="5s" thickness={2}>
              <span className="inline-flex items-center gap-2 text-sm font-bold">
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </span>
            </StarBorder>
          </Magnet>
          <ShinyButton variant="outline" size="md" href="/sentinel/dashboard">
            Open dashboard
          </ShinyButton>
        </div>
      </section>

      <footer
        data-no-fluid
        className="landing-glass-panel relative z-20 mx-4 mb-6 rounded-[32px] border-t px-5 py-14 sm:mx-8 sm:px-8 sm:py-16"
      >
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-[var(--landing-text)]">
              <SentinelLogo className="h-5 w-5" /> Sentinel
            </p>
            <p className="mt-3 text-xs font-medium text-[var(--landing-text-muted)]">
              The quiet layer for workspace chat.
            </p>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-bold text-[var(--landing-text)]">Product</p>
            <div className="flex flex-col gap-2 font-medium text-[var(--landing-text-muted)]">
              <Link href="/sentinel/dashboard" className="hover:text-white">
                Dashboard
              </Link>
              <Link href="/sentinel/rules" className="hover:text-white">
                Rules
              </Link>
            </div>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-bold text-[var(--landing-text)]">Start</p>
            <div className="flex flex-col gap-2 font-medium text-[var(--landing-text-muted)]">
              <Link href="/sentinel/dashboard" className="hover:text-white">
                Open the product
              </Link>
              <Link href="/sentinel/dashboard" className="hover:text-white">
                Watch it live
              </Link>
            </div>
          </div>
          <div className="text-sm font-medium text-[var(--landing-text-muted)]">
            <p>© 2026 Sentinel</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

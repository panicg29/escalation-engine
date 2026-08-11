"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  GitBranch,
  Hash,
  MessageSquare,
  Radio,
  ScanSearch,
  Timer,
  UserX,
  Zap,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { CLASSIFICATION_STYLES } from "@/lib/sentinel/mockData";
import { springSnappy } from "@/lib/sentinel/motion";
import { formatAlertMessageText } from "@/lib/slack/formatMessageDisplayClient";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";

const ESCALATION_TIMER_MS = 15000;
const STEP_MS = 260;

const OUTCOME = {
  Escalate: {
    label: "Needs attention",
    badge: CLASSIFICATION_STYLES.Escalate.badge,
    border: CLASSIFICATION_STYLES.Escalate.border,
    glow: CLASSIFICATION_STYLES.Escalate.glow,
  },
  Log: {
    label: "Saved for reference",
    badge: CLASSIFICATION_STYLES.Log.badge,
    border: CLASSIFICATION_STYLES.Log.border,
    glow: CLASSIFICATION_STYLES.Log.glow,
  },
  Mute: {
    label: "No action needed",
    badge: CLASSIFICATION_STYLES.Mute.badge,
    border: CLASSIFICATION_STYLES.Mute.border,
    glow: CLASSIFICATION_STYLES.Mute.glow,
  },
};

const BRANCHES = {
  known: { label: "Exact match", hint: "Skip LLM · cached", tone: "emerald", icon: ScanSearch },
  similar: { label: "Close match", hint: "Reuse prior feedback", tone: "cyan", icon: ScanSearch },
  fresh: { label: "Fresh read", hint: "Direct LLM", tone: "violet", icon: Bot },
  pending: { label: "Looking up", hint: "Checking feedback", tone: "amber", icon: Hash },
};

const TONE_STYLES = {
  blue: {
    border: "border-blue-500/55",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    glow: "shadow-[0_0_24px_-6px_rgba(59,130,246,0.35)]",
  },
  amber: {
    border: "border-amber-500/55",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    glow: "shadow-[0_0_24px_-6px_rgba(245,158,11,0.35)]",
  },
  emerald: {
    border: "border-emerald-500/55",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    glow: "shadow-[0_0_24px_-6px_rgba(16,185,129,0.35)]",
  },
  cyan: {
    border: "border-cyan-500/55",
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    glow: "shadow-[0_0_24px_-6px_rgba(6,182,212,0.35)]",
  },
  violet: {
    border: "border-violet-500/55",
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    glow: "shadow-[0_0_24px_-6px_rgba(139,92,246,0.35)]",
  },
  rose: {
    border: "border-rose-500/55",
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    glow: "shadow-[0_0_24px_-6px_rgba(244,63,94,0.35)]",
  },
};

const expandFromLeft = {
  initial: { opacity: 0, x: -18, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -8, scale: 0.96 },
  transition: { type: "spring", stiffness: 300, damping: 26 },
};

function resolvePath(alert) {
  if (alert?.provisional || alert?.status === "analyzing") return "pending";
  const source = alert.triageSource || alert.triageDebug?.triageSource;
  if (source === "exact") return "known";
  if (source === "semantic") return "similar";
  return "fresh";
}

function ArrowRight({ active }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex h-[96px] w-8 shrink-0 items-center justify-center origin-left"
    >
      <svg width="24" height="10" viewBox="0 0 24 10" className="overflow-visible">
        <motion.path
          d="M0 5 H16 M11 1.5 L17.5 5 L11 8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--sentinel-border)]"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3 }}
        />
        {active && (
          <motion.circle
            r="2.5"
            fill="#8B5CF6"
            initial={{ cx: 0, cy: 5, opacity: 0 }}
            animate={{ cx: [0, 18], cy: 5, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
        )}
      </svg>
    </motion.div>
  );
}

function FlowNode({
  icon: Icon,
  title,
  subtitle,
  tone,
  active,
  wide,
  children,
}) {
  const s = TONE_STYLES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, x: -18, scale: 0.92 }}
      animate={{
        opacity: 1,
        x: 0,
        scale: active ? 1.02 : 1,
        boxShadow: active ? "0 0 20px -4px rgba(139,92,246,0.3)" : "none",
      }}
      exit={{ opacity: 0, x: -8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={{ transformOrigin: "left center" }}
      className={`flex shrink-0 flex-col rounded-lg border px-3 py-2.5 ${wide ? "w-[148px]" : "w-[118px]"} min-h-[96px] ${s.border} ${s.bg}`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${s.text}`} />
        <span className={`text-[10px] font-bold uppercase leading-tight tracking-wide ${s.text}`}>
          {title}
        </span>
      </div>
      {subtitle ? (
        <p className="sentinel-text-muted line-clamp-2 text-[10px] leading-snug">{subtitle}</p>
      ) : null}
      {children ? <div className="mt-auto pt-1.5">{children}</div> : null}
    </motion.div>
  );
}

function ResultNode({ classification, outcome, active }) {
  return (
    <motion.div
      {...expandFromLeft}
      style={{ transformOrigin: "left center" }}
      animate={{
        opacity: 1,
        x: 0,
        scale: active ? 1.03 : 1,
      }}
      className={`flex w-[118px] shrink-0 flex-col items-center justify-center rounded-lg border-2 px-3 py-2.5 min-h-[96px] ${outcome.border}`}
    >
      <Zap className="mb-1 h-4 w-4 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-wide">Result</span>
      <span
        className={`mt-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${outcome.badge}`}
      >
        {classification}
      </span>
    </motion.div>
  );
}

function RingTimer({ secondsLeft, active, targetName }) {
  const total = ESCALATION_TIMER_MS / 1000;
  const progress =
    secondsLeft != null ? Math.min(1, Math.max(0, secondsLeft / total)) : 1;
  const size = 64;
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;

  return (
    <motion.div
      {...expandFromLeft}
      style={{ transformOrigin: "left center" }}
      className="flex w-[118px] shrink-0 flex-col items-center justify-center min-h-[96px]"
    >
      <motion.div
        animate={active ? { scale: [1, 1.04, 1] } : {}}
        transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="4" />
          <motion.circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="#F59E0B"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Timer className="mb-0 h-3 w-3 text-amber-500" />
          <span className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {secondsLeft != null ? `${secondsLeft}s` : "…"}
          </span>
        </div>
      </motion.div>
      <p className="mt-1 max-w-[110px] truncate text-center text-[10px] font-medium text-amber-600 dark:text-amber-400">
        Waiting for {targetName}
      </p>
    </motion.div>
  );
}

function CallingEscalationNode({ active, targetName }) {
  return (
    <motion.div
      {...expandFromLeft}
      style={{ transformOrigin: "left center" }}
      className="flex w-[148px] shrink-0 flex-col items-center justify-center min-h-[96px]"
    >
      <motion.div
        animate={active ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 1.1, repeat: active ? Infinity : 0 }}
        className="flex flex-col items-center rounded-lg border-2 border-rose-500/70 bg-rose-500/15 px-3 py-3 shadow-[0_0_24px_-6px_rgba(244,63,94,0.45)]"
      >
        <Phone className="mb-1.5 h-4 w-4 text-rose-500" />
        <motion.p
          animate={active ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
          transition={{ duration: 1.2, repeat: active ? Infinity : 0 }}
          className="text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-rose-600 dark:text-rose-400"
        >
          Escalated: Calling User…
        </motion.p>
      </motion.div>
      <p className="mt-1.5 max-w-[140px] truncate text-center text-[10px] font-medium text-rose-600/90 dark:text-rose-400/90">
        Twilio voice to {targetName}
      </p>
    </motion.div>
  );
}

function getCallOutcomeDisplay(callOutcome) {
  if (callOutcome === "answered" || callOutcome === "completed") {
    return {
      label: "Escalation Successful: User Answered",
      tone: "emerald",
      Icon: CheckCircle2,
    };
  }
  if (callOutcome === "declined" || callOutcome === "busy") {
    return {
      label: "Escalation Failed: User Cut the Call",
      tone: "rose",
      Icon: AlertTriangle,
    };
  }
  if (callOutcome === "missed" || callOutcome === "no-answer") {
    return {
      label: "Escalation Failed: No Answer / Declined",
      tone: "amber",
      Icon: AlertTriangle,
    };
  }
  return {
    label: "Escalation Failed: Call Did Not Connect",
    tone: "rose",
    Icon: AlertTriangle,
  };
}

function CallOutcomeNode({ callOutcome }) {
  const { label, tone, Icon } = getCallOutcomeDisplay(callOutcome);
  const s = TONE_STYLES[tone];

  return (
    <motion.div
      {...expandFromLeft}
      style={{ transformOrigin: "left center" }}
      className="flex w-[168px] shrink-0 flex-col items-center justify-center min-h-[96px]"
    >
      <div
        className={`flex flex-col items-center rounded-lg border-2 px-3 py-3 ${s.border} ${s.bg} ${s.glow}`}
      >
        <Icon className={`mb-1.5 h-4 w-4 ${s.text}`} />
        <p
          className={`text-center text-[10px] font-bold uppercase leading-tight tracking-wide ${s.text}`}
        >
          {label}
        </p>
      </div>
    </motion.div>
  );
}

function ResolutionCard({ status, targetName, classification, resolutionType }) {
  const isResolved = status === "resolved";
  const tone = isResolved ? TONE_STYLES.emerald : TONE_STYLES.rose;
  const Icon = isResolved ? CheckCircle2 : AlertTriangle;
  const title = isResolved ? "Target responded" : "Timer expired";
  const detail = isResolved
    ? resolutionType === "reaction"
      ? `${targetName} reacted — timer canceled`
      : `${targetName} replied in thread — timer canceled`
    : "No response within the wait window — escalated";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={`mx-auto flex max-w-sm flex-col items-center rounded-xl border px-6 py-8 text-center ${tone.border} ${tone.bg} ${tone.glow}`}
    >
      <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${tone.bg} ring-1 ${tone.border}`}>
        <Icon className={`h-6 w-6 ${tone.text}`} />
      </div>
      <p className={`text-sm font-semibold ${tone.text}`}>{title}</p>
      <p className="sentinel-text-secondary mt-1.5 text-xs leading-relaxed">{detail}</p>
      {!isResolved && classification && (
        <span
          className={`mt-3 rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase ring-1 ${OUTCOME.Escalate.badge}`}
        >
          {classification}
        </span>
      )}
    </motion.div>
  );
}

function PipelineRun({ run }) {
  const [phase, setPhase] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [resolutionOnly, setResolutionOnly] = useState(false);
  const wasPendingRef = useRef(false);
  const { alert } = run;
  const displayName = alert.userName || "Team member";
  const messageText = formatAlertMessageText(alert);
  const path = useMemo(() => resolvePath(alert), [alert]);
  const branch = BRANCHES[path];
  const outcome = OUTCOME[alert.classification] || OUTCOME.Mute;
  const status = alert.status || "resolved";
  const isAnalyzing = Boolean(alert.provisional || status === "analyzing");
  const hasMentionReroute = !isAnalyzing && alert.timerTrigger === "non_target_mention";
  const withTimer =
    !isAnalyzing &&
    !hasMentionReroute &&
    Boolean(alert.timerTrigger) &&
    alert.timerTrigger !== "non_target_mention";
  const showWait = status === "pending" && withTimer;
  const targetName = alert.targetUserName || "you";
  const runKey = alert.slackMessageTs || run.id;

  const totalPhases = hasMentionReroute ? 7 : withTimer ? 7 : 6;

  const routesPhase = 6;
  const resultPhase = totalPhases;

  useEffect(() => {
    if (status === "pending" && withTimer) {
      wasPendingRef.current = true;
    }
  }, [status, withTimer]);

  useEffect(() => {
    if (wasPendingRef.current && status === "resolved") {
      setResolutionOnly(true);
    }
  }, [status]);

  useEffect(() => {
    if (resolutionOnly) return undefined;
    setPhase(0);
    // Always schedule through phase 7 so upgrading analyzing → timer
    // does not restart the animation when totalPhases changes.
    const timers = Array.from({ length: 7 }, (_, i) =>
      setTimeout(() => setPhase(i + 1), i * STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [runKey, resolutionOnly]);

  useEffect(() => {
    if (resolutionOnly || !showWait || !alert.timestamp || phase < resultPhase) {
      if (resolutionOnly || !showWait) setSecondsLeft(null);
      return undefined;
    }
    const startedAt = new Date(alert.timestamp).getTime();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setSecondsLeft(Math.max(0, Math.ceil((ESCALATION_TIMER_MS - elapsed) / 1000)));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [showWait, alert.timestamp, alert.id, phase, resultPhase, resolutionOnly]);

  const timerActive = !resolutionOnly && showWait && phase >= resultPhase && status === "pending";
  const showTimer = timerActive && status === "pending";
  const isCalling =
    status === "escalating" || status === "escalated";
  const showCalling = !resolutionOnly && withTimer && phase >= resultPhase && isCalling;
  const showClosed = !resolutionOnly && withTimer && phase >= resultPhase && status === "closed";
  const showResult =
    !resolutionOnly &&
    !isAnalyzing &&
    !withTimer &&
    phase >= resultPhase &&
    !showTimer &&
    !showCalling &&
    !showClosed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={springSnappy}
      className="sentinel-panel rounded-xl p-4 sm:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--sentinel-border)] pb-3">
        <div className="min-w-0 flex-1">
          <p className="sentinel-text-muted text-[10px] font-medium uppercase tracking-wider">
            Live run
          </p>
          <p className="sentinel-text-primary truncate text-sm font-semibold">{displayName}</p>
          <p className="sentinel-text-secondary mt-0.5 line-clamp-1 text-xs">
            &ldquo;{messageText}&rdquo;
          </p>
        </div>
        {!resolutionOnly && phase >= 4 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ring-1 ${
              path === "known"
                ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400"
                : path === "similar"
                  ? "bg-cyan-500/15 text-cyan-700 ring-cyan-500/30 dark:text-cyan-400"
                  : path === "pending"
                    ? "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-400"
                    : "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-400"
            }`}
          >
            {branch.label}
          </motion.span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {resolutionOnly ? (
          <ResolutionCard
            key="resolution"
            status={status}
            targetName={targetName}
            classification={alert.classification}
            resolutionType={alert.resolutionType}
          />
        ) : (
          <motion.div
            key="flow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full"
          >
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-[var(--sentinel-surface-inset)]">
              <motion.div
                className="h-full rounded-full bg-violet-500"
                initial={{ width: "0%" }}
                animate={{ width: `${(Math.min(phase, totalPhases) / totalPhases) * 100}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>

            <div className="flex items-center justify-center overflow-x-auto pb-1 [scrollbar-width:thin]">
              <div className="flex items-center px-1">
                <AnimatePresence mode="popLayout">
                  {phase >= 1 && (
                    <FlowNode
                      key="arrives"
                      icon={Radio}
                      title="Arrives"
                      subtitle="From Slack"
                      tone="blue"
                      active={phase === 1}
                    >
                      <p className="text-[10px] font-medium text-blue-500">Received</p>
                    </FlowNode>
                  )}
                </AnimatePresence>

                {phase >= 2 && <ArrowRight active={phase === 2} />}

                <AnimatePresence mode="popLayout">
                  {phase >= 2 && (
                    <FlowNode
                      key="reads"
                      icon={MessageSquare}
                      title="Reads"
                      subtitle={displayName}
                      tone="blue"
                      active={phase === 2}
                      wide
                    >
                      <p className="sentinel-text-primary line-clamp-3 text-[10px] leading-snug">
                        {messageText}
                      </p>
                    </FlowNode>
                  )}
                </AnimatePresence>

                {phase >= 3 && <ArrowRight active={phase === 3} />}

                <AnimatePresence mode="popLayout">
                  {phase >= 3 && (
                    <FlowNode
                      key="checks"
                      icon={Hash}
                      title="Checks"
                      subtitle="Past feedback"
                      tone="amber"
                      active={phase === 3}
                    >
                      {phase === 3 ? (
                        <div className="h-1.5 animate-pulse rounded-full bg-amber-500/40" />
                      ) : (
                        <p className="text-[10px] font-medium text-amber-500">Scanned</p>
                      )}
                    </FlowNode>
                  )}
                </AnimatePresence>

                {phase >= 4 && <ArrowRight active={phase === 4} />}

                <AnimatePresence mode="popLayout">
                  {phase >= 4 && (
                    <FlowNode
                      key="branch"
                      icon={branch.icon}
                      title={branch.label}
                      subtitle={branch.hint}
                      tone={branch.tone}
                      active={phase === 4}
                    >
                      <p className="text-[10px] font-medium">Path chosen</p>
                    </FlowNode>
                  )}
                </AnimatePresence>

                {phase >= 5 && <ArrowRight active={phase === 5} />}

                <AnimatePresence mode="popLayout">
                  {phase >= 5 && (
                    <FlowNode
                      key="decides"
                      icon={path === "fresh" || path === "pending" ? Bot : ScanSearch}
                      title="Decides"
                      subtitle={
                        path === "known"
                          ? "Cached override"
                          : path === "similar"
                            ? "Few-shot + AI"
                            : path === "pending"
                              ? "Running model…"
                              : "Direct AI"
                      }
                      tone="violet"
                      active={phase === 5 || isAnalyzing}
                    >
                      {phase === 5 || isAnalyzing ? (
                        <div className="space-y-1">
                          <div className="h-1.5 animate-pulse rounded-full bg-violet-500/40" />
                          <div className="h-1.5 w-4/5 animate-pulse rounded-full bg-violet-500/20" />
                        </div>
                      ) : hasMentionReroute ? (
                        <p className="text-[10px] font-medium">Flagged urgent</p>
                      ) : (
                        <p className="text-[10px] font-medium">{outcome.label}</p>
                      )}
                    </FlowNode>
                  )}
                </AnimatePresence>

                {hasMentionReroute && phase >= routesPhase && (
                  <ArrowRight active={phase === routesPhase} />
                )}

                <AnimatePresence mode="popLayout">
                  {hasMentionReroute && phase >= routesPhase && (
                    <FlowNode
                      key="routes"
                      icon={UserX}
                      title="Routes"
                      subtitle="Mention check"
                      tone="amber"
                      active={phase === routesPhase}
                      wide
                    >
                      <p className="text-[10px] font-medium leading-snug text-amber-600 dark:text-amber-400">
                        Not the target user — logged
                      </p>
                    </FlowNode>
                  )}
                </AnimatePresence>

                {showTimer && phase >= resultPhase && (
                  <>
                    <ArrowRight active={phase === resultPhase} />
                    <RingTimer
                      secondsLeft={secondsLeft}
                      active={timerActive}
                      targetName={targetName}
                    />
                  </>
                )}

                {showCalling && (
                  <>
                    <ArrowRight active={phase === resultPhase} />
                    <CallingEscalationNode active targetName={targetName} />
                  </>
                )}

                {showClosed && (
                  <>
                    <ArrowRight active={phase === resultPhase} />
                    <CallOutcomeNode callOutcome={alert.callOutcome} />
                  </>
                )}

                {(showResult ||
                  (hasMentionReroute &&
                    phase >= resultPhase &&
                    !showTimer &&
                    !showCalling &&
                    !showClosed)) && (
                  <>
                    <ArrowRight active={phase === resultPhase} />
                    <ResultNode
                      classification={alert.classification}
                      outcome={outcome}
                      active={phase === resultPhase}
                    />
                  </>
                )}
              </div>
            </div>

            <p className="sentinel-text-muted mt-3 text-center text-[10px] tabular-nums">
              Step {Math.min(phase, totalPhases)} of {totalPhases}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PipelinePage() {
  const { activeTeamId } = useWorkspace();
  const [run, setRun] = useState(null);
  const [connected, setConnected] = useState(false);
  const seenRef = useRef(new Set());
  const runRef = useRef(null);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const handlePayload = useCallback((payload) => {
    if (!payload) return;
    if (payload.eventKind === "resolution_attempt") return;

    const isAlert =
      payload.eventKind === "alert_update" ||
      payload.eventKind === "alert" ||
      payload.eventKind === "pipeline_start" ||
      Boolean(payload.id);
    if (!isAlert || !payload.id) return;
    if (activeTeamId && payload.teamId && payload.teamId !== activeTeamId) return;

    const current = runRef.current;
    const currentId = current?.id;
    const payloadTs = payload.slackMessageTs || null;
    const currentTs = current?.alert?.slackMessageTs || null;
    const sameMessage =
      Boolean(payloadTs) && Boolean(currentTs) && payloadTs === currentTs;

    // Upgrade provisional "analyzing" run in-place when final triage arrives.
    if (
      current?.alert?.provisional &&
      !payload.provisional &&
      sameMessage
    ) {
      seenRef.current.delete(currentId);
      seenRef.current.add(payload.id);
      setRun((prev) =>
        prev
          ? {
              ...prev,
              id: payload.id,
              alert: { ...payload, provisional: false },
            }
          : {
              id: payload.id,
              alert: { ...payload, provisional: false },
              resolutionAttempts: [],
              createdAt: Date.now(),
            }
      );
      return;
    }

    if (
      payload.eventKind === "alert_update" ||
      (seenRef.current.has(payload.id) && currentId === payload.id)
    ) {
      if (currentId === payload.id || sameMessage) {
        setRun((prev) =>
          prev ? { ...prev, alert: { ...prev.alert, ...payload, provisional: false } } : prev
        );
      }
      return;
    }

    seenRef.current.add(payload.id);
    setRun({
      id: payload.id,
      alert: payload,
      resolutionAttempts: [],
      createdAt: Date.now(),
    });
  }, [activeTeamId]);

  const handlePayloadRef = useRef(handlePayload);
  useEffect(() => {
    handlePayloadRef.current = handlePayload;
  }, [handlePayload]);

  useEffect(() => {
    if (!activeTeamId) {
      setRun(null);
      setConnected(false);
      return undefined;
    }

    seenRef.current = new Set();
    setRun(null);

    const source = new EventSource(
      `/api/slack/events?teamId=${encodeURIComponent(activeTeamId)}`
    );

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        handlePayloadRef.current(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    };

    return () => source.close();
  }, [activeTeamId]);

  // Removed redundant polling for better performance
  // SSE provides real-time updates, and server already polls Twilio every 500ms
  // This eliminates unnecessary API calls and reduces server load

  return (
    <SentinelShell
      title="Live Pipeline"
      subtitle="Watch each message branch through checks, decisions, and outcomes"
    >
      <WorkspaceGate>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="sentinel-text-muted flex items-center gap-2 text-xs">
            <GitBranch className="h-4 w-4 text-violet-500" />
            Session-only demo · one message at a time
          </div>
          <span className="sentinel-text-muted flex items-center gap-1.5 text-[11px]">
            <Radio className="h-3 w-3" />
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-[var(--sentinel-text-muted)]"}`}
            />
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>

        <AnimatePresence mode="wait">
          {!run ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--sentinel-border)]"
            >
              <GitBranch className="sentinel-text-muted mb-2 h-7 w-7" />
              <p className="sentinel-text-muted text-sm">Waiting for a Slack message…</p>
              <p className="sentinel-text-muted mt-1 text-center text-xs">
                Keep this page open, then send a message in your connected workspace.
              </p>
            </motion.div>
          ) : (
            <PipelineRun
              key={run.alert?.slackMessageTs || run.id}
              run={run}
            />
          )}
        </AnimatePresence>
      </WorkspaceGate>
    </SentinelShell>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Clock,
  Cpu,
  GitBranch,
  Inbox,
  MessageSquare,
  Phone,
  PhoneMissed,
  Reply,
  SmilePlus,
  Sparkles,
} from "lucide-react";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import { SentinelShell } from "@/components/sentinel/SentinelShell";
import { WorkspaceGate } from "@/components/sentinel/WorkspaceSwitcher";
import { useWorkspace } from "@/lib/sentinel/workspaceContext";
import { formatAlertMessageText } from "@/lib/slack/formatMessageDisplayClient";
import { PipelineThreads } from "@/components/sentinel/PipelineThreads";

const DEFAULT_ESCALATION_TIMER_MS = 15000;
const STEP_MS = 340;
const ease = [0.22, 1, 0.36, 1];

const ROUTES = {
  known: { label: "Seen before", hint: "Same text as a saved correction." },
  similar: { label: "Close match", hint: "Similar to a saved correction." },
  fresh: { label: "New", hint: "First time seeing this." },
  pending: { label: "Checking", hint: "Looking through past calls." },
};

const BEAM = {
  curvature: 0,
  pathColor: "#a1a1aa",
  pathWidth: 2,
  pathOpacity: 0.28,
  gradientStartColor: "#6366f1",
  gradientStopColor: "#818cf8",
  duration: 6,
};

function resolvePath(alert) {
  if (alert?.provisional || alert?.status === "analyzing") return "pending";
  const source = alert.triageSource || alert.triageDebug?.triageSource;
  if (source === "exact") return "known";
  if (source === "semantic") return "similar";
  return "fresh";
}

function ackKind(alert) {
  const type = String(alert?.resolutionType || "").toLowerCase();
  const eventType = String(alert?.resolutionEventType || alert?.eventType || "").toLowerCase();
  if (type === "reaction" || eventType === "reaction_added") return "reaction";
  if (type === "thread_reply" || type === "reply" || eventType === "thread_reply") return "reply";
  return null;
}

function callCopy(callOutcome) {
  if (callOutcome === "answered") {
    return { title: "Picked up", hint: "They answered the call." };
  }
  if (callOutcome === "declined" || callOutcome === "busy") {
    return { title: "Declined", hint: "They cut the call." };
  }
  if (callOutcome === "not_reached") {
    return { title: "No ring", hint: "The call never reached the phone." };
  }
  if (callOutcome === "missed" || callOutcome === "no-answer" || callOutcome === "completed") {
    return { title: "No answer", hint: "It rang. Nobody picked up." };
  }
  if (callOutcome === "failed" || callOutcome === "canceled" || callOutcome === "unknown") {
    return { title: "No connect", hint: "The call did not go through." };
  }
  if (!callOutcome) {
    return { title: "Calling", hint: "Trying to reach them." };
  }
  return { title: "No connect", hint: "The call did not go through." };
}

function decideCopy(classification) {
  if (classification === "Escalate") {
    return { title: "Verdict", hint: "Wake — someone needs to look now." };
  }
  if (classification === "Log") {
    return { title: "Verdict", hint: "Save — keep it. No tap." };
  }
  return { title: "Verdict", hint: "Skip — leave it in the chat." };
}

const PipelineNode = React.forwardRef(function PipelineNode(
  { title, subtitle, icon, status = "pending" },
  ref
) {
  return (
    <div
      ref={ref}
      className={`z-10 flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-background p-4 shadow-sm ${
        status === "pending" ? "opacity-100" : status === "idle" ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-foreground/70">{icon}</div>
        {status === "success" && (
          <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.6} />
        )}
        {status === "failed" && <div className="h-2 w-2 rounded-full bg-red-500" />}
        {status === "pending" && <div className="h-2 w-2 rounded-full bg-foreground" />}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-950 dark:text-white">{title}</div>
      <div className="line-clamp-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">{subtitle}</div>
    </div>
  );
});
PipelineNode.displayName = "PipelineNode";

function nodeStatus(state, failed = false) {
  if (failed && (state === "done" || state === "current")) return "failed";
  if (state === "done") return "success";
  if (state === "current") return "pending";
  return "idle";
}

function AckBanner({ name, kind }) {
  const reacted = kind === "reaction";
  const replied = kind === "reply";
  const Icon = reacted ? SmilePlus : replied ? Reply : Check;
  const title = reacted
    ? `${name} reacted`
    : replied
      ? `${name} replied`
      : `${name} responded`;
  const body = reacted
    ? "They acknowledged the message. The wait is over."
    : replied
      ? "They answered in the thread. The wait is over."
      : "The wait is over.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-sm"
    >
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-background">
        <Icon className="h-4 w-4 text-foreground" strokeWidth={1.75} />
      </span>
      <div>
        <p className="text-sm font-medium tracking-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </motion.div>
  );
}

function PipelineRun({ run }) {
  const [phase, setPhase] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [resolutionOnly, setResolutionOnly] = useState(false);
  const wasPendingRef = useRef(false);
  const containerRef = useRef(null);
  const landedRef = useRef(null);
  const readRef = useRef(null);
  const memoryRef = useRef(null);
  const routeRef = useRef(null);
  const branchOriginRef = useRef(null);
  const decidingRef = useRef(null);
  const waitingRef = useRef(null);
  const noAnswerRef = useRef(null);

  const { alert } = run;
  const displayName = alert.userName || "Team member";
  const messageText = formatAlertMessageText(alert);
  const path = useMemo(() => resolvePath(alert), [alert]);
  const route = ROUTES[path];
  const matchPct =
    typeof alert.similarityScores === "number" && Number.isFinite(alert.similarityScores)
      ? Math.round(alert.similarityScores * 100)
      : null;
  const savedLabel = alert.matchedOverride || alert.classification || "Mute";
  const reused = Boolean(alert.semanticAutoApplied) || path === "known";
  const routeSubtitle =
    path === "known"
      ? `Same text as a saved ${savedLabel} correction.`
      : reused && path === "similar"
        ? matchPct != null
          ? `${matchPct}% match — using saved ${savedLabel} correction.`
          : `Using saved ${savedLabel} correction.`
        : matchPct != null
          ? `${matchPct}% similar to saved ${savedLabel} — below 70%, not reused.`
          : `${route.label}. ${route.hint}`;
  const status = alert.status || "resolved";
  const isAnalyzing = Boolean(alert.provisional || status === "analyzing");
  const hasMentionReroute = !isAnalyzing && alert.timerTrigger === "non_target_mention";
  const withTimer =
    !isAnalyzing &&
    !hasMentionReroute &&
    Boolean(alert.timerTrigger) &&
    alert.timerTrigger !== "non_target_mention";
  const showWait = status === "pending" && withTimer;
  const targetName = alert.targetUserName || displayName || "them";
  const runKey = alert.slackMessageTs || run.id;
  const kind = ackKind(alert);

  useEffect(() => {
    if (status === "pending" && withTimer) wasPendingRef.current = true;
  }, [status, withTimer]);

  useEffect(() => {
    if (wasPendingRef.current && status === "resolved") setResolutionOnly(true);
  }, [status]);

  useEffect(() => {
    if (resolutionOnly) return undefined;
    setPhase(0);
    const timers = Array.from({ length: 8 }, (_, i) =>
      setTimeout(() => setPhase(i + 1), i * STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [runKey, resolutionOnly]);

  useEffect(() => {
    if (resolutionOnly || !showWait || !alert.timestamp || phase < 6) {
      if (resolutionOnly || !showWait) setSecondsLeft(null);
      return undefined;
    }
    const startedAt = new Date(alert.timestamp).getTime();
    const waitMs = Number(alert.escalationTimeoutMs) > 0
      ? Number(alert.escalationTimeoutMs)
      : DEFAULT_ESCALATION_TIMER_MS;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setSecondsLeft(Math.max(0, Math.ceil((waitMs - elapsed) / 1000)));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [showWait, alert.timestamp, alert.escalationTimeoutMs, phase, resolutionOnly]);

  const isCalling = status === "escalating" || status === "escalated";
  const showClosed = withTimer && status === "closed";
  const decided = decideCopy(alert.classification);
  const call = callCopy(alert.callOutcome);

  const decidingTitle = isAnalyzing ? "Deciding" : "Verdict";
  const decidingHint = isAnalyzing
    ? "Still reading it."
    : hasMentionReroute
      ? "Not the person on call. Saved."
      : decided.hint;

  const waitingHint = kind
    ? kind === "reaction"
      ? `${targetName} reacted. Wait stopped.`
      : `${targetName} replied. Wait stopped.`
    : showWait && secondsLeft != null
      ? `${secondsLeft}s left for ${targetName}.`
      : withTimer
        ? `Holding for ${targetName}.`
        : "No wait on this one.";

  const callingHint = isCalling
    ? `Ringing ${targetName}.`
    : showClosed
      ? call.hint
      : withTimer
        ? "Call starts if nobody answers in time."
        : "No call on this one.";

  const callingTitle = showClosed ? call.title : "Calling";
  const callFailed =
    showClosed &&
    alert.callOutcome !== "answered" &&
    Boolean(alert.callOutcome);
  const CallIcon =
    showClosed && (alert.callOutcome === "answered" ? Phone : PhoneMissed);

  let maxStep = 5;
  if (withTimer || kind || resolutionOnly) maxStep = 6;
  if (isCalling || showClosed) maxStep = 7;
  const reached = isCalling || showClosed ? Math.max(phase, 7) : phase;
  const visible = resolutionOnly ? maxStep : Math.min(Math.max(reached, 0), maxStep);
  const pipelineSettled =
    !isAnalyzing && !showWait && !isCalling && (status === "resolved" || status === "closed");
  const stepState = (n) => {
    if (n < visible) return "done";
    if (n === visible) return pipelineSettled ? "done" : "current";
    return "idle";
  };

  const showDeciding = visible >= 5;
  const showWaiting = visible >= 6;
  const showCalling = visible >= 7;

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-24">
      {resolutionOnly && <AckBanner name={targetName} kind={kind} />}

      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">This message</p>
        <p className="mt-1 truncate text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
          {displayName}
          <span className="ml-3 font-medium text-zinc-700 dark:text-zinc-300">“{messageText}”</span>
        </p>
      </div>

      <div ref={containerRef} className="relative w-full min-w-0 overflow-visible py-6">
        <div className="relative mx-auto w-full max-w-5xl">
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            <PipelineNode
              ref={landedRef}
              icon={<Inbox className="h-5 w-5" strokeWidth={2.2} />}
              title="Landed"
              subtitle="Came in from chat."
              status={nodeStatus(stepState(1))}
            />
            <PipelineNode
              ref={readRef}
              icon={<MessageSquare className="h-5 w-5" strokeWidth={2.2} />}
              title="Read"
              subtitle={messageText ? `“${messageText}”` : "Reading the note."}
              status={nodeStatus(stepState(2))}
            />
            <PipelineNode
              ref={memoryRef}
              icon={<Cpu className="h-5 w-5" strokeWidth={2.2} />}
              title="Memory"
              subtitle="Have we seen this?"
              status={nodeStatus(stepState(3))}
            />
            <PipelineNode
              ref={routeRef}
              icon={<GitBranch className="h-5 w-5" strokeWidth={2.2} />}
              title="Route"
              subtitle={routeSubtitle}
              status={nodeStatus(stepState(4))}
            />
          </div>
          <div
            ref={branchOriginRef}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        {(showDeciding || showWaiting || showCalling) && (
          <div className="mx-auto mt-10 flex w-full max-w-[17.5rem] flex-col items-stretch gap-10">
            {showDeciding && (
              <PipelineNode
                ref={decidingRef}
                icon={<Sparkles className="h-5 w-5" strokeWidth={2.2} />}
                title={decidingTitle}
                subtitle={decidingHint}
                status={nodeStatus(stepState(5))}
              />
            )}
            {showWaiting && (
              <PipelineNode
                ref={waitingRef}
                icon={<Clock className="h-5 w-5" strokeWidth={2.2} />}
                title="Waiting"
                subtitle={waitingHint}
                status={nodeStatus(stepState(6))}
              />
            )}
            {showCalling && (
              <PipelineNode
                ref={noAnswerRef}
                icon={
                  CallIcon ? (
                    <CallIcon className="h-5 w-5" strokeWidth={2.2} />
                  ) : (
                    <Phone className="h-5 w-5" strokeWidth={2.2} />
                  )
                }
                title={callingTitle}
                subtitle={callingHint}
                status={nodeStatus(stepState(7), callFailed)}
              />
            )}
          </div>
        )}

        <AnimatedBeam
          containerRef={containerRef}
          fromRef={landedRef}
          toRef={readRef}
          startYOffset={0}
          endYOffset={0}
          {...BEAM}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={readRef}
          toRef={memoryRef}
          startYOffset={0}
          endYOffset={0}
          {...BEAM}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={memoryRef}
          toRef={routeRef}
          startYOffset={0}
          endYOffset={0}
          {...BEAM}
        />
        {showDeciding && (
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={branchOriginRef}
            toRef={decidingRef}
            startXOffset={0}
            endXOffset={0}
            {...BEAM}
          />
        )}
        {showWaiting && (
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={decidingRef}
            toRef={waitingRef}
            startXOffset={0}
            endXOffset={0}
            {...BEAM}
          />
        )}
        {showCalling && (
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={waitingRef}
            toRef={noAnswerRef}
            startXOffset={0}
            endXOffset={0}
            {...BEAM}
          />
        )}
      </div>
    </div>
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

    if (payload.eventKind === "resolution_attempt") {
      if (!payload.accepted) return;
      const current = runRef.current;
      const sameMessage =
        current &&
        payload.slackMessageTs &&
        current.alert?.slackMessageTs === payload.slackMessageTs;
      const sameId = current && (current.id === payload.alertId || current.alert?.id === payload.alertId);
      if (!sameMessage && !sameId) return;

      const eventType = payload.resolutionEventType || payload.eventType;
      const resolutionType =
        eventType === "reaction_added" ? "reaction" : eventType === "thread_reply" ? "thread_reply" : payload.resolutionType;

      setRun((prev) =>
        prev
          ? {
              ...prev,
              alert: {
                ...prev.alert,
                status: "resolved",
                resolutionType: resolutionType || prev.alert.resolutionType,
                resolutionEventType: eventType || prev.alert.resolutionEventType,
              },
            }
          : prev
      );
      return;
    }

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
    const sameMessage = Boolean(payloadTs) && Boolean(currentTs) && payloadTs === currentTs;

    if (current?.alert?.provisional && !payload.provisional && sameMessage) {
      seenRef.current.delete(currentId);
      seenRef.current.add(payload.id);
      setRun((prev) =>
        prev
          ? { ...prev, id: payload.id, alert: { ...payload, provisional: false } }
          : { id: payload.id, alert: { ...payload, provisional: false }, resolutionAttempts: [], createdAt: Date.now() }
      );
      return;
    }

    if (payload.eventKind === "alert_update" || (seenRef.current.has(payload.id) && currentId === payload.id)) {
      if (currentId === payload.id || sameMessage) {
        setRun((prev) => (prev ? { ...prev, alert: { ...prev.alert, ...payload, provisional: false } } : prev));
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

    const source = new EventSource(`/api/slack/events?teamId=${encodeURIComponent(activeTeamId)}`);
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

  return (
    <>
      <PipelineThreads />
      <div className="relative z-10">
        <SentinelShell
          title="Pipeline"
          subtitle="Watch a message arrive, branch, and land."
          titleClassName="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white"
          subtitleClassName="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          <WorkspaceGate>
            <div className="relative mx-auto w-full min-w-0 max-w-6xl">
          {!run ? (
            <div className="relative z-10 max-w-md">
              <div className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-400"}`} />
                {connected ? "Live" : "Connecting"}
              </div>
              <p className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-[2.15rem] sm:leading-tight">
                It only taps you when something is actually on fire.
              </p>
              <p className="mt-4 max-w-sm text-base font-medium leading-relaxed text-zinc-700 dark:text-zinc-300">
                A message comes in. Sentinel reads it, checks memory, and chooses skip, save, or wake. If nobody answers, it waits — then it calls.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-400"}`} />
                {connected ? "Live" : "Connecting"}
              </div>
              <PipelineRun key={run.alert?.slackMessageTs || run.id} run={run} />
            </>
          )}
            </div>
          </WorkspaceGate>
        </SentinelShell>
      </div>
    </>
  );
}

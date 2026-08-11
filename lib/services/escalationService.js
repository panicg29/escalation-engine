import { connectDB } from "@/lib/db";
import Alert from "@/lib/models/Alert";
import { hasBroadcastMention } from "@/lib/slack/extractTargetUser";
import { broadcastAlert, toAlertWireShape } from "@/lib/sentinel/alertBroadcast";
import { triggerVoiceEscalation, fetchCallStatus, isTerminalCallStatus, cancelTwilioCall, isRejectSipCode } from "@/lib/services/twilioService";
import { scheduleEscalationJob, cancelEscalationJob } from "@/lib/redis/queues.js";

const ESCALATION_DELAY_MS = Number.parseInt(
  process.env.ESCALATION_TIMER_MS || "15000",
  10
);

global.escalationTimers = global.escalationTimers || new Map();
global.callStatusWatches = global.callStatusWatches || new Set();
global.escalationCallsInFlight = global.escalationCallsInFlight || new Set();
global.callRingCounts = global.callRingCounts || new Map();
global.callAnsweredSids = global.callAnsweredSids || new Set();
global.declineCancelSids = global.declineCancelSids || new Set();

const CALL_STATUS_POLL_MS = 500;
const CALL_STATUS_MAX_MS = 90_000;
const CALL_STATUS_BACKOFF_THRESHOLD = 30_000; // Start backoff after 30s
const SHORT_HANGUP_SECONDS = 3;

async function clearEscalationTimer(alertId) {
  const key = String(alertId);
  
  // Try to cancel Redis job queue first
  try {
    await cancelEscalationJob(alertId);
  } catch (error) {
    console.warn(`Failed to cancel job queue escalation for ${alertId}:`, error?.message);
  }
  
  // Also clear setTimeout fallback if it exists
  const handle = global.escalationTimers.get(key);
  if (handle) {
    clearTimeout(handle);
    global.escalationTimers.delete(key);
  }
}

function broadcastResolutionAttempt({
  teamId,
  alertId,
  slackMessageTs,
  actorUserId,
  targetUserId,
  accepted,
  reason,
  eventType,
}) {
  broadcastAlert({
    eventKind: "resolution_attempt",
    teamId,
    alertId,
    slackMessageTs,
    actorUserId,
    targetUserId,
    accepted,
    reason,
    resolutionEventType: eventType,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Escalation is tracked in Sentinel (DB + SSE). We intentionally do NOT post
 * into Slack threads — that was confusing and not part of the pipeline UX.
 */
async function postSlackEscalation() {
  return {
    attempted: false,
    ok: true,
    error: null,
    skipped: true,
    reason: "slack_thread_notify_disabled",
  };
}

/**
 * Decide whether the response timer should run and if classification should be overridden.
 *
 * Timer rules:
 * 1. @here / @channel / @everyone → force Escalate + start timer
 * 2. Workspace target @mentioned → start timer (any triage classification)
 * 3. Escalate with no user mentions → start timer (urgent broadcast to target)
 * 4. Escalate with mentions excluding target → no timer, reclassify as Log
 */
export function evaluateEscalationTimer({
  classification,
  slackMessageTs,
  workspaceTargetUserId,
  mentionedUserIds = [],
  text = "",
}) {
  if (!slackMessageTs || !workspaceTargetUserId) {
    return {
      timerApplies: false,
      classification,
      trigger: null,
      reasoningSuffix: null,
    };
  }

  if (hasBroadcastMention(text)) {
    return {
      timerApplies: true,
      classification: "Escalate",
      trigger: "broadcast_mention",
      reasoningSuffix:
        " Channel broadcast (@here, @channel, or @everyone) — escalated with response timer.",
    };
  }

  if (mentionedUserIds.includes(workspaceTargetUserId)) {
    return {
      timerApplies: true,
      classification,
      trigger: "target_mentioned",
      reasoningSuffix:
        " Workspace notification target was mentioned — response timer started.",
    };
  }

  if (
    classification === "Escalate" &&
    mentionedUserIds.length > 0 &&
    !mentionedUserIds.includes(workspaceTargetUserId)
  ) {
    return {
      timerApplies: false,
      classification: "Log",
      trigger: "non_target_mention",
      reasoningSuffix:
        " Message mentions someone other than the workspace notification target — logged for reference instead of escalated.",
    };
  }

  if (classification === "Escalate" && mentionedUserIds.length === 0) {
    return {
      timerApplies: true,
      classification,
      trigger: "urgent_no_mention",
      reasoningSuffix: null,
    };
  }

  return {
    timerApplies: false,
    classification,
    trigger: null,
    reasoningSuffix: null,
  };
}

/** @deprecated Use evaluateEscalationTimer */
export function shouldStartEscalationTimer({
  classification,
  slackMessageTs,
  workspaceTargetUserId,
  mentionedUserIds = [],
  text = "",
}) {
  return evaluateEscalationTimer({
    classification,
    slackMessageTs,
    workspaceTargetUserId,
    mentionedUserIds,
    text,
  }).timerApplies;
}

export function initialAlertStatus(
  classification,
  { slackMessageTs, targetUserId, mentionedUserIds = [], text = "" } = {}
) {
  return evaluateEscalationTimer({
    classification,
    slackMessageTs,
    workspaceTargetUserId: targetUserId,
    mentionedUserIds,
    text,
  }).timerApplies
    ? "pending"
    : "resolved";
}

function matchesResolutionActor(alert, actorUserId) {
  if (!actorUserId || !alert.targetUserId) return false;
  return actorUserId === alert.targetUserId;
}

export async function findPendingAlertByMessageTs({ teamId, slackMessageTs }) {
  if (!teamId || !slackMessageTs) return null;
  await connectDB();
  return Alert.findOne({
    teamId,
    slackMessageTs,
    status: "pending",
  }).lean();
}

export async function resolveAlert({
  alertId,
  teamId,
  resolvedByUserId,
  resolutionType,
}) {
  await connectDB();
  const doc = await Alert.findOneAndUpdate(
    { _id: alertId, teamId, status: "pending" },
    {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedByUserId: resolvedByUserId || "",
      resolutionType: resolutionType || "",
    },
    { new: true }
  );

  if (!doc) return null;

  await clearEscalationTimer(alertId);
  const alert = toAlertWireShape(doc, { eventKind: "alert_update" });
  broadcastAlert(alert);
  return doc;
}

/**
 * Map raw Twilio CallStatus → Sentinel callOutcome.
 * Optional context distinguishes short hang-ups and SIP reject codes.
 */
export function mapTwilioCallOutcome(callStatus, { sipResponseCode, callDuration, wasAnswered } = {}) {
  if (isRejectSipCode(sipResponseCode)) {
    return "declined";
  }

  if (callStatus === "busy") {
    return "declined";
  }

  if (
    callStatus === "completed" &&
    wasAnswered &&
    Number.isFinite(callDuration) &&
    callDuration <= SHORT_HANGUP_SECONDS
  ) {
    return "declined";
  }

  switch (callStatus) {
    case "completed":
      return "answered";
    case "no-answer":
      // Twilio docs: no-answer = missed OR rejected when the carrier
      // never returns busy (common on some international mobiles).
      return "missed";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return callStatus || "unknown";
  }
}

function clearCallTracking(callSid) {
  if (!callSid) return;
  global.callStatusWatches.delete(callSid);
  global.callRingCounts.delete(callSid);
  global.callAnsweredSids.delete(callSid);
  global.declineCancelSids.delete(callSid);
}

/**
 * Close an escalating alert from a Twilio call outcome.
 * Idempotent — only transitions alerts still in `escalating`.
 */
export async function finalizeCallEscalation({
  callSid,
  callStatus,
  source = "unknown",
  sipResponseCode = null,
  callDuration = null,
  callOutcomeOverride = null,
}) {
  if (!callSid) return null;

  const wasAnswered = global.callAnsweredSids.has(callSid);
  const callOutcome =
    callOutcomeOverride ||
    (callStatus === "canceled" && global.declineCancelSids.has(callSid)
      ? "declined"
      : mapTwilioCallOutcome(callStatus, {
          sipResponseCode,
          callDuration,
          wasAnswered,
        }));

  await connectDB();
  const doc = await Alert.findOneAndUpdate(
    { callSid, status: "escalating" },
    {
      status: "closed",
      callOutcome,
    },
    { new: true }
  );

  if (!doc) {
    clearCallTracking(callSid);
    return null;
  }

  clearCallTracking(callSid);

  broadcastAlert(toAlertWireShape(doc, { eventKind: "alert_update" }));
  console.log(
    JSON.stringify({
      source: "escalation-service",
      action: "call_closed",
      via: source,
      callSid,
      callStatus,
      callOutcome,
      sipResponseCode,
      callDuration,
      wasAnswered,
      alertId: String(doc._id),
      teamId: doc.teamId,
    })
  );
  return doc;
}

/**
 * Mark call answered (pickup detected) for short-hangup → declined mapping.
 */
export function markCallAnswered(callSid) {
  if (callSid) global.callAnsweredSids.add(callSid);
}

/**
 * Record a ringing event. A second ringing on the same CallSid often means
 * the carrier rejected then Twilio failed over / re-alerted — cancel + decline.
 */
export async function handleCallRinging(callSid) {
  if (!callSid) return null;

  const next = (global.callRingCounts.get(callSid) || 0) + 1;
  global.callRingCounts.set(callSid, next);

  console.log(
    JSON.stringify({
      source: "escalation-service",
      action: "call_ringing",
      callSid,
      ringCount: next,
    })
  );

  if (next < 2) return null;

  global.declineCancelSids.add(callSid);
  await cancelTwilioCall(callSid);
  return finalizeCallEscalation({
    callSid,
    callStatus: "busy",
    callOutcomeOverride: "declined",
    source: "ringing_retry_cancel",
  });
}

/**
 * Carrier signaled reject via SIP — stop any re-dial and close as declined.
 */
export async function handleCallRejected({ callSid, callStatus, sipResponseCode, source }) {
  if (!callSid) return null;

  global.declineCancelSids.add(callSid);
  await cancelTwilioCall(callSid);
  return finalizeCallEscalation({
    callSid,
    callStatus: callStatus || "busy",
    sipResponseCode,
    callOutcomeOverride: "declined",
    source: source || "reject_signal",
  });
}

/**
 * Poll Twilio directly for faster UI updates than waiting on webhooks alone.
 */
export function startCallStatusWatch(callSid) {
  if (!callSid || global.callStatusWatches.has(callSid)) return;

  global.callStatusWatches.add(callSid);
  const startedAt = Date.now();

  const poll = async () => {
    if (!global.callStatusWatches.has(callSid)) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed > CALL_STATUS_MAX_MS) {
      global.callStatusWatches.delete(callSid);
      return;
    }

    const details = await fetchCallStatus(callSid);
    const status = details?.status || null;
    if (status && isTerminalCallStatus(status)) {
      global.callStatusWatches.delete(callSid);

      if (status === "busy" || isRejectSipCode(details?.sipResponseCode)) {
        await handleCallRejected({
          callSid,
          callStatus: status,
          sipResponseCode: details?.sipResponseCode,
          source: "twilio_poll_reject",
        });
        return;
      }

      await finalizeCallEscalation({
        callSid,
        callStatus: status,
        sipResponseCode: details?.sipResponseCode,
        callDuration: Number.isFinite(details?.duration) ? details.duration : null,
        source: "twilio_poll",
      });
      return;
    }

    // Implement exponential backoff for longer calls to reduce CPU usage
    let nextPollMs = CALL_STATUS_POLL_MS;
    if (elapsed > CALL_STATUS_BACKOFF_THRESHOLD) {
      // After 30 seconds, increase polling interval exponentially up to 5 seconds max
      const backoffMultiplier = Math.min(4, Math.floor((elapsed - CALL_STATUS_BACKOFF_THRESHOLD) / 10000) + 1);
      nextPollMs = Math.min(5000, CALL_STATUS_POLL_MS * backoffMultiplier);
    }

    setTimeout(poll, nextPollMs);
  };

  void poll();
}

export async function escalateAlert({ alertId, teamId, botToken, channelId }) {
  const alertKey = String(alertId);
  if (global.escalationCallsInFlight.has(alertKey)) {
    return null;
  }

  global.escalationCallsInFlight.add(alertKey);

  try {
    await connectDB();

    // Atomic lock: only one worker may claim a pending alert.
    // If status is not pending (or callSid already exists), abort immediately.
    const locked = await Alert.findOneAndUpdate(
      {
        _id: alertId,
        teamId,
        status: "pending",
        $or: [{ callSid: null }, { callSid: "" }, { callSid: { $exists: false } }],
      },
      {
        status: "escalating",
        escalatedAt: new Date(),
      },
      { new: true }
    );

    if (!locked) {
      console.log(
        JSON.stringify({
          source: "escalation-service",
          action: "escalate_aborted",
          reason: "alert_not_pending_or_already_claimed",
          alertId: alertKey,
          teamId,
        })
      );
      return null;
    }

    await clearEscalationTimer(alertId);

    // Push escalating state to the UI before the Twilio API call.
    broadcastAlert(toAlertWireShape(locked, { eventKind: "alert_update" }));

    const alertText = locked.displayText || locked.text || "";
    const voiceResult = await triggerVoiceEscalation(
      process.env.TEST_USER_PHONE,
      alertText
    );

    let finalDoc = locked;
    if (voiceResult.ok && voiceResult.callSid) {
      finalDoc =
        (await Alert.findOneAndUpdate(
          { _id: alertId, teamId, status: "escalating" },
          { callSid: voiceResult.callSid },
          { new: true }
        )) || locked;
      startCallStatusWatch(voiceResult.callSid);
    } else {
      finalDoc =
        (await Alert.findOneAndUpdate(
          { _id: alertId, teamId, status: "escalating" },
          { status: "closed", callOutcome: "failed" },
          { new: true }
        )) || locked;
    }

    const delivery = await postSlackEscalation({
      botToken,
      channelId,
      slackMessageTs: finalDoc.slackMessageTs,
      targetUserId: finalDoc.targetUserId,
      text: finalDoc.text,
    });

    broadcastAlert(toAlertWireShape(finalDoc, { eventKind: "alert_update" }));
    return { doc: finalDoc, delivery, voiceResult };
  } finally {
    global.escalationCallsInFlight.delete(alertKey);
  }
}

export async function scheduleEscalation({ alertId, teamId, channelId, botToken }) {
  if (!alertId || !teamId) return;

  await clearEscalationTimer(alertId);

  // Try to use Redis job queue first
  try {
    const jobId = await scheduleEscalationJob(alertId, teamId, ESCALATION_DELAY_MS, { botToken, channelId });
    console.log(
      JSON.stringify({
        source: "escalation-service",
        action: "scheduled_job",
        alertId: String(alertId),
        teamId,
        jobId,
        delayMs: ESCALATION_DELAY_MS,
        method: "redis-queue",
      })
    );
    return jobId;
  } catch (error) {
    console.warn(
      JSON.stringify({
        source: "escalation-service",
        action: "job_schedule_failed",
        alertId: String(alertId),
        teamId,
        error: error?.message,
        fallback: "setTimeout",
      })
    );
    
    // Fallback to setTimeout
    const handle = setTimeout(() => {
      global.escalationTimers.delete(String(alertId));
      void escalateAlert({ alertId, teamId, botToken, channelId })
        .then((result) => {
        if (result?.doc) {
          console.log(
            JSON.stringify({
              source: "escalation-service",
              action: "escalated",
              alertId: String(alertId),
              teamId,
              slackMessageTs: result.doc.slackMessageTs,
              targetUserId: result.doc.targetUserId,
              slackDelivery: result.delivery,
              voiceEscalation: result.voiceResult,
              method: "setTimeout-fallback",
            })
          );
        }
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              source: "escalation-service",
              action: "escalation_failed",
              alertId: String(alertId),
              teamId,
              error: error?.message || "Escalation timer failed",
              method: "setTimeout-fallback",
            })
          );
        });
    }, ESCALATION_DELAY_MS);

    global.escalationTimers.set(String(alertId), handle);
    
    console.log(
      JSON.stringify({
        source: "escalation-service",
        action: "scheduled_timeout",
        alertId: String(alertId),
        teamId,
        delayMs: ESCALATION_DELAY_MS,
        method: "setTimeout-fallback",
      })
    );
    
    return handle;
  }
}

export async function handleReactionAdded({
  event,
  teamId,
}) {
  if (event?.item?.type !== "message") return;

  const slackMessageTs = event.item.ts;
  const actorUserId = event.user;
  if (!slackMessageTs || !actorUserId) return;

  const alert = await findPendingAlertByMessageTs({ teamId, slackMessageTs });
  if (!alert) return;

  if (!matchesResolutionActor(alert, actorUserId)) {
    console.log(
      JSON.stringify({
        source: "slack-events",
        action: "reaction_ignored",
        reason: "Reaction ignored: not the workspace notification target",
        teamId,
        alertId: String(alert._id),
        slackMessageTs,
        actorUserId,
        targetUserId: alert.targetUserId,
      })
    );
    broadcastResolutionAttempt({
      teamId,
      alertId: String(alert._id),
      slackMessageTs,
      actorUserId,
      targetUserId: alert.targetUserId,
      accepted: false,
      reason: "Reaction ignored: not the workspace notification target",
      eventType: "reaction_added",
    });
    return;
  }

  const resolved = await resolveAlert({
    alertId: alert._id,
    teamId,
    resolvedByUserId: actorUserId,
    resolutionType: "reaction",
  });

  if (resolved) {
    console.log(
      JSON.stringify({
        source: "slack-events",
        action: "resolved",
        reason: "Target user reacted",
        teamId,
        alertId: String(alert._id),
        slackMessageTs,
        actorUserId,
      })
    );
    broadcastResolutionAttempt({
      teamId,
      alertId: String(alert._id),
      slackMessageTs,
      actorUserId,
      targetUserId: alert.targetUserId,
      accepted: true,
      reason: "Notification target reacted — timer canceled",
      eventType: "reaction_added",
    });
  }
}

export async function handleThreadReply({
  event,
  teamId,
}) {
  const threadTs = event.thread_ts;
  const actorUserId = event.user || event.user_id;
  if (!threadTs || !actorUserId) return { handled: false };

  const alert = await findPendingAlertByMessageTs({ teamId, slackMessageTs: threadTs });
  if (!alert) return { handled: false };

  if (!matchesResolutionActor(alert, actorUserId)) {
    console.log(
      JSON.stringify({
        source: "slack-events",
        action: "thread_reply_ignored",
        reason: "Thread reply ignored: not the workspace notification target",
        teamId,
        alertId: String(alert._id),
        slackMessageTs: threadTs,
        actorUserId,
        targetUserId: alert.targetUserId,
      })
    );
    broadcastResolutionAttempt({
      teamId,
      alertId: String(alert._id),
      slackMessageTs: threadTs,
      actorUserId,
      targetUserId: alert.targetUserId,
      accepted: false,
      reason: "Thread reply ignored: not the workspace notification target",
      eventType: "thread_reply",
    });
    return { handled: true, triage: false };
  }

  const resolved = await resolveAlert({
    alertId: alert._id,
    teamId,
    resolvedByUserId: actorUserId,
    resolutionType: "thread_reply",
  });

  if (resolved) {
    console.log(
      JSON.stringify({
        source: "slack-events",
        action: "resolved",
        reason: "Target user replied in thread",
        teamId,
        alertId: String(alert._id),
        slackMessageTs: threadTs,
        actorUserId,
      })
    );
    broadcastResolutionAttempt({
      teamId,
      alertId: String(alert._id),
      slackMessageTs: threadTs,
      actorUserId,
      targetUserId: alert.targetUserId,
      accepted: true,
      reason: "Notification target replied — timer canceled",
      eventType: "thread_reply",
    });
  }

  return { handled: true, triage: false };
}

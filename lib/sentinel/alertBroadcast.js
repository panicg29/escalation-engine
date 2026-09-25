import { EventEmitter } from "node:events";
import { publishEvent, CHANNELS } from "@/lib/redis/pubsub.js";

const sseEncoder = new TextEncoder();
const HUB_KEY = "__sentinelSseHub";

export function toAlertWireShape(doc, overrides = {}) {
  const id = doc._id ? doc._id.toString() : doc.id;
  return {
    id,
    teamId: doc.teamId || null,
    userId: doc.userId,
    userName: doc.userName || "Team member",
    text: doc.text,
    displayText: doc.displayText || doc.text,
    classification: doc.classification,
    reasoning: doc.reasoning || "",
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : doc.timestamp,
    correctedAt: doc.correctedAt
      ? doc.correctedAt instanceof Date
        ? doc.correctedAt.toISOString()
        : doc.correctedAt
      : null,
    triageSource: doc.triageSource || null,
    similarityScores: doc.similarityScores ?? null,
    semanticAutoApplied: Boolean(doc.semanticAutoApplied),
    matchedOverride: doc.matchedOverride || null,
    slackMessageTs: doc.slackMessageTs || null,
    slackChannelId: doc.slackChannelId || null,
    targetUserId: doc.targetUserId || null,
    targetUserName: doc.targetUserName || null,
    mentionedUserIds: doc.mentionedUserIds || [],
    timerTrigger: doc.timerTrigger || null,
    escalationTimeoutMs: doc.escalationTimeoutMs || null,
    status: doc.status || "resolved",
    resolutionType: doc.resolutionType || null,
    resolvedAt: doc.resolvedAt
      ? doc.resolvedAt instanceof Date
        ? doc.resolvedAt.toISOString()
        : doc.resolvedAt
      : null,
    escalatedAt: doc.escalatedAt
      ? doc.escalatedAt instanceof Date
        ? doc.escalatedAt.toISOString()
        : doc.escalatedAt
      : null,
    callSid: doc.callSid || null,
    callOutcome: doc.callOutcome || null,
    ...overrides,
  };
}

/**
 * Process-wide SSE hub. Prefer EventEmitter over holding ReadableStream
 * controllers across requests — those go stale under Next.js HMR and look
 * "delivered" while the live pipeline tab never receives the chunk.
 */
export function getSseHub() {
  if (!globalThis[HUB_KEY]) {
    const hub = new EventEmitter();
    hub.setMaxListeners(50);
    globalThis[HUB_KEY] = hub;
  }
  return globalThis[HUB_KEY];
}

/** @deprecated Prefer getSseHub — kept for any leftover imports */
export function getSseControllers() {
  return getSseHub();
}

export function subscribeSse(handler) {
  const hub = getSseHub();
  hub.on("alert", handler);
  return () => hub.off("alert", handler);
}

export function unsubscribeSse() {
  // no-op; callers should use the disposer returned by subscribeSse
}

export async function broadcastAlert(alert) {
  const hub = getSseHub();
  const listenerCount = hub.listenerCount("alert");
  const teamId = alert?.teamId || null;

  // Broadcast to Redis pub/sub (distributed) and local EventEmitter (backward compatibility)
  try {
    // Redis pub/sub for distributed SSE across multiple instances
    await publishEvent(CHANNELS.ALERT, alert, { teamId });
    
    // Local EventEmitter for processes that haven't migrated to Redis subscriptions yet
    if (listenerCount > 0) {
      hub.emit("alert", alert);
    }
    
    console.log(
      JSON.stringify({
        source: "sse-broadcast",
        action: "emitted",
        teamId: alert?.teamId || null,
        eventKind: alert?.eventKind || "alert",
        alertId: alert?.id || alert?.alertId || null,
        localSubscribers: listenerCount,
        broadcast: "redis+local",
      })
    );
  } catch (error) {
    console.error("Broadcast failed:", error?.message);
    
    // Fallback to local broadcast only
    if (listenerCount > 0) {
      hub.emit("alert", alert);
    } else {
      console.warn(
        JSON.stringify({
          source: "sse-broadcast",
          warning: "no_active_subscribers",
          teamId: alert?.teamId || null,
          eventKind: alert?.eventKind || "alert",
          alertId: alert?.id || alert?.alertId || null,
          subscriberCount: 0,
        })
      );
    }
  }
}

export { sseEncoder };

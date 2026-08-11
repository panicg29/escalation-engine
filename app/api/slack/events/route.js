import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Alert from "@/lib/models/Alert";
import { resolveSlackUserName } from "@/lib/slack/resolveUser";
import {
  TRIAGE_MODEL,
  TRIAGE_SYSTEM_PROMPT,
  getTriageRequestPayload,
  triageMessage,
} from "@/lib/services/aiService";
import { generateEmbedding } from "@/lib/services/embeddingService";
import {
  buildDynamicSystemPrompt,
  findExactFeedback,
  findSimilarFeedback,
} from "@/lib/services/feedbackService";
import { hashText, normalizeForEmbedding } from "@/lib/services/textNormalize";
import {
  handleReactionAdded,
  handleThreadReply,
  scheduleEscalation,
  evaluateEscalationTimer,
} from "@/lib/services/escalationService";
import { extractMentionedUserIds, hasBroadcastMention } from "@/lib/slack/extractTargetUser";
import { formatSlackMessageDisplay } from "@/lib/slack/formatMessageDisplay";
import { resolveWorkspaceForTeam, isWorkspaceActiveForEvents, getEscalationTargetFromWorkspace } from "@/lib/services/workspaceService";
import {
  broadcastAlert,
  toAlertWireShape,
  getSseHub,
  subscribeSse,
  sseEncoder,
} from "@/lib/sentinel/alertBroadcast";
import { subscribeToEvents, CHANNELS } from "@/lib/redis/pubsub.js";
import {
  startPerformanceTracking,
  addPerformanceEvent,
  completePerformanceTracking,
  PERF_EVENTS,
} from "@/lib/services/performanceMonitor.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLACK_SIGNATURE_MAX_AGE_SEC = 60 * 5;
const SSE_HEARTBEAT_MS = 15000;

function verifySlackSignature({ signingSecret, signature, timestamp, rawBody }) {
  if (!signingSecret || !signature || !timestamp || rawBody == null) return false;

  const requestTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(requestTimestamp)) return false;

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - requestTimestamp);
  if (ageSec > SLACK_SIGNATURE_MAX_AGE_SEC) return false;

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring, "utf8")
    .digest("hex");
  const computed = `v0=${hmac}`;

  const signatureBuffer = Buffer.from(signature, "utf8");
  const computedBuffer = Buffer.from(computed, "utf8");
  if (signatureBuffer.length !== computedBuffer.length) return false;

  return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
}

function getTimeContext() {
  const now = new Date();
  if (now.getDay() === 0 || now.getDay() === 6) return "Weekend";
  const hour = now.getHours();
  return hour >= 9 && hour < 17 ? "Working Hours" : "After Hours";
}

function persistTriageSource(source) {
  if (source === "exact" || source === "semantic" || source === "llm") return source;
  return "llm";
}

function topSimilarityScore(similar) {
  if (!Array.isArray(similar) || similar.length === 0) return null;
  const score = similar[0]?.similarity;
  return typeof score === "number" ? Number(score.toFixed(4)) : null;
}

const SEMANTIC_FEEDBACK_ENABLED =
  String(process.env.SEMANTIC_FEEDBACK_ENABLED ?? "true").toLowerCase() !==
  "false";

const SEMANTIC_EMBEDDING_TIMEOUT_MS = Math.max(
  250,
  Number.parseInt(process.env.SEMANTIC_EMBEDDING_TIMEOUT_MS || "1400", 10) || 1400
);

// Above this cosine score, reuse the matched feedback label instead of asking
// the fine-tuned model (which frequently ignores soft few-shot hints).
const SEMANTIC_OVERRIDE_THRESHOLD = Math.min(
  0.99,
  Math.max(
    0.55,
    Number.parseFloat(process.env.SEMANTIC_OVERRIDE_THRESHOLD || "0.70") || 0.7
  )
);

async function raceWithTimeout(promise, ms, fallbackValue) {
  let timer;
  const guarded = Promise.resolve(promise).catch(() => fallbackValue);
  try {
    return await Promise.race([
      guarded,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Tiered triage:
 * 1) Exact hash → cached override (skip LLM)
 * 2) Strong semantic match → reuse top feedback override (skip LLM)
 * 3) Weaker semantic match → LLM + few-shot from prior feedback
 * 4) No match → direct LLM
 */
async function runTieredTriage(text, timeContext, teamId, trackingId = null) {
  const textHash = hashText(text);
  const exact = await findExactFeedback(text, teamId);

  if (exact) {
    return {
      classification: exact.userOverride,
      reasoning:
        exact.userReasoning?.trim() ||
        `Exact match from user correction (${exact.userOverride}).`,
      triageSource: "exact",
      textHash,
      similarityMatches: null,
      topSimilarityScore: null,
      fallback: false,
      triageDebug: {
        tier: 1,
        tierLabel: "Tier 1 — Exact hash match",
        triageSource: "exact",
        teamId,
        textHash,
        llmSkipped: true,
        model: null,
        llmRequest: null,
        matchedFeedback: {
          originalText: exact.originalText,
          userOverride: exact.userOverride,
          userReasoning: exact.userReasoning || "",
        },
        similarityScores: null,
      },
    };
  }

  let similar = [];
  let embeddingTimedOut = false;

  if (SEMANTIC_FEEDBACK_ENABLED) {
    try {
      if (trackingId) addPerformanceEvent(trackingId, PERF_EVENTS.EMBEDDING_START);

      const embeddingResult = await raceWithTimeout(
        (async () => {
          const embedding = await generateEmbedding(normalizeForEmbedding(text));
          if (trackingId) {
            addPerformanceEvent(trackingId, PERF_EVENTS.EMBEDDING_COMPLETE);
            addPerformanceEvent(trackingId, PERF_EVENTS.SIMILARITY_START);
          }
          const matches = await findSimilarFeedback(embedding, teamId);
          if (trackingId) {
            addPerformanceEvent(trackingId, PERF_EVENTS.SIMILARITY_COMPLETE, {
              similarMatches: matches.length,
            });
          }
          return matches;
        })(),
        SEMANTIC_EMBEDDING_TIMEOUT_MS,
        null
      );

      if (embeddingResult == null) {
        embeddingTimedOut = true;
        console.warn(
          JSON.stringify({
            source: "slack-events",
            stage: "embedding",
            teamId,
            textHash,
            warning: "semantic_lookup_timeout",
            timeoutMs: SEMANTIC_EMBEDDING_TIMEOUT_MS,
          })
        );
      } else {
        similar = embeddingResult;
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          source: "slack-events",
          stage: "embedding",
          teamId,
          textHash,
          error: error?.message || "Embedding failed",
        })
      );
    }

    if (similar.length > 0) {
      const top = similar[0];
      const topScore = Number(top.similarity) || 0;
      const similarityMatches = similar.map((s) => ({
        textHash: s.textHash,
        score: Number(s.similarity.toFixed(4)),
        userOverride: s.userOverride,
        originalText: s.originalText,
      }));
      const scoreSummary = similarityMatches;

      // Strong close-match: reuse human override. Fine-tuned 1.5B often
      // ignores soft few-shot, so high-similarity corrections must be authoritative.
      if (topScore >= SEMANTIC_OVERRIDE_THRESHOLD && top.userOverride) {
        return {
          classification: top.userOverride,
          reasoning:
            top.userReasoning?.trim() ||
            `Close match to prior feedback (${(topScore * 100).toFixed(0)}% similar) labeled ${top.userOverride}.`,
          triageSource: "semantic",
          textHash,
          similarityMatches,
          topSimilarityScore: topSimilarityScore(similar),
          fallback: false,
          triageDebug: {
            tier: 2,
            tierLabel: "Tier 2 — Semantic override (high confidence)",
            triageSource: "semantic",
            teamId,
            textHash,
            llmSkipped: true,
            model: null,
            llmRequest: null,
            fewShotExampleCount: similar.length,
            similarityScores: scoreSummary,
            matchedFeedback: {
              originalText: top.originalText,
              userOverride: top.userOverride,
              userReasoning: top.userReasoning || "",
              similarity: Number(topScore.toFixed(4)),
            },
            systemPromptIncludesFewShot: false,
            semanticAutoApplied: true,
            semanticOverrideThreshold: SEMANTIC_OVERRIDE_THRESHOLD,
          },
        };
      }

      const systemPrompt = buildDynamicSystemPrompt(similar);
      const llmRequest = getTriageRequestPayload(text, timeContext, systemPrompt);
      if (trackingId) addPerformanceEvent(trackingId, PERF_EVENTS.LLM_START);
      const result = await triageMessage(text, timeContext, {
        systemPrompt,
        fewShotExamples: similar,
      });
      if (trackingId) {
        addPerformanceEvent(trackingId, PERF_EVENTS.LLM_COMPLETE, {
          classification: result.classification,
          fallback: result.fallback,
        });
      }
      return {
        classification: result.classification,
        reasoning: result.reasoning,
        triageSource: result.fallback ? "llm" : "semantic",
        textHash,
        similarityMatches,
        topSimilarityScore: topSimilarityScore(similar),
        fallback: result.fallback || false,
        triageDebug: {
          tier: 2,
          tierLabel: "Tier 2 — Semantic few-shot + LLM",
          triageSource: result.fallback ? "llm" : "semantic",
          teamId,
          textHash,
          llmSkipped: false,
          model: TRIAGE_MODEL,
          llmRequest,
          fewShotExampleCount: similar.length,
          similarityScores: scoreSummary,
          systemPromptIncludesFewShot: true,
          semanticAutoApplied: false,
        },
      };
    }
  }

  const llmRequest = getTriageRequestPayload(text, timeContext, TRIAGE_SYSTEM_PROMPT);
  if (trackingId) addPerformanceEvent(trackingId, PERF_EVENTS.LLM_START);
  const result = await triageMessage(text, timeContext);
  if (trackingId) {
    addPerformanceEvent(trackingId, PERF_EVENTS.LLM_COMPLETE, {
      classification: result.classification,
      fallback: result.fallback,
    });
  }

  return {
    classification: result.classification,
    reasoning: result.reasoning,
    triageSource: "llm",
    textHash,
    similarityMatches: null,
    topSimilarityScore: null,
    fallback: result.fallback || false,
    triageDebug: {
      tier: 3,
      tierLabel: embeddingTimedOut
        ? "Tier 3 — Direct LLM (semantic timeout)"
        : SEMANTIC_FEEDBACK_ENABLED
          ? "Tier 3 — Direct LLM (no similar feedback)"
          : "Tier 3 — Direct LLM (semantic disabled)",
      triageSource: "llm",
      teamId,
      textHash,
      llmSkipped: false,
      model: TRIAGE_MODEL,
      llmRequest,
      fewShotExampleCount: 0,
      similarityScores: null,
      embeddingTimedOut,
      systemPromptIncludesFewShot: false,
    },
  };
}

async function triageSlackMessage({
  userId,
  text,
  event,
  teamId,
  botToken,
  slackMessageTs,
  slackChannelId,
  workspace,
}) {
  // Start performance tracking for this message
  const trackingId = `slack-${teamId}-${slackMessageTs}`;
  startPerformanceTracking(trackingId, PERF_EVENTS.SLACK_RECEIVED);
  addPerformanceEvent(trackingId, PERF_EVENTS.TRIAGE_START);
  
  // Run independent async operations in parallel for better performance
  const timeContext = getTimeContext();
  const { targetUserId: workspaceTargetUserId, targetUserName: workspaceTargetUserName } =
    getEscalationTargetFromWorkspace(workspace);

  // Instant pipeline UI: show the run before LLM / embeddings finish.
  const provisionalId = `pending-${teamId}-${slackMessageTs || Date.now()}`;
  void broadcastAlert({
    id: provisionalId,
    teamId,
    userId,
    userName: "Team member",
    text,
    displayText: text,
    classification: "Mute",
    reasoning: "Analyzing…",
    triageSource: null,
    similarityScores: null,
    slackMessageTs: slackMessageTs || null,
    slackChannelId: slackChannelId || null,
    targetUserId: workspaceTargetUserId || null,
    targetUserName: workspaceTargetUserName || null,
    mentionedUserIds: extractMentionedUserIds(text),
    timerTrigger: null,
    status: "analyzing",
    timestamp: new Date().toISOString(),
    eventKind: "pipeline_start",
    provisional: true,
  });
  
  const [userName, displayText, result] = await Promise.all([
    resolveSlackUserName(userId, event, { teamId, botToken }),
    formatSlackMessageDisplay(text, { teamId, botToken }),
    runTieredTriage(text, timeContext, teamId, trackingId),
  ]);
  
  addPerformanceEvent(trackingId, PERF_EVENTS.TRIAGE_COMPLETE, {
    classification: result.classification,
    triageSource: result.triageSource,
  });
  
  // These operations depend on the results above, so run them after
  const mentionedUserIds = extractMentionedUserIds(text);
  const timerDecision = evaluateEscalationTimer({
    classification: result.classification,
    slackMessageTs,
    workspaceTargetUserId,
    mentionedUserIds,
    text,
  });

  const timerApplies = timerDecision.timerApplies;
  const finalClassification = timerDecision.classification;
  const finalReasoning = timerDecision.reasoningSuffix
    ? `${result.reasoning || ""}${timerDecision.reasoningSuffix}`.trim()
    : result.reasoning;

  const status = timerApplies ? "pending" : "resolved";

  await connectDB();
  addPerformanceEvent(trackingId, PERF_EVENTS.DB_SAVE_START);

  if (slackMessageTs) {
    const existing = await Alert.findOne({ teamId, slackMessageTs }).lean();
    if (existing) {
      console.log(
        JSON.stringify({
          source: "slack-events",
          action: "duplicate_message_skipped",
          teamId,
          slackMessageTs,
          alertId: String(existing._id),
          status: existing.status,
        })
      );
      return existing;
    }
  }

  const doc = await Alert.create({
    teamId,
    userId,
    userName,
    text,
    displayText,
    classification: finalClassification,
    reasoning: finalReasoning,
    triageSource: persistTriageSource(result.triageSource),
    similarityScores: result.topSimilarityScore,
    slackMessageTs: slackMessageTs || null,
    slackChannelId: slackChannelId || null,
    targetUserId: workspaceTargetUserId || null,
    targetUserName: workspaceTargetUserName || null,
    mentionedUserIds,
    timerTrigger: timerDecision.trigger,
    status,
    timestamp: new Date(),
  });

  const alert = toAlertWireShape(doc, {
    triageDebug: {
      tier: result.triageDebug?.tier ?? null,
      tierLabel: result.triageDebug?.tierLabel || "",
      triageSource: result.triageSource,
      fewShotExampleCount: result.triageDebug?.fewShotExampleCount ?? 0,
      similarityScores: result.triageDebug?.similarityScores ?? null,
      matchedFeedback: result.triageDebug?.matchedFeedback ?? null,
      systemPromptIncludesFewShot: Boolean(
        result.triageDebug?.systemPromptIncludesFewShot
      ),
    },
    eventKind: "alert",
  });
  
  addPerformanceEvent(trackingId, PERF_EVENTS.DB_SAVE_COMPLETE, {
    alertId: doc._id.toString(),
    status,
  });
  
  broadcastAlert(alert);
  addPerformanceEvent(trackingId, PERF_EVENTS.SSE_BROADCAST);

  if (status === "pending" && slackMessageTs) {
    void scheduleEscalation({
      alertId: doc._id,
      teamId,
      channelId: slackChannelId,
      botToken,
    });
  } else if (!workspaceTargetUserId && (result.classification === "Escalate" || hasBroadcastMention(text))) {
    console.warn(
      JSON.stringify({
        source: "slack-events",
        action: "escalation_timer_skipped",
        reason: "No workspace notification target — reconnect workspace via OAuth",
        teamId,
        alertId: String(doc._id),
        slackMessageTs,
      })
    );
  } else if (
    !timerApplies &&
    timerDecision.trigger === "non_target_mention"
  ) {
    console.log(
      JSON.stringify({
        source: "slack-events",
        action: "mention_rerouted_to_log",
        reason: "Message mentions others; workspace notification target not mentioned",
        teamId,
        alertId: String(doc._id),
        slackMessageTs,
        mentionedUserIds,
        workspaceTargetUserId,
      })
    );
  }

  console.log(
    JSON.stringify(
      {
        source: "slack-events",
        teamId,
        userName,
        slackText: text,
        classification: alert.classification,
        reasoning: alert.reasoning,
        timerTrigger: timerDecision.trigger,
        triageSource: result.triageSource,
        textHash: result.textHash,
        similarityScores: result.topSimilarityScore,
        similarityMatches: result.similarityMatches,
        fallback: result.fallback,
        slackMessageTs,
        targetUserId: alert.targetUserId,
        targetUserName: alert.targetUserName,
        mentionedUserIds,
        timerTrigger: timerDecision.trigger,
        status,
      },
      null,
      2
    )
  );
  
  // Complete performance tracking - UI initialization happens via SSE
  completePerformanceTracking(trackingId, PERF_EVENTS.SSE_BROADCAST);
}

export async function GET(request) {
  let heartbeat;
  let unsubscribe;
  let redisUnsubscribe;
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") || null;

  // Touch hub early so POST and GET share the same process-wide emitter.
  getSseHub();

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk) => {
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          return false;
        }
      };

      send(sseEncoder.encode(": connected\n\n"));

      const onAlert = (alert) => {
        if (teamId && alert?.teamId && alert.teamId !== teamId) return;
        const ok = send(sseEncoder.encode(`data: ${JSON.stringify(alert)}\n\n`));
        if (!ok) cleanup();
      };

      // Subscribe to local EventEmitter (backward compatibility)
      unsubscribe = subscribeSse(onAlert);
      
      // Subscribe to Redis pub/sub (distributed events)
      subscribeToEvents(CHANNELS.ALERT, onAlert, { teamId })
        .then((unsub) => {
          redisUnsubscribe = unsub;
        })
        .catch((error) => {
          console.warn("Redis SSE subscription failed:", error?.message);
        });

      heartbeat = setInterval(() => {
        if (!send(sseEncoder.encode(": ping\n\n"))) cleanup();
      }, SSE_HEARTBEAT_MS);

      function cleanup() {
        clearInterval(heartbeat);
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (redisUnsubscribe) {
          try {
            redisUnsubscribe();
            redisUnsubscribe = null;
          } catch (error) {
            console.warn("Redis unsubscribe error:", error?.message);
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
      if (redisUnsubscribe) {
        try {
          redisUnsubscribe();
        } catch (error) {
          console.warn("Redis unsubscribe error in cancel:", error?.message);
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { error: "Slack signing secret is not configured." },
      { status: 500 }
    );
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Unable to read request body." }, { status: 400 });
  }

  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!verifySlackSignature({ signingSecret, signature, timestamp, rawBody })) {
    return NextResponse.json({ error: "Invalid Slack signature." }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Ack Slack immediately so retries do not fan out duplicate events
  // while LLM triage / timers / Twilio still run in the background.
  if (payload.type === "event_callback") {
    const trackingId = `slack-${payload.team_id}-${payload.event?.ts || Date.now()}`;
    addPerformanceEvent(trackingId, PERF_EVENTS.SLACK_ACKED);
    
    void processSlackEventCallback(payload).catch((error) => {
      console.error(
        JSON.stringify({
          source: "slack-events",
          stage: "async_event_callback",
          error: error?.message || "Failed to process Slack event callback",
        })
      );
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

async function processSlackEventCallback(payload) {
  const teamId = payload.team_id || payload.event?.team || null;
  const event = payload.event;
  const eventType = event?.type || null;
  const channelId = event?.channel || event?.item?.channel || null;

  console.log(
    JSON.stringify({
      source: "slack-events",
      action: "event_received",
      teamId,
      eventType,
      channelId,
      userId: event?.user || event?.user_id || null,
      subtype: event?.subtype || null,
      hasBotId: Boolean(event?.bot_id),
    })
  );

  if (!teamId) {
    console.warn(
      JSON.stringify({
        source: "slack-events",
        error: "Missing team_id on event_callback payload",
      })
    );
    return;
  }

  const workspaceActive = await isWorkspaceActiveForEvents(teamId);
  if (!workspaceActive) {
    console.log(
      JSON.stringify({
        source: "slack-events",
        teamId,
        action: "ignored",
        reason: "workspace_inactive_or_missing",
      })
    );
    return;
  }

  const workspace = await resolveWorkspaceForTeam(teamId);
  if (!workspace?.botAccessToken) {
    console.warn(
      JSON.stringify({
        source: "slack-events",
        teamId,
        error:
          "No workspace token — connect workspace via OAuth or set SLACK_BOT_TOKEN + SLACK_DEFAULT_TEAM_ID",
      })
    );
    return;
  }

  if (event?.type === "reaction_added") {
    await handleReactionAdded({ event, teamId: workspace.teamId });
    return;
  }

  if (event?.type !== "message" || event.bot_id) return;

  const subtype = event.subtype || null;
  if (subtype && subtype !== "thread_broadcast" && subtype !== "file_share") {
    return;
  }

  const text = typeof event.text === "string" ? event.text.trim() : "";
  const userId = event.user || event.user_id || "unknown";
  const slackMessageTs = event.ts || null;
  const slackChannelId = event.channel || null;

  if (event.thread_ts) {
    const result = await handleThreadReply({ event, teamId: workspace.teamId });
    if (result?.handled || !text) return;
    await triageSlackMessage({
      userId,
      text,
      event,
      teamId: workspace.teamId,
      botToken: workspace.botAccessToken,
      slackMessageTs,
      slackChannelId,
      workspace,
    });
    return;
  }

  if (!text) return;

  await triageSlackMessage({
    userId,
    text,
    event,
    teamId: workspace.teamId,
    botToken: workspace.botAccessToken,
    slackMessageTs,
    slackChannelId,
    workspace,
  });
}

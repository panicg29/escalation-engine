import { OpenRouter } from "@openrouter/sdk";
import { classifyUrgency, OLLAMA_URGENCY_MODEL } from "@/lib/services/ollamaUrgencyService";

/**
 * Single-switch model control.
 * Change this string (or OPENROUTER_MODEL env var) to move from free tier to paid models.
 */
export const ACTIVE_MODEL = "openai/gpt-4o-mini";
/** Slack urgency classification now runs on local Ollama (sentinel-qwen). */
export const TRIAGE_MODEL = OLLAMA_URGENCY_MODEL;

export const TRIAGE_SYSTEM_PROMPT = `You are the core logic engine of Sentinel, an autonomous workplace notification triage agent. Your sole purpose is to analyze incoming chat messages and determine their operational urgency.

You must classify every incoming message into exactly one of three categories:
1. ESCALATE: Critical infrastructure failures, active blocker bugs, high-priority emergency alerts, or direct, time-sensitive demands from executives/leadership that require immediate human attention.
2. LOG: Routine updates, status check-ins, scheduled deployment reports, or generic product/project updates that should be recorded but require no immediate action.
3. MUTE: Casual office chatter, social banter, memes, non-urgent watercooler conversations, or notifications that can safely be bypassed to prevent fatigue.

Analyze the context, tone, and keywords. Output your decision STRICTLY in the following clean JSON format. Do not include markdown code block formatting (like \`\`\`json), do not include any conversational filler, and do not provide any text outside this JSON object:
{
  "classification": "ESCALATE" | "LOG" | "MUTE",
  "reasoning": "A concise, single-sentence technical justification of why this text matches the classification."
}`;

/**
 * Legacy playground prompt — used by multi-variant analyze flows only.
 */
export const SYSTEM_PROMPT =
  "You are the 'Escalation Engine', an enterprise AI middleware designed to mitigate alert fatigue. Your job is to analyze workplace messages and determine their urgency based on semantic context and the time of day. You must output strictly in JSON format.\nTaxonomy Rules:\n- Score 0-3 (Mute): Informational chatter, resolved issues, casual conversation.\n- Score 4-7 (Log): Actionable but non-critical tasks, minor bugs, routine requests.\n- Score 8-10 (Escalate): Work-stopping blockers, server crashes, VIP client threats.\nOutput Schema: { 'urgencyScore': number, 'actionDecision': 'Escalate' | 'Log' | 'Mute', 'reasoning': 'string', 'trigger_words': ['string'] }";

/**
 * Three evaluation lenses to simulate model variants while keeping architecture stable.
 */
export const ANALYSIS_VARIANTS = [
  {
    label: "Balanced Lens",
    lens: "Balanced weighting of urgency cues, semantics, and tone.",
    model: ACTIVE_MODEL,
  },
  {
    label: "Deadline Lens",
    lens: "Bias toward explicit deadlines, response windows, and time pressure.",
    model: ACTIVE_MODEL,
  },
  {
    label: "Premium Test Lens",
    lens: "Bias toward blocker language, outage risk, and customer impact.",
    model: ACTIVE_MODEL,
  },
];

const MAX_429_RETRIES = Math.max(
  0,
  Number.parseInt(process.env.OPENROUTER_MAX_429_RETRIES || "5", 10) || 5
);
const INITIAL_BACKOFF_MS = Math.max(
  500,
  Number.parseInt(process.env.OPENROUTER_INITIAL_BACKOFF_MS || "2500", 10) ||
    2500
);
const REQUEST_TIMEOUT_MS = 30000;
const BENCHMARK_ACTIONS = ["Escalate", "Log", "Mute"];
const BENCHMARK_INVALID_RESPONSE_RETRIES = 1;
const BENCHMARK_SYSTEM_PROMPT =
  "You are the Escalation Engine. Analyze the workplace message and output strictly in JSON: { 'actionDecision': 'Escalate' | 'Log' | 'Mute' }.";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.openRouterApiKey ||
  process.env.OPEN_ROUTER_API_KEY ||
  "";

/**
 * OpenRouter SDK client using API key from .env.local (OPENROUTER_API_KEY).
 */
const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

/**
 * Clean, typed error wrapper so Next.js routes can decide fallback behavior.
 */
export class AIServiceError extends Error {
  constructor(message, { status = 500, cause = null } = {}) {
    super(message);
    this.name = "AIServiceError";
    this.status = status;
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const WORD_REGEX = /[a-zA-Z0-9][a-zA-Z0-9'-]*/g;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "hey",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "just",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

const CRITICAL_PATTERNS = [
  /work[-\s]?stopping/i,
  /\b(server|service|production|prod)\s+(down|outage|offline)\b/i,
  /\b(outage|incident|sev[ -]?1|p0|critical|blocked|blocker)\b/i,
  /\b(vip|enterprise|major client)\b/i,
  /\b(data loss|security breach|breach)\b/i,
  /\b(can'?t login|cannot login|login failed)\b/i,
  /\b(payment(s)? failed|checkout failed)\b/i,
];

const ACTIONABLE_PATTERNS = [
  /\b(minor bug|bug|ticket|task|request|follow[-\s]?up)\b/i,
  /\b(can you|please|need to|needs to|should)\b/i,
  /\b(today|tomorrow|deadline|eta|review|deploy|update|fix)\b/i,
];

const CASUAL_PATTERNS = [
  /\b(how was your weekend|weekend|good morning|good night)\b/i,
  /\b(hello|hey|hi|thanks|thank you|lol|haha)\b/i,
  /\b(coffee|lunch|dinner|chat)\b/i,
];

const TRIGGER_PATTERNS = [
  /work[-\s]?stopping/gi,
  /\bserver down\b/gi,
  /\boutage\b/gi,
  /\bblocked\b/gi,
  /\bblocker\b/gi,
  /\bincident\b/gi,
  /\bcritical\b/gi,
  /\bsev[ -]?1\b/gi,
  /\bp0\b/gi,
  /\bvip\b/gi,
  /\bdeadline\b/gi,
  /\beta\b/gi,
  /\basap\b/gi,
  /\burgent\b/gi,
  /\bweekend\b/gi,
  /\bminor bug\b/gi,
];

function getErrorStatus(error) {
  return (
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.cause?.statusCode ??
    error?.cause?.status ??
    null
  );
}

function extractErrorMessage(error) {
  const fromTypedError = error?.error?.message;
  if (typeof fromTypedError === "string" && fromTypedError.trim()) {
    return fromTypedError.trim();
  }

  const body = error?.body;
  if (typeof body === "string" && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      const nested =
        parsed?.error?.message || parsed?.message || parsed?.detail || null;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    } catch {
      // Ignore JSON parse failure and continue fallback chain.
    }
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown upstream error.";
}

function is429Error(error) {
  const status = getErrorStatus(error);
  if (status === 429 || status === "429") return true;
  return /too many requests|rate limit|429/i.test(error?.message || "");
}

function is404Error(error) {
  const status = getErrorStatus(error);
  if (status === 404 || status === "404") return true;
  return /not found|404/i.test(extractErrorMessage(error));
}

function clampUrgencyScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(10, Math.max(0, Math.round(parsed)));
}

function actionFromScore(score) {
  if (score >= 8) return "Escalate";
  if (score >= 4) return "Log";
  return "Mute";
}

function normalizeAction(action, score) {
  const allowed = ["Escalate", "Log", "Mute"];
  const provided = typeof action === "string" ? action.trim() : "";
  const safeAction = allowed.includes(provided)
    ? provided
    : actionFromScore(score);

  // Taxonomy is strict: score band must match decision.
  return actionFromScore(score) === safeAction ? safeAction : actionFromScore(score);
}

function tokenizeMessage(message) {
  return (message.toLowerCase().match(WORD_REGEX) || []).map((t) => t.trim());
}

function uniqueLimit(values, limit = 8) {
  const deduped = [];
  const seen = new Set();
  for (const item of values) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function deriveTriggerWords(message) {
  const foundPhrases = [];
  for (const pattern of TRIGGER_PATTERNS) {
    const matches = message.match(pattern);
    if (!matches) continue;
    for (const match of matches) foundPhrases.push(match.trim());
  }

  const informativeTokens = tokenizeMessage(message)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .slice(0, 8);

  const merged = uniqueLimit([...foundPhrases, ...informativeTokens], 8);
  return merged.length > 0 ? merged : ["general context"];
}

function normalizeTriggerWords(value, message) {
  const fromModel = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  const normalized = uniqueLimit(fromModel, 8);
  if (normalized.length > 0) return normalized;
  return deriveTriggerWords(message);
}

function inferFromMessage({ message, time }) {
  const text = message.toLowerCase();
  const isCritical = CRITICAL_PATTERNS.some((p) => p.test(text));
  const isActionable = ACTIONABLE_PATTERNS.some((p) => p.test(text));
  const isCasual = CASUAL_PATTERNS.some((p) => p.test(text));
  const afterHours = /after hours|weekend/i.test(time || "");

  let urgencyScore = 3;
  if (isCritical) urgencyScore = afterHours ? 10 : 9;
  else if (isActionable) urgencyScore = afterHours ? 6 : 5;
  else if (isCasual) urgencyScore = 1;

  const actionDecision = actionFromScore(urgencyScore);
  const triggerWords = deriveTriggerWords(message);

  let reasoning;
  if (isCritical) {
    reasoning = `Detected blocker-level language and operational risk${afterHours ? " during off-hours" : ""}, so immediate escalation is warranted.`;
  } else if (isActionable) {
    reasoning = "Message appears actionable but not work-stopping, so it should be logged for follow-up.";
  } else if (isCasual) {
    reasoning = "Message appears conversational/informational without operational impact, so muting is appropriate.";
  } else {
    reasoning = "No strong urgency indicators were found; applying low-priority default classification.";
  }

  return { urgencyScore, actionDecision, trigger_words: triggerWords, reasoning };
}

function extractAssistantText(chatResult) {
  const content = chatResult?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        if (part && typeof part.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (content && typeof content === "object") return JSON.stringify(content);
  if (content == null) return "";
  return String(content);
}

function parseModelJson(rawText) {
  const raw = (rawText || "").trim();
  if (!raw) return null;

  const attempts = [];
  attempts.push(raw);
  attempts.push(raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(raw.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of attempts) {
    if (!candidate) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try loose JSON normalization for common single-quote and trailing-comma cases.
      const loosened = candidate
        .replace(/([{,]\s*)'([^'"]+?)'(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^'"]*?)'(\s*[},])/g, ': "$1"$2')
        .replace(/,\s*([}\]])/g, "$1");

      try {
        const parsed = JSON.parse(loosened);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Keep trying the next candidate.
      }
    }
  }

  return null;
}

function normalizeBenchmarkAction(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("escalate")) return "Escalate";
  if (normalized.includes("log")) return "Log";
  if (normalized.includes("mute")) return "Mute";

  return null;
}

function extractBenchmarkActionFromRaw(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return null;
  const match = rawText.match(/\b(Escalate|Log|Mute)\b/i);
  if (!match) return null;
  return normalizeBenchmarkAction(match[1]);
}

function normalizeTriageClassification(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "ESCALATE" || normalized.includes("ESCALATE")) return "Escalate";
  if (normalized === "LOG" || normalized.includes("LOG")) return "Log";
  if (normalized === "MUTE" || normalized.includes("MUTE")) return "Mute";
  return normalizeBenchmarkAction(value);
}

function buildTriageMessages({
  message,
  timeContext,
  retry = false,
  lastRaw = "",
  systemPrompt = TRIAGE_SYSTEM_PROMPT,
}) {
  const userContent = [
    timeContext ? `Time Context: ${timeContext}` : null,
    `Message: """${message.trim()}"""`,
    'Return ONLY raw JSON: {"classification":"ESCALATE"|"LOG"|"MUTE","reasoning":"..."}',
  ]
    .filter(Boolean)
    .join("\n");

  if (!retry) {
    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
    { role: "assistant", content: lastRaw || '{"classification":"","reasoning":""}' },
    {
      role: "user",
      content:
        'Invalid output. Reply with ONLY raw JSON: {"classification":"ESCALATE"|"LOG"|"MUTE","reasoning":"one sentence"}',
    },
  ];
}

export function getTriageRequestPayload(
  message,
  timeContext = "",
  systemPrompt = TRIAGE_SYSTEM_PROMPT
) {
  return {
    model: TRIAGE_MODEL,
    messages: buildTriageMessages({
      message: message.trim(),
      timeContext,
      systemPrompt,
    }),
  };
}

function buildBenchmarkMessages({ question, timeContext, retry = false, lastRaw = "" }) {
  const baseUserLines = [
    `Time Context: ${String(timeContext || "").trim() || "Unknown"}`,
    `Message: """${question.trim()}"""`,
    'Return EXACTLY one JSON object with one key: {"actionDecision":"Escalate"|"Log"|"Mute"}.',
    "Do not include explanations, markdown, or extra keys.",
  ];

  if (!retry) {
    return [
      { role: "system", content: BENCHMARK_SYSTEM_PROMPT },
      { role: "user", content: baseUserLines.join("\n") },
    ];
  }

  return [
    { role: "system", content: BENCHMARK_SYSTEM_PROMPT },
    { role: "user", content: baseUserLines.join("\n") },
    {
      role: "assistant",
      content: lastRaw || '{"actionDecision":""}',
    },
    {
      role: "user",
      content:
        'Your last output was invalid. Reply with ONLY one of: {"actionDecision":"Escalate"} or {"actionDecision":"Log"} or {"actionDecision":"Mute"}',
    },
  ];
}

function buildUserPrompt({ message, time, variantLens }) {
  return [
    `Analyze the workplace message and time context.`,
    `Time Context: ${time}`,
    `Variant Lens: ${variantLens}`,
    `Message: """${message.trim()}"""`,
    `Return ONLY valid JSON that matches the system schema.`,
    `Use DOUBLE quotes for all keys and string values.`,
    `Do not include markdown, code fences, or commentary.`,
  ].join("\n");
}

async function sendWith429Backoff({ messages, model }) {
  if (!OPENROUTER_API_KEY) {
    throw new AIServiceError(
      "Missing OpenRouter API key. Add OPENROUTER_API_KEY (or openRouterApiKey) in .env.local before calling /api/analyze.",
      { status: 401 }
    );
  }

  let attempt = 0;
  let delayMs = INITIAL_BACKOFF_MS;

  // Initial attempt + up to MAX_429_RETRIES retry attempts on 429.
  while (true) {
    try {
      return await openrouter.chat.send(
        {
          chatRequest: {
            model,
            temperature: 0.2,
            responseFormat: { type: "json_object" },
            messages,
          },
        },
        {
          timeoutMs: REQUEST_TIMEOUT_MS,
          retryCodes: ["5XX"],
        }
      );
    } catch (error) {
      if (is429Error(error) && attempt < MAX_429_RETRIES) {
        await sleep(delayMs);
        attempt += 1;
        delayMs *= 2;
        continue;
      }

      if (is429Error(error)) {
        const details = extractErrorMessage(error);
        throw new AIServiceError(
          `OpenRouter rate limit exceeded after ${MAX_429_RETRIES} retries. ${details}`,
          { status: 429, cause: error }
        );
      }

      const details = extractErrorMessage(error);
      throw new AIServiceError("OpenRouter chat request failed.", {
        status: getErrorStatus(error) || 500,
        cause: {
          original: error,
          details,
          model,
        },
      });
    }
  }
}

async function sendWithModelFallback({
  messages,
  preferredModel = ACTIVE_MODEL,
}) {
  const model = preferredModel === TRIAGE_MODEL ? TRIAGE_MODEL : preferredModel;

  try {
    const completion = await sendWith429Backoff({ messages, model });
    return { completion, requestedModel: model };
  } catch (error) {
    const details = extractErrorMessage(error?.cause?.original || error);
    throw new AIServiceError(
      `OpenRouter chat request failed for model "${model}". ${details}`,
      {
        status: getErrorStatus(error) || 500,
        cause: error,
      }
    );
  }
}

function normalizeAnalysisPayload({
  rawPayload,
  message,
  time,
  variantLabel,
  resolvedModelId,
}) {
  const inferred = inferFromMessage({ message, time });
  const urgencyScore = clampUrgencyScore(
    rawPayload?.urgencyScore ?? inferred.urgencyScore
  );
  const actionDecision = normalizeAction(
    rawPayload?.actionDecision ?? inferred.actionDecision,
    urgencyScore
  );
  const triggerWords = normalizeTriggerWords(
    rawPayload?.trigger_words,
    message
  );
  const reasoning =
    typeof rawPayload?.reasoning === "string" && rawPayload.reasoning.trim()
      ? rawPayload.reasoning.trim()
      : inferred.reasoning;

  return {
    modelName: variantLabel,
    modelId: resolvedModelId || ACTIVE_MODEL,
    urgencyScore,
    actionDecision,
    reasoning,
    trigger_words: triggerWords,
    processingLatencyMs: null,
  };
}

/**
 * Analyze one variant invocation. Route layer can fan this out with Promise.all.
 */
export async function analyzeMessageVariant({
  message,
  time,
  variantLabel = "OpenRouter Variant",
  variantLens = "Balanced urgency scoring",
  modelOverride,
}) {
  const startedAt = Date.now();
  const targetModel =
    typeof modelOverride === "string" && modelOverride.trim()
      ? modelOverride.trim()
      : ACTIVE_MODEL;

  const { completion, requestedModel } = await sendWithModelFallback({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildUserPrompt({ message, time, variantLens }),
      },
    ],
    preferredModel: targetModel,
  });

  const assistantText = extractAssistantText(completion);
  const parsedJson = parseModelJson(assistantText);

  const normalized = normalizeAnalysisPayload({
    rawPayload: parsedJson || {},
    message,
    time,
    variantLabel,
    resolvedModelId: completion?.model || requestedModel || targetModel,
  });

  return {
    ...normalized,
    processingLatencyMs: Date.now() - startedAt,
  };
}

/**
 * Fallback result object that preserves current frontend schema.
 */
export function buildFallbackVariantResult({ variantLabel, reason, modelId }) {
  return {
    modelName: variantLabel,
    modelId: modelId || ACTIVE_MODEL,
    urgencyScore: 5,
    actionDecision: "Log",
    reasoning: reason || "Fallback response due to upstream model failure.",
    trigger_words: ["fallback"],
    processingLatencyMs: null,
    error: true,
  };
}

/**
 * Compatibility helper used by existing bulk API route.
 */
export async function analyzeMessage({ message, time }) {
  const tasks = ANALYSIS_VARIANTS.map((variant) =>
    analyzeMessageVariant({
      message,
      time,
      variantLabel: variant.label,
      variantLens: variant.lens,
      modelOverride: variant.model,
    }).catch((error) =>
      buildFallbackVariantResult({
        variantLabel: variant.label,
        reason: error?.message || "Model call failed; returning fallback.",
        modelId: variant.model || ACTIVE_MODEL,
      })
    )
  );

  const results = await Promise.all(tasks);
  const fallback = results.some((item) => item.error);
  return { results, fallback };
}

/**
 * Production Slack triage — local Ollama fine-tune (sentinel-qwen).
 * Model returns HIGH/LOW; mapped to Escalate/Mute for the existing pipeline.
 * Benchmark / analyze playground paths remain on OpenRouter (untouched).
 * @param {string} message
 * @param {string} [timeContext]
 * @param {{ systemPrompt?: string, fewShotExamples?: Array }} [options]
 */
export async function triageMessage(message, timeContext = "", options = {}) {
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new AIServiceError("Message is required for triage.", { status: 400 });
  }

  const question = message.trim();
  const fewShotExamples = Array.isArray(options.fewShotExamples)
    ? options.fewShotExamples
    : [];

  try {
    const { urgency, usedFewShot } = await classifyUrgency(question, {
      fewShotExamples,
    });
    const classification = urgency === "HIGH" ? "Escalate" : "Mute";

    return {
      classification,
      actionDecision: classification,
      urgency,
      reasoning:
        urgency === "HIGH"
          ? usedFewShot
            ? "Local Sentinel model classified HIGH, guided by similar past feedback."
            : "Local Sentinel model classified urgency as HIGH."
          : usedFewShot
            ? "Local Sentinel model classified LOW, guided by similar past feedback."
            : "Local Sentinel model classified urgency as LOW.",
      raw: { urgency, usedFewShot: Boolean(usedFewShot) },
      modelId: TRIAGE_MODEL,
    };
  } catch {
    const inferred = inferFromMessage({ message: question, time: timeContext });
    return {
      classification: inferred.actionDecision,
      actionDecision: inferred.actionDecision,
      reasoning: `Local Ollama urgency request failed; heuristic fallback: ${inferred.reasoning}`,
      raw: null,
      modelId: TRIAGE_MODEL,
      fallback: true,
    };
  }
}

/**
 * Benchmark helper used by /api/benchmark for strict action-only classification.
 */
export async function evaluateMessage(question, modelString, timeContext = "") {
  if (!question || typeof question !== "string" || !question.trim()) {
    throw new AIServiceError("Question is required for benchmark evaluation.", {
      status: 400,
    });
  }

  if (!modelString || typeof modelString !== "string" || !modelString.trim()) {
    throw new AIServiceError("A valid OpenRouter model string is required.", {
      status: 400,
    });
  }

  const model = modelString.trim() === TRIAGE_MODEL ? TRIAGE_MODEL : modelString.trim();

  let lastRawText = "";

  for (let attempt = 0; attempt <= BENCHMARK_INVALID_RESPONSE_RETRIES; attempt += 1) {
    const completion = await sendWith429Backoff({
      model,
      messages: buildBenchmarkMessages({
        question,
        timeContext,
        retry: attempt > 0,
        lastRaw: lastRawText,
      }),
    });

    const rawText = extractAssistantText(completion);
    lastRawText = rawText;
    const parsed = parseModelJson(rawText);
    const normalizedAction =
      normalizeBenchmarkAction(parsed?.actionDecision) ||
      extractBenchmarkActionFromRaw(rawText);

    if (normalizedAction && BENCHMARK_ACTIONS.includes(normalizedAction)) {
      return {
        actionDecision: normalizedAction,
        raw: parsed,
        modelId: completion?.model || modelString,
      };
    }
  }

  const details = lastRawText?.slice(0, 250) || "No model content returned.";
  throw new AIServiceError(
    `Invalid benchmark response format from model "${modelString}".`,
    {
      status: 502,
      cause: { details },
    }
  );
}

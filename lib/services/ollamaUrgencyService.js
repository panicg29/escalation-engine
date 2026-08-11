import OpenAI from "openai";

export const OLLAMA_URGENCY_MODEL = "sentinel-qwen";
export const OLLAMA_BASE_URL = "http://localhost:11434/v1";

const ollama = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama",
});

function overrideToUrgency(override) {
  return override === "Escalate" ? "HIGH" : "LOW";
}

function escapeFewShotText(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim()
    .slice(0, 280);
}

/**
 * Optional few-shot block from prior human feedback (semantic path).
 * Maps Escalate/Log/Mute → HIGH/LOW so the fine-tuned model stays on-contract.
 */
function buildFewShotSystemSuffix(fewShotExamples = []) {
  if (!Array.isArray(fewShotExamples) || fewShotExamples.length === 0) return "";

  const lines = fewShotExamples.map((ex, index) => {
    const urgency = overrideToUrgency(ex.userOverride);
    const message = escapeFewShotText(ex.originalText);
    const reason = escapeFewShotText(ex.userReasoning || "Prior human correction.");
    return `Example ${index + 1}: "${message}" → ${urgency} (${reason})`;
  });

  return [
    "",
    "CRITICAL — historical human corrections for similar messages:",
    ...lines,
    "These corrections override your default instincts when the current message is similar.",
    "If Example N matches the current intent, output that same HIGH or LOW label.",
    "Reply with only HIGH or LOW.",
  ].join("\n");
}

function buildChatMlPrompt(message, { fewShotExamples = [] } = {}) {
  const system =
    "You are Sentinel AI. Classify the urgency of the Slack message as HIGH or LOW." +
    buildFewShotSystemSuffix(fewShotExamples);

  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${message}<|im_end|>\n<|im_start|>assistant\n`;
}

/**
 * Normalize model output into the strict Gazi UI contract.
 * @returns {"HIGH" | "LOW" | null}
 */
export function parseUrgencyLabel(raw) {
  if (raw == null) return null;

  if (typeof raw === "object") {
    const value = raw.urgency ?? raw.classification ?? raw.label;
    return parseUrgencyLabel(value);
  }

  const text = String(raw).trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parseUrgencyLabel(parsed);
    }
  } catch {
    /* plain-text model output */
  }

  const upper = text.toUpperCase();
  if (/\bHIGH\b/.test(upper)) return "HIGH";
  if (/\bLOW\b/.test(upper)) return "LOW";
  return null;
}

/**
 * Classify Slack message urgency via local fine-tuned Ollama model.
 * Always returns `{ urgency: "HIGH" | "LOW" }` for frontend contract stability.
 * @param {string} message
 * @param {{ fewShotExamples?: Array<{ originalText?: string, userOverride?: string, userReasoning?: string }> }} [options]
 */
export async function classifyUrgency(message, options = {}) {
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message is required for urgency classification.");
  }

  const fewShotExamples = Array.isArray(options.fewShotExamples)
    ? options.fewShotExamples.slice(0, 3)
    : [];
  const prompt = buildChatMlPrompt(message.trim(), { fewShotExamples });

  const completion = await ollama.chat.completions.create({
    model: OLLAMA_URGENCY_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 10,
  });

  const rawText = completion?.choices?.[0]?.message?.content ?? "";
  const urgency = parseUrgencyLabel(rawText);

  if (urgency !== "HIGH" && urgency !== "LOW") {
    throw new Error(
      `Invalid urgency response from ${OLLAMA_URGENCY_MODEL}: ${String(rawText).slice(0, 120)}`
    );
  }

  return { urgency, usedFewShot: fewShotExamples.length > 0 };
}

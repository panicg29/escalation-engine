import crypto from "node:crypto";

export function canonicalizeFeedbackText(text) {
  if (typeof text !== "string") return "";

  return text
    .replace(/<@([A-Z0-9]+)\|([^>]+)>/gi, "@$2")
    .replace(/<@[A-Z0-9]+>/gi, "@user")
    .replace(/<!subteam\^[^>|]+(?:\|([^>]+))?>/gi, (_, name) =>
      name ? `@${name}` : "@group"
    )
    .replace(/<!here(?:\|[^>]+)?>/gi, "@here")
    .replace(/<!channel(?:\|[^>]+)?>/gi, "@channel")
    .replace(/<!everyone(?:\|[^>]+)?>/gi, "@everyone")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>\s]+)>/g, "$1");
}

export function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeForFeedback(text) {
  return normalizeText(canonicalizeFeedbackText(text));
}

/** Expands common engineering shorthand before embedding (semantic matching only). */
function expandAbbreviations(text) {
  return text
    .replace(/\bprod\b/g, "production")
    .replace(/\bdb\b/g, "database");
}

export function normalizeForEmbedding(text) {
  return expandAbbreviations(normalizeForFeedback(text));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashText(text) {
  return sha256(normalizeForFeedback(text));
}

export function hashTextLegacy(text) {
  return sha256(normalizeText(text));
}

/**
 * Token Jaccard on canonicalized text.
 */
export function lexicalOverlapScore(a, b) {
  const { left, right, intersection } = tokenSets(a, b);
  if (!left.size || !right.size) return 0;
  return intersection / (left.size + right.size - intersection);
}

function tokenSets(a, b) {
  const tokensOf = (value) =>
    new Set(
      normalizeForFeedback(value)
        .split(" ")
        .map((part) => part.replace(/[^\p{L}\p{N}]+/gu, ""))
        .filter((part) => part.length > 1)
    );
  const left = tokensOf(a);
  const right = tokensOf(b);
  let intersection = 0;
  if (left.size && right.size) {
    for (const token of left) {
      if (right.has(token)) intersection += 1;
    }
  }
  return { left, right, intersection };
}

function diceTokenScore(a, b) {
  const { left, right, intersection } = tokenSets(a, b);
  if (!left.size || !right.size) return 0;
  return (2 * intersection) / (left.size + right.size);
}

function levenshteinRatio(a, b) {
  const left = normalizeForFeedback(a);
  const right = normalizeForFeedback(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  const prev = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = prev[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + cost);
      last = next;
    }
  }
  return 1 - prev[right.length] / maxLen;
}

/**
 * How close two messages are, ignoring word order (opening vs closing).
 * Dice/Jaccard/edit distance treat "file" vs "doc" in the same request as similar.
 */
export function feedbackMatchScore(a, b) {
  return Math.max(lexicalOverlapScore(a, b), diceTokenScore(a, b), levenshteinRatio(a, b));
}

export function feedbackHashCandidates(text) {
  const canonical = hashText(text);
  const legacy = hashTextLegacy(text);
  return canonical === legacy ? [canonical] : [canonical, legacy];
}

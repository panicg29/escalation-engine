import crypto from "node:crypto";

export function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Expands common engineering shorthand before embedding (semantic matching only). */
function expandAbbreviations(text) {
  return text
    .replace(/\bprod\b/g, "production")
    .replace(/\bdb\b/g, "database");
}

export function normalizeForEmbedding(text) {
  return expandAbbreviations(normalizeText(text));
}

export function hashText(text) {
  const normalized = normalizeText(text);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

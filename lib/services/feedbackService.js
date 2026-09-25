import { connectDB } from "@/lib/db";
import Feedback from "@/lib/models/Feedback";
import { TRIAGE_SYSTEM_PROMPT } from "@/lib/services/aiService";
import { generateEmbedding } from "@/lib/services/embeddingService";
import {
  feedbackHashCandidates,
  hashText,
  feedbackMatchScore,
  normalizeForEmbedding,
  normalizeForFeedback,
} from "@/lib/services/textNormalize";

const SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.FEW_SHOT_SIMILARITY_THRESHOLD || "0.55"
);
const FEW_SHOT_TOP_K = Number.parseInt(process.env.FEW_SHOT_TOP_K || "10", 10) || 10;
const LEXICAL_OVERRIDE_THRESHOLD = Math.min(
  0.99,
  Math.max(
    0.5,
    Number.parseFloat(process.env.LEXICAL_OVERRIDE_THRESHOLD || "0.70") || 0.7
  )
);

const CLASSIFICATIONS = ["Escalate", "Log", "Mute"];

export function normalizeOverride(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const match = CLASSIFICATIONS.find((c) => c.toLowerCase() === normalized.toLowerCase());
  return match || null;
}

function requireTeamId(teamId) {
  if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
    throw new Error("teamId is required for workspace-scoped feedback.");
  }
  return teamId.trim();
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < n; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function escapePromptText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

export function buildFewShotBlock(examples) {
  if (!examples?.length) return "";

  const lines = examples.map((ex, index) => {
    const label = ex.userOverride?.toUpperCase() || "MUTE";
    const message = escapePromptText(ex.originalText);
    const reason = escapePromptText(ex.userReasoning || "No reasoning provided.");
    return [
      `Example ${index + 1}:`,
      `- Message: "${message}"`,
      `- Correct classification: ${label}`,
      `- User reasoning: "${reason}"`,
    ].join("\n");
  });

  return [
    "",
    "[HISTORICAL USER CORRECTIONS / EXAMPLES]",
    "The following are real past messages and the classifications users explicitly chose. Use them as authoritative guidance when the current message is semantically similar.",
    "",
    ...lines,
    "",
    "Evaluate the current message consistently with these examples when applicable.",
  ].join("\n");
}

export function buildDynamicSystemPrompt(examples, basePrompt = TRIAGE_SYSTEM_PROMPT) {
  const block = buildFewShotBlock(examples);
  if (!block) return basePrompt;
  return `${basePrompt}${block}`;
}

async function embedFeedbackText(text) {
  try {
    const embedding = await generateEmbedding(normalizeForEmbedding(text));
    return Array.isArray(embedding) ? embedding : [];
  } catch (error) {
    console.warn(
      JSON.stringify({
        source: "feedback-service",
        stage: "embedding",
        error: error?.message || "Embedding failed; saving exact-match only",
      })
    );
    return [];
  }
}

export async function saveFeedback({
  teamId,
  originalText,
  userOverride,
  userReasoning,
  sourceAlertId,
}) {
  const scopedTeamId = requireTeamId(teamId);
  const override = normalizeOverride(userOverride);
  if (!override) {
    throw new Error("userOverride must be Escalate, Log, or Mute.");
  }

  const text = typeof originalText === "string" ? originalText.trim() : "";
  if (!text) {
    throw new Error("originalText is required.");
  }

  const textHash = hashText(text);
  const hashes = feedbackHashCandidates(text);
  const embedding = await embedFeedbackText(text);

  await connectDB();

  const existing = await Feedback.findOne({
    teamId: scopedTeamId,
    textHash: { $in: hashes },
  });

  const payload = {
    teamId: scopedTeamId,
    textHash,
    originalText: text,
    userOverride: override,
    userReasoning: typeof userReasoning === "string" ? userReasoning.trim() : "",
    timestamp: new Date(),
    sourceAlertId: sourceAlertId || "",
  };
  if (embedding.length) {
    payload.embedding = embedding;
  } else if (!existing) {
    payload.embedding = [];
  }

  if (existing) {
    return Feedback.findOneAndUpdate(
      { _id: existing._id },
      payload,
      { new: true }
    );
  }

  return Feedback.create(payload);
}

export function toFeedbackWireShape(doc) {
  const id = doc._id ? doc._id.toString() : doc.id;
  return {
    id,
    teamId: doc.teamId || null,
    textHash: doc.textHash,
    originalText: doc.originalText,
    userOverride: doc.userOverride,
    userReasoning: doc.userReasoning || "",
    timestamp:
      doc.timestamp instanceof Date ? doc.timestamp.toISOString() : doc.timestamp,
    sourceAlertId: doc.sourceAlertId || "",
    embeddingDimensions: Array.isArray(doc.embedding) ? doc.embedding.length : 0,
  };
}

export async function listFeedback(teamId, { page = 1, limit = 20, userOverride = null } = {}) {
  const scopedTeamId = requireTeamId(teamId);
  await connectDB();

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
  const skip = (safePage - 1) * safeLimit;

  const query = { teamId: scopedTeamId };
  const override = userOverride ? normalizeOverride(userOverride) : null;
  if (override) {
    query.userOverride = override;
  }

  const [docs, filteredTotal, counts] = await Promise.all([
    Feedback.find(query).sort({ timestamp: -1 }).skip(skip).limit(safeLimit).lean(),
    Feedback.countDocuments(query),
    buildFeedbackCounts(scopedTeamId),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / safeLimit));

  return {
    feedback: docs.map(toFeedbackWireShape),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: filteredTotal,
      totalPages,
      hasMore: safePage < totalPages,
    },
    counts,
  };
}

async function buildFeedbackCounts(teamId) {
  const [agg, total, embedded] = await Promise.all([
    Feedback.aggregate([
      { $match: { teamId } },
      { $group: { _id: "$userOverride", count: { $sum: 1 } } },
    ]),
    Feedback.countDocuments({ teamId }),
    Feedback.countDocuments({
      teamId,
      embedding: { $exists: true, $not: { $size: 0 } },
    }),
  ]);

  const counts = { all: total, Escalate: 0, Log: 0, Mute: 0, embedded };
  for (const row of agg) {
    if (row._id && counts[row._id] !== undefined) {
      counts[row._id] = row.count;
    }
  }
  return counts;
}

export async function clearFeedbackForTeam(teamId) {
  const scopedTeamId = requireTeamId(teamId);
  await connectDB();
  const result = await Feedback.deleteMany({ teamId: scopedTeamId });
  return result.deletedCount;
}

export async function updateFeedbackById(
  id,
  { teamId, originalText, userOverride, userReasoning }
) {
  const scopedTeamId = requireTeamId(teamId);
  await connectDB();
  const existing = await Feedback.findOne({ _id: id, teamId: scopedTeamId });
  if (!existing) {
    throw new Error("Feedback not found.");
  }

  const text =
    typeof originalText === "string" && originalText.trim()
      ? originalText.trim()
      : existing.originalText;
  const override = userOverride
    ? normalizeOverride(userOverride)
    : existing.userOverride;
  if (!override) {
    throw new Error("userOverride must be Escalate, Log, or Mute.");
  }

  const reasoning =
    typeof userReasoning === "string"
      ? userReasoning.trim()
      : existing.userReasoning || "";

  const newHash = hashText(text);
  const hashes = feedbackHashCandidates(text);
  const textChanged = newHash !== existing.textHash || text !== existing.originalText;

  if (textChanged) {
    const conflict = await Feedback.findOne({
      teamId: scopedTeamId,
      textHash: { $in: hashes },
      _id: { $ne: existing._id },
    });
    if (conflict) {
      throw new Error("Another correction already exists for this message text.");
    }

    const embedding = await embedFeedbackText(text);
    const payload = {
      textHash: newHash,
      originalText: text,
      userOverride: override,
      userReasoning: reasoning,
      timestamp: new Date(),
    };
    if (embedding.length) payload.embedding = embedding;
    else payload.embedding = [];

    const updated = await Feedback.findOneAndUpdate(
      { _id: id, teamId: scopedTeamId },
      payload,
      { new: true }
    );
    return toFeedbackWireShape(updated);
  }

  const updated = await Feedback.findOneAndUpdate(
    { _id: id, teamId: scopedTeamId },
    {
      userOverride: override,
      userReasoning: reasoning,
      timestamp: new Date(),
    },
    { new: true }
  );
  return toFeedbackWireShape(updated);
}

export async function deleteFeedbackById(id, teamId) {
  const scopedTeamId = requireTeamId(teamId);
  await connectDB();
  const deleted = await Feedback.findOneAndDelete({ _id: id, teamId: scopedTeamId });
  if (!deleted) {
    throw new Error("Feedback not found.");
  }
  return toFeedbackWireShape(deleted);
}

export async function findExactFeedback(text, teamId) {
  const scopedTeamId = requireTeamId(teamId);
  const hashes = feedbackHashCandidates(text);
  await connectDB();
  const matches = await Feedback.find({
    teamId: scopedTeamId,
    textHash: { $in: hashes },
  })
    .sort({ timestamp: -1 })
    .lean();

  if (matches.length) {
    const canonical = hashText(text);
    return matches.find((doc) => doc.textHash === canonical) || matches[0];
  }

  const needle = normalizeForFeedback(text);
  if (!needle) return null;

  const recent = await Feedback.find({ teamId: scopedTeamId })
    .sort({ timestamp: -1 })
    .limit(200)
    .select("textHash originalText userOverride userReasoning timestamp")
    .lean();

  return (
    recent.find((doc) => normalizeForFeedback(doc.originalText) === needle) ||
    null
  );
}

/**
 * Near-paraphrase of a stored correction (one/few words swapped).
 * Returns the best Jaccard match at or above LEXICAL_OVERRIDE_THRESHOLD.
 */
export async function findNearDuplicateFeedback(text, teamId) {
  const scopedTeamId = requireTeamId(teamId);
  const needle = normalizeForFeedback(text);
  if (!needle) return null;

  await connectDB();
  const recent = await Feedback.find({ teamId: scopedTeamId })
    .sort({ timestamp: -1 })
    .limit(200)
    .select("textHash originalText userOverride userReasoning timestamp")
    .lean();

  let best = null;
  let bestScore = 0;
  for (const doc of recent) {
    const score = feedbackMatchScore(needle, doc.originalText);
    if (score > bestScore) {
      best = doc;
      bestScore = score;
    }
  }

  if (!best) return null;
  return {
    ...best,
    similarity: bestScore,
    matchKind: "lexical",
    belowThreshold: bestScore < LEXICAL_OVERRIDE_THRESHOLD,
  };
}

export async function findSimilarFeedback(
  embedding,
  teamId,
  { topK = FEW_SHOT_TOP_K, minScore = 0 } = {}
) {
  if (!embedding?.length) return [];
  const scopedTeamId = requireTeamId(teamId);

  await connectDB();
  
  // Try Atlas Vector Search first (requires vector index on embedding field)
  const useVectorSearch = process.env.MONGODB_VECTOR_SEARCH_ENABLED === "true";
  
  if (useVectorSearch) {
    try {
      const vectorResults = await findSimilarFeedbackWithVectorSearch(
        embedding, 
        scopedTeamId, 
        { topK, minScore }
      );
      return vectorResults;
    } catch (error) {
      console.warn(
        JSON.stringify({
          source: "feedback-service",
          stage: "vector-search", 
          teamId: scopedTeamId,
          error: error?.message || "Vector search failed, falling back to JS similarity",
          fallback: "javascript-similarity"
        })
      );
      // Fall through to JavaScript similarity search
    }
  }

  // Fallback to JavaScript similarity computation (original method)
  // Cap candidate set so Slack triage stays fast as feedback grows.
  const candidateLimit =
    Number.parseInt(process.env.FEW_SHOT_CANDIDATE_LIMIT || "150", 10) || 150;

  const docs = await Feedback.find({
    teamId: scopedTeamId,
    embedding: { $exists: true, $not: { $size: 0 } },
  })
    .select("textHash originalText userOverride userReasoning embedding")
    .sort({ timestamp: -1 })
    .limit(candidateLimit)
    .lean();

  const scored = docs
    .map((doc) => ({
      ...doc,
      similarity: cosineSimilarity(embedding, doc.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .filter((doc) => doc.similarity >= minScore);

  return scored;
}

/**
 * MongoDB Atlas Vector Search implementation using $vectorSearch aggregation.
 * Requires a vector search index named "embedding_vector_index" on the embedding field.
 * 
 * To create the index in MongoDB Atlas:
 * 1. Go to Atlas UI -> Database -> Search -> Create Search Index
 * 2. Choose "Vector Search" -> Select your collection (feedback)  
 * 3. Use this JSON configuration:
 * {
 *   "fields": [
 *     {
 *       "type": "vector",
 *       "path": "embedding", 
 *       "numDimensions": 1536,
 *       "similarity": "cosine"
 *     },
 *     {
 *       "type": "filter",
 *       "path": "teamId"
 *     }
 *   ]
 * }
 * 4. Name the index "embedding_vector_index"
 */
async function findSimilarFeedbackWithVectorSearch(
  embedding, 
  teamId, 
  { topK = FEW_SHOT_TOP_K, minScore = SIMILARITY_THRESHOLD } = {}
) {
  const pipeline = [
    {
      $vectorSearch: {
        index: "embedding_vector_index", // This index needs to be created in Atlas
        path: "embedding",
        queryVector: embedding,
        numCandidates: Math.max(topK * 10, 100), // Overrequest for better recall
        limit: topK * 2, // Get more results to filter by score
        filter: {
          teamId: { $eq: teamId }
        }
      }
    },
    {
      $addFields: {
        similarity: { $meta: "vectorSearchScore" }
      }
    },
    {
      $match: {
        similarity: { $gte: minScore }
      }
    },
    {
      $sort: { similarity: -1 }
    },
    {
      $limit: topK
    }
  ];

  const results = await Feedback.aggregate(pipeline);
  return results;
}

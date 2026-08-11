import { connectDB } from "@/lib/db";
import Feedback from "@/lib/models/Feedback";
import { TRIAGE_SYSTEM_PROMPT } from "@/lib/services/aiService";
import { generateEmbedding } from "@/lib/services/embeddingService";
import { hashText, normalizeForEmbedding } from "@/lib/services/textNormalize";

const SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.FEW_SHOT_SIMILARITY_THRESHOLD || "0.55"
);
const FEW_SHOT_TOP_K = Number.parseInt(process.env.FEW_SHOT_TOP_K || "3", 10) || 3;

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
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
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
  const embedding = await generateEmbedding(normalizeForEmbedding(text));

  await connectDB();

  const doc = await Feedback.findOneAndUpdate(
    { teamId: scopedTeamId, textHash },
    {
      teamId: scopedTeamId,
      textHash,
      originalText: text,
      userOverride: override,
      userReasoning: typeof userReasoning === "string" ? userReasoning.trim() : "",
      embedding,
      timestamp: new Date(),
      sourceAlertId: sourceAlertId || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
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

export async function listFeedback(teamId) {
  const scopedTeamId = requireTeamId(teamId);
  await connectDB();
  const docs = await Feedback.find({ teamId: scopedTeamId }).sort({ timestamp: -1 }).lean();
  return docs.map(toFeedbackWireShape);
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
  const textChanged = newHash !== existing.textHash;

  if (textChanged) {
    const conflict = await Feedback.findOne({
      teamId: scopedTeamId,
      textHash: newHash,
      _id: { $ne: existing._id },
    });
    if (conflict) {
      throw new Error("Another correction already exists for this message text.");
    }

    const embedding = await generateEmbedding(normalizeForEmbedding(text));
    const updated = await Feedback.findOneAndUpdate(
      { _id: id, teamId: scopedTeamId },
      {
        textHash: newHash,
        originalText: text,
        userOverride: override,
        userReasoning: reasoning,
        embedding,
        timestamp: new Date(),
      },
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
  const textHash = hashText(text);
  await connectDB();
  return Feedback.findOne({ teamId: scopedTeamId, textHash }).lean();
}

export async function findSimilarFeedback(
  embedding,
  teamId,
  { topK = FEW_SHOT_TOP_K, minScore = SIMILARITY_THRESHOLD } = {}
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
    .filter((doc) => doc.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

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

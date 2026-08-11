import { connectDB } from "@/lib/db";
import { BENCHMARK_MODEL_DEFINITIONS } from "@/lib/models/Benchmark";
import { evaluateMessage } from "@/lib/services/aiService";

const BENCHMARK_MODELS = Object.fromEntries(
  BENCHMARK_MODEL_DEFINITIONS.map((entry) => [entry.key, entry])
);

const MAX_CHUNK_SIZE = 5;
const INTER_QUESTION_DELAY_MS = 250;
const DEFAULT_TIME_CONTEXT = "Working Hours";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeRows(payload) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const message = String(item.message || item.question || "").trim();
      if (!message) return null;
      return { message };
    })
    .filter(Boolean);
}

function getDetailedError(error) {
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.original?.status ||
    error?.cause?.original?.statusCode ||
    500;

  const causeDetails =
    error?.cause?.details ||
    error?.cause?.message ||
    error?.cause?.original?.message ||
    "";

  const model =
    error?.cause?.model ||
    error?.cause?.original?.model ||
    "";

  const parts = [
    error?.message || "Unknown processing error.",
    model ? `model=${model}` : "",
    causeDetails ? `upstream=${causeDetails}` : "",
  ].filter(Boolean);

  return {
    status,
    detail: parts.join(" | "),
  };
}

export async function POST(request) {
  let body = null;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const rows = normalizeRows(body?.rows || body?.questions || []);
  const selectedModelKey = String(body?.selectedModel || "").trim();
  const selectedModelConfig = BENCHMARK_MODELS[selectedModelKey];

  if (!selectedModelConfig) {
    return Response.json(
      {
        error: `selectedModel is required and must be one of: ${Object.keys(
          BENCHMARK_MODELS
        ).join(", ")}.`,
      },
      { status: 400 }
    );
  }

  if (!rows.length) {
    return Response.json(
      {
        error:
          "rows array is required. Each row must include a non-empty message or question field.",
      },
      { status: 400 }
    );
  }

  if (rows.length > MAX_CHUNK_SIZE) {
    return Response.json(
      { error: `Chunk too large. Max ${MAX_CHUNK_SIZE} rows per request.` },
      { status: 400 }
    );
  }

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      {
        error: "Failed to connect to MongoDB.",
        detail: error?.message || "Unknown database error.",
      },
      { status: 500 }
    );
  }

  try {
    const evaluatedRows = [];

    // Process questions sequentially to reduce free-tier burst/rate-limit failures.
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      const modelResult = await evaluateMessage(
        row.message,
        selectedModelConfig.modelSlug,
        DEFAULT_TIME_CONTEXT
      );

      evaluatedRows.push({
        question: row.message,
        suggestedAction: modelResult.actionDecision,
      });

      if (index < rows.length - 1) {
        await sleep(INTER_QUESTION_DELAY_MS);
      }
    }

    const selectedModelRecords = evaluatedRows.map((row) => ({
      question: row.question,
      suggestedAction: row.suggestedAction,
    }));

    await selectedModelConfig.resultModel.insertMany(selectedModelRecords);

    return Response.json({
      success: true,
      processed: rows.length,
      selectedModel: selectedModelKey,
      modelSlug: selectedModelConfig.modelSlug,
      targetSchema: selectedModelConfig.schemaName,
    });
  } catch (error) {
    const { status, detail } = getDetailedError(error);

    return Response.json(
      {
        error: "Benchmark processing failed.",
        detail,
      },
      { status }
    );
  }
}

export const dynamic = "force-dynamic";

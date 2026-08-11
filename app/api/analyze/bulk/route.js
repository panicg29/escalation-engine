import {
  ANALYSIS_VARIANTS,
  analyzeMessage,
  buildFallbackVariantResult,
} from "../service";
import { connectDB } from "@/lib/db";
import AnalysisSession from "@/lib/models/AnalysisSession";
import Evaluation from "@/lib/models/Evaluation";

const VALID_TIME_CONTEXTS = new Set(["Working Hours", "After Hours", "Weekend"]);
const VALID_ACTIONS = new Set(["Escalate", "Log", "Mute"]);
const DEFAULT_BULK_CONCURRENCY = 2;
const MAX_BULK_CONCURRENCY = 4;

function normalizeTimeContext(value) {
  if (typeof value !== "string") return "Working Hours";
  const trimmed = value.trim();
  return VALID_TIME_CONTEXTS.has(trimmed) ? trimmed : "Working Hours";
}

function normalizeExpectedAction(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return VALID_ACTIONS.has(trimmed) ? trimmed : undefined;
}

function normalizeMessage(record) {
  const raw = record?.message || record?.originalMessage || "";
  return typeof raw === "string" ? raw.trim() : "";
}

function getBulkConcurrency() {
  const parsed = Number(process.env.BULK_RECORD_CONCURRENCY);
  if (!Number.isFinite(parsed)) return DEFAULT_BULK_CONCURRENCY;
  return Math.min(MAX_BULK_CONCURRENCY, Math.max(1, Math.floor(parsed)));
}

function toErrorMessage(error) {
  return (
    error?.message ||
    error?.detail ||
    error?.response?.data?.error?.message ||
    "Unknown bulk processing error."
  );
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= items.length) break;
        results[idx] = await worker(items[idx], idx);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

export async function POST(request) {
  const {
    records = [],
    sessionId,
    sessionName = `Session ${new Date().toISOString()}`,
    datasetSource = "CSV Upload",
  } = await request.json();

  if (!Array.isArray(records) || records.length === 0) {
    return Response.json(
      { error: "records array (messages) is required" },
      { status: 400 }
    );
  }

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  let sessionDoc = null;

  try {
    if (sessionId) {
      sessionDoc = await AnalysisSession.findById(sessionId);
    }
    if (!sessionDoc) {
      sessionDoc = await AnalysisSession.create({
        sessionName,
        datasetSource,
        totalMessages: 0,
      });
    }
  } catch (error) {
    return Response.json(
      { error: "Unable to create or retrieve session", detail: error.message },
      { status: 500 }
    );
  }

  const usableRows = records
    .map((record, originalIndex) => ({
      originalIndex,
      message: normalizeMessage(record),
      time: normalizeTimeContext(record?.time || record?.timeContext),
      expectedAction: normalizeExpectedAction(record?.expectedAction),
    }))
    .filter((row) => row.message.length > 0);

  if (!usableRows.length) {
    return Response.json(
      { error: "No valid non-empty messages were found in this chunk." },
      { status: 400 }
    );
  }

  const analyzeConcurrency = getBulkConcurrency();
  const analyzedRows = await runWithConcurrency(
    usableRows,
    analyzeConcurrency,
    async (row) => {
      try {
        const { results, fallback } = await analyzeMessage({
          message: row.message,
          time: row.time,
          expectedAction: row.expectedAction,
        });

        return {
          ...row,
          modelResponses: results,
          fallback,
          rowError: null,
        };
      } catch (error) {
        const rowError = toErrorMessage(error);
        const fallbackResponses = ANALYSIS_VARIANTS.map((variant) =>
          buildFallbackVariantResult({
            variantLabel: variant.label,
            reason: rowError,
            modelId: variant.model,
          })
        );

        return {
          ...row,
          modelResponses: fallbackResponses,
          fallback: true,
          rowError,
        };
      }
    }
  );

  const persistenceResults = await runWithConcurrency(
    analyzedRows,
    analyzeConcurrency,
    async (row) => {
      const evaluationDoc = {
        sessionId: sessionDoc._id,
        originalMessage: row.message,
        timeContext: row.time,
        expectedAction: row.expectedAction,
        modelResponses: row.modelResponses,
      };

      try {
        const saved = await Evaluation.create(evaluationDoc);
        return {
          ok: true,
          originalIndex: row.originalIndex,
          fallback: row.fallback,
          rowError: row.rowError,
          saved: saved.toObject(),
        };
      } catch (error) {
        return {
          ok: false,
          originalIndex: row.originalIndex,
          fallback: true,
          rowError: toErrorMessage(error),
          failedMessage: row.message,
        };
      }
    }
  );

  const savedEvaluations = persistenceResults
    .filter((item) => item?.ok)
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => ({
      ...item.saved,
      fallback: item.fallback,
      rowError: item.rowError,
    }));

  const failedRows = persistenceResults
    .filter((item) => !item?.ok)
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => ({
      rowIndex: item.originalIndex,
      message: item.failedMessage,
      error: item.rowError,
    }));

  await AnalysisSession.findByIdAndUpdate(sessionDoc._id, {
    $inc: { totalMessages: savedEvaluations.length },
  });

  return Response.json({
    sessionId: sessionDoc._id.toString(),
    saved: savedEvaluations.length,
    failed: failedRows.length,
    processed: usableRows.length,
    failedRows,
    evaluations: savedEvaluations,
  });
}

import { connectDB } from "@/lib/db";
import {
  BENCHMARK_MODEL_DEFINITIONS,
  LEGACY_BENCHMARK_MODEL_DEFINITIONS,
} from "@/lib/models/Benchmark";
import Evaluation from "@/lib/models/Evaluation";
import AnalysisSession from "@/lib/models/AnalysisSession";

const ACTIVE_MODEL_META = BENCHMARK_MODEL_DEFINITIONS;
const ALL_MODEL_META = [
  ...BENCHMARK_MODEL_DEFINITIONS,
  ...LEGACY_BENCHMARK_MODEL_DEFINITIONS,
];

function normalizeLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit || "200", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 200;
  return Math.min(parsed, 1000);
}

function mapRows(rows = []) {
  return rows.map((row) => ({
    _id: row._id?.toString?.() || String(row._id),
    question: row.question,
    suggestedAction: row.suggestedAction,
  }));
}

function resolveModelMeta(rawKey) {
  const normalized = String(rawKey || "").trim().toLowerCase();
  if (!normalized) return null;

  return (
    ALL_MODEL_META.find((meta) =>
      [meta.key, meta.schemaName, meta.modelSlug, meta.label]
        .map((value) => String(value || "").trim().toLowerCase())
        .includes(normalized)
    ) || null
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = normalizeLimit(searchParams.get("limit"));

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
    const datasetResults = await Promise.all(
      ACTIVE_MODEL_META.map(async (meta) => {
        const [rows, total] = await Promise.all([
          meta.resultModel.find().sort({ _id: -1 }).limit(limit).lean(),
          meta.resultModel.countDocuments(),
        ]);

        return {
          key: meta.key,
          label: meta.label,
          modelSlug: meta.modelSlug,
          schemaName: meta.schemaName,
          total,
          results: mapRows(rows),
        };
      })
    );

    return Response.json({
      success: true,
      limit,
      datasets: datasetResults,
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to load benchmark results.",
        detail: error?.message || "Unknown query error.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const modelKey = searchParams.get("modelKey");

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
    if (modelKey && modelKey.toLowerCase() !== "all") {
      const targetModel = resolveModelMeta(modelKey);
      if (!targetModel) {
        return Response.json(
          { error: "Invalid modelKey. Provide a valid benchmark model key." },
          { status: 400 }
        );
      }

      const deletionResult = await targetModel.resultModel.deleteMany({});
      const removedCount = deletionResult.deletedCount || 0;

      return Response.json({
        success: true,
        scope: "single",
        message: `Cleared schema ${targetModel.schemaName} successfully.`,
        totals: {
          [targetModel.schemaName]: removedCount,
          totalRemoved: removedCount,
        },
      });
    }

    const modelDeletions = await Promise.all(
      ALL_MODEL_META.map(async (meta) => ({
        schemaName: meta.schemaName,
        deletedCount: (await meta.resultModel.deleteMany({})).deletedCount || 0,
      }))
    );

    const [evaluationDeletion, sessionDeletion] = await Promise.all([
      Evaluation.deleteMany({}),
      AnalysisSession.deleteMany({}),
    ]);

    const totals = modelDeletions.reduce((acc, item) => {
      acc[item.schemaName] = item.deletedCount;
      return acc;
    }, {});

    totals.evaluation = evaluationDeletion.deletedCount || 0;
    totals.analysisSession = sessionDeletion.deletedCount || 0;

    const totalRemoved = Object.values(totals).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );

    return Response.json({
      success: true,
      scope: "all",
      message: "All schemas were cleared successfully.",
      totals: {
        ...totals,
        totalRemoved,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to clear schemas.",
        detail: error?.message || "Unknown delete error.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

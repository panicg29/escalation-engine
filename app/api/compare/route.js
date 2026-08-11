import { connectDB } from "@/lib/db";
import {
  BENCHMARK_MODEL_DEFINITIONS,
  LEGACY_BENCHMARK_MODEL_DEFINITIONS,
} from "@/lib/models/Benchmark";

const MODEL_SELECTIONS = (() => {
  const mapping = {};
  const allDefinitions = [
    ...BENCHMARK_MODEL_DEFINITIONS,
    ...LEGACY_BENCHMARK_MODEL_DEFINITIONS,
  ];

  const register = (key, modelMeta) => {
    if (!key) return;
    mapping[normalizeText(key)] = modelMeta;
  };

  allDefinitions.forEach((entry) => {
    register(entry.key, entry);
    register(entry.label, entry);
    register(entry.schemaName, entry);
    register(entry.modelSlug, entry);
  });

  register("model a", LEGACY_BENCHMARK_MODEL_DEFINITIONS[0]);
  register("model_a", LEGACY_BENCHMARK_MODEL_DEFINITIONS[0]);
  register("modela", LEGACY_BENCHMARK_MODEL_DEFINITIONS[0]);
  register("model b", LEGACY_BENCHMARK_MODEL_DEFINITIONS[1]);
  register("model_b", LEGACY_BENCHMARK_MODEL_DEFINITIONS[1]);
  register("modelb", LEGACY_BENCHMARK_MODEL_DEFINITIONS[1]);

  return mapping;
})();

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeAction(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveModelMeta(selectedModel) {
  return MODEL_SELECTIONS[normalizeText(selectedModel)] || null;
}

function uniqueResolvedModels(rawSelection = []) {
  const deduped = [];
  const seen = new Set();

  rawSelection.forEach((selection) => {
    const resolved = resolveModelMeta(selection);
    if (!resolved) return;
    if (seen.has(resolved.key)) return;
    seen.add(resolved.key);
    deduped.push(resolved);
  });

  return deduped;
}

export async function POST(request) {
  let body = null;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const selectedModelsRaw = Array.isArray(body?.selectedModels)
    ? body.selectedModels
    : body?.selectedModel
      ? [body.selectedModel]
      : [];
  const surveyData = Array.isArray(body?.surveyData) ? body.surveyData : [];
  const selectedModels = uniqueResolvedModels(selectedModelsRaw);

  if (!selectedModels.length) {
    return Response.json(
      {
        error:
          "selectedModels is required and must include at least one benchmark model.",
      },
      { status: 400 }
    );
  }

  if (!surveyData.length) {
    return Response.json(
      { error: "surveyData is required and must be a non-empty array." },
      { status: 400 }
    );
  }

  const normalizedSurveyRows = surveyData
    .map((row) => ({
      message: String(row?.message || "").trim(),
      suggested_action: String(row?.suggested_action || "").trim(),
    }))
    .filter((row) => row.message.length > 0 && row.suggested_action.length > 0);

  if (!normalizedSurveyRows.length) {
    return Response.json(
      {
        error:
          "surveyData rows must include non-empty message and suggested_action fields.",
      },
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
    const uniqueMessages = [
      ...new Set(normalizedSurveyRows.map((row) => row.message)),
    ];

    const modelRecordEntries = await Promise.all(
      selectedModels.map(async (modelMeta) => {
        const rows = await modelMeta.resultModel
          .find({ question: { $in: uniqueMessages } })
          .lean();

        const recordMap = new Map(
          rows.map((record) => [normalizeText(record.question), record])
        );

        return [modelMeta.key, recordMap];
      })
    );

    const modelRecordMaps = new Map(modelRecordEntries);

    const detailedResults = normalizedSurveyRows.map((surveyRow) => {
      const normalizedMessage = normalizeText(surveyRow.message);
      const perModel = selectedModels.map((modelMeta) => {
        const dbRecord =
          modelRecordMaps.get(modelMeta.key)?.get(normalizedMessage) || null;
        const aiAction = dbRecord?.suggestedAction || null;
        const isMatch =
          Boolean(aiAction) &&
          normalizeAction(surveyRow.suggested_action) === normalizeAction(aiAction);

        return {
          key: modelMeta.key,
          label: modelMeta.label,
          schemaName: modelMeta.schemaName,
          aiAction: aiAction || "Not Found",
          found: Boolean(aiAction),
          isMatch,
        };
      });

      const questionFoundInAllModels = perModel.every((item) => item.found);

      return {
        message: surveyRow.message,
        humanAction: surveyRow.suggested_action,
        questionFoundInAllModels,
        perModel,
      };
    });

    const comparedRows = detailedResults.filter(
      (row) => row.questionFoundInAllModels
    );
    const totalUploaded = detailedResults.length;
    const compared = comparedRows.length;
    const skippedNoCommon = totalUploaded - compared;

    const modelStats = selectedModels.map((modelMeta) => {
      const matched = comparedRows.filter((row) => {
        const modelRow = row.perModel.find((item) => item.key === modelMeta.key);
        return Boolean(modelRow?.isMatch);
      }).length;

      const mismatched = compared - matched;
      const accuracyPercentage =
        compared > 0 ? Number(((matched / compared) * 100).toFixed(2)) : null;

      const foundInUploaded = detailedResults.filter((row) => {
        const modelRow = row.perModel.find((item) => item.key === modelMeta.key);
        return Boolean(modelRow?.found);
      }).length;

      return {
        key: modelMeta.key,
        label: modelMeta.label,
        modelSlug: modelMeta.modelSlug,
        schemaName: modelMeta.schemaName,
        totalUploaded,
        foundInUploaded,
        comparedCommon: compared,
        matched,
        mismatched,
        accuracyPercentage,
      };
    });

    return Response.json({
      stats: {
        totalUploaded,
        compared,
        skippedNoCommon,
        selectedModelCount: selectedModels.length,
      },
      modelStats,
      detailedResults,
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to compare survey data with benchmark predictions.",
        detail: error?.message || "Unknown comparison error.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

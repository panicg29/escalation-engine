import mongoose from "mongoose";

const allowedActions = ["Escalate", "Log", "Mute"];

function createResultSchema() {
  const schema = new mongoose.Schema(
    {
      question: { type: String, required: true, trim: true, index: true },
      suggestedAction: { type: String, enum: allowedActions, required: true },
    },
    { versionKey: false }
  );
  
  // Add compound index for question-based queries with action filtering
  schema.index({ question: 1, suggestedAction: 1 });
  
  return schema;
}

export const ModelAResult =
  mongoose.models.ModelAResult ||
  mongoose.model("ModelAResult", createResultSchema());

export const ModelBResult =
  mongoose.models.ModelBResult ||
  mongoose.model("ModelBResult", createResultSchema());

export const Gpt4oMiniResult =
  mongoose.models.Gpt4oMiniResult ||
  mongoose.model("Gpt4oMiniResult", createResultSchema());

export const Gemini15FlashResult =
  mongoose.models.Gemini15FlashResult ||
  mongoose.model("Gemini15FlashResult", createResultSchema());

export const DeepSeekChatResult =
  mongoose.models.DeepSeekChatResult ||
  mongoose.model("DeepSeekChatResult", createResultSchema());

export const Claude35HaikuResult =
  mongoose.models.Claude35HaikuResult ||
  mongoose.model("Claude35HaikuResult", createResultSchema());

export const BENCHMARK_MODEL_DEFINITIONS = [
  {
    key: "gpt4oMini",
    label: "OpenAI GPT-4o Mini",
    modelSlug: "openai/gpt-4o-mini",
    schemaName: "Gpt4oMiniResult",
    resultModel: Gpt4oMiniResult,
  },
  {
    key: "gemini15Flash",
    label: "Google Gemini 2.5 Flash Lite",
    modelSlug: "google/gemini-2.5-flash-lite",
    schemaName: "Gemini15FlashResult",
    resultModel: Gemini15FlashResult,
  },
  {
    key: "deepseekChat",
    label: "DeepSeek Chat",
    modelSlug: "deepseek/deepseek-chat",
    schemaName: "DeepSeekChatResult",
    resultModel: DeepSeekChatResult,
  },
  {
    key: "claude35Haiku",
    label: "Anthropic Claude 3.5 Haiku",
    modelSlug: "anthropic/claude-3.5-haiku",
    schemaName: "Claude35HaikuResult",
    resultModel: Claude35HaikuResult,
  },
];

export const LEGACY_BENCHMARK_MODEL_DEFINITIONS = [
  {
    key: "modelA",
    label: "Model A",
    modelSlug: "nvidia/nemotron-3-super-120b-a12b:free",
    schemaName: "ModelAResult",
    resultModel: ModelAResult,
  },
  {
    key: "modelB",
    label: "Model B",
    modelSlug: "nvidia/nemotron-nano-9b-v2:free",
    schemaName: "ModelBResult",
    resultModel: ModelBResult,
  },
];

import {
  AIServiceError,
  evaluateMessage,
} from "@/lib/services/aiService";

const PLAYGROUND_MODELS = {
  free: {
    key: "free",
    label: "Free (Gemma 2 9B)",
    slug: "google/gemma-2-9b-it:free",
  },
  premium: {
    key: "premium",
    label: "Premium (GPT-4o Mini)",
    slug: "openai/gpt-4o-mini",
  },
};

export async function POST(request) {
  const { message = "", time = "Working Hours", selectedModel = "premium" } =
    await request.json();

  if (!message.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const selectedModelConfig = PLAYGROUND_MODELS[String(selectedModel).trim()];
  if (!selectedModelConfig) {
    return Response.json(
      { error: "selectedModel must be one of: free, premium." },
      { status: 400 }
    );
  }

  try {
    const modelResult = await evaluateMessage(
      message,
      selectedModelConfig.slug,
      time
    );

    return Response.json({
      selectedModel: {
        key: selectedModelConfig.key,
        label: selectedModelConfig.label,
        slug: selectedModelConfig.slug,
      },
      result: {
        message,
        action: modelResult.actionDecision,
      },
    });
  } catch (error) {
    console.error("Analyze error", error);
    const status =
      error?.status || error?.statusCode || error?.response?.status || 500;
    const friendly = status === 429
      ? "OpenRouter rate limit reached for the selected model."
      : status === 401
        ? "Invalid or missing OpenRouter API key. Update OPENROUTER_API_KEY and retry."
        : "Model call failed.";

    const reason =
      error instanceof AIServiceError
        ? error.message
        : error?.message || "Unknown model error.";

    return Response.json(
      {
        error: friendly,
        errorDetail: reason,
        statusCode: status,
      },
      { status }
    );
  }
}

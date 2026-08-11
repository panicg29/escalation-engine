import { OpenRouter } from "@openrouter/sdk";
import { AIServiceError } from "@/lib/services/aiService";

export const EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL ||
  "nvidia/llama-nemotron-embed-vl-1b-v2:free";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.openRouterApiKey ||
  process.env.OPEN_ROUTER_API_KEY ||
  "";

const openrouter = new OpenRouter({ apiKey: OPENROUTER_API_KEY });

function extractEmbeddingVector(response) {
  const data = response?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const vector = data[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) return null;
  return vector.map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

export async function generateEmbedding(text, { retry = true } = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new AIServiceError(
      "Missing OpenRouter API key. Add OPENROUTER_API_KEY in .env.local.",
      { status: 500 }
    );
  }

  const input = typeof text === "string" ? text.trim() : "";
  if (!input) {
    throw new AIServiceError("Text is required for embedding.", { status: 400 });
  }

  let lastError = null;

  for (let attempt = 0; attempt < (retry ? 2 : 1); attempt += 1) {
    try {
      const response = await openrouter.embeddings.generate({
        requestBody: {
          model: EMBEDDING_MODEL,
          input,
          encodingFormat: "float",
        },
      });

      const vector = extractEmbeddingVector(response);
      if (vector?.length) return vector;

      lastError = new AIServiceError("Embedding response contained no vector.", {
        status: 502,
      });
    } catch (error) {
      lastError =
        error instanceof AIServiceError
          ? error
          : new AIServiceError("OpenRouter embedding request failed.", {
              status: 502,
              cause: error,
            });
    }
  }

  throw lastError || new AIServiceError("Failed to generate embedding.", { status: 502 });
}

import { classifyUrgency } from "@/lib/services/ollamaUrgencyService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Urgency classification for Slack messages via local Ollama (sentinel-qwen).
 * Response contract (stable for frontend): { urgency: "HIGH" | "LOW" }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const message =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.text === "string"
        ? body.text
        : "";

  if (!message.trim()) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  try {
    const result = await classifyUrgency(message);
    return Response.json({ urgency: result.urgency });
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "urgency-api",
        action: "classify_failed",
        error: error?.message || "Urgency classification failed",
      })
    );
    return Response.json(
      {
        error: "Urgency classification failed.",
        detail: error?.message || "Unknown error",
      },
      { status: 502 }
    );
  }
}

import OpenAI from "openai";

const groqKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const client = new OpenAI({
  apiKey: groqKey,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(request) {
  const { message = "", time = "Working Hours" } = await request.json();

  if (!client.apiKey) {
    return Response.json(
      { error: "Missing GROQ_API_KEY on server" },
      { status: 500 }
    );
  }

  try {
    const completion = await client.chat.completions.create({
      model: groqModel,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `
You are an escalation engine for workplace communications between coworkers (Slack/Email).
For each input message:
- Consider sender as a colleague; assume normal corporate context.
- Assess urgency on a 0–10 scale (0 = no action; 10 = immediate interrupt).
- Choose one action: Escalate (must interrupt/phone), Log (record for later handling), or Mute (no action needed now).
- Keep reasoning concise (1–2 sentences) citing why the action matches urgency and time context.
Return three distinct prompt variants (Prompt A/B/C) that might reasonably differ in weighting tone, timing, or content cues.
Output strictly JSON matching: {"results":[{modelName, urgencyScore, actionDecision, reasoning}, ...]}.
          `,
        },
        {
          role: "user",
          content: `Message: """${message.trim()}"""
Simulated time context: ${time}.
Produce three distinct prompt variants (Prompt A/B/C) with:
- modelName (Prompt A, Prompt B, Prompt C)
- urgencyScore as X/10
- actionDecision as one of Escalate, Log, or Mute
- reasoning in 1-2 sentences
Respond ONLY as compact JSON: {"results":[ ... ]}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(
      completion.choices?.[0]?.message?.content || "{}"
    );

    const results = Array.isArray(parsed.results) ? parsed.results : [];

    if (results.length === 0) {
      throw new Error("Empty results from model");
    }

    return Response.json({ time, echoedMessage: message, results });
  } catch (error) {
    console.error("Analyze error", error);

    const status = error?.status || error?.response?.status;
    const friendly =
      status === 429
        ? "Groq quota exceeded for this key. Showing fallback sample decisions."
        : status === 401
          ? "Invalid or missing Groq API key. Update GROQ_API_KEY and retry."
          : "Model call failed. Showing fallback sample decisions.";

    const errorDetail =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Unknown error";

    const results = [
      {
        modelName: "Prompt A",
        urgencyScore: "7/10",
        actionDecision: "Escalate",
        reasoning:
          "Mentions quick follow-up and short response window; better to escalate.",
      },
      {
        modelName: "Prompt B",
        urgencyScore: "4/10",
        actionDecision: "Log",
        reasoning:
          "Request is routine and can be handled in the next block without impact.",
      },
      {
        modelName: "Prompt C",
        urgencyScore: "2/10",
        actionDecision: "Mute",
        reasoning: "No clear action or urgency; safe to mute for now.",
      },
    ];
    return Response.json(
      {
        time,
        echoedMessage: message,
        results,
        error: friendly,
        fallback: true,
        statusCode: status || 500,
        errorDetail,
        model: groqModel,
      },
      { status: 200 }
    );
  }
}

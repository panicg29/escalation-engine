import { NextResponse } from "next/server";
import { AIServiceError } from "@/lib/services/aiService";
import {
  clearFeedbackForTeam,
  listFeedback,
  normalizeOverride,
  saveFeedback,
  toFeedbackWireShape,
} from "@/lib/services/feedbackService";

export const dynamic = "force-dynamic";

function requireTeamId(request, bodyTeamId) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") || bodyTeamId;
  if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
    return {
      error: NextResponse.json(
        { error: "teamId is required." },
        { status: 400 }
      ),
    };
  }
  return { teamId: teamId.trim() };
}

export async function GET(request) {
  const scoped = requireTeamId(request);
  if (scoped.error) return scoped.error;

  const { searchParams } = new URL(request.url);
  const pageRaw = Number.parseInt(searchParams.get("page") || "1", 10);
  const limitRaw = Number.parseInt(searchParams.get("limit") || "20", 10);
  const userOverride = searchParams.get("userOverride");

  try {
    const result = await listFeedback(scoped.teamId, {
      page: pageRaw,
      limit: limitRaw,
      userOverride: userOverride || null,
    });
    return NextResponse.json({ teamId: scoped.teamId, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch feedback." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const scoped = requireTeamId(request, body?.teamId);
  if (scoped.error) return scoped.error;

  const { originalText, userOverride, userReasoning, sourceAlertId } = body || {};
  const override = normalizeOverride(userOverride);

  if (!override) {
    return NextResponse.json(
      { error: "userOverride must be Escalate, Log, or Mute." },
      { status: 400 }
    );
  }

  const text = typeof originalText === "string" ? originalText.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "originalText is required." }, { status: 400 });
  }

  try {
    const doc = await saveFeedback({
      teamId: scoped.teamId,
      originalText: text,
      userOverride: override,
      userReasoning:
        typeof userReasoning === "string" ? userReasoning.trim() : "",
      sourceAlertId: typeof sourceAlertId === "string" ? sourceAlertId : "",
    });

    return NextResponse.json({ ok: true, feedback: toFeedbackWireShape(doc) });
  } catch (error) {
    if (error instanceof AIServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 502 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Failed to save feedback." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const scoped = requireTeamId(request);
  if (scoped.error) return scoped.error;

  try {
    const deletedCount = await clearFeedbackForTeam(scoped.teamId);
    return NextResponse.json({ ok: true, teamId: scoped.teamId, deletedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to clear feedback." },
      { status: 500 }
    );
  }
}

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { AIServiceError } from "@/lib/services/aiService";
import {
  deleteFeedbackById,
  normalizeOverride,
  updateFeedbackById,
} from "@/lib/services/feedbackService";

export const dynamic = "force-dynamic";

function invalidIdResponse() {
  return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
}

function requireTeamId(request, bodyTeamId) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") || bodyTeamId;
  if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
    return {
      error: NextResponse.json({ error: "teamId is required." }, { status: 400 }),
    };
  }
  return { teamId: teamId.trim() };
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return invalidIdResponse();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const scoped = requireTeamId(request, body?.teamId);
  if (scoped.error) return scoped.error;

  const { originalText, userOverride, userReasoning } = body || {};
  if (userOverride && !normalizeOverride(userOverride)) {
    return NextResponse.json(
      { error: "userOverride must be Escalate, Log, or Mute." },
      { status: 400 }
    );
  }

  try {
    const feedback = await updateFeedbackById(id, {
      teamId: scoped.teamId,
      originalText,
      userOverride,
      userReasoning,
    });
    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    if (error instanceof AIServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 502 }
      );
    }

    const status = error?.message === "Feedback not found." ? 404 : 500;
    return NextResponse.json(
      { error: error?.message || "Failed to update feedback." },
      { status }
    );
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return invalidIdResponse();
  }

  const scoped = requireTeamId(request);
  if (scoped.error) return scoped.error;

  try {
    const feedback = await deleteFeedbackById(id, scoped.teamId);
    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    const status = error?.message === "Feedback not found." ? 404 : 500;
    return NextResponse.json(
      { error: error?.message || "Failed to delete feedback." },
      { status }
    );
  }
}

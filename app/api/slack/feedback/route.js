import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { AIServiceError } from "@/lib/services/aiService";
import {
  normalizeOverride,
  saveFeedback,
} from "@/lib/services/feedbackService";
import { applyUserClassificationCorrection } from "@/lib/services/escalationService";
import { broadcastAlert, toAlertWireShape } from "@/lib/sentinel/alertBroadcast";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { alertId, originalText, userOverride, userReasoning, teamId } = body || {};
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

  if (!teamId || typeof teamId !== "string") {
    return NextResponse.json(
      { error: "teamId is required for workspace-scoped feedback." },
      { status: 400 }
    );
  }

  const reasoning =
    typeof userReasoning === "string" && userReasoning.trim()
      ? userReasoning.trim()
      : `User corrected classification to ${override}.`;

  try {
    const feedbackDoc = await saveFeedback({
      teamId,
      originalText: text,
      userOverride: override,
      userReasoning: reasoning,
      sourceAlertId: typeof alertId === "string" ? alertId : "",
    });

    let alertPayload = null;

    if (alertId && mongoose.Types.ObjectId.isValid(alertId)) {
      const updated = await applyUserClassificationCorrection({
        alertId,
        teamId,
        classification: override,
        reasoning,
      });

      if (!updated) {
        return NextResponse.json({ error: "Alert not found." }, { status: 404 });
      }

      alertPayload = toAlertWireShape(updated, { eventKind: "alert_update" });
      broadcastAlert(alertPayload);
    }

    return NextResponse.json({
      ok: true,
      feedback: {
        textHash: feedbackDoc.textHash,
        teamId: feedbackDoc.teamId,
        userOverride: feedbackDoc.userOverride,
        embeddingDimensions: Array.isArray(feedbackDoc.embedding)
          ? feedbackDoc.embedding.length
          : 0,
      },
      alert: alertPayload,
    });
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

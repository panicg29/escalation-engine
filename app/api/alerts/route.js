import { connectDB } from "@/lib/db";
import Alert from "@/lib/models/Alert";
import { ensureAlertDisplayText } from "@/lib/slack/ensureDisplayText";
import { backfillUserName, resolveSlackUserNames } from "@/lib/slack/resolveUser";
import { findWorkspaceByTeamId } from "@/lib/services/workspaceService";
import { formatSlackMessageDisplay } from "@/lib/slack/formatMessageDisplay";
import { messageHasRawSlackTokens } from "@/lib/slack/formatMessageDisplayClient";

export const dynamic = "force-dynamic";

function requireTeamId(request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  if (!teamId || !teamId.trim()) {
    return { error: Response.json({ error: "teamId query parameter is required." }, { status: 400 }) };
  }
  return { teamId: teamId.trim() };
}

export async function GET(request) {
  const scoped = requireTeamId(request);
  if (scoped.error) return scoped.error;
  const { teamId } = scoped;
  const { searchParams } = new URL(request.url);
  const afterRaw = searchParams.get("after");
  const limitRaw = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  try {
    const workspace = await findWorkspaceByTeamId(teamId);
    const query = { teamId };
    if (afterRaw) {
      const afterDate = new Date(afterRaw);
      if (!Number.isNaN(afterDate.getTime())) {
        query.timestamp = { $gte: afterDate };
      }
    }

    const alerts = await Alert.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    // Performance optimization: Batch process users and display text
    const botToken = workspace?.botAccessToken || null;
    
    // Collect all user IDs that need resolution
    const userIdsToResolve = alerts
      .filter(doc => (!doc.userName || doc.userName === "Team member") && doc.userId)
      .map(doc => doc.userId);
    
    // Batch resolve all users at once (major performance improvement)
    const resolvedUsers = userIdsToResolve.length > 0 
      ? await resolveSlackUserNames(userIdsToResolve, { teamId, botToken })
      : {};
    
    // Collect alerts that need display text processing
    const alertsNeedingDisplayText = alerts.filter(doc => {
      const current = doc.displayText || "";
      return !current || messageHasRawSlackTokens(current);
    });
    
    // Batch resolve display text for alerts that need it
    const displayTextUpdates = new Map();
    if (alertsNeedingDisplayText.length > 0 && botToken) {
      const displayTextPromises = alertsNeedingDisplayText.map(async (doc) => {
        try {
          const formatted = await formatSlackMessageDisplay(doc.text || "", { teamId, botToken });
          if (formatted && formatted !== doc.text) {
            displayTextUpdates.set(doc._id.toString(), formatted);
          }
        } catch (error) {
          console.warn(`Failed to format display text for alert ${doc._id}:`, error?.message);
        }
      });
      await Promise.all(displayTextPromises);
    }
    
    // Batch database updates
    const userUpdates = [];
    const displayUpdates = [];
    
    const payload = alerts.map((doc) => {
      let userName = doc.userName || "Team member";
      let displayText = doc.displayText || "";
      
      // Check if user needs resolution
      if (userName === "Team member" && doc.userId && resolvedUsers[doc.userId]) {
        userName = resolvedUsers[doc.userId];
        userUpdates.push({
          updateOne: {
            filter: { _id: doc._id, teamId },
            update: { userName }
          }
        });
      }
      
      // Check if display text was updated
      const newDisplayText = displayTextUpdates.get(doc._id.toString());
      if (newDisplayText) {
        displayText = newDisplayText;
        displayUpdates.push({
          updateOne: {
            filter: { _id: doc._id, teamId },
            update: { displayText }
          }
        });
      } else if (!displayText) {
        displayText = doc.text;
      }

      return {
          id: doc._id.toString(),
          teamId: doc.teamId,
          userId: doc.userId,
          userName,
          text: doc.text,
          displayText,
          classification: doc.classification,
          reasoning: doc.reasoning || "",
          timestamp: doc.timestamp.toISOString(),
          correctedAt: doc.correctedAt ? doc.correctedAt.toISOString() : null,
          triageSource: doc.triageSource || null,
          similarityScores: doc.similarityScores ?? null,
          slackMessageTs: doc.slackMessageTs || null,
          targetUserId: doc.targetUserId || null,
          targetUserName: doc.targetUserName || null,
          mentionedUserIds: doc.mentionedUserIds || [],
          timerTrigger: doc.timerTrigger || null,
          status: doc.status || "resolved",
          resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : null,
          escalatedAt: doc.escalatedAt ? doc.escalatedAt.toISOString() : null,
          callSid: doc.callSid || null,
          callOutcome: doc.callOutcome || null,
        };
    });
    
    // Execute batch database updates for performance
    try {
      if (userUpdates.length > 0) {
        await Alert.bulkWrite(userUpdates, { ordered: false });
        console.log(`Batch updated ${userUpdates.length} user names`);
      }
      
      if (displayUpdates.length > 0) {
        await Alert.bulkWrite(displayUpdates, { ordered: false });
        console.log(`Batch updated ${displayUpdates.length} display texts`);
      }
    } catch (batchError) {
      console.warn("Batch update error:", batchError?.message);
      // Continue with response - batch updates are performance optimizations, not critical
    }

    return Response.json({ teamId, alerts: payload });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch alerts", detail: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const scoped = requireTeamId(request);
  if (scoped.error) return scoped.error;
  const { teamId } = scoped;

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  try {
    const result = await Alert.deleteMany({ teamId });
    return Response.json({ ok: true, teamId, deletedCount: result.deletedCount });
  } catch (error) {
    return Response.json(
      { error: "Failed to clear alerts", detail: error.message },
      { status: 500 }
    );
  }
}

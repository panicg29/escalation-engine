import { connectDB } from "@/lib/db";
import Alert from "@/lib/models/Alert";
import { backfillUserName, resolveSlackUserNames } from "@/lib/slack/resolveUser";
import { findWorkspaceByTeamId } from "@/lib/services/workspaceService";
import { formatSlackMessageDisplay } from "@/lib/slack/formatMessageDisplay";
import { messageHasRawSlackTokens } from "@/lib/slack/formatMessageDisplayClient";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = ["Escalate", "Log", "Mute"];
const STATUSES = ["pending", "resolved", "escalated", "escalating", "closed"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function requireTeamId(request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  if (!teamId || !teamId.trim()) {
    return { error: Response.json({ error: "teamId query parameter is required." }, { status: 400 }) };
  }
  return { teamId: teamId.trim() };
}

function parsePagination(searchParams) {
  const pageRaw = Number.parseInt(searchParams.get("page") || "1", 10);
  const limitRaw = Number.parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}

function parseFilters(searchParams) {
  const classification = searchParams.get("classification");
  const status = searchParams.get("status");
  const afterRaw = searchParams.get("after");

  const filters = {};
  if (classification && CLASSIFICATIONS.includes(classification)) {
    filters.classification = classification;
  }
  if (status && STATUSES.includes(status)) {
    filters.status = status;
  }
  if (afterRaw) {
    const afterDate = new Date(afterRaw);
    if (!Number.isNaN(afterDate.getTime())) {
      filters.timestamp = { $gte: afterDate };
    }
  }
  return filters;
}

function toAlertPayload(doc, resolvedUsers = {}, displayTextUpdates = new Map()) {
  let userName = doc.userName || "Team member";
  let displayText = doc.displayText || "";

  if (userName === "Team member" && doc.userId && resolvedUsers[doc.userId]) {
    userName = resolvedUsers[doc.userId];
  }

  const newDisplayText = displayTextUpdates.get(doc._id.toString());
  if (newDisplayText) {
    displayText = newDisplayText;
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
    semanticAutoApplied: Boolean(doc.semanticAutoApplied),
    matchedOverride: doc.matchedOverride || null,
    slackMessageTs: doc.slackMessageTs || null,
    targetUserId: doc.targetUserId || null,
    targetUserName: doc.targetUserName || null,
    mentionedUserIds: doc.mentionedUserIds || [],
    timerTrigger: doc.timerTrigger || null,
    escalationTimeoutMs: doc.escalationTimeoutMs || null,
    status: doc.status || "resolved",
    resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : null,
    escalatedAt: doc.escalatedAt ? doc.escalatedAt.toISOString() : null,
    callSid: doc.callSid || null,
    callOutcome: doc.callOutcome || null,
  };
}

async function buildCounts(teamId) {
  const [classificationAgg, statusAgg, total] = await Promise.all([
    Alert.aggregate([
      { $match: { teamId } },
      { $group: { _id: "$classification", count: { $sum: 1 } } },
    ]),
    Alert.aggregate([
      { $match: { teamId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Alert.countDocuments({ teamId }),
  ]);

  const classification = { all: total, Escalate: 0, Log: 0, Mute: 0 };
  for (const row of classificationAgg) {
    if (row._id && classification[row._id] !== undefined) {
      classification[row._id] = row.count;
    }
  }

  const status = { all: total, pending: 0, resolved: 0, escalated: 0, escalating: 0, closed: 0 };
  for (const row of statusAgg) {
    if (row._id && status[row._id] !== undefined) {
      status[row._id] = row.count;
    }
  }

  return { classification, status };
}

export async function GET(request) {
  const scoped = requireTeamId(request);
  if (scoped.error) return scoped.error;
  const { teamId } = scoped;
  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const filters = parseFilters(searchParams);

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
    const query = { teamId, ...filters };

    const [alerts, filteredTotal, counts] = await Promise.all([
      Alert.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Alert.countDocuments(query),
      buildCounts(teamId),
    ]);

    const botToken = workspace?.botAccessToken || null;

    const userIdsToResolve = alerts
      .filter((doc) => (!doc.userName || doc.userName === "Team member") && doc.userId)
      .map((doc) => doc.userId);

    const resolvedUsers =
      userIdsToResolve.length > 0
        ? await resolveSlackUserNames(userIdsToResolve, { teamId, botToken })
        : {};

    const alertsNeedingDisplayText = alerts.filter((doc) => {
      const current = doc.displayText || "";
      return !current || messageHasRawSlackTokens(current);
    });

    const displayTextUpdates = new Map();
    if (alertsNeedingDisplayText.length > 0 && botToken) {
      await Promise.all(
        alertsNeedingDisplayText.map(async (doc) => {
          try {
            const formatted = await formatSlackMessageDisplay(doc.text || "", { teamId, botToken });
            if (formatted && formatted !== doc.text) {
              displayTextUpdates.set(doc._id.toString(), formatted);
            }
          } catch (error) {
            console.warn(`Failed to format display text for alert ${doc._id}:`, error?.message);
          }
        })
      );
    }

    const userUpdates = [];
    const displayUpdates = [];

    const payload = alerts.map((doc) => {
      const item = toAlertPayload(doc, resolvedUsers, displayTextUpdates);

      if (item.userName !== doc.userName && doc.userName === "Team member" && doc.userId && resolvedUsers[doc.userId]) {
        userUpdates.push({
          updateOne: {
            filter: { _id: doc._id, teamId },
            update: { userName: item.userName },
          },
        });
      }

      const newDisplayText = displayTextUpdates.get(doc._id.toString());
      if (newDisplayText) {
        displayUpdates.push({
          updateOne: {
            filter: { _id: doc._id, teamId },
            update: { displayText: newDisplayText },
          },
        });
      }

      return item;
    });

    try {
      if (userUpdates.length > 0) {
        await Alert.bulkWrite(userUpdates, { ordered: false });
      }
      if (displayUpdates.length > 0) {
        await Alert.bulkWrite(displayUpdates, { ordered: false });
      }
    } catch (batchError) {
      console.warn("Batch update error:", batchError?.message);
    }

    const totalPages = Math.max(1, Math.ceil(filteredTotal / limit));

    return Response.json({
      teamId,
      alerts: payload,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages,
        hasMore: page < totalPages,
      },
      counts,
    });
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

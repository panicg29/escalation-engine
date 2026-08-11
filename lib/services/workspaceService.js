import { connectDB } from "@/lib/db";
import Workspace from "@/lib/models/Workspace";

export function isWorkspaceActive(doc) {
  if (!doc) return false;
  if (doc.status === "inactive") return false;
  if (doc.connected === false) return false;
  return true;
}

export function toWorkspaceWireShape(doc, { includeToken = false } = {}) {
  if (!doc) return null;
  const active = isWorkspaceActive(doc);
  const wire = {
    id: doc._id ? doc._id.toString() : doc.id,
    teamId: doc.teamId,
    teamName: doc.teamName || "Slack Workspace",
    incomingChannelId: doc.incomingChannelId || "",
    incomingChannelName: doc.incomingChannelName || "",
    targetUserId: doc.targetUserId || "",
    targetUserName: doc.targetUserName || "",
    status: doc.status || (active ? "active" : "inactive"),
    connected: doc.connected ?? active,
    disconnectedAt: doc.disconnectedAt
      ? doc.disconnectedAt instanceof Date
        ? doc.disconnectedAt.toISOString()
        : doc.disconnectedAt
      : null,
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt:
      doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
  if (includeToken) {
    wire.botAccessToken = doc.botAccessToken;
  }
  return wire;
}

/** The single Slack user who receives / acknowledges urgent notifications for a workspace. */
export function getEscalationTargetFromWorkspace(workspace) {
  if (!workspace) {
    return { targetUserId: null, targetUserName: null };
  }
  const targetUserId = workspace.targetUserId?.trim() || null;
  const targetUserName = workspace.targetUserName?.trim() || null;
  return { targetUserId, targetUserName };
}

async function uninstallSlackApp(botAccessToken) {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SLACK_CLIENT_ID and SLACK_CLIENT_SECRET are required for apps.uninstall.");
  }

  if (!botAccessToken) {
    throw new Error("botAccessToken is required for apps.uninstall.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token: botAccessToken,
  });

  const response = await fetch("https://slack.com/api/apps.uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json();
  return data;
}

export async function ensureEnvFallbackWorkspace() {
  const fallback = getEnvFallbackWorkspace();
  if (!fallback) return null;

  await connectDB();
  const existing = await Workspace.findOne({ teamId: fallback.teamId }).lean();
  if (existing) return existing;

  return Workspace.findOneAndUpdate(
    { teamId: fallback.teamId },
    {
      teamId: fallback.teamId,
      teamName: fallback.teamName,
      botAccessToken: fallback.botAccessToken,
      incomingChannelId: fallback.incomingChannelId || "",
      incomingChannelName: fallback.incomingChannelName || "",
      targetUserId: fallback.targetUserId || "",
      targetUserName: fallback.targetUserName || "",
      status: "active",
      connected: true,
      disconnectedAt: null,
      updatedAt: new Date(),
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Assign teamId to legacy Alert/Feedback docs that predate multi-tenancy. */
export async function backfillLegacyTeamId(teamId) {
  if (!teamId) return { alerts: 0, feedback: 0 };
  await connectDB();
  const Alert = (await import("@/lib/models/Alert")).default;
  const Feedback = (await import("@/lib/models/Feedback")).default;

  const [alerts, feedback] = await Promise.all([
    Alert.updateMany(
      { $or: [{ teamId: { $exists: false } }, { teamId: null }, { teamId: "" }] },
      { $set: { teamId } }
    ),
    Feedback.updateMany(
      { $or: [{ teamId: { $exists: false } }, { teamId: null }, { teamId: "" }] },
      { $set: { teamId } }
    ),
  ]);

  return {
    alerts: alerts.modifiedCount || 0,
    feedback: feedback.modifiedCount || 0,
  };
}

export async function listWorkspaces({ activeOnly = false } = {}) {
  await connectDB();
  const fallback = await ensureEnvFallbackWorkspace();
  if (fallback?.teamId) {
    try {
      await backfillLegacyTeamId(fallback.teamId);
    } catch (error) {
      console.warn("[Workspace] legacy teamId backfill skipped:", error?.message);
    }
  }

  try {
    const Feedback = (await import("@/lib/models/Feedback")).default;
    await Feedback.collection.dropIndex("textHash_1").catch(() => {});
  } catch {
    // index may already be compound or absent
  }

  const docs = await Workspace.find().sort({ teamName: 1 }).lean();
  const filtered = activeOnly ? docs.filter(isWorkspaceActive) : docs;
  return filtered.map((doc) => toWorkspaceWireShape(doc));
}

export async function findWorkspaceByTeamId(teamId, { includeInactive = true } = {}) {
  if (!teamId || typeof teamId !== "string") return null;
  await connectDB();
  const doc = await Workspace.findOne({ teamId: teamId.trim() }).lean();
  if (!doc) return null;
  if (!includeInactive && !isWorkspaceActive(doc)) return null;
  return doc;
}

export async function isWorkspaceActiveForEvents(teamId) {
  const workspace = await findWorkspaceByTeamId(teamId, { includeInactive: true });
  if (!workspace) return false;
  return isWorkspaceActive(workspace);
}

export async function upsertWorkspaceFromOAuth({
  teamId,
  teamName,
  botAccessToken,
  incomingChannelId = "",
  incomingChannelName = "",
  targetUserId = "",
  targetUserName = "",
}) {
  if (!teamId || !botAccessToken) {
    throw new Error("teamId and botAccessToken are required.");
  }

  await connectDB();

  const doc = await Workspace.findOneAndUpdate(
    { teamId },
    {
      teamId,
      teamName: teamName || "Slack Workspace",
      botAccessToken,
      incomingChannelId: incomingChannelId || "",
      incomingChannelName: incomingChannelName || "",
      ...(targetUserId ? { targetUserId, targetUserName: targetUserName || "" } : {}),
      status: "active",
      connected: true,
      disconnectedAt: null,
      updatedAt: new Date(),
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

/**
 * Uninstall the Slack app for a workspace and mark the row inactive (soft disconnect).
 */
export async function disconnectWorkspaceByTeamId(teamId) {
  if (!teamId) throw new Error("teamId is required.");

  await connectDB();
  const workspace = await Workspace.findOne({ teamId }).lean();
  if (!workspace) {
    return null;
  }

  let slackUninstall = { attempted: false, ok: false, error: null };

  if (workspace.botAccessToken) {
    slackUninstall.attempted = true;
    try {
      const result = await uninstallSlackApp(workspace.botAccessToken);
      slackUninstall.ok = Boolean(result?.ok);
      if (!result?.ok) {
        slackUninstall.error = result?.error || "apps.uninstall failed";
        console.warn(
          JSON.stringify({
            source: "workspace-disconnect",
            teamId,
            slackError: slackUninstall.error,
          })
        );
      }
    } catch (error) {
      slackUninstall.error = error?.message || "apps.uninstall request failed";
      console.warn(
        JSON.stringify({
          source: "workspace-disconnect",
          teamId,
          error: slackUninstall.error,
        })
      );
    }
  }

  const updated = await Workspace.findOneAndUpdate(
    { teamId },
    {
      status: "inactive",
      connected: false,
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    },
    { new: true }
  );

  return {
    workspace: updated,
    slackUninstall,
  };
}

/** @deprecated Use disconnectWorkspaceByTeamId */
export async function deleteWorkspaceByTeamId(teamId) {
  const result = await disconnectWorkspaceByTeamId(teamId);
  return result?.workspace || null;
}

/** Fallback for local/dev when OAuth workspace is not yet connected. */
export function getEnvFallbackWorkspace() {
  const token =
    process.env.SLACK_BOT_TOKEN ||
    process.env.SLACK_USER_TOKEN ||
    process.env.SLACK_OAUTH_TOKEN ||
    "";
  const teamId = process.env.SLACK_DEFAULT_TEAM_ID || "T_LOCAL_DEV";
  if (!token) return null;
  return {
    teamId,
    teamName: process.env.SLACK_DEFAULT_TEAM_NAME || "Local Dev Workspace",
    botAccessToken: token,
    incomingChannelId: process.env.SLACK_DEFAULT_CHANNEL_ID || "",
    incomingChannelName: process.env.SLACK_DEFAULT_CHANNEL_NAME || "",
    targetUserId: process.env.SLACK_DEFAULT_TARGET_USER_ID || "",
    targetUserName: process.env.SLACK_DEFAULT_TARGET_USER_NAME || "",
    status: "active",
    connected: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function resolveWorkspaceForTeam(teamId) {
  if (teamId) {
    const workspace = await findWorkspaceByTeamId(teamId, { includeInactive: true });
    if (workspace) {
      if (!isWorkspaceActive(workspace)) return null;
      if (workspace.botAccessToken) return workspace;
      return null;
    }
  }

  const fallback = getEnvFallbackWorkspace();
  if (!fallback) return null;

  if (!teamId || teamId === fallback.teamId) {
    return fallback;
  }

  // Dev convenience: auto-register only when no workspace row exists yet.
  if (process.env.SLACK_AUTO_REGISTER_ENV_TOKEN !== "false") {
    try {
      const created = await upsertWorkspaceFromOAuth({
        teamId,
        teamName: fallback.teamName,
        botAccessToken: fallback.botAccessToken,
        incomingChannelId: fallback.incomingChannelId,
        incomingChannelName: fallback.incomingChannelName,
      });
      return created?.toObject?.() || created;
    } catch (error) {
      console.warn("[Workspace] auto-register failed:", error?.message);
    }
  }

  return null;
}

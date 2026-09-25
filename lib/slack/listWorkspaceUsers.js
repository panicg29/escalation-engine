import { findWorkspaceByTeamId } from "@/lib/services/workspaceService";

const LIST_CACHE_TTL_MS = 5 * 60 * 1000;
global.workspaceUsersCache = global.workspaceUsersCache || new Map();
global.workspaceUsersCacheTs = global.workspaceUsersCacheTs || new Map();

function pickDisplayName(user) {
  if (!user) return "Unknown user";
  const profile = user.profile || {};
  return (
    profile.display_name?.trim() ||
    profile.real_name?.trim() ||
    user.real_name?.trim() ||
    user.name?.trim() ||
    user.id
  );
}

function toWorkspaceUser(user) {
  const profile = user.profile || {};
  return {
    id: user.id,
    name: pickDisplayName(user),
    handle: user.name || "",
    isBot: Boolean(user.is_bot),
    isDeleted: Boolean(user.deleted),
    avatar: profile.image_48 || profile.image_32 || "",
  };
}

export async function listWorkspaceUsers(teamId, { includeBots = true } = {}) {
  if (!teamId) {
    throw new Error("teamId is required.");
  }

  const cacheKey = `${teamId}:${includeBots ? "all" : "humans"}`;
  const cached = global.workspaceUsersCache.get(cacheKey);
  const cacheTs = global.workspaceUsersCacheTs.get(cacheKey) || 0;
  if (cached && Date.now() - cacheTs < LIST_CACHE_TTL_MS) {
    return cached;
  }

  const workspace = await findWorkspaceByTeamId(teamId);
  const token = workspace?.botAccessToken;
  if (!token) {
    throw new Error("Workspace is not connected or missing a bot token.");
  }

  const members = [];
  let cursor = "";

  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`https://slack.com/api/users.list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "Failed to fetch workspace users from Slack.");
    }

    if (Array.isArray(data.members)) {
      members.push(...data.members);
    }

    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  const users = members
    .filter((user) => user?.id && !user.deleted && user.id !== "USLACKBOT")
    .filter((user) => (includeBots ? true : !user.is_bot))
    .map(toWorkspaceUser)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  global.workspaceUsersCache.set(cacheKey, users);
  global.workspaceUsersCacheTs.set(cacheKey, Date.now());

  return users;
}

export function clearWorkspaceUsersCache(teamId) {
  if (!teamId) return;
  for (const key of global.workspaceUsersCache.keys()) {
    if (key.startsWith(`${teamId}:`)) {
      global.workspaceUsersCache.delete(key);
      global.workspaceUsersCacheTs.delete(key);
    }
  }
}

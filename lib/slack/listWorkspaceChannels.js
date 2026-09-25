import { findWorkspaceByTeamId } from "@/lib/services/workspaceService";

const LIST_CACHE_TTL_MS = 5 * 60 * 1000;
global.workspaceChannelsCache = global.workspaceChannelsCache || new Map();
global.workspaceChannelsCacheTs = global.workspaceChannelsCacheTs || new Map();

function toWorkspaceChannel(channel) {
  return {
    id: channel.id,
    name: channel.name || channel.id,
    isPrivate: Boolean(channel.is_private),
    numMembers: typeof channel.num_members === "number" ? channel.num_members : null,
  };
}

export async function listWorkspaceChannels(teamId) {
  if (!teamId) {
    throw new Error("teamId is required.");
  }

  const cacheKey = teamId;
  const cached = global.workspaceChannelsCache.get(cacheKey);
  const cacheTs = global.workspaceChannelsCacheTs.get(cacheKey) || 0;
  if (cached && Date.now() - cacheTs < LIST_CACHE_TTL_MS) {
    return cached;
  }

  const workspace = await findWorkspaceByTeamId(teamId);
  const token = workspace?.botAccessToken;
  if (!token) {
    throw new Error("Workspace is not connected or missing a bot token.");
  }

  const channels = [];
  let cursor = "";

  do {
    const params = new URLSearchParams({
      limit: "200",
      exclude_archived: "true",
      types: "public_channel,private_channel",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://slack.com/api/conversations.list?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "Failed to fetch workspace channels from Slack.");
    }

    if (Array.isArray(data.channels)) {
      channels.push(...data.channels);
    }

    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  const normalized = channels
    .filter((channel) => channel?.id && channel?.name && !channel.is_archived)
    .map(toWorkspaceChannel)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  global.workspaceChannelsCache.set(cacheKey, normalized);
  global.workspaceChannelsCacheTs.set(cacheKey, Date.now());

  return normalized;
}

export function clearWorkspaceChannelsCache(teamId) {
  if (!teamId) return;
  global.workspaceChannelsCache.delete(teamId);
  global.workspaceChannelsCacheTs.delete(teamId);
}

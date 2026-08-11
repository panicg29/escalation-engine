function getEnvSlackToken() {
  return (
    process.env.SLACK_BOT_TOKEN ||
    process.env.SLACK_USER_TOKEN ||
    process.env.SLACK_OAUTH_TOKEN ||
    ""
  );
}

import { getCacheValue, setCacheValue, setBatchCacheValues, CACHE_PREFIXES, DEFAULT_TTL } from "@/lib/redis/cache.js";

// Fallback in-memory cache for when Redis is not available
const fallbackCache = global.slackUserCache || (global.slackUserCache = new Map());
let missingTokenLogged = false;

function cacheKey(teamId, userId) {
  return userId;
}

async function getCachedUser(userId, teamId) {
  try {
    // Try Redis cache first
    const cached = await getCacheValue(CACHE_PREFIXES.SLACK_USER, userId, { teamId });
    if (cached) return cached;
    
    // Fallback to memory cache
    const fallbackKey = `${teamId || "default"}:${userId}`;
    return fallbackCache.get(fallbackKey) || null;
  } catch (error) {
    console.warn(`Cache get failed for user ${userId}:`, error?.message);
    // Fallback to memory cache
    const fallbackKey = `${teamId || "default"}:${userId}`;
    return fallbackCache.get(fallbackKey) || null;
  }
}

async function setCachedUser(userId, name, teamId) {
  try {
    // Set in Redis cache
    await setCacheValue(CACHE_PREFIXES.SLACK_USER, userId, name, { 
      teamId, 
      ttl: DEFAULT_TTL.SLACK_USER 
    });
    
    // Also set in fallback cache
    const fallbackKey = `${teamId || "default"}:${userId}`;
    fallbackCache.set(fallbackKey, name);
  } catch (error) {
    console.warn(`Cache set failed for user ${userId}:`, error?.message);
    // At least set in fallback cache
    const fallbackKey = `${teamId || "default"}:${userId}`;
    fallbackCache.set(fallbackKey, name);
  }
}

async function setBatchCachedUsers(userMap, teamId) {
  try {
    // Set in Redis cache
    await setBatchCacheValues(CACHE_PREFIXES.SLACK_USER, userMap, {
      teamId,
      ttl: DEFAULT_TTL.SLACK_USER
    });
    
    // Also set in fallback cache
    for (const [userId, name] of Object.entries(userMap)) {
      const fallbackKey = `${teamId || "default"}:${userId}`;
      fallbackCache.set(fallbackKey, name);
    }
  } catch (error) {
    console.warn(`Batch cache set failed:`, error?.message);
    // At least set in fallback cache
    for (const [userId, name] of Object.entries(userMap)) {
      const fallbackKey = `${teamId || "default"}:${userId}`;
      fallbackCache.set(fallbackKey, name);
    }
  }
}

function pickName(user) {
  if (!user) return null;
  const profile = user.profile || {};
  const display = profile.display_name?.trim();
  if (display) return display;
  const real = profile.real_name?.trim();
  if (real) return real;
  const name = user.name?.trim();
  if (name) return name;
  return null;
}

function nameFromEvent(event) {
  const profile = event?.user_profile;
  if (!profile) return null;
  return (
    profile.display_name?.trim() ||
    profile.real_name?.trim() ||
    profile.name?.trim() ||
    null
  );
}

/**
 * Batch resolve multiple users in parallel (much faster than sequential)
 */
export async function resolveSlackUserNames(
  userIds, 
  { teamId = null, botToken = null } = {}
) {
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return {};
  }

  const token = botToken || getEnvSlackToken();
  if (!token) {
    const fallback = {};
    userIds.forEach(id => { fallback[id] = "Team member"; });
    return fallback;
  }

  // Check cache for all users first
  const cachePromises = userIds.map(async (userId) => {
    if (!userId || userId === "unknown") return { userId, cached: null };
    const cached = await getCachedUser(userId, teamId);
    return { userId, cached };
  });
  
  const cacheResults = await Promise.all(cachePromises);
  const uncachedUserIds = cacheResults
    .filter(result => result.cached === null && result.userId && result.userId !== "unknown")
    .map(result => result.userId);

  // Return cached results immediately if no uncached users
  if (uncachedUserIds.length === 0) {
    const results = {};
    cacheResults.forEach(({ userId, cached }) => {
      if (userId && userId !== "unknown") {
        results[userId] = cached || "Team member";
      }
    });
    return results;
  }

  // Fetch uncached users in parallel
  const fetchPromises = uncachedUserIds.map(async (userId) => {
    try {
      const res = await fetch(
        `https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (!data.ok) {
        console.warn(`[Slack] users.info failed for ${userId}:`, data.error || "unknown");
        return { userId, name: "Team member" };
      }

      const name = pickName(data.user) || "Team member";
      
      return { userId, name };
    } catch (error) {
      console.warn(`[Slack] users.info request error for ${userId}:`, error?.message);
      return { userId, name: "Team member" };
    }
  });

  const fetchResults = await Promise.all(fetchPromises);

  // Cache the fetched results in batch
  const fetchedUserMap = {};
  fetchResults.forEach(({ userId, name }) => {
    fetchedUserMap[userId] = name;
  });
  
  if (Object.keys(fetchedUserMap).length > 0) {
    await setBatchCachedUsers(fetchedUserMap, teamId);
  }

  // Combine cached and fetched results
  const allResults = {};
  cacheResults.forEach(({ userId, cached }) => {
    if (!userId || userId === "unknown") {
      allResults[userId] = "Unknown";
      return;
    }

    if (cached !== null) {
      allResults[userId] = cached;
    } else {
      // Find in fetch results
      const fetchResult = fetchResults.find(r => r.userId === userId);
      allResults[userId] = fetchResult ? fetchResult.name : "Team member";
    }
  });

  return allResults;
}

export async function resolveSlackUserName(
  userId,
  event = null,
  { teamId = null, botToken = null } = {}
) {
  if (!userId || userId === "unknown") return "Unknown";

  const fromEvent = nameFromEvent(event);
  if (fromEvent) {
    await setCachedUser(userId, fromEvent, teamId);
    return fromEvent;
  }

  const cached = await getCachedUser(userId, teamId);
  if (cached) return cached;

  const token = botToken || getEnvSlackToken();
  if (!token) {
    if (!missingTokenLogged) {
      missingTokenLogged = true;
      console.warn(
        "[Slack] No bot token available — connect a workspace or set SLACK_BOT_TOKEN to resolve display names."
      );
    }
    return "Team member";
  }

  // For single user resolution, use the batch function
  const results = await resolveSlackUserNames([userId], { teamId, botToken });
  return results[userId] || "Team member";
}

export async function backfillUserName(
  userId,
  currentName,
  { teamId = null, botToken = null } = {}
) {
  if (!userId || (currentName && currentName !== "Team member")) {
    return currentName || "Team member";
  }
  return resolveSlackUserName(userId, null, { teamId, botToken });
}

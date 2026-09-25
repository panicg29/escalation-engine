import { connectDB } from "@/lib/db";
import Rules from "@/lib/models/Rules";

// Global cache for rules to avoid DB hits on every message
global.rulesCache = global.rulesCache || new Map();
global.rulesCacheTimestamp = global.rulesCacheTimestamp || new Map();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached rules for a team, with automatic cache invalidation
 */
export async function getRulesForTeam(teamId) {
  if (!teamId) return Rules.getDefaultRules();

  const now = Date.now();
  const cacheKey = teamId;
  const cachedRules = global.rulesCache.get(cacheKey);
  const cacheTimestamp = global.rulesCacheTimestamp.get(cacheKey) || 0;

  // Return cached rules if still fresh
  if (cachedRules && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return normalizeRulesLists(cachedRules);
  }

  try {
    await connectDB();
    const rules = await Rules.getRulesForTeam(teamId);
    const normalizedRules = normalizeRulesLists(rules);
    
    // Update cache
    global.rulesCache.set(cacheKey, normalizedRules);
    global.rulesCacheTimestamp.set(cacheKey, now);
    
    return normalizedRules;
  } catch (error) {
    console.error(`Failed to fetch rules for team ${teamId}:`, error);
    // Return cached rules as fallback if available
    if (cachedRules) return cachedRules;
    // Final fallback to defaults
    return Rules.getDefaultRules();
  }
}

/**
 * Clear rules cache for a specific team
 */
export function clearRulesCache(teamId) {
  if (teamId) {
    global.rulesCache.delete(teamId);
    global.rulesCacheTimestamp.delete(teamId);
  }
}

/**
 * Normalize VIP/muted lists so a user cannot appear in both (VIP wins).
 */
export function sanitizePeopleLists(vipUsers = [], mutedUsers = []) {
  const vipSet = new Set(Array.isArray(vipUsers) ? vipUsers.filter(Boolean) : []);
  const muted = (Array.isArray(mutedUsers) ? mutedUsers : []).filter(
    (id) => id && !vipSet.has(id)
  );
  return {
    vipUsers: [...vipSet],
    mutedUsers: muted,
  };
}

/**
 * Normalize monitored/ignored channel lists (ignored wins on overlap).
 */
export function sanitizeChannelLists(monitoredChannels = [], ignoredChannels = []) {
  const ignoredSet = new Set(
    Array.isArray(ignoredChannels) ? ignoredChannels.filter(Boolean) : []
  );
  const monitored = (Array.isArray(monitoredChannels) ? monitoredChannels : []).filter(
    (id) => id && !ignoredSet.has(id)
  );
  return {
    monitoredChannels: monitored,
    ignoredChannels: [...ignoredSet],
  };
}

function normalizeRulesLists(rules = {}) {
  const { vipUsers, mutedUsers } = sanitizePeopleLists(
    rules.vipUsers,
    rules.mutedUsers
  );
  const { monitoredChannels, ignoredChannels } = sanitizeChannelLists(
    rules.monitoredChannels,
    rules.ignoredChannels
  );
  return {
    ...rules,
    vipUsers,
    mutedUsers,
    monitoredChannels,
    ignoredChannels,
  };
}

/**
 * Check if a user is in the VIP list (instant escalation)
 */
export async function isVipUser(teamId, userId) {
  if (!teamId || !userId) return false;
  const rules = await getRulesForTeam(teamId);
  return rules.vipUsers?.includes(userId) || false;
}

/**
 * Check if a user should be muted/ignored
 */
export async function isMutedUser(teamId, userId, isBot = false) {
  if (!teamId || !userId) return false;

  // VIP always wins over mute rules
  if (await isVipUser(teamId, userId)) return false;

  const rules = await getRulesForTeam(teamId);

  // Check bot muting
  if (isBot && rules.muteBots) return true;

  // Check explicit muted users list
  return rules.mutedUsers?.includes(userId) || false;
}

/**
 * Check if a channel should be monitored
 */
export async function shouldMonitorChannel(teamId, channelId) {
  if (!teamId || !channelId) return true; // Default to monitoring
  const rules = await getRulesForTeam(teamId);
  
  // If channel is explicitly ignored, don't monitor
  if (rules.ignoredChannels?.includes(channelId)) return false;
  
  // If there's a monitored channels list, only monitor those
  if (rules.monitoredChannels?.length > 0) {
    return rules.monitoredChannels.includes(channelId);
  }
  
  // Default: monitor all channels not in ignore list
  return true;
}

/**
 * Get escalation timeout in milliseconds for a team
 */
export async function getEscalationTimeout(teamId) {
  const envMs = Number.parseInt(process.env.ESCALATION_TIMER_MS || "", 10);
  if (Number.isFinite(envMs) && envMs >= 5000) return envMs;

  const rules = await getRulesForTeam(teamId);
  const seconds = Number(rules.escalationTimeoutSeconds);
  const safeSeconds = Number.isFinite(seconds) && seconds >= 15 ? seconds : 15;
  return safeSeconds * 1000;
}

/**
 * Get escalation phone number for a team
 */
export async function getEscalationPhone(teamId) {
  const rules = await getRulesForTeam(teamId);
  return rules.escalationPhone || process.env.TEST_USER_PHONE || "";
}

/**
 * Get AI sensitivity configuration for triage
 */
export async function getAiSensitivityConfig(teamId) {
  const rules = await getRulesForTeam(teamId);
  
  const config = {
    sensitivity: rules.aiSensitivity || "balanced",
    escalateThreshold: rules.escalateThreshold || 8,
    logThreshold: rules.logThreshold || 4
  };
  
  // Apply sensitivity multipliers to thresholds
  switch (config.sensitivity) {
    case "low":
      config.escalateThreshold = Math.max(6, config.escalateThreshold - 1);
      config.logThreshold = Math.max(1, config.logThreshold - 1);
      break;
    case "strict":
      config.escalateThreshold = Math.min(10, config.escalateThreshold + 1);
      config.logThreshold = Math.min(7, config.logThreshold + 1);
      break;
    // "balanced" uses defaults
  }
  
  return config;
}

/**
 * Check if rate limiting should apply for escalations
 */
export async function shouldRateLimit(teamId, currentHourEscalations = 0) {
  const rules = await getRulesForTeam(teamId);
  const limit = rules.hourlyEscalationLimit || 12;
  return currentHourEscalations >= limit;
}

/**
 * Get cooldown period in minutes
 */
export async function getCooldownMinutes(teamId) {
  const rules = await getRulesForTeam(teamId);
  return rules.cooldownMinutes || 30;
}

/**
 * Check if after-hours boost should be applied
 */
export async function shouldApplyAfterHoursBoost(teamId) {
  const rules = await getRulesForTeam(teamId);
  if (!rules.afterHoursBoost) return false;
  
  const now = new Date();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const hour = now.getHours();
  const isAfterHours = hour < 9 || hour >= 17;
  
  return isWeekend || isAfterHours;
}

/**
 * Get custom rules text for LLM prompt enhancement
 */
export async function getCustomRules(teamId) {
  const rules = await getRulesForTeam(teamId);
  return rules.customRules || "";
}

/**
 * Apply rules-based classification override
 * Returns { shouldOverride: boolean, classification?: string, reason?: string }
 */
export async function applyRulesOverride(
  teamId,
  userId,
  channelId,
  text,
  isBot = false,
  { includeVip = true } = {}
) {
  // VIP takes priority — skip AI triage and always escalate
  if (includeVip && (await isVipUser(teamId, userId))) {
    return {
      shouldOverride: true,
      classification: "Escalate",
      reason: "VIP user — instant escalation",
      bypassMentionChecks: true,
      timerTrigger: "vip_sender",
    };
  }

  // Check if user is muted
  if (await isMutedUser(teamId, userId, isBot)) {
    return {
      shouldOverride: true,
      classification: "Mute",
      reason: isBot ? "Bot messages are muted" : "User is in muted list",
    };
  }
  
  // Check if channel should not be monitored
  if (!(await shouldMonitorChannel(teamId, channelId))) {
    return {
      shouldOverride: true,
      classification: "Mute",
      reason: "Channel not monitored"
    };
  }
  
  return { shouldOverride: false };
}
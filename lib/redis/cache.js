import { getRedisClient, isRedisAvailable } from "./client.js";

// Fallback in-memory cache when Redis is not available
const memoryCache = new Map();

// Cache key prefixes for organization
const CACHE_PREFIXES = {
  SLACK_USER: "slack:user:",
  EMBEDDING: "embedding:",
  TRIAGE_RESULT: "triage:",
  USER_SESSION: "session:",
};

// Default TTL values (in seconds)
const DEFAULT_TTL = {
  SLACK_USER: 3600, // 1 hour
  EMBEDDING: 1800, // 30 minutes  
  TRIAGE_RESULT: 900, // 15 minutes
  USER_SESSION: 7200, // 2 hours
};

/**
 * Build cache key with proper prefix and team scoping
 */
function buildCacheKey(prefix, key, teamId = null) {
  const scopedKey = teamId ? `${teamId}:${key}` : key;
  return `${prefix}${scopedKey}`;
}

/**
 * Set cache value with TTL
 */
export async function setCacheValue(prefix, key, value, { teamId = null, ttl = null } = {}) {
  const cacheKey = buildCacheKey(prefix, key, teamId);
  const serializedValue = JSON.stringify(value);
  const expiresIn = ttl || DEFAULT_TTL.SLACK_USER; // Default fallback

  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      await redis.setex(cacheKey, expiresIn, serializedValue);
      return true;
    } else {
      // Fallback to memory cache with simple TTL simulation
      memoryCache.set(cacheKey, {
        value: serializedValue,
        expires: Date.now() + (expiresIn * 1000),
      });
      return true;
    }
  } catch (error) {
    console.warn(`Cache set failed for ${cacheKey}:`, error?.message);
    return false;
  }
}

/**
 * Get cache value  
 */
export async function getCacheValue(prefix, key, { teamId = null } = {}) {
  const cacheKey = buildCacheKey(prefix, key, teamId);

  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      const cached = await redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } else {
      // Fallback to memory cache
      const cached = memoryCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return JSON.parse(cached.value);
      } else if (cached) {
        // Expired, remove it
        memoryCache.delete(cacheKey);
      }
      return null;
    }
  } catch (error) {
    console.warn(`Cache get failed for ${cacheKey}:`, error?.message);
    return null;
  }
}

/**
 * Delete cache value
 */
export async function deleteCacheValue(prefix, key, { teamId = null } = {}) {
  const cacheKey = buildCacheKey(prefix, key, teamId);

  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      await redis.del(cacheKey);
    } else {
      memoryCache.delete(cacheKey);
    }
    return true;
  } catch (error) {
    console.warn(`Cache delete failed for ${cacheKey}:`, error?.message);
    return false;
  }
}

/**
 * Set multiple cache values at once (batch operation)
 */
export async function setBatchCacheValues(prefix, keyValueMap, { teamId = null, ttl = null } = {}) {
  const expiresIn = ttl || DEFAULT_TTL.SLACK_USER;

  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      const pipeline = redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValueMap)) {
        const cacheKey = buildCacheKey(prefix, key, teamId);
        const serializedValue = JSON.stringify(value);
        pipeline.setex(cacheKey, expiresIn, serializedValue);
      }
      
      await pipeline.exec();
      return true;
    } else {
      // Fallback to memory cache
      const expireTime = Date.now() + (expiresIn * 1000);
      for (const [key, value] of Object.entries(keyValueMap)) {
        const cacheKey = buildCacheKey(prefix, key, teamId);
        memoryCache.set(cacheKey, {
          value: JSON.stringify(value),
          expires: expireTime,
        });
      }
      return true;
    }
  } catch (error) {
    console.warn(`Batch cache set failed:`, error?.message);
    return false;
  }
}

/**
 * Get multiple cache values at once (batch operation)
 */
export async function getBatchCacheValues(prefix, keys, { teamId = null } = {}) {
  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      const cacheKeys = keys.map(key => buildCacheKey(prefix, key, teamId));
      const values = await redis.mget(cacheKeys);
      
      const results = {};
      keys.forEach((key, index) => {
        const value = values[index];
        results[key] = value ? JSON.parse(value) : null;
      });
      
      return results;
    } else {
      // Fallback to memory cache
      const results = {};
      const now = Date.now();
      
      for (const key of keys) {
        const cacheKey = buildCacheKey(prefix, key, teamId);
        const cached = memoryCache.get(cacheKey);
        
        if (cached && cached.expires > now) {
          results[key] = JSON.parse(cached.value);
        } else {
          if (cached) memoryCache.delete(cacheKey); // Clean up expired
          results[key] = null;
        }
      }
      
      return results;
    }
  } catch (error) {
    console.warn(`Batch cache get failed:`, error?.message);
    return {};
  }
}

/**
 * Clear all cache entries with a specific prefix and team
 */
export async function clearTeamCache(prefix, teamId) {
  try {
    if (isRedisAvailable()) {
      const redis = await getRedisClient();
      const pattern = buildCacheKey(prefix, "*", teamId);
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(keys);
      }
      return keys.length;
    } else {
      // Fallback to memory cache
      const pattern = buildCacheKey(prefix, "", teamId);
      let deletedCount = 0;
      
      for (const key of memoryCache.keys()) {
        if (key.startsWith(pattern)) {
          memoryCache.delete(key);
          deletedCount++;
        }
      }
      
      return deletedCount;
    }
  } catch (error) {
    console.warn(`Clear team cache failed for ${prefix}${teamId}:`, error?.message);
    return 0;
  }
}

// Export cache prefixes and TTL constants for use by other modules
export { CACHE_PREFIXES, DEFAULT_TTL };
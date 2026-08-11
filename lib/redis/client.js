import Redis from "ioredis";

let redisClient = null;
let isConnected = false;

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0", 10),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  showFriendlyErrorStack: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  // Connection pool settings for scalability
  maxLoadingTimeout: 5000,
};

/**
 * Get or create Redis client instance
 */
export async function getRedisClient() {
  if (redisClient && isConnected) {
    return redisClient;
  }

  try {
    if (redisClient) {
      await redisClient.quit();
    }

    redisClient = new Redis(REDIS_CONFIG);

    // Connection event handlers
    redisClient.on("connect", () => {
      console.log("Redis client connected");
      isConnected = true;
    });

    redisClient.on("ready", () => {
      console.log("Redis client ready");
    });

    redisClient.on("error", (error) => {
      console.error("Redis client error:", error?.message);
      isConnected = false;
    });

    redisClient.on("close", () => {
      console.log("Redis client connection closed");
      isConnected = false;
    });

    redisClient.on("reconnecting", () => {
      console.log("Redis client reconnecting...");
      isConnected = false;
    });

    // Test the connection
    await redisClient.connect();
    await redisClient.ping();
    
    return redisClient;
  } catch (error) {
    console.error("Failed to connect to Redis:", error?.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Check if Redis is available and connected
 */
export function isRedisAvailable() {
  return Boolean(
    process.env.REDIS_ENABLED === "true" && 
    redisClient && 
    isConnected
  );
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedisConnection() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log("Redis connection closed gracefully");
    } catch (error) {
      console.error("Error closing Redis connection:", error?.message);
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
}

/**
 * Get Redis client for pub/sub operations (separate connection)
 */
export async function getRedisPubSubClient() {
  const pubSubClient = new Redis(REDIS_CONFIG);
  await pubSubClient.connect();
  return pubSubClient;
}

// Handle process termination
if (typeof process !== "undefined") {
  process.on("SIGINT", closeRedisConnection);
  process.on("SIGTERM", closeRedisConnection);
}
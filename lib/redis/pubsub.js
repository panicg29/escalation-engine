import { getRedisPubSubClient, isRedisAvailable } from "./client.js";
import { EventEmitter } from "events";

// Fallback in-process EventEmitter when Redis is not available  
const fallbackEmitter = new EventEmitter();
fallbackEmitter.setMaxListeners(100); // Allow many SSE connections

// Redis pub/sub clients (separate connections for pub and sub)
let publisherClient = null;
let subscriberClient = null;

// Event channel prefixes
const CHANNELS = {
  ALERT: "alerts:",
  RESOLUTION: "resolutions:", 
  ESCALATION: "escalations:",
  SYSTEM: "system:",
};

/**
 * Initialize Redis pub/sub clients
 */
async function initializePubSub() {
  if (!isRedisAvailable()) {
    console.log("Redis not available, using in-process EventEmitter for pub/sub");
    return false;
  }

  try {
    if (!publisherClient) {
      publisherClient = await getRedisPubSubClient();
      console.log("Redis publisher client initialized");
    }
    
    if (!subscriberClient) {
      subscriberClient = await getRedisPubSubClient();
      console.log("Redis subscriber client initialized");
    }
    
    return true;
  } catch (error) {
    console.error("Failed to initialize Redis pub/sub:", error?.message);
    return false;
  }
}

/**
 * Publish event to Redis channel or fallback emitter
 */
export async function publishEvent(channel, eventData, { teamId = null } = {}) {
  const fullChannel = teamId ? `${channel}${teamId}` : channel;
  
  try {
    // Try Redis first
    if (isRedisAvailable() && publisherClient) {
      const payload = JSON.stringify({
        ...eventData,
        timestamp: Date.now(),
        teamId,
      });
      
      await publisherClient.publish(fullChannel, payload);
      return true;
    } else {
      // Fallback to in-process EventEmitter
      fallbackEmitter.emit(fullChannel, {
        ...eventData,
        timestamp: Date.now(), 
        teamId,
      });
      return true;
    }
  } catch (error) {
    console.error(`Failed to publish to ${fullChannel}:`, error?.message);
    
    // Try fallback on Redis failure
    try {
      fallbackEmitter.emit(fullChannel, {
        ...eventData,
        timestamp: Date.now(),
        teamId,
        fallback: true,
      });
      return true;
    } catch (fallbackError) {
      console.error("Fallback publish also failed:", fallbackError?.message);
      return false;
    }
  }
}

/**
 * Subscribe to Redis channel or fallback emitter
 */
export async function subscribeToEvents(channel, callback, { teamId = null } = {}) {
  const fullChannel = teamId ? `${channel}${teamId}` : channel;
  
  try {
    // Try Redis first
    if (isRedisAvailable() && !subscriberClient) {
      await initializePubSub();
    }
    
    if (isRedisAvailable() && subscriberClient) {
      // Redis pub/sub subscription
      await subscriberClient.subscribe(fullChannel);
      
      subscriberClient.on("message", (channel, message) => {
        if (channel === fullChannel) {
          try {
            const eventData = JSON.parse(message);
            callback(eventData);
          } catch (parseError) {
            console.error(`Failed to parse message from ${channel}:`, parseError?.message);
          }
        }
      });
      
      console.log(`Subscribed to Redis channel: ${fullChannel}`);
      return () => subscriberClient.unsubscribe(fullChannel);
    } else {
      // Fallback to in-process EventEmitter
      fallbackEmitter.on(fullChannel, callback);
      console.log(`Subscribed to fallback channel: ${fullChannel}`);
      return () => fallbackEmitter.off(fullChannel, callback);
    }
  } catch (error) {
    console.error(`Failed to subscribe to ${fullChannel}:`, error?.message);
    
    // Always provide fallback subscription
    fallbackEmitter.on(fullChannel, callback);
    console.log(`Using fallback subscription for: ${fullChannel}`);
    return () => fallbackEmitter.off(fullChannel, callback);
  }
}

/**
 * Unsubscribe from all channels (cleanup)
 */
export async function unsubscribeAll() {
  try {
    if (subscriberClient) {
      await subscriberClient.unsubscribe();
      console.log("Unsubscribed from all Redis channels");
    }
    
    fallbackEmitter.removeAllListeners();
    console.log("Cleared all fallback event listeners");
  } catch (error) {
    console.error("Error during unsubscribe:", error?.message);
  }
}

/**
 * Get current subscription count (for monitoring)
 */
export async function getSubscriptionCount() {
  try {
    if (isRedisAvailable() && subscriberClient) {
      const channels = await subscriberClient.pubsub("channels");
      return {
        redis: channels.length,
        fallback: fallbackEmitter.listenerCount(),
        mode: "redis"
      };
    } else {
      return {
        redis: 0,
        fallback: fallbackEmitter.listenerCount(),
        mode: "fallback"
      };
    }
  } catch (error) {
    console.error("Failed to get subscription count:", error?.message);
    return {
      redis: 0,
      fallback: fallbackEmitter.listenerCount(),
      mode: "error"
    };
  }
}

/**
 * Broadcast alert event (convenience wrapper)
 */
export async function broadcastAlert(alertData, teamId) {
  return publishEvent(CHANNELS.ALERT, {
    eventKind: "alert",
    alert: alertData,
  }, { teamId });
}

/**
 * Broadcast alert update event (convenience wrapper)
 */
export async function broadcastAlertUpdate(alertData, teamId) {
  return publishEvent(CHANNELS.ALERT, {
    eventKind: "alert_update", 
    alert: alertData,
  }, { teamId });
}

/**
 * Broadcast resolution attempt event (convenience wrapper)
 */
export async function broadcastResolutionAttempt(data, teamId) {
  return publishEvent(CHANNELS.RESOLUTION, {
    eventKind: "resolution_attempt",
    ...data,
  }, { teamId });
}

// Initialize pub/sub on module load
initializePubSub().catch(error => {
  console.warn("Redis pub/sub initialization failed, will use fallback:", error?.message);
});

// Export channel constants
export { CHANNELS };
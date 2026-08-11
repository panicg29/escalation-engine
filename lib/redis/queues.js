import { Queue, Worker } from "bullmq";
import { getRedisClient, isRedisAvailable } from "./client.js";

// Queue names
export const QUEUE_NAMES = {
  ESCALATION: "escalation-queue",
  NOTIFICATIONS: "notifications-queue",
  CLEANUP: "cleanup-queue",
};

// Job types
export const JOB_TYPES = {
  ESCALATE_ALERT: "escalate-alert",
  CLEANUP_EXPIRED: "cleanup-expired",
  SEND_NOTIFICATION: "send-notification",
};

// Queue instances
let queues = {};
let workers = {};
let isInitialized = false;

/**
 * Initialize BullMQ queues and workers
 */
export async function initializeQueues() {
  if (isInitialized) return true;

  try {
    if (!isRedisAvailable()) {
      console.log("Redis not available, queue operations will use fallback mechanisms");
      return false;
    }

    const redisConfig = {
      // Use the same Redis client configuration
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || "0", 10),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    // Initialize queues (BullMQ handles delayed jobs natively — no QueueScheduler needed)
    for (const queueName of Object.values(QUEUE_NAMES)) {
      queues[queueName] = new Queue(queueName, { connection: redisConfig });
    }

    console.log("BullMQ queues initialized");
    isInitialized = true;
    return true;
  } catch (error) {
    console.error("Failed to initialize BullMQ queues:", error?.message);
    return false;
  }
}

/**
 * Get queue instance by name
 */
export function getQueue(queueName) {
  return queues[queueName];
}

/**
 * Add escalation job (replaces setTimeout)
 */
export async function scheduleEscalationJob(alertId, teamId, delayMs = 15000, { botToken = null, channelId = null } = {}) {
  try {
    if (!isInitialized) {
      await initializeQueues();
    }

    const queue = getQueue(QUEUE_NAMES.ESCALATION);
    if (!queue) {
      throw new Error("Escalation queue not available");
    }

    const job = await queue.add(
      JOB_TYPES.ESCALATE_ALERT,
      {
        alertId,
        teamId,
        botToken,
        channelId,
        scheduledAt: new Date().toISOString(),
      },
      {
        delay: delayMs,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 10, // Keep last 10 completed jobs for debugging
        removeOnFail: 50, // Keep last 50 failed jobs for debugging
        jobId: `escalate-${alertId}`, // Unique job ID for deduplication
      }
    );

    console.log(
      JSON.stringify({
        source: "queue-system",
        action: "scheduled",
        jobType: JOB_TYPES.ESCALATE_ALERT,
        jobId: job.id,
        alertId,
        teamId,
        delayMs,
      })
    );

    return job.id;
  } catch (error) {
    console.error("Failed to schedule escalation job:", error?.message);
    throw error;
  }
}

/**
 * Cancel escalation job (replaces clearTimeout)
 */
export async function cancelEscalationJob(alertId) {
  try {
    const queue = getQueue(QUEUE_NAMES.ESCALATION);
    if (!queue) {
      console.warn("Escalation queue not available for cancellation");
      return false;
    }

    const jobId = `escalate-${alertId}`;
    const job = await queue.getJob(jobId);
    
    if (job) {
      await job.remove();
      console.log(
        JSON.stringify({
          source: "queue-system",
          action: "cancelled",
          jobType: JOB_TYPES.ESCALATE_ALERT,
          jobId,
          alertId,
        })
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error("Failed to cancel escalation job:", error?.message);
    return false;
  }
}

/**
 * Get job status for monitoring
 */
export async function getJobStatus(queueName, jobId) {
  try {
    const queue = getQueue(queueName);
    if (!queue) return null;

    const job = await queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      delay: job.opts.delay,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
    };
  } catch (error) {
    console.error("Failed to get job status:", error?.message);
    return null;
  }
}

/**
 * Get queue statistics for monitoring
 */
export async function getQueueStats(queueName) {
  try {
    const queue = getQueue(queueName);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  } catch (error) {
    console.error("Failed to get queue stats:", error?.message);
    return null;
  }
}

/**
 * Clean up old jobs from queues
 */
export async function cleanupQueues() {
  try {
    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queue = getQueue(queueName);
      if (queue) {
        // Remove completed jobs older than 1 hour
        await queue.clean(60 * 60 * 1000, "completed");
        // Remove failed jobs older than 24 hours  
        await queue.clean(24 * 60 * 60 * 1000, "failed");
      }
    }
    console.log("Queue cleanup completed");
  } catch (error) {
    console.error("Queue cleanup failed:", error?.message);
  }
}

/**
 * Gracefully close all queues and workers
 */
export async function closeQueues() {
  try {
    // Close workers first
    for (const worker of Object.values(workers)) {
      await worker.close();
    }

    // Close queues
    for (const queue of Object.values(queues)) {
      await queue.close();
    }

    queues = {};
    workers = {};
    isInitialized = false;
    console.log("All queues closed gracefully");
  } catch (error) {
    console.error("Error closing queues:", error?.message);
  }
}

// Handle process termination
if (typeof process !== "undefined") {
  process.on("SIGINT", closeQueues);
  process.on("SIGTERM", closeQueues);
}

// Initialize queues on module load
if (process.env.REDIS_ENABLED === "true") {
  initializeQueues().catch(error => {
    console.warn("Queue initialization failed, will use fallback mechanisms:", error?.message);
  });
}
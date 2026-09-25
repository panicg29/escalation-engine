import { Queue, Worker } from "bullmq";
import { isRedisAvailable } from "./client.js";

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
let queueInitAttempted = false;
let queueAvailable = false;
let queueUnavailableLogged = false;

function logQueueUnavailableOnce(message) {
  if (queueUnavailableLogged) return;
  queueUnavailableLogged = true;
  console.log(message);
}

function getRedisConnectionConfig() {
  return {
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || "0", 10),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  };
}

/**
 * Initialize BullMQ queues and workers
 */
export async function initializeQueues() {
  if (isInitialized) return queueAvailable;
  if (queueInitAttempted) return queueAvailable;
  queueInitAttempted = true;

  if (process.env.REDIS_ENABLED !== "true") {
    logQueueUnavailableOnce(
      "Redis queues disabled (set REDIS_ENABLED=true to enable). Using in-process timers."
    );
    isInitialized = true;
    queueAvailable = false;
    return false;
  }

  try {
    if (!isRedisAvailable()) {
      logQueueUnavailableOnce(
        "Redis not connected. Escalation jobs will use in-process timers."
      );
      isInitialized = true;
      queueAvailable = false;
      return false;
    }

    const redisConfig = getRedisConnectionConfig();

    for (const queueName of Object.values(QUEUE_NAMES)) {
      queues[queueName] = new Queue(queueName, { connection: redisConfig });
    }

    console.log("BullMQ queues initialized");
    isInitialized = true;
    queueAvailable = true;
    return true;
  } catch (error) {
    logQueueUnavailableOnce(
      `BullMQ queue init failed (${error?.message}). Using in-process timers.`
    );
    isInitialized = true;
    queueAvailable = false;
    return false;
  }
}

/**
 * Whether the escalation queue is ready for use
 */
export function isEscalationQueueAvailable() {
  return queueAvailable && Boolean(getQueue(QUEUE_NAMES.ESCALATION));
}

/**
 * Get queue instance by name
 */
export function getQueue(queueName) {
  return queues[queueName];
}

/**
 * Add escalation job (replaces setTimeout when Redis is available)
 * Returns null when queue is unavailable so callers can fall back cleanly.
 */
export async function scheduleEscalationJob(
  alertId,
  teamId,
  delayMs = 15000,
  { botToken = null, channelId = null } = {}
) {
  if (!isInitialized) {
    await initializeQueues();
  }

  const queue = getQueue(QUEUE_NAMES.ESCALATION);
  if (!queue || !queueAvailable) {
    return null;
  }

  try {
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
        removeOnComplete: 10,
        removeOnFail: 50,
        jobId: `escalate-${alertId}`,
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
    return null;
  }
}

/**
 * Cancel escalation job (replaces clearTimeout)
 */
export async function cancelEscalationJob(alertId) {
  if (!isEscalationQueueAvailable()) {
    return false;
  }

  try {
    const queue = getQueue(QUEUE_NAMES.ESCALATION);
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
        await queue.clean(60 * 60 * 1000, "completed");
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
    for (const worker of Object.values(workers)) {
      await worker.close();
    }

    for (const queue of Object.values(queues)) {
      await queue.close();
    }

    queues = {};
    workers = {};
    isInitialized = false;
    queueInitAttempted = false;
    queueAvailable = false;
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

// Initialize queues on module load when Redis is enabled
if (process.env.REDIS_ENABLED === "true") {
  initializeQueues().catch((error) => {
    logQueueUnavailableOnce(
      `Queue initialization failed (${error?.message}). Using in-process timers.`
    );
  });
}

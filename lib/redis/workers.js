import { Worker } from "bullmq";
import { QUEUE_NAMES, JOB_TYPES } from "./queues.js";
import { escalateAlert } from "@/lib/services/escalationService.js";

// Worker instances
let workers = {};

/**
 * Process escalation jobs
 */
async function processEscalationJob(job) {
  const { alertId, teamId, scheduledAt, botToken, channelId } = job.data;
  
  console.log(
    JSON.stringify({
      source: "queue-worker",
      action: "processing",
      jobType: JOB_TYPES.ESCALATE_ALERT,
      jobId: job.id,
      alertId,
      teamId,
      scheduledAt,
      processedAt: new Date().toISOString(),
    })
  );

  try {
    // Call the existing escalation logic with proper parameters
    await escalateAlert({ alertId, teamId, botToken, channelId });
    
    console.log(
      JSON.stringify({
        source: "queue-worker", 
        action: "completed",
        jobType: JOB_TYPES.ESCALATE_ALERT,
        jobId: job.id,
        alertId,
        teamId,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "queue-worker",
        action: "failed",
        jobType: JOB_TYPES.ESCALATE_ALERT,
        jobId: job.id,
        alertId,
        teamId,
        error: error?.message,
      })
    );
    throw error; // Re-throw to trigger BullMQ retry logic
  }
}

/**
 * Process notification jobs (placeholder for future use)
 */
async function processNotificationJob(job) {
  const { type, recipient, message } = job.data;
  
  console.log(
    JSON.stringify({
      source: "queue-worker",
      action: "processing",
      jobType: JOB_TYPES.SEND_NOTIFICATION,
      jobId: job.id,
      notificationType: type,
      recipient,
    })
  );

  // Placeholder - implement specific notification logic here
  // This could be email, SMS, webhook, etc.
  
  console.log(
    JSON.stringify({
      source: "queue-worker",
      action: "completed", 
      jobType: JOB_TYPES.SEND_NOTIFICATION,
      jobId: job.id,
    })
  );
}

/**
 * Process cleanup jobs
 */
async function processCleanupJob(job) {
  const { type, olderThan } = job.data;
  
  console.log(
    JSON.stringify({
      source: "queue-worker",
      action: "processing",
      jobType: JOB_TYPES.CLEANUP_EXPIRED,
      jobId: job.id,
      cleanupType: type,
      olderThan,
    })
  );

  // Implement cleanup logic here (cache cleanup, old alerts, etc.)
  
  console.log(
    JSON.stringify({
      source: "queue-worker",
      action: "completed",
      jobType: JOB_TYPES.CLEANUP_EXPIRED,
      jobId: job.id,
    })
  );
}

/**
 * Initialize job workers
 */
export async function initializeWorkers() {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || "localhost", 
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || "0", 10),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    // Escalation worker
    workers[QUEUE_NAMES.ESCALATION] = new Worker(
      QUEUE_NAMES.ESCALATION,
      async (job) => {
        switch (job.name) {
          case JOB_TYPES.ESCALATE_ALERT:
            await processEscalationJob(job);
            break;
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection: redisConfig,
        concurrency: 5, // Process up to 5 escalations concurrently
        removeOnComplete: 10,
        removeOnFail: 50,
      }
    );

    // Notifications worker
    workers[QUEUE_NAMES.NOTIFICATIONS] = new Worker(
      QUEUE_NAMES.NOTIFICATIONS,
      async (job) => {
        switch (job.name) {
          case JOB_TYPES.SEND_NOTIFICATION:
            await processNotificationJob(job);
            break;
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection: redisConfig,
        concurrency: 10, // Process notifications quickly
        removeOnComplete: 5,
        removeOnFail: 20,
      }
    );

    // Cleanup worker
    workers[QUEUE_NAMES.CLEANUP] = new Worker(
      QUEUE_NAMES.CLEANUP,
      async (job) => {
        switch (job.name) {
          case JOB_TYPES.CLEANUP_EXPIRED:
            await processCleanupJob(job);
            break;
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        connection: redisConfig,
        concurrency: 1, // Cleanup jobs run sequentially
        removeOnComplete: 3,
        removeOnFail: 10,
      }
    );

    // Add error handlers
    for (const [queueName, worker] of Object.entries(workers)) {
      worker.on("completed", (job) => {
        console.log(
          JSON.stringify({
            source: "queue-worker",
            event: "completed",
            queue: queueName,
            jobId: job.id,
            jobName: job.name,
          })
        );
      });

      worker.on("failed", (job, err) => {
        console.error(
          JSON.stringify({
            source: "queue-worker",
            event: "failed",
            queue: queueName,
            jobId: job?.id,
            jobName: job?.name,
            error: err?.message,
            attempts: job?.attemptsMade,
          })
        );
      });

      worker.on("error", (err) => {
        console.error(
          JSON.stringify({
            source: "queue-worker",
            event: "error",
            queue: queueName,
            error: err?.message,
          })
        );
      });
    }

    console.log("BullMQ workers initialized");
    return true;
  } catch (error) {
    console.error("Failed to initialize workers:", error?.message);
    return false;
  }
}

/**
 * Close all workers gracefully
 */
export async function closeWorkers() {
  try {
    for (const worker of Object.values(workers)) {
      await worker.close();
    }
    workers = {};
    console.log("All workers closed gracefully");
  } catch (error) {
    console.error("Error closing workers:", error?.message);
  }
}

// Auto-initialize workers if Redis is enabled
if (process.env.REDIS_ENABLED === "true") {
  initializeWorkers().catch(error => {
    console.warn("Worker initialization failed:", error?.message);
  });
}

// Handle process termination
if (typeof process !== "undefined") {
  process.on("SIGINT", closeWorkers);
  process.on("SIGTERM", closeWorkers);
}
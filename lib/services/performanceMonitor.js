import { getCacheValue, setCacheValue, CACHE_PREFIXES, DEFAULT_TTL } from "@/lib/redis/cache.js";

// Performance monitoring configuration
const MONITORING_ENABLED = process.env.PERFORMANCE_MONITORING_ENABLED === "true";
const ALERT_THRESHOLD_MS = 3000; // 3 second target
const CACHE_TTL = 300; // 5 minutes for performance data

// Performance event types
export const PERF_EVENTS = {
  SLACK_RECEIVED: "slack-received",
  SLACK_ACKED: "slack-acked", 
  TRIAGE_START: "triage-start",
  TRIAGE_COMPLETE: "triage-complete",
  EMBEDDING_START: "embedding-start",
  EMBEDDING_COMPLETE: "embedding-complete", 
  SIMILARITY_START: "similarity-start",
  SIMILARITY_COMPLETE: "similarity-complete",
  LLM_START: "llm-start",
  LLM_COMPLETE: "llm-complete",
  DB_SAVE_START: "db-save-start",
  DB_SAVE_COMPLETE: "db-save-complete",
  SSE_BROADCAST: "sse-broadcast",
  UI_INITIALIZED: "ui-initialized",
  ESCALATION_SCHEDULED: "escalation-scheduled",
  ESCALATION_TRIGGERED: "escalation-triggered",
  TWILIO_CALL_START: "twilio-call-start",
  TWILIO_CALL_COMPLETE: "twilio-call-complete",
  RULES_OVERRIDE: "rules-override",
};

// Global performance tracking
const performanceStore = globalThis.__performanceStore || (globalThis.__performanceStore = new Map());

/**
 * Start tracking performance for a request/alert
 */
export function startPerformanceTracking(trackingId, initialEvent = PERF_EVENTS.SLACK_RECEIVED) {
  if (!MONITORING_ENABLED && !process.env.NODE_ENV === "development") return null;
  
  const startTime = Date.now();
  const tracker = {
    id: trackingId,
    startTime,
    events: [{
      event: initialEvent,
      timestamp: startTime,
      elapsed: 0,
    }],
    metadata: {},
  };
  
  performanceStore.set(trackingId, tracker);
  return tracker;
}

/**
 * Add performance event to tracking
 */
export function addPerformanceEvent(trackingId, event, metadata = {}) {
  if (!MONITORING_ENABLED && !process.env.NODE_ENV === "development") return;
  
  const tracker = performanceStore.get(trackingId);
  if (!tracker) return;
  
  const timestamp = Date.now();
  const elapsed = timestamp - tracker.startTime;
  
  tracker.events.push({
    event,
    timestamp,
    elapsed,
    metadata,
  });
  
  // Log performance alert if we exceed threshold
  if (elapsed > ALERT_THRESHOLD_MS && event === PERF_EVENTS.UI_INITIALIZED) {
    console.warn(
      JSON.stringify({
        source: "performance-monitor",
        alert: "latency-threshold-exceeded",
        trackingId,
        totalLatencyMs: elapsed,
        thresholdMs: ALERT_THRESHOLD_MS,
        events: tracker.events,
      })
    );
  }
}

/**
 * Complete performance tracking and generate report
 */
export function completePerformanceTracking(trackingId, finalEvent = PERF_EVENTS.UI_INITIALIZED) {
  if (!MONITORING_ENABLED && !process.env.NODE_ENV === "development") return null;
  
  const tracker = performanceStore.get(trackingId);
  if (!tracker) return null;
  
  // Add final event
  addPerformanceEvent(trackingId, finalEvent);
  
  const totalLatency = Date.now() - tracker.startTime;
  const report = generatePerformanceReport(tracker, totalLatency);
  
  // Cache the report for analytics
  void setCacheValue("perf", trackingId, report, { ttl: CACHE_TTL }).catch(() => {});
  
  // Clean up from memory
  performanceStore.delete(trackingId);
  
  return report;
}

/**
 * Generate detailed performance report
 */
function generatePerformanceReport(tracker, totalLatency) {
  const events = tracker.events;
  const stages = {};
  
  // Calculate stage durations
  for (let i = 1; i < events.length; i++) {
    const currentEvent = events[i];
    const previousEvent = events[i - 1];
    const stageDuration = currentEvent.elapsed - previousEvent.elapsed;
    
    stages[`${previousEvent.event}_to_${currentEvent.event}`] = {
      duration: stageDuration,
      start: previousEvent.elapsed,
      end: currentEvent.elapsed,
    };
  }
  
  // Identify bottlenecks
  const bottlenecks = Object.entries(stages)
    .filter(([_, stage]) => stage.duration > 500) // Stages taking >500ms
    .sort(([_, a], [__, b]) => b.duration - a.duration)
    .slice(0, 3); // Top 3 slowest stages
  
  const report = {
    trackingId: tracker.id,
    totalLatency,
    startTime: tracker.startTime,
    endTime: tracker.startTime + totalLatency,
    meetsTarget: totalLatency <= ALERT_THRESHOLD_MS,
    events: events,
    stages: stages,
    bottlenecks: bottlenecks.map(([stageName, stage]) => ({
      stage: stageName,
      duration: stage.duration,
      percentage: Math.round((stage.duration / totalLatency) * 100),
    })),
    summary: {
      triageTime: calculateStageTime(events, PERF_EVENTS.TRIAGE_START, PERF_EVENTS.TRIAGE_COMPLETE),
      embeddingTime: calculateStageTime(events, PERF_EVENTS.EMBEDDING_START, PERF_EVENTS.EMBEDDING_COMPLETE),
      similarityTime: calculateStageTime(events, PERF_EVENTS.SIMILARITY_START, PERF_EVENTS.SIMILARITY_COMPLETE),
      llmTime: calculateStageTime(events, PERF_EVENTS.LLM_START, PERF_EVENTS.LLM_COMPLETE),
      dbSaveTime: calculateStageTime(events, PERF_EVENTS.DB_SAVE_START, PERF_EVENTS.DB_SAVE_COMPLETE),
    },
    metadata: tracker.metadata,
  };
  
  // Log performance summary
  console.log(
    JSON.stringify({
      source: "performance-monitor",
      action: "completed",
      trackingId: tracker.id,
      totalLatencyMs: totalLatency,
      meetsTarget: report.meetsTarget,
      topBottlenecks: report.bottlenecks,
    })
  );
  
  return report;
}

/**
 * Calculate duration between two event types
 */
function calculateStageTime(events, startEvent, endEvent) {
  const start = events.find(e => e.event === startEvent);
  const end = events.find(e => e.event === endEvent);
  
  if (!start || !end) return null;
  return end.elapsed - start.elapsed;
}

/**
 * Get performance report from cache
 */
export async function getPerformanceReport(trackingId) {
  try {
    return await getCacheValue("perf", trackingId);
  } catch (error) {
    console.warn(`Failed to get performance report for ${trackingId}:`, error?.message);
    return null;
  }
}

/**
 * Get performance statistics for monitoring dashboard
 */
export async function getPerformanceStats(timeRangeMs = 300000) { // Last 5 minutes
  // This would typically query from a time-series database
  // For now, return basic stats from recent cached reports
  try {
    const recentReports = []; // In real implementation, query cached reports within timeRange
    
    if (recentReports.length === 0) {
      return {
        totalRequests: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        targetMeetRate: 0,
        topBottlenecks: [],
      };
    }
    
    const latencies = recentReports.map(r => r.totalLatency).sort((a, b) => a - b);
    const targetMeets = recentReports.filter(r => r.meetsTarget).length;
    
    return {
      totalRequests: recentReports.length,
      averageLatency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p95Latency: latencies[Math.floor(latencies.length * 0.95)] || 0,
      p99Latency: latencies[Math.floor(latencies.length * 0.99)] || 0,
      targetMeetRate: Math.round((targetMeets / recentReports.length) * 100),
      timeRange: timeRangeMs,
    };
  } catch (error) {
    console.error("Failed to get performance stats:", error?.message);
    return null;
  }
}

/**
 * Middleware to add performance tracking to HTTP requests
 */
export function performanceMiddleware(trackingIdExtractor = null) {
  return (req, res, next) => {
    const trackingId = trackingIdExtractor ? trackingIdExtractor(req) : `req-${Date.now()}-${Math.random()}`;
    
    req.performanceTracker = startPerformanceTracking(trackingId);
    req.addPerformanceEvent = (event, metadata) => addPerformanceEvent(trackingId, event, metadata);
    req.completePerformanceTracking = (finalEvent) => completePerformanceTracking(trackingId, finalEvent);
    
    // Auto-complete on response finish
    res.on('finish', () => {
      if (req.performanceTracker) {
        req.completePerformanceTracking();
      }
    });
    
    next();
  };
}

/**
 * Create a performance tracking function for a specific pipeline
 */
export function createPipelineTracker(baseName) {
  return {
    start: (id) => startPerformanceTracking(id, `${baseName}-start`),
    event: (id, event, metadata) => addPerformanceEvent(id, `${baseName}-${event}`, metadata),
    complete: (id) => completePerformanceTracking(id, `${baseName}-complete`),
  };
}

// Export performance configuration
export { MONITORING_ENABLED, ALERT_THRESHOLD_MS };
import { NextResponse } from "next/server";
import { getPerformanceReport, getPerformanceStats } from "@/lib/services/performanceMonitor.js";

export const dynamic = "force-dynamic";

/**
 * Get performance monitoring data
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingId = searchParams.get("trackingId");
    const statsOnly = searchParams.get("stats") === "true";
    const timeRange = parseInt(searchParams.get("timeRange") || "300000", 10); // Default 5 minutes

    if (trackingId) {
      // Get specific performance report
      const report = await getPerformanceReport(trackingId);
      if (!report) {
        return NextResponse.json(
          { error: "Performance report not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(report);
    }

    if (statsOnly) {
      // Get performance statistics
      const stats = await getPerformanceStats(timeRange);
      return NextResponse.json(stats || {
        totalRequests: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        targetMeetRate: 0,
        timeRange,
      });
    }

    // Return performance monitoring status
    return NextResponse.json({
      monitoring: {
        enabled: process.env.PERFORMANCE_MONITORING_ENABLED === "true",
        targetLatency: 3000,
        alertThreshold: 3000,
      },
      endpoints: {
        specificReport: "/api/performance?trackingId={id}",
        statistics: "/api/performance?stats=true&timeRange={ms}",
      },
      usage: {
        trackingId: "Use trackingId to get detailed performance report for a specific request",
        stats: "Use stats=true to get aggregated performance statistics",
        timeRange: "Use timeRange (ms) to specify statistics time window (default 5 minutes)",
      },
    });
  } catch (error) {
    console.error("Performance API error:", error?.message);
    return NextResponse.json(
      { error: "Failed to get performance data", detail: error?.message },
      { status: 500 }
    );
  }
}
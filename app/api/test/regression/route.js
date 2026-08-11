import { NextResponse } from "next/server";
import { runRegressionTests, quickHealthCheck } from "@/lib/testing/regressionTests.js";

export const dynamic = "force-dynamic";

/**
 * Run comprehensive regression tests or quick health check
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const testType = searchParams.get("type") || "health";
    const format = searchParams.get("format") || "json";

    if (testType === "health") {
      // Quick health check for monitoring
      const healthStatus = await quickHealthCheck();
      
      if (format === "text") {
        const status = healthStatus.status === "healthy" ? "OK" : "ERROR";
        return new NextResponse(status, {
          status: healthStatus.status === "healthy" ? 200 : 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
      
      return NextResponse.json(healthStatus, {
        status: healthStatus.status === "healthy" ? 200 : 503,
      });
    }

    if (testType === "regression") {
      // Full regression test suite
      console.log("🧪 Starting regression tests via API request...");
      const report = await runRegressionTests();
      
      const httpStatus = report.summary?.failed > 0 ? 500 : 200;
      
      return NextResponse.json({
        success: report.summary?.failed === 0,
        ...report,
        executedAt: new Date().toISOString(),
      }, { status: httpStatus });
    }

    // Invalid test type
    return NextResponse.json({
      error: "Invalid test type",
      validTypes: ["health", "regression"],
      usage: {
        health: "/api/test/regression?type=health",
        regression: "/api/test/regression?type=regression",
        textFormat: "/api/test/regression?type=health&format=text",
      },
    }, { status: 400 });

  } catch (error) {
    console.error("Regression test API error:", error);
    return NextResponse.json({
      error: "Test execution failed",
      detail: error?.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

/**
 * Manual test trigger (POST for safety)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const testType = body.type || "regression";
    
    if (testType !== "regression") {
      return NextResponse.json({
        error: "Only regression tests can be triggered via POST",
        validTypes: ["regression"],
      }, { status: 400 });
    }

    console.log("🧪 Running regression tests via POST request...");
    const report = await runRegressionTests();
    
    return NextResponse.json({
      success: report.summary?.failed === 0,
      triggeredBy: "manual",
      ...report,
      executedAt: new Date().toISOString(),
    }, { 
      status: report.summary?.failed > 0 ? 500 : 200 
    });

  } catch (error) {
    console.error("Manual test trigger error:", error);
    return NextResponse.json({
      error: "Manual test execution failed", 
      detail: error?.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
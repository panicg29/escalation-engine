import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Rules from "@/lib/models/Rules";
import { clearRulesCache, sanitizePeopleLists, sanitizeChannelLists } from "@/lib/services/rulesService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId parameter is required" },
        { status: 400 }
      );
    }

    await connectDB();
    const rules = await Rules.getRulesForTeam(teamId);

    return NextResponse.json({
      success: true,
      rules: rules
    });

  } catch (error) {
    console.error("Error fetching rules:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return NextResponse.json(
      { error: "Failed to fetch rules configuration", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { teamId, updatedBy, ...rulesData } = body;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    // Validate required fields and ranges
    if (rulesData.escalationTimeoutSeconds) {
      if (rulesData.escalationTimeoutSeconds < 15 || rulesData.escalationTimeoutSeconds > 900) {
        return NextResponse.json(
          { error: "Escalation timeout must be between 15 and 900 seconds" },
          { status: 400 }
        );
      }
    }

    if (rulesData.escalateThreshold) {
      if (rulesData.escalateThreshold < 6 || rulesData.escalateThreshold > 10) {
        return NextResponse.json(
          { error: "Escalate threshold must be between 6 and 10" },
          { status: 400 }
        );
      }
    }

    if (rulesData.logThreshold) {
      if (rulesData.logThreshold < 1 || rulesData.logThreshold > 7) {
        return NextResponse.json(
          { error: "Log threshold must be between 1 and 7" },
          { status: 400 }
        );
      }
    }

    const updatePayload = { ...rulesData };

    if ("vipUsers" in rulesData || "mutedUsers" in rulesData) {
      const { vipUsers, mutedUsers } = sanitizePeopleLists(
        rulesData.vipUsers,
        rulesData.mutedUsers
      );
      updatePayload.vipUsers = vipUsers;
      updatePayload.mutedUsers = mutedUsers;
    }

    if ("monitoredChannels" in rulesData || "ignoredChannels" in rulesData) {
      const { monitoredChannels, ignoredChannels } = sanitizeChannelLists(
        rulesData.monitoredChannels,
        rulesData.ignoredChannels
      );
      updatePayload.monitoredChannels = monitoredChannels;
      updatePayload.ignoredChannels = ignoredChannels;
    }

    await connectDB();

    const updatedRules = await Rules.findOneAndUpdate(
      { teamId },
      {
        ...updatePayload,
        lastUpdatedBy: updatedBy || "Unknown",
        updatedAt: new Date()
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true
      }
    );

    clearRulesCache(teamId);

    console.log(
      JSON.stringify({
        source: "rules-api",
        action: "rules_updated",
        teamId,
        updatedBy: updatedBy || "Unknown",
        changes: Object.keys(rulesData)
      })
    );

    return NextResponse.json({
      success: true,
      rules: updatedRules,
      message: "Rules configuration updated successfully"
    });

  } catch (error) {
    console.error("Error updating rules:", error);
    return NextResponse.json(
      { error: "Failed to update rules configuration" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  // Alias for PUT to support creation
  return PUT(request);
}
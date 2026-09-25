import { NextResponse } from "next/server";
import { listWorkspaceUsers } from "@/lib/slack/listWorkspaceUsers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId")?.trim();
  const includeBots = searchParams.get("includeBots") !== "false";

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  try {
    const users = await listWorkspaceUsers(teamId, { includeBots });
    return NextResponse.json({ teamId, users });
  } catch (error) {
    const message = error?.message || "Failed to load workspace users.";
    const status = message.includes("not connected") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

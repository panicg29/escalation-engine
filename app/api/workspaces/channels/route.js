import { NextResponse } from "next/server";
import { listWorkspaceChannels } from "@/lib/slack/listWorkspaceChannels";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId")?.trim();

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  try {
    const channels = await listWorkspaceChannels(teamId);
    return NextResponse.json({ teamId, channels });
  } catch (error) {
    const message = error?.message || "Failed to load workspace channels.";
    const status = message.includes("not connected") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import {
  disconnectWorkspaceByTeamId,
  listWorkspaces,
  toWorkspaceWireShape,
} from "@/lib/services/workspaceService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "true";

  try {
    const workspaces = await listWorkspaces({ activeOnly });
    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to list workspaces." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  try {
    const result = await disconnectWorkspaceByTeamId(teamId);
    if (!result?.workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      workspace: toWorkspaceWireShape(result.workspace),
      slackUninstall: result.slackUninstall,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to disconnect workspace." },
      { status: 500 }
    );
  }
}

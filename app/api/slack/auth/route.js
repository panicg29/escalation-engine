import { NextResponse } from "next/server";
import { resolveSlackUserName } from "@/lib/slack/resolveUser";

export const dynamic = "force-dynamic";

/**
 * Public app base (ngrok in local/dev). Used for OAuth redirect_uri and return URLs.
 */
function getAppBaseUrl(request) {
  const fromEnv =
    process.env.NEXT_PUBLIC_SLACK_OAUTH_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return `${proto}://${host}`.replace(/\/$/, "");
}

function getOAuthRedirectUri(request) {
  if (process.env.SLACK_REDIRECT_URI) {
    return process.env.SLACK_REDIRECT_URI.replace(/\/$/, "");
  }
  return `${getAppBaseUrl(request)}/api/slack/auth`;
}

/**
 * GET /api/slack/auth
 * - Without ?code= → redirect user to Slack OAuth authorize URL ("Add to Slack").
 * - With ?code=    → exchange code for bot token and upsert Workspace.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const baseUrl = getAppBaseUrl(request);
  const redirectUri = getOAuthRedirectUri(request);

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/sentinel/workspaces?error=${encodeURIComponent(error)}`
    );
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env.local.",
      },
      { status: 500 }
    );
  }

  if (!code) {
    const scopes = [
      "channels:history",
      "channels:read",
      "chat:write",
      "groups:history",
      "groups:read",
      "users:read",
      "reactions:read",
    ].join(",");

    const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);

    return NextResponse.redirect(authorizeUrl.toString());
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = await tokenRes.json();

    if (!data.ok) {
      console.error("[Slack OAuth] oauth.v2.access failed:", data.error);
      return NextResponse.redirect(
        `${baseUrl}/sentinel/workspaces?error=${encodeURIComponent(data.error || "oauth_failed")}`
      );
    }

    const teamId = data.team?.id;
    const teamName = data.team?.name || "Slack Workspace";
    const botAccessToken = data.access_token;

    if (!teamId || !botAccessToken) {
      return NextResponse.redirect(
        `${baseUrl}/sentinel/workspaces?error=missing_team_or_token`
      );
    }

    const authTestRes = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${botAccessToken}` },
    });
    const authTest = await authTestRes.json();
    if (!authTest.ok || authTest.team_id !== teamId) {
      console.error(
        "[Slack OAuth] received unusable bot token:",
        authTest.error || "team_id_mismatch"
      );
      return NextResponse.redirect(
        `${baseUrl}/sentinel/workspaces?error=${encodeURIComponent(
          authTest.error || "token_team_mismatch"
        )}`
      );
    }

    const incomingChannelId =
      data.incoming_webhook?.channel_id ||
      "";
    const incomingChannelName =
      data.incoming_webhook?.channel ||
      "";

    const targetUserId = data.authed_user?.id || "";
    let targetUserName = "";
    if (targetUserId) {
      targetUserName = await resolveSlackUserName(targetUserId, null, {
        teamId,
        botToken: botAccessToken,
      });
    }

    const { upsertWorkspaceFromOAuth } = await import(
      "@/lib/services/workspaceService"
    );

    await upsertWorkspaceFromOAuth({
      teamId,
      teamName,
      botAccessToken,
      incomingChannelId,
      incomingChannelName,
      targetUserId,
      targetUserName,
    });

    return NextResponse.redirect(
      `${baseUrl}/sentinel/workspaces?connected=${encodeURIComponent(teamId)}`
    );
  } catch (err) {
    console.error("[Slack OAuth] unexpected error:", err?.message || err);
    return NextResponse.redirect(
      `${baseUrl}/sentinel/workspaces?error=server_error`
    );
  }
}

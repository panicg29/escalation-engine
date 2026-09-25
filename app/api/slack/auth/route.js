import { NextResponse } from "next/server";
import { resolveSlackUserName } from "@/lib/slack/resolveUser";

export const dynamic = "force-dynamic";

/**
 * Origin of this HTTP request (localhost or the public tunnel).
 */
function getRequestOrigin(request) {
  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "") ||
    "http";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host;
  return `${proto}://${host}`.replace(/\/$/, "");
}

/**
 * Must match a Redirect URL saved on the Slack app (https ngrok in local/dev).
 * Do not send localhost here unless that URI is also registered in Slack.
 */
function getSlackRedirectUri() {
  const explicit = process.env.SLACK_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const origin = (
    process.env.NEXT_PUBLIC_SLACK_OAUTH_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/$/, "");
  return origin ? `${origin}/api/slack/auth` : "";
}

function allowedReturnOrigins() {
  const origins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  for (const raw of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SLACK_OAUTH_ORIGIN,
    process.env.SLACK_REDIRECT_URI,
  ]) {
    if (!raw) continue;
    try {
      const href = raw.includes("://") ? raw : `https://${raw}`;
      origins.add(new URL(href).origin);
    } catch {
      // ignore malformed env
    }
  }
  return origins;
}

function encodeOAuthState(returnOrigin) {
  return Buffer.from(JSON.stringify({ returnOrigin }), "utf8").toString(
    "base64url"
  );
}

function decodeOAuthState(state) {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const origin = String(parsed?.returnOrigin || "").replace(/\/$/, "");
    if (origin && allowedReturnOrigins().has(origin)) return origin;
  } catch {
    // ignore tampered state
  }
  return null;
}

function workspacesRedirect(origin, query) {
  return `${origin}/sentinel/workspaces${query}`;
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
  const requestOrigin = getRequestOrigin(request);
  const redirectUri = getSlackRedirectUri() || `${requestOrigin}/api/slack/auth`;
  const returnOrigin =
    decodeOAuthState(searchParams.get("state")) || requestOrigin;

  if (error) {
    return NextResponse.redirect(
      workspacesRedirect(
        returnOrigin,
        `?error=${encodeURIComponent(error)}`
      )
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
    authorizeUrl.searchParams.set("state", encodeOAuthState(requestOrigin));

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
        `${returnOrigin}/sentinel/workspaces?error=${encodeURIComponent(data.error || "oauth_failed")}`
      );
    }

    const teamId = data.team?.id;
    const teamName = data.team?.name || "Slack Workspace";
    const botAccessToken = data.access_token;

    if (!teamId || !botAccessToken) {
      return NextResponse.redirect(
        `${returnOrigin}/sentinel/workspaces?error=missing_team_or_token`
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
        `${returnOrigin}/sentinel/workspaces?error=${encodeURIComponent(
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
      `${returnOrigin}/sentinel/workspaces?connected=${encodeURIComponent(teamId)}`
    );
  } catch (err) {
    console.error("[Slack OAuth] unexpected error:", err?.message || err);
    return NextResponse.redirect(
      `${returnOrigin}/sentinel/workspaces?error=server_error`
    );
  }
}

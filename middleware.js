import { NextResponse } from "next/server";

const NGROK_BYPASS_HEADER = "ngrok-skip-browser-warning";
const NGROK_BYPASS_VALUE = "true";

function withNgrokBypass(response, requestHeaders) {
  response.headers.set(NGROK_BYPASS_HEADER, NGROK_BYPASS_VALUE);
  if (requestHeaders) {
    requestHeaders.set(NGROK_BYPASS_HEADER, NGROK_BYPASS_VALUE);
  }
  return response;
}

export function middleware(request) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NGROK_BYPASS_HEADER, NGROK_BYPASS_VALUE);

  if (request.nextUrl.pathname === "/") {
    return withNgrokBypass(
      NextResponse.redirect(new URL("/sentinel", request.url)),
      requestHeaders
    );
  }

  return withNgrokBypass(
    NextResponse.next({
      request: { headers: requestHeaders },
    }),
    requestHeaders
  );
}

export const config = {
  matcher: [
    /*
     * All routes except Next.js static assets, images, and the Slack events
     * SSE/webhook path (middleware can buffer or break long-lived streams).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/slack/events|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

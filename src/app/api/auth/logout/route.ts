import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("logout", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "auth/logout" });
    return NextResponse.json({ error: "Failed to log out." }, { status: 500 });
  }
}

/**
 * Cookie-clearing redirect — used by the (app) layout when a JWT passes
 * signature checks but the session is dead server-side (revoked via
 * sessionsValidAfter, deleted user). Redirecting straight to /login would
 * loop: the proxy sees a still-valid JWT and bounces back to the app.
 * Here we delete the cookies first, THEN redirect — the follow-up /login
 * request arrives clean and the loop dies.
 */
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete("waqt-session");
  res.cookies.delete("waqt-uid");
  return res;
}

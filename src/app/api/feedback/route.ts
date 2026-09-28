import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/feedback — submit a feedback/bug report from the in-app widget.
// Body: { message, page, pageDetail?, theme?, viewport? }
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("feedback", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { message, page, pageDetail, theme, viewport } = body as {
      message?: string;
      page?: string;
      pageDetail?: string;
      theme?: string;
      viewport?: string;
    };

    const msg = typeof message === "string" ? message.trim() : "";
    if (!msg) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (msg.length > 2000) {
      return NextResponse.json({ error: "Message is too long (max 2000 characters)." }, { status: 400 });
    }
    // Path context is client-supplied — cap length and keep it a path, not a URL.
    const cleanPath = (v: unknown, max: number) =>
      typeof v === "string" ? v.slice(0, max) : null;
    const safePage = cleanPath(page, 200);
    if (!safePage || !safePage.startsWith("/")) {
      return NextResponse.json({ error: "Page is required." }, { status: 400 });
    }

    await db.insert(schema.feedbackReports).values({
      userId: session.userId,
      page: safePage,
      pageDetail: cleanPath(pageDetail, 300),
      message: msg,
      theme: cleanPath(theme, 20),
      viewport: cleanPath(viewport, 20),
      userAgent: cleanPath(request.headers.get("user-agent"), 300),
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    logError(err, { route: "feedback" });
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

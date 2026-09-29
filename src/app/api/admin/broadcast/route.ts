import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/admin/broadcast — push an acknowledgement-required notice to
// every user's toast tray.
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-broadcast", getClientIp(request.headers), 10, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { title?: unknown; body?: unknown };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 1000) : "";
    if (!title) return NextResponse.json({ error: "Title required." }, { status: 400 });

    await db.execute(sql`
      INSERT INTO app_notifications (user_id, type, title, body)
      SELECT id, 'broadcast', ${title}, ${text || null} FROM users
    `);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logError(e, { route: "admin/broadcast" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

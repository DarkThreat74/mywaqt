import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export const DELETION_GRACE_MS = 5 * 60 * 60 * 1000; // 5 hours

/**
 * Scheduled account deletion — required by Apple Guideline 5.1.2 and Google
 * Play, softened into a 5-hour grace window.
 *
 * POST { confirm: "DELETE" }  → schedule deletion (5h from now)
 * POST { action: "cancel" }   → cancel a scheduled deletion
 * GET                         → { scheduledAt, deletesAt } | nulls
 *
 * The actual purge runs in the checkin cron sweep: deleting the user row
 * cascades to every related table (prayer_log, settings, devices, etc.).
 */

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [user] = await db
    .select({ deletionScheduledAt: schema.users.deletionScheduledAt })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  const scheduledAt = user?.deletionScheduledAt ?? null;
  return NextResponse.json({
    scheduledAt,
    deletesAt: scheduledAt ? new Date(scheduledAt.getTime() + DELETION_GRACE_MS).toISOString() : null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("account-delete", ip, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { confirm?: string; action?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // ── Cancel ──
    if (body.action === "cancel") {
      await db
        .update(schema.users)
        .set({ deletionScheduledAt: null })
        .where(eq(schema.users.id, session.userId));
      return NextResponse.json({ scheduledAt: null, deletesAt: null });
    }

    // ── Schedule ──
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { error: "Confirmation required. Send { confirm: 'DELETE' } to schedule account deletion." },
        { status: 400 },
      );
    }

    const scheduledAt = new Date();
    await db
      .update(schema.users)
      .set({ deletionScheduledAt: scheduledAt })
      .where(eq(schema.users.id, session.userId));

    return NextResponse.json({
      scheduledAt: scheduledAt.toISOString(),
      deletesAt: new Date(scheduledAt.getTime() + DELETION_GRACE_MS).toISOString(),
    });
  } catch (err) {
    logError(err, { route: "auth/delete" });
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

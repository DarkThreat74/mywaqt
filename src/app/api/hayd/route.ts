import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireFemaleTracking(userId: string) {
  const [s] = await db
    .select({ gender: schema.prayerSettings.gender, haydTracking: schema.prayerSettings.haydTracking })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, userId))
    .limit(1);
  return s?.gender === "female" && s.haydTracking;
}

// GET /api/hayd — active period + recent history (bounded)
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("hayd-read", getClientIp(request.headers), 60, 60000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const [active] = await db
    .select()
    .from(schema.haydPeriods)
    .where(and(eq(schema.haydPeriods.userId, session.userId), isNull(schema.haydPeriods.endDate)))
    .limit(1);

  const history = await db
    .select()
    .from(schema.haydPeriods)
    .where(eq(schema.haydPeriods.userId, session.userId))
    .orderBy(desc(schema.haydPeriods.startDate))
    .limit(24);

  return NextResponse.json({ active: active ?? null, periods: history });
}

// POST /api/hayd — { action: 'start' | 'end', date? } or { action: 'delete', id }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("hayd", ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { action?: string; date?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!(await requireFemaleTracking(session.userId))) {
    return NextResponse.json({ error: "Hayd tracking is not enabled for this account." }, { status: 403 });
  }

  const today = new Date().toLocaleDateString("en-CA");
  const date = body.date && DATE_RE.test(body.date) ? body.date : today;

  try {
    if (body.action === "start") {
      // Close any open period first (idempotent — a double-tap ends then restarts cleanly)
      await db
        .update(schema.haydPeriods)
        .set({ endDate: sql`${date}::date - 1` })
        .where(and(eq(schema.haydPeriods.userId, session.userId), isNull(schema.haydPeriods.endDate)));
      const [row] = await db
        .insert(schema.haydPeriods)
        .values({ userId: session.userId, startDate: date })
        .returning();
      return NextResponse.json(row, { status: 201 });
    }

    if (body.action === "end") {
      const [row] = await db
        .update(schema.haydPeriods)
        .set({ endDate: date })
        .where(and(eq(schema.haydPeriods.userId, session.userId), isNull(schema.haydPeriods.endDate)))
        .returning();
      if (!row) return NextResponse.json({ error: "No active period." }, { status: 404 });
      return NextResponse.json(row);
    }

    if (body.action === "delete") {
      if (!body.id || !isValidUUID(body.id)) {
        return NextResponse.json({ error: "Invalid id." }, { status: 400 });
      }
      await db
        .delete(schema.haydPeriods)
        .where(and(eq(schema.haydPeriods.id, body.id), eq(schema.haydPeriods.userId, session.userId)));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    logError(err, { route: "hayd/POST", action: body.action });
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}

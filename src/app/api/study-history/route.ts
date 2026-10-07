import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/study-history — the durable copy of the local session log, newest
// first. The planner merges these into localStorage so stats work cross-device.
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit("study-history-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const rows = await db
      .select()
      .from(schema.studySessionHistory)
      .where(eq(schema.studySessionHistory.userId, session.userId))
      .orderBy(desc(schema.studySessionHistory.createdAt))
      .limit(400);

    return NextResponse.json(rows.map((r) => ({
      id: r.id,
      date: r.date,
      minutes: r.minutes,
      finished: r.finished,
      label: r.label,
      reason: r.reason ?? undefined,
      method: r.method ?? undefined,
      breaks: r.breaks ?? undefined,
      focusMin: r.focusMin ?? undefined,
      switches: r.switches ?? undefined,
      subjects: r.subjects ?? undefined,
      blockId: r.blockId ?? undefined,
    })));
  } catch (err) {
    logError(err, { route: "study-history/GET" });
    return NextResponse.json({ error: "Failed to fetch study history" }, { status: 500 });
  }
}

// POST /api/study-history — record one finished/ended session. Client sends a
// uuid so offline replays and retries stay idempotent (upsert by id).
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("study-history-post", ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      id?: string; date?: string; label?: string; minutes?: number; finished?: boolean;
      reason?: string | null; method?: string | null;
      breaks?: number | null; focusMin?: number | null; switches?: number | null;
      subjects?: { label?: string; min?: number; hw?: string }[] | null;
      blockId?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.id !== undefined && !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: "Valid date (YYYY-MM-DD) is required" }, { status: 400 });
    }
    if (typeof body.label !== "string" || !body.label.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    const minutes = body.minutes;
    if (!Number.isInteger(minutes) || minutes! < 0 || minutes! > 24 * 60) {
      return NextResponse.json({ error: "Invalid minutes" }, { status: 400 });
    }
    if (body.blockId !== undefined && body.blockId !== null && !isValidUUID(body.blockId)) {
      return NextResponse.json({ error: "Invalid blockId" }, { status: 400 });
    }

    const optInt = (v: number | null | undefined, max: number) =>
      Number.isInteger(v) && v! >= 0 && v! <= max ? v : null;
    const subjects = Array.isArray(body.subjects)
      ? body.subjects
          .filter((s): s is { label: string; min: number; hw?: string } =>
            typeof s?.label === "string" && typeof s?.min === "number" && Number.isFinite(s.min) && s.min > 0)
          .slice(0, 50)
          .map((s) => ({
            label: s.label.slice(0, 300),
            min: Math.round(s.min),
            ...(s.hw && isValidUUID(s.hw) ? { hw: s.hw } : {}),
          }))
      : null;

    const [row] = await db
      .insert(schema.studySessionHistory)
      .values({
        id: body.id,
        userId: session.userId,
        date: body.date!,
        label: body.label.trim().slice(0, 300),
        minutes: minutes!,
        finished: body.finished === true,
        reason: typeof body.reason === "string" ? body.reason.slice(0, 120) : null,
        method: typeof body.method === "string" ? body.method.slice(0, 30) : null,
        breaks: optInt(body.breaks, 200),
        focusMin: optInt(body.focusMin, 24 * 60),
        switches: optInt(body.switches, 500),
        subjects,
        blockId: body.blockId ?? null,
      })
      .onConflictDoNothing({ target: schema.studySessionHistory.id })
      .returning({ id: schema.studySessionHistory.id });

    return NextResponse.json({ id: row?.id ?? body.id });
  } catch (err) {
    logError(err, { route: "study-history/POST" });
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}

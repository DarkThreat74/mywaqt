import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Weekday schedule: sorted unique ints 0–6 (Sun–Sat). null = interval mode.
function cleanWeekdays(w: unknown): number[] | null {
  if (w === null || w === undefined) return null;
  if (!Array.isArray(w)) return null;
  const clean = [...new Set(w.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return clean.length ? clean : null;
}

// GET /api/chores — list all chores for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit("chores-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const rows = await db
      .select()
      .from(schema.chores)
      .where(eq(schema.chores.userId, session.userId))
      .orderBy(schema.chores.sortOrder, schema.chores.createdAt)
      .limit(200);

    return NextResponse.json(rows);
  } catch (err) {
    logError(err, { route: "chores/GET" });
    return NextResponse.json({ error: "Failed to fetch chores" }, { status: 500 });
  }
}

// POST /api/chores — create a chore { title, estimatedMinutes?, frequencyDays? }
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("chores-post", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { title?: string; estimatedMinutes?: number; frequencyDays?: number; weekdays?: number[] | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Chore title is required" }, { status: 400 });
    }
    if (title.length > 120) {
      return NextResponse.json({ error: "Title must be 120 characters or less" }, { status: 400 });
    }

    let estimatedMinutes = 30;
    if (body.estimatedMinutes !== undefined) {
      if (!Number.isInteger(body.estimatedMinutes) || body.estimatedMinutes < 5 || body.estimatedMinutes > 24 * 60) {
        return NextResponse.json({ error: "Estimate must be between 5 minutes and 24 hours" }, { status: 400 });
      }
      estimatedMinutes = body.estimatedMinutes;
    }

    let frequencyDays = 7;
    if (body.frequencyDays !== undefined) {
      if (!Number.isInteger(body.frequencyDays) || body.frequencyDays < 1 || body.frequencyDays > 365) {
        return NextResponse.json({ error: "Frequency must be between 1 and 365 days" }, { status: 400 });
      }
      frequencyDays = body.frequencyDays;
    }

    const weekdays = cleanWeekdays(body.weekdays);
    if (body.weekdays !== undefined && body.weekdays !== null && !weekdays) {
      return NextResponse.json({ error: "Weekdays must be 0–6 (Sun–Sat)" }, { status: 400 });
    }

    const [chore] = await db
      .insert(schema.chores)
      .values({ userId: session.userId, title, estimatedMinutes, frequencyDays, weekdays })
      .returning();

    return NextResponse.json(chore);
  } catch (err) {
    logError(err, { route: "chores/POST" });
    return NextResponse.json({ error: "Failed to create chore" }, { status: 500 });
  }
}

// PATCH /api/chores — update a chore, or { done: true } to stamp lastDoneAt
// (done: false un-marks it). Also renames, re-estimates, re-frequencies.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("chores-patch", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      id?: string;
      title?: string;
      estimatedMinutes?: number;
      frequencyDays?: number;
      weekdays?: number[] | null;
      sortOrder?: number;
      done?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (typeof body.id !== "string" || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid chore ID is required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(schema.chores)
      .where(and(eq(schema.chores.id, body.id), eq(schema.chores.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Chore not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const trimmed = typeof body.title === "string" ? body.title.trim() : "";
      if (!trimmed) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      updates.title = trimmed.slice(0, 120);
    }
    if (body.estimatedMinutes !== undefined) {
      if (!Number.isInteger(body.estimatedMinutes) || body.estimatedMinutes < 5 || body.estimatedMinutes > 24 * 60) {
        return NextResponse.json({ error: "Estimate must be between 5 minutes and 24 hours" }, { status: 400 });
      }
      updates.estimatedMinutes = body.estimatedMinutes;
    }
    if (body.frequencyDays !== undefined) {
      if (!Number.isInteger(body.frequencyDays) || body.frequencyDays < 1 || body.frequencyDays > 365) {
        return NextResponse.json({ error: "Frequency must be between 1 and 365 days" }, { status: 400 });
      }
      updates.frequencyDays = body.frequencyDays;
    }
    if (body.sortOrder !== undefined) {
      if (!Number.isInteger(body.sortOrder)) {
        return NextResponse.json({ error: "sortOrder must be an integer" }, { status: 400 });
      }
      updates.sortOrder = body.sortOrder;
    }
    if (body.weekdays !== undefined) {
      const w = cleanWeekdays(body.weekdays);
      if (body.weekdays !== null && body.weekdays.length > 0 && !w) {
        return NextResponse.json({ error: "Weekdays must be 0–6 (Sun–Sat)" }, { status: 400 });
      }
      // Empty array or null clears the schedule → back to interval mode
      updates.weekdays = Array.isArray(body.weekdays) && body.weekdays.length === 0 ? null : w;
    }
    if (body.done === true) updates.lastDoneAt = new Date();
    if (body.done === false) updates.lastDoneAt = null;

    updates.updatedAt = new Date();
    const [updated] = await db
      .update(schema.chores)
      .set(updates)
      .where(and(eq(schema.chores.id, body.id), eq(schema.chores.userId, session.userId)))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    logError(err, { route: "chores/PATCH" });
    return NextResponse.json({ error: "Failed to update chore" }, { status: 500 });
  }
}

// DELETE /api/chores?id=... — delete a chore
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("chores-delete", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: "Valid chore ID is required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(schema.chores)
      .where(and(eq(schema.chores.id, id), eq(schema.chores.userId, session.userId)))
      .returning({ id: schema.chores.id });

    if (!deleted) {
      return NextResponse.json({ error: "Chore not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "chores/DELETE" });
    return NextResponse.json({ error: "Failed to delete chore" }, { status: 500 });
  }
}

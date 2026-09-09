import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET /api/events/bulk?seriesId=...&fromDate=... — returns the number of events in a series
// If fromDate is provided, only counts events from that date forward (future events).
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seriesId = request.nextUrl.searchParams.get("seriesId");
  if (!seriesId || !isValidUUID(seriesId)) {
    return NextResponse.json({ error: "Valid seriesId is required." }, { status: 400 });
  }

  const fromDate = request.nextUrl.searchParams.get("fromDate");

  // Build conditions: always userId + seriesId, optionally fromDate filter
  const conditions = [
    eq(schema.events.userId, session.userId),
    eq(schema.events.seriesId, seriesId),
  ];

  if (fromDate) {
    const cutoff = new Date(fromDate + "T00:00:00");
    if (!isNaN(cutoff.getTime())) {
      conditions.push(gte(schema.events.startAt, cutoff));
    }
  }

  const result = await db
    .select({ count: count() })
    .from(schema.events)
    .where(and(...conditions));

  return NextResponse.json({ count: result[0]?.count ?? 0 });
}

// PATCH /api/events/bulk — update all events in a recurring series
// Body: { seriesId: string, title?, details?, type?, color?, notify?, startAt?, endAt? }
// Updates fields that are present in the body.
// If startAt/endAt are provided, shifts ALL events in the series by the same
// time delta (preserving each occurrence's date, only changing the time-of-day).
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("events-bulk-update", ip, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { seriesId, title, details, type, color, notify, startAt, endAt } = body as {
    seriesId?: string;
    title?: string;
    details?: string | null;
    type?: string;
    color?: string | null;
    notify?: boolean;
    startAt?: string;
    endAt?: string;
  };

  if (!seriesId || !isValidUUID(seriesId)) {
    return NextResponse.json({ error: "Valid seriesId is required." }, { status: 400 });
  }

  // Build update object — only update provided fields
  const updates: Record<string, unknown> = {};

  if (type !== undefined) {
    const validTypes = ["block", "task", "reminder"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
    }
    updates.type = type;
  }

  if (title !== undefined) {
    if (!title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: "Title must be 200 characters or less." }, { status: 400 });
    }
    updates.title = title.trim();
  }

  if (details !== undefined) {
    updates.details = details !== null ? details.trim().slice(0, 1000) || null : null;
  }

  if (notify !== undefined) {
    updates.notify = Boolean(notify);
  }

  if (color !== undefined) {
    updates.color = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  }

  // Time-shift: if startAt and/or endAt are provided, shift all events in the
  // series by the same time-of-day delta. This preserves each occurrence's
  // calendar date while updating the time.
  let timeShiftMs: number | null = null;
  let durationDeltaMs = 0;

  if (startAt !== undefined || endAt !== undefined) {
    // Fetch the edited event to compute the delta
    const [firstEvent] = await db
      .select({
        startAt: schema.events.startAt,
        endAt: schema.events.endAt,
        type: schema.events.type,
      })
      .from(schema.events)
      .where(and(eq(schema.events.userId, session.userId), eq(schema.events.seriesId, seriesId)))
      .limit(1);

    if (!firstEvent) {
      return NextResponse.json({ error: "No events found for this series." }, { status: 404 });
    }

    if (startAt !== undefined) {
      const newStart = new Date(startAt);
      if (isNaN(newStart.getTime())) {
        return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
      }
      // Compute the delta in milliseconds — applied to every event in the series
      timeShiftMs = newStart.getTime() - firstEvent.startAt.getTime();
    }

    if (endAt !== undefined) {
      const newEnd = new Date(endAt);
      if (isNaN(newEnd.getTime())) {
        return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
      }
      const oldDuration = firstEvent.endAt.getTime() - firstEvent.startAt.getTime();
      const newDuration = newEnd.getTime() - (startAt !== undefined ? new Date(startAt).getTime() : firstEvent.startAt.getTime());
      // For blocks/tasks, duration must be positive
      const effectiveType = (updates.type as string) || firstEvent.type;
      if (effectiveType !== "reminder" && newDuration <= 0) {
        return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
      }
      durationDeltaMs = newDuration - oldDuration;
    }
  }

  if (Object.keys(updates).length === 0 && timeShiftMs === null) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // Fetch all events in the series to apply time shifts individually
  if (timeShiftMs !== null || durationDeltaMs !== 0) {
    const allEvents = await db
      .select({ id: schema.events.id, startAt: schema.events.startAt, endAt: schema.events.endAt })
      .from(schema.events)
      .where(and(eq(schema.events.userId, session.userId), eq(schema.events.seriesId, seriesId)));

    if (allEvents.length === 0) {
      return NextResponse.json({ error: "No events found for this series." }, { status: 404 });
    }

    // Update each event individually with its shifted time
    let updatedCount = 0;
    for (const ev of allEvents) {
      const newStart = timeShiftMs !== null ? new Date(ev.startAt.getTime() + timeShiftMs) : ev.startAt;
      const oldDuration = ev.endAt.getTime() - ev.startAt.getTime();
      const newEnd = new Date(newStart.getTime() + oldDuration + durationDeltaMs);

      await db.update(schema.events)
        .set({
          ...updates,
          startAt: newStart,
          endAt: newEnd,
        })
        .where(and(eq(schema.events.id, ev.id), eq(schema.events.userId, session.userId)));
      updatedCount++;
    }

    return NextResponse.json({ updated: updatedCount });
  }

  // No time shift — just update the non-time fields in bulk
  const updated = await db
    .update(schema.events)
    .set(updates)
    .where(
      and(
        eq(schema.events.userId, session.userId),
        eq(schema.events.seriesId, seriesId),
      ),
    )
    .returning({ id: schema.events.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "No events found for this series." }, { status: 404 });
  }

  return NextResponse.json({ updated: updated.length });
}

// DELETE /api/events/bulk — delete future events in a recurring series
// Body: { seriesId: string, fromDate?: string (ISO date, defaults to today) }
// Only deletes events with startAt >= start of fromDate. Past events are preserved.
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("events-bulk-delete", ip, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { seriesId, fromDate } = body as { seriesId?: string; fromDate?: string };

  if (!seriesId || !isValidUUID(seriesId)) {
    return NextResponse.json({ error: "Valid seriesId is required." }, { status: 400 });
  }

  // Determine the cutoff: start of fromDate (or today if not provided).
  // Events with startAt >= cutoff are deleted. Past events are preserved.
  let cutoff: Date;
  if (fromDate) {
    cutoff = new Date(fromDate + "T00:00:00");
    if (isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: "Invalid fromDate." }, { status: 400 });
    }
  } else {
    // Default to start of today in the user's local context.
    // Using UTC midnight of today's date to be safe.
    const now = new Date();
    cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const deleted = await db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.userId, session.userId),
        eq(schema.events.seriesId, seriesId),
        gte(schema.events.startAt, cutoff),
      ),
    )
    .returning({ id: schema.events.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "No future events found for this series. Past events are preserved." }, { status: 404 });
  }

  return NextResponse.json({ deleted: deleted.length });
}

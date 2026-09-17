import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { instantToWall, wallClockToUtc, dateStrInTimezone } from "@/lib/timezone";

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

  const { seriesId, title, details, type, color, notify, startAt, endAt, recurrenceEndDate, fromDate } = body as {
    seriesId?: string;
    title?: string;
    details?: string | null;
    type?: string;
    color?: string | null;
    notify?: boolean;
    startAt?: string;
    endAt?: string;
    recurrenceEndDate?: string;
    fromDate?: string;
  };

  if (!seriesId || !isValidUUID(seriesId)) {
    return NextResponse.json({ error: "Valid seriesId is required." }, { status: 400 });
  }

  // Scope: when the client sends fromDate, only events on/after that date are
  // modified — matches the "all N events in this series" count shown in the UI
  // (which counts from the viewed date forward).
  const scopeConds = [
    eq(schema.events.userId, session.userId),
    eq(schema.events.seriesId, seriesId),
  ];
  if (fromDate) {
    const cutoff = new Date(fromDate + "T00:00:00");
    if (!isNaN(cutoff.getTime())) {
      scopeConds.push(gte(schema.events.startAt, cutoff));
    }
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

  // Events in a recurring series share the same UTC time-of-day (occurrences
  // are whole-day shifts of the first event). Compare time-of-day only —
  // comparing absolute timestamps would include the date gap between the
  // first and edited occurrence and shift every event to a different day.
  const MS_DAY = 24 * 60 * 60 * 1000;
  const todMs = (d: Date) => ((d.getTime() % MS_DAY) + MS_DAY) % MS_DAY;

  // Fetch the series once (ordered) when we need a reference event for the
  // time-of-day/duration delta or when extending the series end date.
  const needsSeries =
    startAt !== undefined || endAt !== undefined || !!recurrenceEndDate;
  const seriesRows = needsSeries
    ? await db
        .select({
          id: schema.events.id,
          startAt: schema.events.startAt,
          endAt: schema.events.endAt,
          type: schema.events.type,
          title: schema.events.title,
          details: schema.events.details,
          color: schema.events.color,
          notify: schema.events.notify,
          recurrenceRule: schema.events.recurrenceRule,
        })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.userId, session.userId),
            eq(schema.events.seriesId, seriesId),
          ),
        )
        .orderBy(schema.events.startAt)
    : null;

  if (needsSeries && (!seriesRows || seriesRows.length === 0)) {
    return NextResponse.json({ error: "No events found for this series." }, { status: 404 });
  }

  const refEvent = seriesRows?.[0];
  const lastEvent = seriesRows?.[seriesRows.length - 1];

  // Time-shift: if startAt and/or endAt are provided, shift all events in the
  // series by the same time-of-day delta. This preserves each occurrence's
  // calendar date while updating the time.
  let timeShiftMs: number | null = null;
  let durationDeltaMs = 0;

  if (startAt !== undefined && refEvent) {
    const newStart = new Date(startAt);
    if (isNaN(newStart.getTime())) {
      return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    }
    const delta = todMs(newStart) - todMs(refEvent.startAt);
    timeShiftMs = delta !== 0 ? delta : null;
  }

  if (endAt !== undefined && refEvent) {
    const newEnd = new Date(endAt);
    if (isNaN(newEnd.getTime())) {
      return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
    }
    const oldDuration = refEvent.endAt.getTime() - refEvent.startAt.getTime();
    const newDuration =
      todMs(newEnd) -
      todMs(startAt !== undefined ? new Date(startAt) : refEvent.startAt);
    // For blocks/tasks, duration must be positive
    const effectiveType = (updates.type as string) || refEvent.type;
    if (effectiveType !== "reminder" && newDuration <= 0) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }
    durationDeltaMs = newDuration - oldDuration;
  }

  // ── Series extension: generate new occurrences up to a later end date ──
  // Parses the stored recurrenceRule "WEEKLY_{days}_UNTIL_{date}" and creates
  // occurrences for matching weekdays after the last existing occurrence.
  let extendedBy = 0;
  if (recurrenceEndDate && lastEvent) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recurrenceEndDate)) {
      return NextResponse.json({ error: "Invalid recurrence end date." }, { status: 400 });
    }
    const ruleMatch = /^WEEKLY_([0-6](?:,[0-6])*)_UNTIL_(\d{4}-\d{2}-\d{2})$/.exec(
      lastEvent.recurrenceRule ?? "",
    );
    if (!ruleMatch) {
      return NextResponse.json({ error: "This series cannot be extended." }, { status: 400 });
    }
    const newEnd = new Date(recurrenceEndDate + "T23:59:59");
    if (isNaN(newEnd.getTime())) {
      return NextResponse.json({ error: "Invalid recurrence end date." }, { status: 400 });
    }

    const days = ruleMatch[1].split(",").map(Number);

    // Get user's timezone to compute local calendar dates + wall-clock times
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    const userTz = settings?.timezone || "UTC";
    const lastWall = instantToWall(lastEvent.startAt, userTz);
    const lastLocalStr = dateStrInTimezone(lastEvent.startAt, userTz);
    const occDurationMs = lastEvent.endAt.getTime() - lastEvent.startAt.getTime();

    // Generate occurrences for matching weekdays after the last occurrence.
    // Each occurrence keeps the series' wall-clock time in the user's
    // timezone (DST-safe — a fixed UTC-day shift would drift ±1h).
    const newOccs: Array<{ startAt: Date; endAt: Date }> = [];
    let cursor = new Date(lastLocalStr + "T00:00:00Z").getTime() + MS_DAY;
    while (newOccs.length < 365) {
      const c = new Date(cursor);
      const cStr = c.toISOString().slice(0, 10);
      if (cStr > recurrenceEndDate) break;
      if (days.includes(c.getUTCDay())) {
        const occStart = wallClockToUtc(
          c.getUTCFullYear(),
          c.getUTCMonth() + 1,
          c.getUTCDate(),
          lastWall.h,
          lastWall.mi,
          lastWall.s,
          userTz,
        );
        newOccs.push({ startAt: occStart, endAt: new Date(occStart.getTime() + occDurationMs) });
      }
      cursor += MS_DAY;
    }

    if (newOccs.length > 0) {
      const newRule = `WEEKLY_${days.join(",")}_UNTIL_${recurrenceEndDate}`;
      await db.insert(schema.events).values(
        newOccs.map((occ) => ({
          userId: session.userId,
          title: (updates.title as string | undefined) ?? lastEvent.title,
          details: "details" in updates ? (updates.details as string | null) : lastEvent.details,
          startAt: occ.startAt,
          endAt: occ.endAt,
          type: ((updates.type as string | undefined) ?? lastEvent.type) as "block" | "task" | "reminder",
          color: "color" in updates ? (updates.color as string | null) : lastEvent.color,
          notify: "notify" in updates ? (updates.notify as boolean) : lastEvent.notify,
          recurrenceRule: newRule,
          seriesId,
          createdVia: "manual",
        })),
      );
      extendedBy = newOccs.length;
      // Update the rule string on all existing series events (unscoped — the
      // rule describes the whole series regardless of the edit's fromDate)
      await db
        .update(schema.events)
        .set({ recurrenceRule: newRule })
        .where(
          and(
            eq(schema.events.userId, session.userId),
            eq(schema.events.seriesId, seriesId),
          ),
        );
    }
  }

  if (Object.keys(updates).length === 0 && timeShiftMs === null && extendedBy === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // Fetch all events in scope to apply time shifts individually.
  // Runs AFTER extension so newly inserted occurrences are shifted too.
  if (timeShiftMs !== null || durationDeltaMs !== 0) {
    const allEvents = await db
      .select({ id: schema.events.id, startAt: schema.events.startAt, endAt: schema.events.endAt })
      .from(schema.events)
      .where(and(...scopeConds));

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

    return NextResponse.json({ updated: updatedCount, extended: extendedBy || undefined });
  }

  // No time shift — just update the non-time fields in bulk
  if (Object.keys(updates).length > 0) {
    const updated = await db
      .update(schema.events)
      .set(updates)
      .where(and(...scopeConds))
      .returning({ id: schema.events.id });

    if (updated.length === 0 && extendedBy === 0) {
      return NextResponse.json({ error: "No events found for this series." }, { status: 404 });
    }

    return NextResponse.json({ updated: updated.length, extended: extendedBy || undefined });
  }

  // Extension-only request
  return NextResponse.json({ updated: 0, extended: extendedBy });
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

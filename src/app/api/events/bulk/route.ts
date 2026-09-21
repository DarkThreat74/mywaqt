import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { instantToWall, wallClockToUtc, dateStrInTimezone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// The user's stored timezone — wall-clock math for events is always done in
// this zone, never the server's or the browser's.
async function getUserTimezone(userId: string): Promise<string> {
  const [settings] = await db
    .select({ timezone: schema.prayerSettings.timezone })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, userId))
    .limit(1);
  return settings?.timezone || "UTC";
}

// Start (00:00) of a YYYY-MM-DD calendar date in `tz`, as a UTC instant.
// Returns null on malformed input.
function localDateStartUtc(dateStr: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, mo, d] = dateStr.split("-").map(Number);
  return wallClockToUtc(y, mo, d, 0, 0, 0, tz);
}

// Milliseconds since local midnight of a wall clock.
const wallTodMs = (w: { h: number; mi: number; s: number }) =>
  (w.h * 3600 + w.mi * 60 + w.s) * 1000;

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
    const cutoff = localDateStartUtc(fromDate, await getUserTimezone(session.userId));
    if (cutoff) {
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

  // All wall-clock math below happens in the user's stored timezone — DST
  // transitions shift UTC offsets, so fixed-millisecond shifts would drift.
  const userTz = await getUserTimezone(session.userId);

  // Scope: when the client sends fromDate, only events on/after that date are
  // modified — matches the "all N events in this series" count shown in the UI
  // (which counts from the viewed date forward). The boundary is local
  // midnight in the user's timezone, not server-local.
  const scopeConds = [
    eq(schema.events.userId, session.userId),
    eq(schema.events.seriesId, seriesId),
  ];
  if (fromDate) {
    const cutoff = localDateStartUtc(fromDate, userTz);
    if (cutoff) {
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

  // Occurrences keep the same *wall-clock* time in the user's timezone —
  // across DST their UTC time-of-day legitimately differs by an hour, so all
  // comparisons and shifts below are done on wall-clock fields, not UTC ms.
  const MS_DAY = 24 * 60 * 60 * 1000;

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

  // Time-shift: if startAt and/or endAt are provided, rebuild every in-scope
  // occurrence at the requested wall-clock time on its own local calendar
  // date. This preserves wall time across DST — the old fixed-ms shift made a
  // recurring 12pm event drift to 11am/1pm after a transition.
  let newStartWall: { h: number; mi: number; s: number } | null = null;
  let newDurationMs: number | null = null;

  if (startAt !== undefined && refEvent) {
    const newStart = new Date(startAt);
    if (isNaN(newStart.getTime())) {
      return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    }
    const w = instantToWall(newStart, userTz);
    newStartWall = { h: w.h, mi: w.mi, s: w.s };
  }

  if (endAt !== undefined && refEvent) {
    const newEnd = new Date(endAt);
    if (isNaN(newEnd.getTime())) {
      return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
    }
    const endWall = instantToWall(newEnd, userTz);
    const startWall = newStartWall ?? instantToWall(refEvent.startAt, userTz);
    const duration = wallTodMs(endWall) - wallTodMs(startWall);
    // For blocks/tasks, duration must be positive
    const effectiveType = (updates.type as string) || refEvent.type;
    if (effectiveType !== "reminder" && duration <= 0) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }
    newDurationMs = Math.max(0, duration);
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
    const days = ruleMatch[1].split(",").map(Number);

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

  if (Object.keys(updates).length === 0 && newStartWall === null && newDurationMs === null && extendedBy === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // Fetch all events in scope to apply time shifts individually.
  // Runs AFTER extension so newly inserted occurrences are shifted too.
  if (newStartWall !== null || newDurationMs !== null) {
    const allEvents = await db
      .select({ id: schema.events.id, startAt: schema.events.startAt, endAt: schema.events.endAt })
      .from(schema.events)
      .where(and(...scopeConds));

    if (allEvents.length === 0) {
      return NextResponse.json({ error: "No events found for this series." }, { status: 404 });
    }

    // Update each event individually: same wall-clock time on its own local
    // calendar date — DST-safe, and it also repairs previously drifted
    // occurrences (a series saved at 12pm pre-fix may have drifted to 11am).
    let updatedCount = 0;
    for (const ev of allEvents) {
      const w = instantToWall(ev.startAt, userTz);
      const newStart = newStartWall
        ? wallClockToUtc(w.y, w.mo, w.d, newStartWall.h, newStartWall.mi, newStartWall.s, userTz)
        : ev.startAt;
      const duration = newDurationMs ?? (ev.endAt.getTime() - ev.startAt.getTime());
      const newEnd = new Date(newStart.getTime() + duration);

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

  // Determine the cutoff: start of fromDate in the user's timezone (or today
  // if not provided). Events with startAt >= cutoff are deleted. Past events
  // are preserved — "past" means before local midnight in the user's tz.
  const userTz = await getUserTimezone(session.userId);
  const from = fromDate ?? dateStrInTimezone(new Date(), userTz);
  const cutoff = localDateStartUtc(from, userTz);
  if (!cutoff) {
    return NextResponse.json({ error: "Invalid fromDate." }, { status: 400 });
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

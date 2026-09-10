import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Project only the columns the calendar clients need — reduces payload at 100k scale
const EVENT_COLUMNS = {
  id: schema.events.id,
  title: schema.events.title,
  details: schema.events.details,
  startAt: schema.events.startAt,
  endAt: schema.events.endAt,
  type: schema.events.type,
  color: schema.events.color,
  notify: schema.events.notify,
  recurrenceRule: schema.events.recurrenceRule,
  seriesId: schema.events.seriesId,
};

// GET /api/events?date=YYYY-MM-DD — list events for a specific day (in user's timezone)
// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD — list events in a date range
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("events-read", ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const seriesId = searchParams.get("seriesId");

  // GET /api/events?seriesId=... — list all events in a recurring series
  if (seriesId) {
    if (!isValidUUID(seriesId)) {
      return NextResponse.json({ error: "Valid seriesId is required." }, { status: 400 });
    }
    const events = await db
      .select(EVENT_COLUMNS)
      .from(schema.events)
      .where(
        and(
          eq(schema.events.userId, session.userId),
          eq(schema.events.seriesId, seriesId),
        ),
      )
      .orderBy(schema.events.startAt)
      .limit(500);

    return NextResponse.json(events);
  }

  if (fromStr && toStr) {
    // Use user's timezone for range boundaries
    const fromDate = new Date(fromStr + "T00:00:00");
    const toDate = new Date(toStr + "T23:59:59.999");
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
    }

    // Cap range to 31 days to prevent unbounded queries
    const maxRange = 31 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > maxRange) {
      return NextResponse.json({ error: "Date range cannot exceed 31 days." }, { status: 400 });
    }

    const events = await db
      .select(EVENT_COLUMNS)
      .from(schema.events)
      .where(
        and(
          eq(schema.events.userId, session.userId),
          gte(schema.events.startAt, fromDate),
          lte(schema.events.startAt, toDate),
        ),
      )
      .orderBy(schema.events.startAt)
      .limit(1000);

    return NextResponse.json(events);
  }

  if (!dateStr) {
    return NextResponse.json({ error: "Missing date parameter." }, { status: 400 });
  }

  // Compute day boundaries in UTC with a wide buffer to handle any timezone offset.
  // start: earliest local midnight (UTC+14, Kiribati) = dateStr - 1 day T10:00:00 UTC
  // end:   latest local end (UTC-12, Baker Island) = dateStr + 1 day T11:59:59 UTC
  // The client filters by local time when rendering, so extra events are harmless.
  const startOfDayUtc = new Date(dateStr + "T00:00:00+14:00");
  const endWithBuffer = new Date(dateStr + "T23:59:59.999-12:00");
  if (isNaN(startOfDayUtc.getTime()) || isNaN(endWithBuffer.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const events = await db
    .select(EVENT_COLUMNS)
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, session.userId),
        gte(schema.events.startAt, startOfDayUtc),
        lte(schema.events.startAt, endWithBuffer),
      ),
    )
    .orderBy(schema.events.startAt)
    .limit(500);

  return NextResponse.json(events);
}

// POST /api/events — create a new event (or recurring series)
// Body: { title, startAt, endAt, type, recurrenceEndDate? }
// If recurrenceEndDate is set, creates weekly occurrences from startAt until that date.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("events-create", ip, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { title, details, startAt, endAt, type, color, notify, recurrenceEndDate, recurrenceDays } = body as {
    title?: string;
    details?: string;
    startAt?: string;
    endAt?: string;
    type?: string;
    color?: string;
    notify?: boolean;
    recurrenceEndDate?: string;
    recurrenceDays?: number[];
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "Title must be 200 characters or less." }, { status: 400 });
  }
  // Details — optional, max 1000 chars, trimmed
  const validDetails = details !== undefined ? details.trim().slice(0, 1000) || null : null;
  if (!startAt) {
    return NextResponse.json({ error: "Start time is required." }, { status: 400 });
  }
  if (!endAt) {
    return NextResponse.json({ error: "End time is required." }, { status: 400 });
  }

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  // For reminders, end can equal start (they're instantaneous lines)
  // For blocks/tasks, end must be after start
  const validTypes = ["block", "task", "reminder"];
  const eventType = validTypes.includes(type || "") ? (type as "block" | "task" | "reminder") : "block";

  // Validate color — must be a hex string like "#c2410c" or null
  const validColor = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;

  // Notify toggle — defaults to true if not specified
  const validNotify = notify !== undefined ? Boolean(notify) : true;

  if (eventType !== "reminder" && endDate <= startDate) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  // For reminders, if end <= start, set end = start + 1 minute (minimal duration for DB)
  let effectiveEnd = endDate;
  if (eventType === "reminder" && endDate <= startDate) {
    effectiveEnd = new Date(startDate.getTime() + 60 * 1000);
  }

  // Check if this is a recurring event
  if (recurrenceEndDate) {
    const recurEnd = new Date(recurrenceEndDate + "T23:59:59");
    if (isNaN(recurEnd.getTime())) {
      return NextResponse.json({ error: "Invalid recurrence end date." }, { status: 400 });
    }
    if (recurEnd <= startDate) {
      return NextResponse.json({ error: "Recurrence end date must be after start date." }, { status: 400 });
    }

    // Get user's timezone to correctly determine local date of the start event
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    const userTimezone = settings?.timezone || "UTC";

    // Extract the user's LOCAL date components from the start event
    // This tells us which calendar day the event falls on in the user's timezone
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: userTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateParts = dateFormatter.formatToParts(startDate);
    const startLocalYear = parseInt(dateParts.find((p) => p.type === "year")?.value || "2026", 10);
    const startLocalMonth = parseInt(dateParts.find((p) => p.type === "month")?.value || "1", 10);
    const startLocalDay = parseInt(dateParts.find((p) => p.type === "day")?.value || "1", 10);

    // Determine which days of the week to repeat on
    // recurrenceDays: array of 0-6 (0=Sunday, 6=Saturday) in user's LOCAL timezone
    // If not provided, default to the local day of the start date
    const startDayOfWeek = new Date(startLocalYear, startLocalMonth - 1, startLocalDay).getDay();
    const daysToRepeat = recurrenceDays && recurrenceDays.length > 0
      ? [...new Set(recurrenceDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
      : [startDayOfWeek];

    if (daysToRepeat.length === 0) {
      return NextResponse.json({ error: "Select at least one day to repeat on." }, { status: 400 });
    }

    // Generate occurrences by iterating local calendar dates.
    // For each matching day-of-week, compute the occurrence by adding the day
    // difference (in whole days) to the original startDate. This preserves the
    // exact UTC time (and thus the local time) of the original event.
    const occurrences: Array<{ startAt: Date; endAt: Date }> = [];
    const durationMs = effectiveEnd.getTime() - startDate.getTime();
    const recurEndMs = recurEnd.getTime();

    let currentYear = startLocalYear;
    let currentMonth = startLocalMonth;
    let currentDay = startLocalDay;

    while (true) {
      // Check if we've passed the recurrence end date
      const currentDateObj = new Date(currentYear, currentMonth - 1, currentDay);
      if (currentDateObj.getTime() > recurEndMs) break;

      const dow = currentDateObj.getDay(); // Correct day-of-week for this calendar date

      if (daysToRepeat.includes(dow)) {
        // Compute day difference from the start local date
        const startLocalDateObj = new Date(startLocalYear, startLocalMonth - 1, startLocalDay);
        const dayDiff = Math.round((currentDateObj.getTime() - startLocalDateObj.getTime()) / (24 * 60 * 60 * 1000));

        // Create the occurrence by shifting the original UTC timestamp by whole days
        const occStart = new Date(startDate.getTime() + dayDiff * 24 * 60 * 60 * 1000);
        if (occStart >= startDate) {
          occurrences.push({
            startAt: occStart,
            endAt: new Date(occStart.getTime() + durationMs),
          });
        }
      }

      // Move to next day
      currentDay++;
      const nextDate = new Date(currentYear, currentMonth - 1, currentDay);
      currentYear = nextDate.getFullYear();
      currentMonth = nextDate.getMonth() + 1;
      currentDay = nextDate.getDate();
    }

    if (occurrences.length === 0) {
      return NextResponse.json({ error: "No occurrences generated before the end date." }, { status: 400 });
    }

    // Cap at 365 occurrences to prevent abuse
    const capped = occurrences.slice(0, 365);

    // Generate a single seriesId for all events in this recurring series.
    // This is the unique identifier used for bulk update/delete — NOT
    // recurrenceRule, which can be shared by unrelated series.
    const seriesId = randomUUID();

    // Insert all occurrences
    const inserted = await db
      .insert(schema.events)
      .values(
        capped.map((occ) => ({
          userId: session.userId,
          title: title.trim(),
          details: validDetails,
          startAt: occ.startAt,
          endAt: occ.endAt,
          type: eventType,
          color: validColor,
          notify: validNotify,
          recurrenceRule: `WEEKLY_${daysToRepeat.join(",")}_UNTIL_${recurrenceEndDate}`,
          seriesId,
          createdVia: "manual",
        })),
      )
      .returning();

    return NextResponse.json({ created: inserted.length, events: inserted }, { status: 201 });
  }

  // Single event
  const [event] = await db
    .insert(schema.events)
    .values({
      userId: session.userId,
      title: title.trim(),
      details: validDetails,
      startAt: startDate,
      endAt: effectiveEnd,
      type: eventType,
      color: validColor,
      notify: validNotify,
      recurrenceRule: null,
      seriesId: null,
      createdVia: "manual",
    })
    .returning();

  return NextResponse.json(event, { status: 201 });
}

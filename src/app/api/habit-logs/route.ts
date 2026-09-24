import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/habit-logs — list habit logs for the user
// Query params: ?date=YYYY-MM-DD (single date) OR ?from=YYYY-MM-DD&to=YYYY-MM-DD (range)
// If no date params, return last 90 days.
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit("habit-logs-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const conditions = [eq(schema.habitLogs.userId, session.userId)];

    if (dateParam) {
      if (!DATE_REGEX.test(dateParam)) {
        return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
      }
      conditions.push(eq(schema.habitLogs.date, dateParam));
    } else if (fromParam || toParam) {
      if (fromParam) {
        if (!DATE_REGEX.test(fromParam)) {
          return NextResponse.json({ error: "Invalid 'from' date format. Use YYYY-MM-DD." }, { status: 400 });
        }
        conditions.push(gte(schema.habitLogs.date, fromParam));
      }
      if (toParam) {
        if (!DATE_REGEX.test(toParam)) {
          return NextResponse.json({ error: "Invalid 'to' date format. Use YYYY-MM-DD." }, { status: 400 });
        }
        conditions.push(lte(schema.habitLogs.date, toParam));
      }
    } else {
      // No date params — return last 90 days
      const today = new Date();
      const ninetyDaysAgo = new Date(today);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const fromStr = ninetyDaysAgo.toISOString().slice(0, 10);
      conditions.push(gte(schema.habitLogs.date, fromStr));
    }

    const logs = await db
      .select()
      .from(schema.habitLogs)
      .where(and(...conditions))
      .orderBy(schema.habitLogs.date)
      .limit(5000);

    return NextResponse.json(logs);
  } catch (err) {
    logError(err, { route: "habit-logs/GET" });
    return NextResponse.json({ error: "Failed to fetch habit logs" }, { status: 500 });
  }
}

// POST /api/habit-logs — toggle habit completion
// Body: { habitId, date }
// If a log exists for (userId, habitId, date), delete it (toggle off).
// If not, insert it (toggle on).
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("habit-logs-post", ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { habitId?: string; date?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body.habitId) {
      return NextResponse.json({ error: "habitId is required" }, { status: 400 });
    }
    if (!body.date || !DATE_REGEX.test(body.date)) {
      return NextResponse.json({ error: "Valid date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    // Verify habit ownership — the habit must belong to the user
    const [habit] = await db
      .select({ id: schema.habits.id })
      .from(schema.habits)
      .where(and(eq(schema.habits.id, body.habitId), eq(schema.habits.userId, session.userId)))
      .limit(1);
    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    // Check if a log already exists for (userId, habitId, date)
    const [existingLog] = await db
      .select({ id: schema.habitLogs.id })
      .from(schema.habitLogs)
      .where(
        and(
          eq(schema.habitLogs.userId, session.userId),
          eq(schema.habitLogs.habitId, body.habitId),
          eq(schema.habitLogs.date, body.date)
        )
      )
      .limit(1);

    if (existingLog) {
      // Toggle off — delete the existing log
      await db
        .delete(schema.habitLogs)
        .where(eq(schema.habitLogs.id, existingLog.id));
      return NextResponse.json({ completed: false });
    }

    // Toggle on — insert a new log
    await db
      .insert(schema.habitLogs)
      .values({
        userId: session.userId,
        habitId: body.habitId,
        date: body.date,
      })
      .onConflictDoNothing({
        target: [schema.habitLogs.userId, schema.habitLogs.habitId, schema.habitLogs.date],
      });

    return NextResponse.json({ completed: true });
  } catch (err) {
    logError(err, { route: "habit-logs/POST" });
    return NextResponse.json({ error: "Failed to toggle habit log" }, { status: 500 });
  }
}

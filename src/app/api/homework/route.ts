import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/homework — list homework for the user (capped at 200 most recent)
// GET /api/homework?from=YYYY-MM-DD&to=YYYY-MM-DD — list homework in a date range
// GET /api/homework?date=YYYY-MM-DD — list homework due on a specific date
// Note: auto-pruning of old completed homework moved to a cron job to avoid
// turning every read into a write (critical for 100k user scale).
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("homework-read", ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const dateStr = searchParams.get("date");

    // Project only the columns the client needs — reduces payload at 100k scale
    const columns = {
      id: schema.homeworks.id,
      title: schema.homeworks.title,
      description: schema.homeworks.description,
      classId: schema.homeworks.classId,
      dueDate: schema.homeworks.dueDate,
      dueTime: schema.homeworks.dueTime,
      priority: schema.homeworks.priority,
      status: schema.homeworks.status,
      kind: schema.homeworks.kind,
      completedAt: schema.homeworks.completedAt,
    };

    // Single-date query: only homework due on that specific date
    if (dateStr) {
      const homework = await db
        .select(columns)
        .from(schema.homeworks)
        .where(
          and(
            eq(schema.homeworks.userId, session.userId),
            eq(schema.homeworks.dueDate, dateStr),
          ),
        )
        .orderBy(asc(schema.homeworks.dueDate), asc(schema.homeworks.dueTime))
        .limit(100);
      return NextResponse.json(homework);
    }

    // Date-range query
    if (fromStr && toStr) {
      const fromDate = new Date(fromStr + "T00:00:00");
      const toDate = new Date(toStr + "T23:59:59.999");
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
      }
      const maxRange = 366 * 24 * 60 * 60 * 1000;
      if (toDate.getTime() - fromDate.getTime() > maxRange) {
        return NextResponse.json({ error: "Date range cannot exceed 1 year." }, { status: 400 });
      }
      const homework = await db
        .select(columns)
        .from(schema.homeworks)
        .where(
          and(
            eq(schema.homeworks.userId, session.userId),
            gte(schema.homeworks.dueDate, fromStr),
            lte(schema.homeworks.dueDate, toStr),
          ),
        )
        .orderBy(asc(schema.homeworks.dueDate), asc(schema.homeworks.dueTime))
        .limit(500);
      return NextResponse.json(homework);
    }

    // No date filter — return only pending + recently completed (last 30 days)
    // This prevents loading years of old homework on every page load
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 30);
    const homework = await db
      .select(columns)
      .from(schema.homeworks)
      .where(
        and(
          eq(schema.homeworks.userId, session.userId),
          // Only pending homework OR completed within last 30 days
          sql`(${schema.homeworks.status} = 'pending' OR ${schema.homeworks.completedAt} >= ${recentCutoff.toISOString()})`,
        ),
      )
      .orderBy(asc(schema.homeworks.dueDate), asc(schema.homeworks.dueTime))
      .limit(200);

    return NextResponse.json(homework);
  } catch (err) {
    logError(err, { route: "homework/GET" });
    return NextResponse.json({ error: "Failed to fetch homework" }, { status: 500 });
  }
}

// POST /api/homework — create a new homework assignment
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("homework-post", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      title?: string;
      description?: string;
      classId?: string | null;
      dueDate?: string;
      dueTime?: string | null;
      priority?: string;
      kind?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (title.length > 300) {
      return NextResponse.json({ error: "Title must be 300 characters or less" }, { status: 400 });
    }
    if (body.description && body.description.length > 2000) {
      return NextResponse.json({ error: "Description must be 2000 characters or less" }, { status: 400 });
    }
    if (!body.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
      return NextResponse.json({ error: "Valid due date (YYYY-MM-DD) is required" }, { status: 400 });
    }
    if (body.dueTime && !/^\d{2}:\d{2}:\d{2}$/.test(body.dueTime)) {
      return NextResponse.json({ error: "Invalid due time format" }, { status: 400 });
    }

    const validPriorities = ["low", "medium", "high"];
    const priority = body.priority && validPriorities.includes(body.priority) ? body.priority : "medium";

    const validKinds = ["homework", "test", "project", "quiz", "reading", "other"];
    const kind = body.kind && validKinds.includes(body.kind) ? body.kind : "homework";

    // Validate classId belongs to the user if provided
    if (body.classId) {
      const [classRow] = await db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(and(eq(schema.classes.id, body.classId), eq(schema.classes.userId, session.userId)))
        .limit(1);
      if (!classRow) {
        return NextResponse.json({ error: "Invalid class" }, { status: 400 });
      }
    }

    const [homework] = await db
      .insert(schema.homeworks)
      .values({
        userId: session.userId,
        title,
        description: body.description?.trim() || null,
        classId: body.classId || null,
        dueDate: body.dueDate,
        dueTime: body.dueTime || null,
        priority: priority as "low" | "medium" | "high",
        kind: kind as "homework" | "test" | "project" | "quiz" | "reading" | "other",
      })
      .returning();

    return NextResponse.json(homework);
  } catch (err) {
    logError(err, { route: "homework/POST" });
    return NextResponse.json({ error: "Failed to create homework" }, { status: 500 });
  }
}

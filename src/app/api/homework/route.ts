import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, asc, sql, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { HOMEWORK_KINDS, type HomeworkKind } from "@/lib/homework/kinds";
import { syncPlannedEvent } from "@/lib/homework/planned";
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
      plannedDate: schema.homeworks.plannedDate,
      plannedStartTime: schema.homeworks.plannedStartTime,
      plannedEndTime: schema.homeworks.plannedEndTime,
      estimatedMinutes: schema.homeworks.estimatedMinutes,
      plannedEventId: schema.homeworks.plannedEventId,
      notified3dAt: schema.homeworks.notified3dAt,
      notified1dAt: schema.homeworks.notified1dAt,
      notifiedMorningAt: schema.homeworks.notifiedMorningAt,
      completedAt: schema.homeworks.completedAt,
    };

    // Attach subtasks to a result set in one batched query (no N+1)
    const withSubtasks = async <T extends { id: string }>(rows: T[]) => {
      if (rows.length === 0) return rows;
      const subs = await db
        .select()
        .from(schema.homeworkSubtasks)
        .where(and(
          eq(schema.homeworkSubtasks.userId, session.userId),
          inArray(schema.homeworkSubtasks.homeworkId, rows.map((r) => r.id)),
        ))
        .orderBy(asc(schema.homeworkSubtasks.sortOrder), asc(schema.homeworkSubtasks.createdAt));
      const byHw = new Map<string, typeof subs>();
      for (const s of subs) {
        if (!byHw.has(s.homeworkId)) byHw.set(s.homeworkId, []);
        byHw.get(s.homeworkId)!.push(s);
      }
      return rows.map((r) => ({ ...r, subtasks: byHw.get(r.id) ?? [] }));
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
      return NextResponse.json(await withSubtasks(homework));
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
      return NextResponse.json(await withSubtasks(homework));
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

    return NextResponse.json(await withSubtasks(homework));
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
      clientId?: string;
      plannedDate?: string | null;
      plannedStartTime?: string | null;
      plannedEndTime?: string | null;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
      estimatedMinutes?: number | null;
      subtasks?: string[];
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

    const kind = body.kind && (HOMEWORK_KINDS as readonly string[]).includes(body.kind) ? body.kind : "homework";

    // Validate planned fields
    const plannedDate = body.plannedDate && /^\d{4}-\d{2}-\d{2}$/.test(body.plannedDate) ? body.plannedDate : null;
    const plannedStartTime = body.plannedStartTime && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.plannedStartTime)
      ? body.plannedStartTime.slice(0, 8) : null;
    const plannedEndTime = body.plannedEndTime && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.plannedEndTime)
      ? body.plannedEndTime.slice(0, 8) : null;
    const plannedStartAt = body.plannedStartAt ? new Date(body.plannedStartAt) : null;
    const plannedEndAt = body.plannedEndAt ? new Date(body.plannedEndAt) : null;
    if (body.plannedStartAt && isNaN(plannedStartAt!.getTime())) {
      return NextResponse.json({ error: "Invalid planned start" }, { status: 400 });
    }
    if (body.plannedEndAt && isNaN(plannedEndAt!.getTime())) {
      return NextResponse.json({ error: "Invalid planned end" }, { status: 400 });
    }
    const estimatedMinutes = typeof body.estimatedMinutes === "number" && body.estimatedMinutes > 0 && body.estimatedMinutes <= 24 * 60
      ? Math.round(body.estimatedMinutes) : null;
    const subtaskTitles = Array.isArray(body.subtasks)
      ? body.subtasks.map((t) => String(t).trim().slice(0, 200)).filter(Boolean).slice(0, 50)
      : [];

    // Validate classId belongs to the user if provided
    let classColor: string | null = null;
    if (body.classId) {
      const [classRow] = await db
        .select({ id: schema.classes.id, color: schema.classes.color })
        .from(schema.classes)
        .where(and(eq(schema.classes.id, body.classId), eq(schema.classes.userId, session.userId)))
        .limit(1);
      if (!classRow) {
        return NextResponse.json({ error: "Invalid class" }, { status: 400 });
      }
      classColor = classRow.color;
    }

    // Offline-created homework carries a client uuid — used as the real row id
    // so queued dependent writes replay correctly and retried POSTs dedupe.
    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const inserted = await db
      .insert(schema.homeworks)
      .values({
        id: validClientId,
        userId: session.userId,
        title,
        description: body.description?.trim() || null,
        classId: body.classId || null,
        dueDate: body.dueDate,
        dueTime: body.dueTime || null,
        priority: priority as "low" | "medium" | "high",
        kind: kind as HomeworkKind,
        plannedDate,
        plannedStartTime,
        plannedEndTime,
        estimatedMinutes,
      })
      .onConflictDoNothing({ target: schema.homeworks.id })
      .returning();

    if (inserted.length === 0 && validClientId) {
      const [existing] = await db
        .select()
        .from(schema.homeworks)
        .where(and(eq(schema.homeworks.id, validClientId), eq(schema.homeworks.userId, session.userId)))
        .limit(1);
      if (existing) return NextResponse.json(existing);
    }

    const hw = inserted[0];

    // Link a calendar event for the planned study session
    let plannedEventId: string | null = null;
    if (plannedStartAt) {
      try {
        plannedEventId = await syncPlannedEvent(session.userId, {
          id: hw.id,
          title: hw.title,
          status: hw.status,
          plannedStartAt: plannedStartAt.toISOString(),
          plannedEndAt: plannedEndAt?.toISOString() ?? null,
          classColor,
        });
        if (plannedEventId) {
          await db.update(schema.homeworks).set({ plannedEventId }).where(eq(schema.homeworks.id, hw.id));
        }
      } catch (err) {
        logError(err, { route: "homework/POST", phase: "planned-event", hwId: hw.id });
      }
    }

    // Checklist steps
    let subtasks: typeof schema.homeworkSubtasks.$inferSelect[] = [];
    if (subtaskTitles.length > 0) {
      subtasks = await db
        .insert(schema.homeworkSubtasks)
        .values(subtaskTitles.map((t, i) => ({ userId: session.userId, homeworkId: hw.id, title: t, sortOrder: i })))
        .returning();
    }

    return NextResponse.json({ ...hw, plannedEventId, subtasks });
  } catch (err) {
    logError(err, { route: "homework/POST" });
    return NextResponse.json({ error: "Failed to create homework" }, { status: 500 });
  }
}

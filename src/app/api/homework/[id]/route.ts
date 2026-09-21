import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { HOMEWORK_KINDS } from "@/lib/homework/kinds";
import { syncPlannedEvent } from "@/lib/homework/planned";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// PATCH /api/homework/[id] — update a homework assignment
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("homework-patch", ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { id } = await params;
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid homework ID" }, { status: 400 });
    }

    let body: {
      title?: string;
      description?: string;
      classId?: string | null;
      dueDate?: string;
      dueTime?: string | null;
      priority?: string;
      status?: string;
      kind?: string;
      plannedDate?: string | null;
      plannedStartTime?: string | null;
      plannedEndTime?: string | null;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
      estimatedMinutes?: number | null;
      subtasks?: Array<{ id?: string; title: string; done?: boolean }>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.homeworks)
      .where(and(eq(schema.homeworks.id, id), eq(schema.homeworks.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Homework not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      updates.title = trimmed.slice(0, 300);
    }
    if (body.description !== undefined) {
      const desc = body.description ?? "";
      if (desc.length > 2000) {
        return NextResponse.json({ error: "Description must be 2000 characters or less" }, { status: 400 });
      }
      updates.description = desc.trim() || null;
    }
    if (body.classId !== undefined) {
      if (body.classId) {
        // Verify the class belongs to this user before linking (IDOR)
        const [cls] = await db
          .select({ id: schema.classes.id })
          .from(schema.classes)
          .where(and(eq(schema.classes.id, body.classId), eq(schema.classes.userId, session.userId)))
          .limit(1);
        if (!cls) {
          return NextResponse.json({ error: "Class not found" }, { status: 400 });
        }
      }
      updates.classId = body.classId || null;
    }
    if (body.dueDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      updates.dueDate = body.dueDate;
    }
    if (body.dueTime !== undefined) {
      // Accept HH:MM or HH:MM:SS (POST requires seconds; the client round-trips
      // stored values which include them). Normalize to HH:MM:SS for the DB.
      const m = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.exec(body.dueTime ?? "");
      if (body.dueTime !== null && body.dueTime !== "" && !m) {
        return NextResponse.json({ error: "Invalid due time" }, { status: 400 });
      }
      updates.dueTime = m ? (m[0].length === 5 ? `${m[0]}:00` : m[0]) : null;
    }
    if (body.priority !== undefined) {
      if (!["low", "medium", "high"].includes(body.priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      updates.priority = body.priority;
    }
    if (body.status !== undefined) {
      if (!["pending", "completed"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
      updates.completedAt = body.status === "completed" ? new Date() : null;
    }
    if (body.kind !== undefined) {
      if (!(HOMEWORK_KINDS as readonly string[]).includes(body.kind)) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
      }
      updates.kind = body.kind;
    }
    if (body.plannedDate !== undefined) {
      if (body.plannedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.plannedDate)) {
        return NextResponse.json({ error: "Invalid planned date" }, { status: 400 });
      }
      updates.plannedDate = body.plannedDate;
    }
    if (body.plannedStartTime !== undefined || body.plannedEndTime !== undefined) {
      const check = (t: string | null | undefined) => t == null || t === "" || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t);
      if (!check(body.plannedStartTime) || !check(body.plannedEndTime)) {
        return NextResponse.json({ error: "Invalid planned time" }, { status: 400 });
      }
      if (body.plannedStartTime !== undefined) updates.plannedStartTime = body.plannedStartTime ? body.plannedStartTime.slice(0, 8) : null;
      if (body.plannedEndTime !== undefined) updates.plannedEndTime = body.plannedEndTime ? body.plannedEndTime.slice(0, 8) : null;
    }
    if (body.estimatedMinutes !== undefined) {
      if (body.estimatedMinutes !== null && (typeof body.estimatedMinutes !== "number" || body.estimatedMinutes <= 0 || body.estimatedMinutes > 24 * 60)) {
        return NextResponse.json({ error: "Invalid estimate" }, { status: 400 });
      }
      updates.estimatedMinutes = body.estimatedMinutes === null ? null : Math.round(body.estimatedMinutes);
    }

    const [updated] = await db
      .update(schema.homeworks)
      .set(updates)
      .where(and(eq(schema.homeworks.id, id), eq(schema.homeworks.userId, session.userId)))
      .returning();

    // Keep the linked calendar event in sync when anything it renders changed.
    const plannedTouched =
      body.plannedStartAt !== undefined || body.plannedEndAt !== undefined ||
      body.plannedDate !== undefined || body.plannedStartTime !== undefined ||
      body.plannedEndTime !== undefined || body.title !== undefined ||
      body.status !== undefined || body.classId !== undefined;
    if (plannedTouched) {
      try {
        // If the client didn't send fresh instants, reuse the existing event's
        // times (e.g. title-only or completion updates).
        let startAtIso = body.plannedStartAt ?? null;
        let endAtIso = body.plannedEndAt ?? null;
        let classColor: string | null = null;
        const classId = updated.classId;
        const needLookups = updated.plannedEventId || classId;
        if (needLookups) {
          const [cls, ev] = await Promise.all([
            classId
              ? db.select({ color: schema.classes.color }).from(schema.classes)
                  .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, session.userId))).limit(1)
              : Promise.resolve([]),
            updated.plannedEventId
              ? db.select({ startAt: schema.events.startAt, endAt: schema.events.endAt }).from(schema.events)
                  .where(and(eq(schema.events.id, updated.plannedEventId), eq(schema.events.userId, session.userId))).limit(1)
              : Promise.resolve([]),
          ]);
          classColor = cls[0]?.color ?? null;
          if (body.plannedStartAt === undefined) startAtIso = ev[0]?.startAt?.toISOString() ?? null;
          if (body.plannedEndAt === undefined) endAtIso = ev[0]?.endAt?.toISOString() ?? null;
        }
        // Cleared plan → no event, even if stale instants came back
        if (updates.plannedDate === null) startAtIso = null;
        const newEventId = await syncPlannedEvent(session.userId, {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          plannedStartAt: startAtIso,
          plannedEndAt: endAtIso,
          plannedEventId: updated.plannedEventId,
          classColor,
        });
        if (newEventId !== updated.plannedEventId) {
          await db.update(schema.homeworks).set({ plannedEventId: newEventId })
            .where(eq(schema.homeworks.id, id));
          updated.plannedEventId = newEventId;
        }
      } catch (err) {
        logError(err, { route: "homework/PATCH", phase: "planned-event", hwId: id });
      }
    }

    // Subtasks: full-list diff (client sends the desired end state)
    let subtasks: typeof schema.homeworkSubtasks.$inferSelect[] | undefined;
    if (body.subtasks !== undefined) {
      if (!Array.isArray(body.subtasks) || body.subtasks.length > 50) {
        return NextResponse.json({ error: "Invalid subtasks" }, { status: 400 });
      }
      const existingSubs = await db
        .select()
        .from(schema.homeworkSubtasks)
        .where(and(eq(schema.homeworkSubtasks.homeworkId, id), eq(schema.homeworkSubtasks.userId, session.userId)));
      const existingById = new Map(existingSubs.map((s) => [s.id, s]));
      const keepIds = new Set<string>();
      for (let i = 0; i < body.subtasks.length; i++) {
        const st = body.subtasks[i];
        const title = String(st.title ?? "").trim().slice(0, 200);
        if (!title) continue;
        if (st.id && existingById.has(st.id)) {
          keepIds.add(st.id);
          const cur = existingById.get(st.id)!;
          if (cur.title !== title || cur.done !== !!st.done || cur.sortOrder !== i) {
            await db.update(schema.homeworkSubtasks)
              .set({ title, done: !!st.done, sortOrder: i })
              .where(eq(schema.homeworkSubtasks.id, st.id));
          }
        } else {
          await db.insert(schema.homeworkSubtasks)
            .values({ userId: session.userId, homeworkId: id, title, done: !!st.done, sortOrder: i });
        }
      }
      const dropIds = existingSubs.filter((s) => !keepIds.has(s.id)).map((s) => s.id);
      for (const dropId of dropIds) {
        await db.delete(schema.homeworkSubtasks)
          .where(and(eq(schema.homeworkSubtasks.id, dropId), eq(schema.homeworkSubtasks.userId, session.userId)));
      }
      subtasks = await db
        .select()
        .from(schema.homeworkSubtasks)
        .where(eq(schema.homeworkSubtasks.homeworkId, id))
        .orderBy(schema.homeworkSubtasks.sortOrder, schema.homeworkSubtasks.createdAt);
    }

    return NextResponse.json(subtasks ? { ...updated, subtasks } : updated);
  } catch (err) {
    logError(err, { route: "homework/PATCH" });
    return NextResponse.json({ error: "Failed to update homework" }, { status: 500 });
  }
}

// DELETE /api/homework/[id] — delete a homework assignment
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("homework-delete", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { id } = await params;
    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid homework ID" }, { status: 400 });
    }

    // Verify ownership + delete with userId in WHERE (prevents IDOR)
    const [deleted] = await db
      .delete(schema.homeworks)
      .where(and(eq(schema.homeworks.id, id), eq(schema.homeworks.userId, session.userId)))
      .returning({ id: schema.homeworks.id, plannedEventId: schema.homeworks.plannedEventId });

    if (!deleted) {
      return NextResponse.json({ error: "Homework not found" }, { status: 404 });
    }

    // Remove the linked study-session event — the FK only clears the pointer,
    // it doesn't delete the calendar block.
    if (deleted.plannedEventId) {
      try {
        await db
          .delete(schema.events)
          .where(and(eq(schema.events.id, deleted.plannedEventId), eq(schema.events.userId, session.userId)));
      } catch (err) {
        logError(err, { route: "homework/DELETE", phase: "planned-event", eventId: deleted.plannedEventId });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "homework/DELETE" });
    return NextResponse.json({ error: "Failed to delete homework" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
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
    if (!id) {
      return NextResponse.json({ error: "Homework ID is required" }, { status: 400 });
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
      if (body.dueTime !== null && body.dueTime !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.dueTime)) {
        return NextResponse.json({ error: "Invalid due time" }, { status: 400 });
      }
      updates.dueTime = body.dueTime || null;
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
      if (!["homework", "test", "project", "quiz", "reading", "other"].includes(body.kind)) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
      }
      updates.kind = body.kind;
    }

    const [updated] = await db
      .update(schema.homeworks)
      .set(updates)
      .where(and(eq(schema.homeworks.id, id), eq(schema.homeworks.userId, session.userId)))
      .returning();

    return NextResponse.json(updated);
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
    if (!id) {
      return NextResponse.json({ error: "Homework ID is required" }, { status: 400 });
    }

    // Verify ownership + delete with userId in WHERE (prevents IDOR)
    const [deleted] = await db
      .delete(schema.homeworks)
      .where(and(eq(schema.homeworks.id, id), eq(schema.homeworks.userId, session.userId)))
      .returning({ id: schema.homeworks.id });

    if (!deleted) {
      return NextResponse.json({ error: "Homework not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "homework/DELETE" });
    return NextResponse.json({ error: "Failed to delete homework" }, { status: 500 });
  }
}

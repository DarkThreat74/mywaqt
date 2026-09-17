import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import { eq, and, count } from "drizzle-orm";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

/**
 * GET /api/goals — list all goals for the authenticated user (flat array)
 * POST /api/goals — create a new goal
 * PATCH /api/goals — update a goal
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.userId, session.userId))
      .orderBy(schema.goals.sortOrder, schema.goals.createdAt)
      .limit(500);

    return NextResponse.json({ goals: rows });
  } catch (err) {
    logError(err, { route: "goals", method: "GET" });
    return NextResponse.json({ error: "Failed to fetch goals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("goals-post", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      title?: string;
      parentId?: string | null;
      description?: string;
      color?: string;
      goalType?: string;
      targetDate?: string | null;
      clientId?: string;
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
    if (title.length > 200) {
      return NextResponse.json({ error: "Title must be 200 characters or less" }, { status: 400 });
    }
    if (body.description && body.description.length > 2000) {
      return NextResponse.json({ error: "Description must be 2000 characters or less" }, { status: 400 });
    }

    // Validate parentId belongs to the user if provided
    if (body.parentId) {
      const [parent] = await db
        .select({ id: schema.goals.id })
        .from(schema.goals)
        .where(and(eq(schema.goals.id, body.parentId), eq(schema.goals.userId, session.userId)))
        .limit(1);
      if (!parent) {
        return NextResponse.json({ error: "Invalid parent goal" }, { status: 400 });
      }
    }

    // Validate goalType if provided
    const goalType = body.goalType && ["long_term", "short_term"].includes(body.goalType)
      ? body.goalType
      : "short_term";

    // Validate targetDate if provided (YYYY-MM-DD)
    let targetDate: string | null = null;
    if (body.targetDate) {
      const parsed = new Date(body.targetDate);
      if (!isNaN(parsed.getTime())) {
        targetDate = body.targetDate;
      }
    }

    // New goals append to the end of their type's list
    const [{ value: goalCount }] = await db
      .select({ value: count() })
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, session.userId), eq(schema.goals.goalType, goalType)));

    // Offline-created goals carry a client-generated uuid — using it as the
    // row's real id makes queued dependent writes + retried POSTs work.
    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const inserted = await db
      .insert(schema.goals)
      .values({
        id: validClientId,
        userId: session.userId,
        parentId: body.parentId ?? null,
        title,
        description: body.description?.trim() || null,
        color: body.color || null,
        goalType,
        targetDate,
        sortOrder: goalCount,
      })
      .onConflictDoNothing({ target: schema.goals.id })
      .returning();

    if (inserted.length === 0 && validClientId) {
      const [existing] = await db
        .select()
        .from(schema.goals)
        .where(and(eq(schema.goals.id, validClientId), eq(schema.goals.userId, session.userId)))
        .limit(1);
      if (existing) return NextResponse.json({ goal: existing });
    }

    return NextResponse.json({ goal: inserted[0] });
  } catch (err) {
    logError(err, { route: "goals", method: "POST" });
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("goals-patch", ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      id?: string;
      title?: string;
      description?: string;
      status?: string;
      color?: string;
      parentId?: string | null;
      sortOrder?: number;
      goalType?: string;
      targetDate?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: "Goal ID is required" }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.id, body.id), eq(schema.goals.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    // Prevent circular parent references
    if (body.parentId && body.parentId !== null) {
      if (body.parentId === body.id) {
        return NextResponse.json({ error: "A goal cannot be its own parent" }, { status: 400 });
      }
      // Verify the parent belongs to this user (IDOR)
      const [parent] = await db
        .select({ id: schema.goals.id })
        .from(schema.goals)
        .where(and(eq(schema.goals.id, body.parentId), eq(schema.goals.userId, session.userId)))
        .limit(1);
      if (!parent) {
        return NextResponse.json({ error: "Invalid parent goal" }, { status: 400 });
      }
      // Check the potential parent isn't a descendant of this goal
      let currentParent: string | null = body.parentId;
      const visited = new Set<string>();
      while (currentParent && !visited.has(currentParent)) {
        if (currentParent === body.id) {
          return NextResponse.json(
            { error: "Circular reference detected" },
            { status: 400 },
          );
        }
        visited.add(currentParent);
        const [p] = await db
          .select({ parentId: schema.goals.parentId })
          .from(schema.goals)
          .where(and(eq(schema.goals.id, currentParent), eq(schema.goals.userId, session.userId)))
          .limit(1);
        currentParent = p?.parentId ?? null;
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      updates.title = trimmed.slice(0, 200);
    }
    if (body.description !== undefined) {
      const desc = body.description ?? "";
      if (desc.length > 2000) {
        return NextResponse.json({ error: "Description must be 2000 characters or less" }, { status: 400 });
      }
      updates.description = desc.trim() || null;
    }
    if (body.status !== undefined) {
      if (!["active", "done", "archived", "backlog"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
      updates.completedAt = body.status === "done" ? new Date() : null;
    }
    if (body.goalType !== undefined) {
      if (!["long_term", "short_term"].includes(body.goalType)) {
        return NextResponse.json({ error: "Invalid goal type" }, { status: 400 });
      }
      updates.goalType = body.goalType;
    }
    if (body.targetDate !== undefined) {
      if (body.targetDate === null || body.targetDate === "") {
        updates.targetDate = null;
      } else {
        const parsed = new Date(body.targetDate);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Invalid target date" }, { status: 400 });
        }
        updates.targetDate = body.targetDate;
      }
    }
    if (body.color !== undefined) updates.color = body.color || null;
    if (body.parentId !== undefined) updates.parentId = body.parentId;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await db
      .update(schema.goals)
      .set(updates)
      .where(and(eq(schema.goals.id, body.id), eq(schema.goals.userId, session.userId)))
      .returning();

    return NextResponse.json({ goal: updated });
  } catch (err) {
    logError(err, { route: "goals", method: "PATCH" });
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("goals-delete", ip, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Goal ID is required" }, { status: 400 });
    }

    // Verify ownership before delete (cascade will handle children)
    const [existing] = await db
      .select({ id: schema.goals.id })
      .from(schema.goals)
      .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    await db.delete(schema.goals).where(and(eq(schema.goals.id, id), eq(schema.goals.userId, session.userId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "goals", method: "DELETE" });
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }
}

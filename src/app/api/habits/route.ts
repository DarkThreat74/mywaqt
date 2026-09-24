import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/habits — list all habits for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit("habits-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const habits = await db
      .select()
      .from(schema.habits)
      .where(eq(schema.habits.userId, session.userId))
      .orderBy(schema.habits.sortOrder, schema.habits.createdAt)
      .limit(200);

    return NextResponse.json(habits);
  } catch (err) {
    logError(err, { route: "habits/GET" });
    return NextResponse.json({ error: "Failed to fetch habits" }, { status: 500 });
  }
}

// POST /api/habits — create a new habit
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("habits-post", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      name?: string;
      description?: string;
      frequency?: string;
      color?: string;
      targetCount?: number;
      timeOfDay?: string | null;
      reminderTime?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Habit name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Habit name must be 100 characters or less" }, { status: 400 });
    }

    const description = body.description?.trim() || null;

    // Validate frequency is 'daily' or 'weekly'
    const frequency = body.frequency ?? "daily";
    if (frequency !== "daily" && frequency !== "weekly") {
      return NextResponse.json({ error: "Frequency must be 'daily' or 'weekly'" }, { status: 400 });
    }

    // Validate color is a hex string
    const color = body.color?.trim() ?? "#c2410c";
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "Valid hex color is required" }, { status: 400 });
    }

    // Validate targetCount if provided
    let targetCount = 1;
    if (body.targetCount !== undefined) {
      if (!Number.isInteger(body.targetCount) || body.targetCount < 1) {
        return NextResponse.json({ error: "targetCount must be a positive integer" }, { status: 400 });
      }
      targetCount = body.targetCount;
    }

    // Validate timeOfDay if provided
    const validTimes = ["morning", "afternoon", "evening", "night"];
    const timeOfDay = body.timeOfDay && validTimes.includes(body.timeOfDay) ? body.timeOfDay : null;

    // Validate reminderTime if provided (HH:MM format)
    let reminderTime: string | null = null;
    if (body.reminderTime) {
      if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(body.reminderTime)) {
        reminderTime = body.reminderTime;
      }
    }

    const [habit] = await db
      .insert(schema.habits)
      .values({
        userId: session.userId,
        name,
        description,
        frequency: frequency as "daily" | "weekly",
        color,
        targetCount,
        timeOfDay,
        reminderTime,
      })
      .returning();

    return NextResponse.json(habit);
  } catch (err) {
    logError(err, { route: "habits/POST" });
    return NextResponse.json({ error: "Failed to create habit" }, { status: 500 });
  }
}

// PATCH /api/habits — update a habit (rename, recolor, archive, targetCount)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("habits-patch", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: {
      id?: string;
      name?: string;
      description?: string;
      color?: string;
      archived?: boolean;
      targetCount?: number;
      timeOfDay?: string | null;
      reminderTime?: string | null;
      sortOrder?: number;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: "Habit ID is required" }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.habits)
      .where(and(eq(schema.habits.id, body.id), eq(schema.habits.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      updates.name = trimmed.slice(0, 100);
    }
    if (body.description !== undefined) {
      updates.description = body.description.trim() || null;
    }
    if (body.color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) {
        return NextResponse.json({ error: "Invalid color" }, { status: 400 });
      }
      updates.color = body.color;
    }
    if (body.archived !== undefined) updates.archived = body.archived;
    if (body.timeOfDay !== undefined) {
      const validTimes = ["morning", "afternoon", "evening", "night"];
      updates.timeOfDay = (body.timeOfDay && validTimes.includes(body.timeOfDay)) ? body.timeOfDay : null;
    }
    if (body.reminderTime !== undefined) {
      if (body.reminderTime === null || body.reminderTime === "") {
        updates.reminderTime = null;
      } else if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(body.reminderTime)) {
        updates.reminderTime = body.reminderTime;
      }
    }
    if (body.targetCount !== undefined) {
      if (!Number.isInteger(body.targetCount) || body.targetCount < 1) {
        return NextResponse.json({ error: "targetCount must be a positive integer" }, { status: 400 });
      }
      updates.targetCount = body.targetCount;
    }
    if (body.sortOrder !== undefined) {
      if (!Number.isInteger(body.sortOrder)) {
        return NextResponse.json({ error: "sortOrder must be an integer" }, { status: 400 });
      }
      updates.sortOrder = body.sortOrder;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing);
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(schema.habits)
      .set(updates)
      .where(and(eq(schema.habits.id, body.id), eq(schema.habits.userId, session.userId)))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    logError(err, { route: "habits/PATCH" });
    return NextResponse.json({ error: "Failed to update habit" }, { status: 500 });
  }
}

// DELETE /api/habits?id=... — delete a habit
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("habits-delete", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Habit ID is required" }, { status: 400 });
    }

    // Verify ownership + delete with userId in WHERE
    const [deleted] = await db
      .delete(schema.habits)
      .where(and(eq(schema.habits.id, id), eq(schema.habits.userId, session.userId)))
      .returning({ id: schema.habits.id });

    if (!deleted) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "habits/DELETE" });
    return NextResponse.json({ error: "Failed to delete habit" }, { status: 500 });
  }
}

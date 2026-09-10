import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/classes — list all classes for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const classes = await db
      .select({
        id: schema.classes.id,
        name: schema.classes.name,
        color: schema.classes.color,
        archived: schema.classes.archived,
        sortOrder: schema.classes.sortOrder,
      })
      .from(schema.classes)
      .where(eq(schema.classes.userId, session.userId))
      .orderBy(schema.classes.sortOrder, schema.classes.createdAt)
      .limit(100);

    return NextResponse.json(classes);
  } catch (err) {
    logError(err, { route: "classes/GET" });
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

// POST /api/classes — create a new class
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("classes-post", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { name?: string; color?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Class name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Class name must be 100 characters or less" }, { status: 400 });
    }

    // Validate color is a hex string
    const color = body.color?.trim();
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "Valid hex color is required" }, { status: 400 });
    }

    const [classRow] = await db
      .insert(schema.classes)
      .values({
        userId: session.userId,
        name,
        color,
      })
      .returning();

    return NextResponse.json(classRow);
  } catch (err) {
    logError(err, { route: "classes/POST" });
    return NextResponse.json({ error: "Failed to create class" }, { status: 500 });
  }
}

// PATCH /api/classes — update a class (rename, recolor, archive)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("classes-patch", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { id?: string; name?: string; color?: string; archived?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.classes)
      .where(and(eq(schema.classes.id, body.id), eq(schema.classes.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      updates.name = trimmed.slice(0, 100);
    }
    if (body.color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) {
        return NextResponse.json({ error: "Invalid color" }, { status: 400 });
      }
      updates.color = body.color;
    }
    if (body.archived !== undefined) updates.archived = body.archived;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ class: existing });
    }

    const [updated] = await db
      .update(schema.classes)
      .set(updates)
      .where(and(eq(schema.classes.id, body.id), eq(schema.classes.userId, session.userId)))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    logError(err, { route: "classes/PATCH" });
    return NextResponse.json({ error: "Failed to update class" }, { status: 500 });
  }
}

// DELETE /api/classes?id=... — delete a class
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("classes-delete", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 });
    }

    // Verify ownership + delete with userId in WHERE
    const [deleted] = await db
      .delete(schema.classes)
      .where(and(eq(schema.classes.id, id), eq(schema.classes.userId, session.userId)))
      .returning({ id: schema.classes.id });

    if (!deleted) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "classes/DELETE" });
    return NextResponse.json({ error: "Failed to delete class" }, { status: 500 });
  }
}

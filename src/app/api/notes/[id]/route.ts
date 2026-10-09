import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// PATCH /api/notes/[id] — update a note (title, content, pinned)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("notes-patch", ip, 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    let body: { title?: string | null; content?: string; pinned?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.notes)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.userId, session.userId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.title !== undefined) {
      if (body.title === null) {
        updates.title = null;
      } else {
        const trimmed = typeof body.title === "string" ? body.title.trim() : "";
        if (trimmed.length > 200) {
          return NextResponse.json({ error: "Title must be 200 characters or less" }, { status: 400 });
        }
        updates.title = trimmed || null;
      }
    }
    if (body.content !== undefined) {
      if (typeof body.content !== "string" || body.content.length > 50_000) {
        return NextResponse.json({ error: "Content must be a string under 50,000 characters" }, { status: 400 });
      }
      updates.content = body.content;
    }
    if (body.pinned !== undefined) {
      updates.pinned = body.pinned === true;
    }

    const [updated] = await db
      .update(schema.notes)
      .set(updates)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.userId, session.userId)))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    logError(err, { route: "notes/[id]/PATCH" });
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

// DELETE /api/notes/[id] — delete a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("notes-delete", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    // Verify ownership + delete with userId in WHERE
    const [deleted] = await db
      .delete(schema.notes)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.userId, session.userId)))
      .returning({ id: schema.notes.id });

    if (!deleted) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "notes/[id]/DELETE" });
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}

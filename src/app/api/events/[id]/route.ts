import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

// PATCH /api/events/[id] — update an existing event
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }

  // Rate limit: 20 updates per hour per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("events-update", ip, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { title, details, startAt, endAt, type, color, notify, recurrenceRule } = body as {
    title?: string;
    details?: string | null;
    startAt?: string;
    endAt?: string;
    type?: string;
    color?: string | null;
    notify?: boolean;
    recurrenceRule?: string | null;
  };

  // Build update object — only update provided fields
  const updates: Record<string, unknown> = {};

  // Process type FIRST — the time validation below needs to know the effective type
  // to decide whether end > start is required (blocks/tasks) or end == start is OK (reminders).
  // Previously this was processed after validation, causing a bug where changing from
  // block → reminder would still validate as block if end < start.
  if (type !== undefined) {
    const validTypes = ["block", "task", "reminder"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
    }
    updates.type = type;
  }

  if (title !== undefined) {
    if (!title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: "Title must be 200 characters or less." }, { status: 400 });
    }
    updates.title = title.trim();
  }

  if (details !== undefined) {
    updates.details = details !== null ? details.trim().slice(0, 1000) || null : null;
  }

  if (startAt !== undefined) {
    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    }
    updates.startAt = startDate;
  }

  if (endAt !== undefined) {
    const endDate = new Date(endAt);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
    }
    updates.endAt = endDate;
  }

  if (notify !== undefined) {
    updates.notify = Boolean(notify);
  }

  // Validate that end > start
  // If only one of startAt/endAt is updated, we need to check against the existing value
  if (updates.startAt || updates.endAt) {
    // Fetch the existing event to compare against if needed
    const [existing] = await db
      .select({ startAt: schema.events.startAt, endAt: schema.events.endAt, type: schema.events.type })
      .from(schema.events)
      .where(and(eq(schema.events.id, id), eq(schema.events.userId, session.userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const effectiveStart = (updates.startAt as Date) || existing.startAt;
    const effectiveEnd = (updates.endAt as Date) || existing.endAt;

    // For blocks and tasks, end must be after start. Reminders can have end == start.
    const effectiveType = (updates.type as string) || existing.type;
    if (effectiveType !== "reminder" && effectiveEnd <= effectiveStart) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }
  }

  if (recurrenceRule !== undefined) {
    updates.recurrenceRule = recurrenceRule?.trim() || null;
  }

  if (color !== undefined) {
    updates.color = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  }

  // Update — scoped to the current user
  const [updated] = await db
    .update(schema.events)
    .set(updates)
    .where(
      and(
        eq(schema.events.id, id),
        eq(schema.events.userId, session.userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE /api/events/[id] — delete an event
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }

  // Rate limit: 20 deletes per hour per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("events-delete", ip, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const [deleted] = await db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.id, id),
        eq(schema.events.userId, session.userId),
      ),
    )
    .returning({ id: schema.events.id });

  if (!deleted) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

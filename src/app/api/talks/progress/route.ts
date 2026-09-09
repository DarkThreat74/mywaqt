import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

// POST /api/talks/progress
// Upserts listening progress for a talk.
// Body: { talkId: string, position?: number, completed?: boolean }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { talkId?: string; position?: number; completed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { talkId, position, completed } = body;
  if (!talkId || !isValidUUID(talkId)) {
    return NextResponse.json({ error: "Valid talkId is required." }, { status: 400 });
  }

  // Track whether position was explicitly provided (0 is a valid position — don't conflate with "not sent")
  const hasPosition = typeof position === "number";
  const pos = hasPosition && position >= 0 ? Math.floor(position) : 0;

  try {
    // Check the talk exists (prevents progress on deleted talks)
    const [talk] = await db.select({ id: schema.talks.id })
      .from(schema.talks)
      .where(eq(schema.talks.id, talkId))
      .limit(1);
    if (!talk) return NextResponse.json({ error: "Talk not found." }, { status: 404 });

    // Upsert progress
    const [existing] = await db.select()
      .from(schema.talkProgress)
      .where(and(
        eq(schema.talkProgress.userId, session.userId),
        eq(schema.talkProgress.talkId, talkId),
      ))
      .limit(1);

    const now = new Date();
    if (existing) {
      // Update existing record
      // Only transition completed from false→true (don't un-complete via position updates)
      const newCompleted = completed !== undefined ? completed : existing.completed;
      const newCompletedAt = newCompleted && !existing.completed ? now : existing.completedAt;
      // Only update position if it was explicitly provided; otherwise keep existing
      const newPosition = hasPosition ? pos : existing.position;

      await db.update(schema.talkProgress).set({
        position: newPosition,
        completed: newCompleted,
        completedAt: newCompletedAt,
        updatedAt: now,
      }).where(eq(schema.talkProgress.id, existing.id));
    } else {
      // Insert new record
      await db.insert(schema.talkProgress).values({
        userId: session.userId,
        talkId,
        position: pos,
        completed: completed ?? false,
        completedAt: completed ? now : null,
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "talks/progress POST" });
    return NextResponse.json({ error: "Failed to save progress." }, { status: 500 });
  }
}

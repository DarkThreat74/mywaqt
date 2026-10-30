import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const [sess] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id!), eq(schema.workoutSessions.userId, session.userId))).limit(1);
    if (!sess) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const sets = await db.select().from(schema.workoutSets)
      .where(eq(schema.workoutSets.sessionId, id)).orderBy(asc(schema.workoutSets.slug), asc(schema.workoutSets.setIndex));
    return NextResponse.json({ session: sess, sets });
  }
  const lastFor = request.nextUrl.searchParams.get("lastFor");
  if (lastFor) {
    // Strong-style: the previous COMPLETED session for this profile + its sets,
    // so the client can pre-fill last time's weight/reps.
    const sessions = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, session.userId), eq(schema.workoutSessions.dayId, lastFor)))
      .orderBy(desc(schema.workoutSessions.startedAt)).limit(10);
    const prev = sessions.find((s) => s.endedAt);
    if (!prev) return NextResponse.json({ sets: [] });
    const sets = await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.sessionId, prev.id));
    return NextResponse.json({ sets, sessionId: prev.id });
  }
  const sessions = await db.select().from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.userId, session.userId))
    .orderBy(desc(schema.workoutSessions.startedAt)).limit(50);
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { dayId, dayName } = await request.json() as { dayId?: string; dayName?: string };
    if (!dayId || !dayName) return NextResponse.json({ error: "dayId + dayName required." }, { status: 400 });
    // Reuse an unfinished session for the same day — a crash/refresh resumes it.
    const [open] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, session.userId), eq(schema.workoutSessions.dayId, dayId!)))
      .orderBy(desc(schema.workoutSessions.startedAt)).limit(1);
    if (open && !open.endedAt) {
      const sets = await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.sessionId, open.id));
      return NextResponse.json({ session: open, sets, resumed: true });
    }
    const [sess] = await db.insert(schema.workoutSessions).values({
      userId: session.userId, dayId, dayName: String(dayName).slice(0, 60),
    }).returning();
    return NextResponse.json({ session: sess, sets: [] }, { status: 201 });
  } catch (e) { logError(e, { route: "workout/sessions POST" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, end } = await request.json() as { id?: string; end?: boolean };
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    await db.update(schema.workoutSessions)
      .set(end ? { endedAt: new Date() } : {})
      .where(and(eq(schema.workoutSessions.id, id!), eq(schema.workoutSessions.userId, session.userId)));
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/sessions PATCH" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    // sets cascade on session delete — deleting the row removes its sets too
    await db.delete(schema.workoutSessions).where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, session.userId)));
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/sessions DELETE" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

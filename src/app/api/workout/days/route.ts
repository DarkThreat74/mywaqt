import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = await db.select().from(schema.workoutDays)
    .where(eq(schema.workoutDays.userId, session.userId))
    .orderBy(asc(schema.workoutDays.weekday));
  const exercises = await db.select().from(schema.workoutDayExercises)
    .innerJoin(schema.workoutDays, eq(schema.workoutDayExercises.dayId, schema.workoutDays.id))
    .where(eq(schema.workoutDays.userId, session.userId))
    .orderBy(asc(schema.workoutDayExercises.sortOrder));
  return NextResponse.json({
    days: days.map((d) => ({ ...d, exercises: exercises.filter((x) => x.workout_day_exercises.dayId === d.id).map((x) => x.workout_day_exercises) })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { weekday, name, exercises } = await request.json() as { weekday?: number; name?: string; exercises?: Array<{ slug?: string; name?: string; sets?: number; reps?: string }> };
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name required." }, { status: 400 });
    }
    const [day] = await db.insert(schema.workoutDays).values({
      userId: session.userId,
      weekday: Number.isInteger(weekday) && weekday! >= 0 && weekday! <= 6 ? weekday! : null,
      name: name.trim().slice(0, 60),
    }).returning();
    if (Array.isArray(exercises)) {
      await db.insert(schema.workoutDayExercises).values(
        exercises.slice(0, 30).map((x, i) => ({
          dayId: day.id, slug: String(x.slug || ""), name: String(x.name || "").slice(0, 120),
          sets: Number.isInteger(x.sets) ? Math.min(20, Math.max(1, x.sets!)) : 3,
          reps: String(x.reps || "8-12").slice(0, 20), sortOrder: i,
        })),
      );
    }
    return NextResponse.json({ day }, { status: 201 });
  } catch (e) { logError(e, { route: "workout/days POST" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, name, exercises } = await request.json() as { id?: string; name?: string; exercises?: Array<{ slug?: string; name?: string; sets?: number; reps?: string }> };
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    const [day] = await db.select().from(schema.workoutDays)
      .where(and(eq(schema.workoutDays.id, id), eq(schema.workoutDays.userId, session.userId))).limit(1);
    if (!day) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (typeof name === "string" && name.trim()) {
      await db.update(schema.workoutDays).set({ name: name.trim().slice(0, 60) }).where(eq(schema.workoutDays.id, id));
    }
    if (Array.isArray(exercises)) {
      await db.delete(schema.workoutDayExercises).where(eq(schema.workoutDayExercises.dayId, id!));
      if (exercises.length) {
        await db.insert(schema.workoutDayExercises).values(
          exercises.slice(0, 30).map((x, i) => ({
            dayId: id, slug: String(x.slug || ""), name: String(x.name || "").slice(0, 120),
            sets: Number.isInteger(x.sets) ? Math.min(20, Math.max(1, x.sets!)) : 3,
            reps: String(x.reps || "8-12").slice(0, 20), sortOrder: i,
          })),
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/days PATCH" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  await db.delete(schema.workoutDays).where(and(eq(schema.workoutDays.id, id), eq(schema.workoutDays.userId, session.userId)));
  return NextResponse.json({ ok: true });
}

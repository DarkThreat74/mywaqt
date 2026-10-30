import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Upsert a set: { sessionId, slug, setIndex, weight, reps, done }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId, slug, setIndex, weight, reps, rir, done } = await request.json() as { sessionId?: string; slug?: string; setIndex?: number; weight?: string | number | null; reps?: number | null; rir?: number | null; done?: boolean };
    if (!sessionId || !slug || !Number.isInteger(setIndex)) {
      return NextResponse.json({ error: "sessionId, slug, setIndex required." }, { status: 400 });
    }
    const [sess] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, sessionId!), eq(schema.workoutSessions.userId, session.userId))).limit(1);
    if (!sess) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await db.insert(schema.workoutSets).values({
      sessionId: sessionId!, slug: String(slug), setIndex: setIndex!,
      weight: weight == null ? null : String(weight).slice(0, 20),
      reps: Number.isInteger(reps) ? reps : null,
      rir: Number.isInteger(rir) ? rir : null,
      done: Boolean(done),
    }).onConflictDoUpdate({
      target: [schema.workoutSets.sessionId, schema.workoutSets.slug, schema.workoutSets.setIndex],
      set: {
        weight: weight == null ? null : String(weight).slice(0, 20),
        reps: Number.isInteger(reps) ? reps : null,
        rir: Number.isInteger(rir) ? rir : null,
        done: Boolean(done),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/sets POST" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

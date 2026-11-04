import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

interface SyncSet {
  id?: string;
  slug?: string;
  setIndex?: number;
  weight?: string | number | null;
  reps?: number | null;
  rir?: number | null;
  setType?: string;
  variation?: string | null;
  side?: string | null;
  loggedAt?: string;
  restAfterSec?: number | null;
  pain?: number | null;
  techniqueFlag?: string | null;
  isPartial?: boolean;
  done?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await getSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as {
      session?: {
        id?: string;
        dayId?: string | null;
        dayName?: string;
        startedAt?: string;
        endedAt?: string | null;
        endedReason?: string | null;
        exerciseOrder?: Record<string, number>;
        readiness?: Record<string, number | undefined>;
      };
      sets?: SyncSet[];
    };
    const draft = body.session;
    if (!draft?.id || !isValidUUID(draft.id) || !draft.dayName) {
      return NextResponse.json({ error: "Valid session draft required." }, { status: 400 });
    }

    const [existing] = await db.select({ id: schema.workoutSessions.id, userId: schema.workoutSessions.userId })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, draft.id))
      .limit(1);
    if (existing && existing.userId !== auth.userId) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (!existing) {
      await db.insert(schema.workoutSessions).values({
        id: draft.id,
        userId: auth.userId,
        dayId: draft.dayId || null,
        dayName: String(draft.dayName).slice(0, 60),
        startedAt: draft.startedAt && !Number.isNaN(Date.parse(draft.startedAt)) ? new Date(draft.startedAt) : new Date(),
        endedAt: draft.endedAt && !Number.isNaN(Date.parse(draft.endedAt)) ? new Date(draft.endedAt) : null,
        exerciseOrder: draft.exerciseOrder || null,
        readiness: draft.readiness || null,
        endedReason: draft.endedReason || null,
      });
    } else if (draft.endedAt || draft.readiness || draft.exerciseOrder) {
      await db.update(schema.workoutSessions).set({
        ...(draft.endedAt && !Number.isNaN(Date.parse(draft.endedAt)) ? { endedAt: new Date(draft.endedAt), endedReason: draft.endedReason || "completed" } : {}),
        ...(draft.readiness ? { readiness: draft.readiness } : {}),
        ...(draft.exerciseOrder ? { exerciseOrder: draft.exerciseOrder } : {}),
      }).where(and(eq(schema.workoutSessions.id, draft.id), eq(schema.workoutSessions.userId, auth.userId)));
    }

    for (const set of body.sets || []) {
      const setIndex = set.setIndex;
      if (!set.slug || typeof setIndex !== "number" || !Number.isInteger(setIndex)) continue;
      const loggedAt = set.loggedAt && !Number.isNaN(Date.parse(set.loggedAt)) ? new Date(set.loggedAt) : undefined;
      const values = {
        sessionId: draft.id,
        slug: String(set.slug).slice(0, 120),
        setIndex,
        weight: set.weight == null ? null : String(set.weight).slice(0, 20),
        reps: Number.isInteger(set.reps) ? set.reps : null,
        rir: Number.isInteger(set.rir) ? set.rir : null,
        setType: ["warmup", "working", "failure"].includes(set.setType || "") ? set.setType : "working",
        variation: typeof set.variation === "string" && set.variation ? set.variation.slice(0, 30) : null,
        side: ["left", "right", "both"].includes(set.side || "") ? set.side : null,
        restAfterSec: typeof set.restAfterSec === "number" && set.restAfterSec >= 0 && set.restAfterSec <= 3600 ? set.restAfterSec : null,
        pain: typeof set.pain === "number" && set.pain >= 0 && set.pain <= 10 ? set.pain : null,
        techniqueFlag: typeof set.techniqueFlag === "string" ? set.techniqueFlag.slice(0, 40) : null,
        isPartial: Boolean(set.isPartial),
        done: Boolean(set.done),
        ...(loggedAt ? { loggedAt } : {}),
      };
      await db.insert(schema.workoutSets).values(values).onConflictDoUpdate({
        target: [schema.workoutSets.sessionId, schema.workoutSets.slug, schema.workoutSets.setIndex],
        set: values,
      });
    }
    return NextResponse.json({ ok: true, sessionId: draft.id, syncedSets: (body.sets || []).length }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    logError(error, { route: "workout/sync POST" });
    return NextResponse.json({ error: "Workout sync failed." }, { status: 500 });
  }
}

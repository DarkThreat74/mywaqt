import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

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
  if (!checkRateLimit("workout-sync", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many workout sync attempts." }, { status: 429 });
  }
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
    if (Array.isArray(body.sets) && body.sets.length > 500) {
      return NextResponse.json({ error: "A workout cannot contain more than 500 sets." }, { status: 400 });
    }
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
    } else if (draft.startedAt || draft.endedAt || draft.readiness || draft.exerciseOrder) {
      await db.update(schema.workoutSessions).set({
        ...(draft.startedAt && !Number.isNaN(Date.parse(draft.startedAt)) ? { startedAt: new Date(draft.startedAt) } : {}),
        ...(draft.endedAt && !Number.isNaN(Date.parse(draft.endedAt)) ? { endedAt: new Date(draft.endedAt), endedReason: draft.endedReason || "completed" } : {}),
        ...(draft.readiness ? { readiness: draft.readiness } : {}),
        ...(draft.exerciseOrder ? { exerciseOrder: draft.exerciseOrder } : {}),
      }).where(and(eq(schema.workoutSessions.id, draft.id), eq(schema.workoutSessions.userId, auth.userId)));
    }

    // One multi-row upsert — a 30-set session was 30 serialized round-trips.
    const sessionId = draft.id;
    const setRows = (body.sets || [])
      .filter((set): set is typeof set & { setIndex: number } =>
        !!set.slug && typeof set.setIndex === "number" && Number.isInteger(set.setIndex))
      .map((set) => ({
        sessionId,
        slug: String(set.slug).slice(0, 120),
        setIndex: set.setIndex,
        weight: (() => { const n = set.weight == null ? NaN : Number(set.weight); return Number.isFinite(n) && n > 0 && n <= 2000 ? String(n).slice(0, 20) : null; })(),
        reps: typeof set.reps === "number" && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 500 ? set.reps : null,
        rir: typeof set.rir === "number" && Number.isInteger(set.rir) && set.rir >= 0 && set.rir <= 10 ? set.rir : null,
        setType: ["warmup", "working", "failure"].includes(set.setType || "") ? set.setType : "working",
        variation: typeof set.variation === "string" && set.variation ? set.variation.slice(0, 30) : null,
        side: ["left", "right", "both"].includes(set.side || "") ? set.side : null,
        restAfterSec: typeof set.restAfterSec === "number" && set.restAfterSec >= 0 && set.restAfterSec <= 3600 ? set.restAfterSec : null,
        pain: typeof set.pain === "number" && set.pain >= 0 && set.pain <= 10 ? set.pain : null,
        techniqueFlag: typeof set.techniqueFlag === "string" ? set.techniqueFlag.slice(0, 40) : null,
        isPartial: Boolean(set.isPartial),
        done: Boolean(set.done),
        ...(set.loggedAt && !Number.isNaN(Date.parse(set.loggedAt)) ? { loggedAt: new Date(set.loggedAt) } : {}),
      }));
    if (setRows.length > 0) {
      await db.insert(schema.workoutSets).values(setRows).onConflictDoUpdate({
        target: [schema.workoutSets.sessionId, schema.workoutSets.slug, schema.workoutSets.setIndex],
        set: {
          weight: sql`excluded.weight`, reps: sql`excluded.reps`, rir: sql`excluded.rir`,
          setType: sql`excluded.set_type`, variation: sql`excluded.variation`, side: sql`excluded.side`,
          restAfterSec: sql`excluded.rest_after_sec`, pain: sql`excluded.pain`,
          techniqueFlag: sql`excluded.technique_flag`, isPartial: sql`excluded.is_partial`,
          done: sql`excluded.done`,
          // Keep the old timestamp when the re-synced row carries none.
          loggedAt: sql`coalesce(excluded.logged_at, ${schema.workoutSets.loggedAt})`,
        },
      });
    }
    return NextResponse.json({ ok: true, sessionId: draft.id, syncedSets: (body.sets || []).length }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    logError(error, { route: "workout/sync POST" });
    const message = error instanceof Error ? error.message : "";
    if (/column .* does not exist|relation .* does not exist/i.test(message)) {
      return NextResponse.json({ error: "Workout database schema is out of date — a migration is missing." }, { status: 500 });
    }
    return NextResponse.json({ error: "Workout sync failed." }, { status: 500 });
  }
}

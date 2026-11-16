import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const MAX_PHOTO_CHARS = 2_000_000; // ~1.5MB binary — 1920px webp q0.9 headroom
const ANGLES = new Set(["front", "side", "back", "other"]);

// GET /api/workout/photos — metadata + pose only; photoData is heavy, so the
// list endpoint strips it. Clients fetch the full row via ?withData=1&id=…
// or just render local copies until the sync confirms.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const [row] = await db.select().from(schema.workoutPhotos)
      .where(and(eq(schema.workoutPhotos.id, id), eq(schema.workoutPhotos.userId, session.userId))).limit(1);
    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ photo: row });
  }
  // Batch full-row fetch for offline hydration — one request instead of N.
  const idsParam = request.nextUrl.searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(isValidUUID).slice(0, 60);
    if (!ids.length) return NextResponse.json({ photos: [] });
    const rows = await db.select().from(schema.workoutPhotos)
      .where(and(eq(schema.workoutPhotos.userId, session.userId), inArray(schema.workoutPhotos.id, ids)));
    return NextResponse.json({ photos: rows });
  }
  const rows = await db.select({
    id: schema.workoutPhotos.id,
    takenAt: schema.workoutPhotos.takenAt,
    angle: schema.workoutPhotos.angle,
    weightKg: schema.workoutPhotos.weightKg,
    note: schema.workoutPhotos.note,
    photoMime: schema.workoutPhotos.photoMime,
    pose: schema.workoutPhotos.pose,
    worldPose: schema.workoutPhotos.worldPose,
    analysis: schema.workoutPhotos.analysis,
  }).from(schema.workoutPhotos)
    .where(eq(schema.workoutPhotos.userId, session.userId))
    .orderBy(desc(schema.workoutPhotos.takenAt))
    .limit(200);
  return NextResponse.json({ photos: rows });
}

// POST /api/workout/photos — upsert by client-supplied id (offline queue replays).
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const angle = typeof body.angle === "string" && ANGLES.has(body.angle) ? body.angle : "other";
  const photoData = typeof body.photoData === "string" ? body.photoData : "";
  const photoMime = typeof body.photoMime === "string" && body.photoMime.startsWith("image/") ? body.photoMime : "image/webp";
  if (!/^data:image\/(webp|jpeg|png)/.test(photoData) || photoData.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({ error: "Invalid photo payload." }, { status: 400 });
  }
  const weightKg = typeof body.weightKg === "number" && body.weightKg > 20 && body.weightKg < 500 ? String(body.weightKg) : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  // Landmarks must be 33 finite-number pairs — anything else would draw NaN
  // skeletons on the next guided capture.
  const validPose = (p: unknown, dims: number) =>
    Array.isArray(p) && p.length === 33 &&
    p.every((l) => Array.isArray(l) && l.length >= dims &&
      l.slice(0, dims).every((n) => typeof n === "number" && Number.isFinite(n)));
  const pose = validPose(body.pose, 2) ? body.pose as number[][] : null;
  const worldPose = validPose(body.worldPose, 3) ? body.worldPose as number[][] : null;
  // Capture-time analysis — shallow-validated, stored as jsonb.
  const rawAnalysis = body.analysis && typeof body.analysis === "object" ? body.analysis as Record<string, unknown> : null;
  const analysis = rawAnalysis ? {
    shirtless: typeof rawAnalysis.shirtless === "boolean" ? rawAnalysis.shirtless : null,
    skinRatio: typeof rawAnalysis.skinRatio === "number" && rawAnalysis.skinRatio >= 0 && rawAnalysis.skinRatio <= 1 ? rawAnalysis.skinRatio : null,
    matchScore: typeof rawAnalysis.matchScore === "number" && rawAnalysis.matchScore >= 0 && rawAnalysis.matchScore <= 100 ? Math.round(rawAnalysis.matchScore) : null,
  } : null;
  // Clamp takenAt — a wrong device clock must not future-date a photo and
  // hijack the pose guide (priorFor picks the most recent per angle).
  const parsedAt = typeof body.takenAt === "string" ? new Date(body.takenAt) : null;
  const takenAt = parsedAt && !Number.isNaN(+parsedAt) && +parsedAt <= Date.now() + 5 * 60_000 ? parsedAt : new Date();
  const id = typeof body.id === "string" && isValidUUID(body.id) ? body.id : undefined;

  try {
    if (id) {
      const [existing] = await db.select({ id: schema.workoutPhotos.id }).from(schema.workoutPhotos)
        .where(and(eq(schema.workoutPhotos.id, id), eq(schema.workoutPhotos.userId, session.userId))).limit(1);
      if (existing) {
        await db.update(schema.workoutPhotos).set({ takenAt, angle, weightKg, note, photoData, photoMime, pose, worldPose, analysis })
          .where(eq(schema.workoutPhotos.id, id));
        return NextResponse.json({ ok: true, id });
      }
    }
    try {
      const [row] = await db.insert(schema.workoutPhotos).values({
        ...(id ? { id } : {}),
        userId: session.userId, takenAt, angle, weightKg, note, photoData, photoMime, pose, worldPose, analysis,
      }).returning({ id: schema.workoutPhotos.id });
      return NextResponse.json({ ok: true, id: row.id });
    } catch (err) {
      // Concurrent upsert of the same client id (immediate POST racing the
      // sync sweeper) → PK violation. Fall back to update, still user-scoped
      // so a foreign id can never overwrite someone else's photo.
      if (id && (err as { code?: string }).code === "23505") {
        const updated = await db.update(schema.workoutPhotos)
          .set({ takenAt, angle, weightKg, note, photoData, photoMime, pose, worldPose, analysis })
          .where(and(eq(schema.workoutPhotos.id, id), eq(schema.workoutPhotos.userId, session.userId)))
          .returning({ id: schema.workoutPhotos.id });
        if (updated.length) return NextResponse.json({ ok: true, id });
      }
      throw err;
    }
  } catch (err) {
    logError(err, { route: "workout/photos POST" });
    return NextResponse.json({ error: "Could not save photo." }, { status: 500 });
  }
}

// DELETE /api/workout/photos?id=…
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  await db.delete(schema.workoutPhotos)
    .where(and(eq(schema.workoutPhotos.id, id), eq(schema.workoutPhotos.userId, session.userId)));
  return NextResponse.json({ ok: true });
}

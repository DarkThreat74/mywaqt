import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const MAX_PHOTO_CHARS = 1_500_000; // ~1.1MB binary — 1920px webp q0.9 headroom
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
  if (!photoData.startsWith("data:image/") || photoData.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({ error: "Invalid photo payload." }, { status: 400 });
  }
  const weightKg = typeof body.weightKg === "number" && body.weightKg > 20 && body.weightKg < 500 ? String(body.weightKg) : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  const pose = Array.isArray(body.pose) && body.pose.length === 33 ? body.pose : null;
  const worldPose = Array.isArray(body.worldPose) && body.worldPose.length === 33 ? body.worldPose : null;
  // Capture-time analysis — shallow-validated, stored as jsonb.
  const rawAnalysis = body.analysis && typeof body.analysis === "object" ? body.analysis as Record<string, unknown> : null;
  const analysis = rawAnalysis ? {
    shirtless: typeof rawAnalysis.shirtless === "boolean" ? rawAnalysis.shirtless : null,
    skinRatio: typeof rawAnalysis.skinRatio === "number" && rawAnalysis.skinRatio >= 0 && rawAnalysis.skinRatio <= 1 ? rawAnalysis.skinRatio : null,
    matchScore: typeof rawAnalysis.matchScore === "number" && rawAnalysis.matchScore >= 0 && rawAnalysis.matchScore <= 100 ? Math.round(rawAnalysis.matchScore) : null,
  } : null;
  const takenAt = typeof body.takenAt === "string" && !Number.isNaN(Date.parse(body.takenAt)) ? new Date(body.takenAt) : new Date();
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
    const [row] = await db.insert(schema.workoutPhotos).values({
      ...(id ? { id } : {}),
      userId: session.userId, takenAt, angle, weightKg, note, photoData, photoMime, pose, worldPose, analysis,
    }).returning({ id: schema.workoutPhotos.id });
    return NextResponse.json({ ok: true, id: row.id });
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

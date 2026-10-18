import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

/**
 * GET /api/quran-tester/mistakes — the user's confirmed mistakes + peeks.
 * Local IndexedDB mirrors this for offline; the server copy is what
 * survives reinstalls and follows the account across devices.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("qt-mistakes", getClientIp(request.headers), 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const rows = await db
      .select()
      .from(schema.quranTesterMistakes)
      .where(eq(schema.quranTesterMistakes.userId, session.userId))
      .orderBy(schema.quranTesterMistakes.confirmedAt);
    return NextResponse.json({ mistakes: rows });
  } catch (err) {
    logError(err, { route: "quran-tester/mistakes:get" });
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}

/** POST — confirm a mistake (or log a peek). Upserts on (user,s,a,w). */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("qt-mistakes", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => null);
    const surah = Number(body?.surah);
    const ayah = Number(body?.ayah);
    const word = Number(body?.word);
    const kind = typeof body?.kind === "string" ? body.kind.slice(0, 40) : "";
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 ||
        !Number.isInteger(ayah) || ayah < 1 || ayah > 286 ||
        !Number.isInteger(word) || word < 0 || word > 60 || !kind) {
      return NextResponse.json({ error: "Invalid mistake." }, { status: 400 });
    }
    await db
      .insert(schema.quranTesterMistakes)
      .values({ userId: session.userId, surah, ayah, word, kind })
      .onConflictDoUpdate({
        target: [
          schema.quranTesterMistakes.userId,
          schema.quranTesterMistakes.surah,
          schema.quranTesterMistakes.ayah,
          schema.quranTesterMistakes.word,
        ],
        set: { kind, confirmedAt: new Date() },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "quran-tester/mistakes:post" });
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}

/** DELETE — remove a mistake by surah/ayah/word. */
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("qt-mistakes", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => null);
    const surah = Number(body?.surah);
    const ayah = Number(body?.ayah);
    const word = Number(body?.word);
    if (!Number.isInteger(surah) || !Number.isInteger(ayah) || !Number.isInteger(word)) {
      return NextResponse.json({ error: "Invalid mistake." }, { status: 400 });
    }
    await db
      .delete(schema.quranTesterMistakes)
      .where(and(
        eq(schema.quranTesterMistakes.userId, session.userId),
        eq(schema.quranTesterMistakes.surah, surah),
        eq(schema.quranTesterMistakes.ayah, ayah),
        eq(schema.quranTesterMistakes.word, word),
      ));
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "quran-tester/mistakes:delete" });
    return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  }
}

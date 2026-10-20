import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";
import { downloadObjectToFile, uploadBuffer } from "@/lib/r2/client";
import { compressAudioFile } from "@/lib/audio/process";
import { analyzeClipAudio } from "@/lib/recite/analyze";
import { SURAHS } from "@/lib/content/quran";
import { isValidUUID } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, unlink } from "fs/promises";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/recite-clips/process
 * Compresses a recite clip to Opus via the same filter chain as talks.
 * Clips are capped at 40MB on upload so the full chain always applies.
 *
 * Body: { clipId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-recite-process", getClientIp(request.headers), 10, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { clipId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { clipId } = body;
    if (!clipId || !isValidUUID(clipId)) {
      return NextResponse.json({ error: "A valid clip ID is required." }, { status: 400 });
    }

    const [clip] = await db.select({
      id: schema.reciteClips.id,
      title: schema.reciteClips.title,
      storageKey: schema.reciteClips.storageKey,
      passage: schema.reciteClips.passage,
      style: schema.reciteClips.style,
      duration: schema.reciteClips.duration,
      processedAt: schema.reciteClips.processedAt,
      processingStatus: schema.reciteClips.processingStatus,
    }).from(schema.reciteClips).where(eq(schema.reciteClips.id, clipId)).limit(1);
    if (!clip) {
      return NextResponse.json({ error: "Clip not found." }, { status: 404 });
    }
    if (!clip.storageKey) {
      return NextResponse.json({ error: "Clip has no audio file to process." }, { status: 400 });
    }

    const startedAt = new Date();
    const staleBefore = new Date(startedAt.getTime() - maxDuration * 1000);
    if (clip.processingStatus === "processing" && clip.processedAt && clip.processedAt >= staleBefore) {
      return NextResponse.json({ error: "Clip is already being processed." }, { status: 409 });
    }
    if (clip.processingStatus === "published" || clip.processingStatus === "ready") {
      return NextResponse.json({ error: "Clip is already processed." }, { status: 409 });
    }

    const [claimed] = await db.update(schema.reciteClips).set({
      processingStatus: "processing",
      processingStage: "starting",
      processedAt: startedAt,
      processingError: null,
    }).where(and(
      eq(schema.reciteClips.id, clipId),
      or(
        inArray(schema.reciteClips.processingStatus, ["pending", "failed"]),
        and(eq(schema.reciteClips.processingStatus, "processing"), or(isNull(schema.reciteClips.processedAt), lt(schema.reciteClips.processedAt, staleBefore))),
      ),
    )).returning({ id: schema.reciteClips.id });
    if (!claimed) return NextResponse.json({ error: "Clip processing already started." }, { status: 409 });

    after(async () => {
      const startTime = Date.now();
      const watchdogMs = (maxDuration - 30) * 1000;
      let watchdogFired = false;

      const watchdog = setTimeout(async () => {
        watchdogFired = true;
        try {
          await db.update(schema.reciteClips).set({
            processingStatus: "failed",
            processingStage: null,
            processingError: `Processing timed out after ${maxDuration - 30}s.`,
          }).where(eq(schema.reciteClips.id, clipId));
        } catch (e) {
          logError(e, { route: "admin/recite-clips/process", clipId, phase: "watchdog" });
        }
      }, watchdogMs);

      const tmpDir = join(tmpdir(), "waqt-audio-processing");
      await mkdir(tmpDir, { recursive: true });
      const inputPath = join(tmpDir, `clip-input-${clipId}-${Date.now()}`);

      const stage = (s: string) =>
        db.update(schema.reciteClips).set({ processingStage: s }).where(eq(schema.reciteClips.id, clipId)).catch(() => {});

      try {
        await stage("downloading");
        await downloadObjectToFile(clip.storageKey!, inputPath);

        await stage("filtering + encoding");
        const result = await compressAudioFile(inputPath, 0);

        const processedKey = clip.storageKey!
          .replace(/^recite-clips\//, "recite-clips/processed/")
          .replace(/\.\w+$/, ".opus");
        await stage("uploading");
        await uploadBuffer(processedKey, result.buffer, "audio/ogg");

        // One-time analysis: locate the passage, measure per-word tajwid.
        // Best-effort — a clip without analysis still publishes fine.
        let analysis: Record<string, unknown> | undefined;
        let locatedPassage: string | null = null;
        let autoTitle: string | null = null;
        let guessedStyle: string | null = null;
        await stage("analyzing recitation");
        try {
          const a = await analyzeClipAudio(inputPath);
          analysis = a.analysis;
          if (a.passage) {
            locatedPassage = `${a.passage.surah}:${a.passage.ayah}${a.passage.ayahEnd !== a.passage.ayah ? `-${a.passage.ayahEnd}` : ""}`;
            autoTitle = `${SURAHS[a.passage.surah - 1]?.name ?? "Qur'an"} · ${locatedPassage}`;
          }
          guessedStyle = a.style;
        } catch (e) {
          logError(e, { route: "admin/recite-clips/process", clipId, phase: "analysis" });
        }
        await unlink(inputPath).catch(() => {});

        await db.update(schema.reciteClips).set({
          processingStatus: "ready",
          processingStage: null,
          processedStorageKey: processedKey,
          processedAt: new Date(),
          duration: result.duration || clip.duration,
          fileSize: result.processedSize,
          processingError: analysis ? null : "processed without analysis",
          ...(analysis ? { analysis } : {}),
          // Only auto-fill what the admin left blank — manual fields win.
          // Title stays "New clip" until a located passage names it; an admin-set title is kept.
          ...(clip.title === "New clip" && autoTitle ? { title: autoTitle } : {}),
          ...(!clip.passage && locatedPassage ? { passage: locatedPassage } : {}),
          ...(!clip.style && guessedStyle ? { style: guessedStyle } : {}),
        }).where(eq(schema.reciteClips.id, clipId));

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[recite-clips:process] Clip ${clipId} done in ${elapsed}s`);
      } catch (err) {
        if (watchdogFired) return;
        const errorMsg = err instanceof Error ? err.message : "Unknown processing error";
        logError(err, { route: "admin/recite-clips/process", clipId });
        try {
          await db.update(schema.reciteClips).set({
            processingStatus: "failed",
            processingStage: null,
            processingError: errorMsg.slice(0, 500),
          }).where(eq(schema.reciteClips.id, clipId));
        } catch (updateError) {
          logError(updateError, { route: "admin/recite-clips/process", clipId, phase: "mark-failed" });
        }
      } finally {
        clearTimeout(watchdog);
        await unlink(inputPath).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, message: "Compression started." });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/recite-clips/process", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

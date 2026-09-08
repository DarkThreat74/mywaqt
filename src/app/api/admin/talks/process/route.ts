import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";
import { downloadObjectToFile, uploadBuffer } from "@/lib/r2/client";
import { compressAudioFile } from "@/lib/audio/process";
import { isValidUUID } from "@/lib/validation";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, stat, unlink } from "fs/promises";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby max (300s). Pro allows 800s.
// memory=1024 is set in vercel.json

/**
 * POST /api/admin/talks/process
 * Compresses a talk to Opus 24kbps mono voip mode.
 *
 * Filter chain (10 stages, ~6x realtime on Vercel shared vCPU):
 *   highpass(80) → lowpass(12k) → silenceremove → afftdn → deesser →
 *   equalizer(3k) → equalizer(200) → acompressor → dynaudnorm → alimiter
 *   → Opus 24kbps mono voip @ 48kHz, compression_level 5, cutoff 12kHz
 *
 * Files >40MB are skipped (too large for 300s timeout at ~6x realtime).
 * At 6x realtime, a 40MB file (~33min audio) takes ~330s — tight but
 * the watchdog fires at 270s, so we skip to be safe.
 *
 * Body: { talkId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    let body: { talkId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { talkId } = body;

    if (!talkId || !isValidUUID(talkId)) {
      return NextResponse.json({ error: "A valid talk ID is required." }, { status: 400 });
    }

    const [talk] = await db.select({
      id: schema.talks.id,
      storageKey: schema.talks.storageKey,
      fileSize: schema.talks.fileSize,
      duration: schema.talks.duration,
      processedAt: schema.talks.processedAt,
      processingStatus: schema.talks.processingStatus,
    }).from(schema.talks).where(eq(schema.talks.id, talkId)).limit(1);
    if (!talk) {
      return NextResponse.json({ error: "Talk not found." }, { status: 404 });
    }

    if (!talk.storageKey) {
      return NextResponse.json({ error: "Talk has no audio file to process." }, { status: 400 });
    }

    const startedAt = new Date();
    const staleBefore = new Date(startedAt.getTime() - maxDuration * 1000);
    if (talk.processingStatus === "processing" && talk.processedAt && talk.processedAt >= staleBefore) {
      return NextResponse.json({ error: "Talk is already being processed." }, { status: 409 });
    }

    // Files >40MB are too large for the 300s Hobby timeout at ~6x realtime.
    // Skip compression and use the original file directly.
    // (At 6x realtime, 40MB ≈ 33min audio ≈ 330s processing — too tight.)
    const fileBytes = talk.fileSize ?? 0;
    const MAX_PROCESSABLE_BYTES = 40 * 1024 * 1024;
    const isTooLarge = fileBytes > MAX_PROCESSABLE_BYTES;

    if (isTooLarge) {
      await db.update(schema.talks).set({
        processingStatus: "ready",
        processedStorageKey: talk.storageKey,
        processedAt: new Date(),
        processingError: null,
      }).where(eq(schema.talks.id, talkId));

      console.log(`[talks:process] Talk ${talkId}: file too large (${(fileBytes / 1024 / 1024).toFixed(1)} MB) — using original`);

      return NextResponse.json({
        success: true,
        message: `File is ${(fileBytes / 1024 / 1024).toFixed(0)}MB — too large for the 300s processing limit. Using original file.`,
      });
    }

    if (talk.processingStatus === "published" || talk.processingStatus === "ready") {
      return NextResponse.json({ error: "Talk is already processed." }, { status: 409 });
    }

    const [claimed] = await db.update(schema.talks).set({
      processingStatus: "processing",
      processedAt: startedAt,
      processingError: null,
    }).where(and(
      eq(schema.talks.id, talkId),
      or(
        inArray(schema.talks.processingStatus, ["pending", "failed"]),
        and(eq(schema.talks.processingStatus, "processing"), or(isNull(schema.talks.processedAt), lt(schema.talks.processedAt, staleBefore))),
      ),
    )).returning({ id: schema.talks.id });
    if (!claimed) return NextResponse.json({ error: "Talk processing already started." }, { status: 409 });

    // Compress to Opus in the background using after().
    // A watchdog marks the talk as "failed" if we're about to hit maxDuration.
    after(async () => {
      const startTime = Date.now();
      const watchdogMs = (maxDuration - 30) * 1000;
      let watchdogFired = false;

      const watchdog = setTimeout(async () => {
        watchdogFired = true;
        console.error(`[talks:process] Talk ${talkId}: watchdog fired after ${maxDuration - 30}s`);
        try {
          await db.update(schema.talks).set({
            processingStatus: "failed",
            processingError: `Processing timed out after ${maxDuration - 30}s.`,
          }).where(eq(schema.talks.id, talkId));
        } catch (e) {
          logError(e, { route: "admin/talks/process", talkId, phase: "watchdog" });
        }
      }, watchdogMs);

      const tmpDir = join(tmpdir(), 'waqt-audio-processing');
      await mkdir(tmpDir, { recursive: true });
      const inputPath = join(tmpDir, `input-${talkId}-${Date.now()}`);

      try {
        // 1. Download from R2 — always stream to disk (simple, memory-safe)
        console.log(`[talks:process] Talk ${talkId}: downloading from R2…`);
        await downloadObjectToFile(talk.storageKey!, inputPath);
        const fileStat = await stat(inputPath);
        const originalSize = fileStat.size;

        // Re-check file size after download — DB value may be stale or wrong
        if (originalSize > MAX_PROCESSABLE_BYTES) {
          console.log(`[talks:process] Talk ${talkId}: actual file size ${(originalSize / 1024 / 1024).toFixed(1)} MB exceeds limit — using original`);
          await db.update(schema.talks).set({
            processingStatus: "ready",
            processedStorageKey: talk.storageKey,
            processedAt: new Date(),
            processingError: null,
          }).where(eq(schema.talks.id, talkId));
          return;
        }

        // 2. Compress to Opus 24kbps mono voip (10-stage filter chain, ~6x realtime)
        console.log(`[talks:process] Talk ${talkId}: compressing to Opus (${(originalSize / 1024 / 1024).toFixed(1)} MB)…`);
        const result = await compressAudioFile(inputPath, originalSize);

        // 3. Free disk space before upload
        await unlink(inputPath).catch(() => {});

        // 4. Upload to R2 with .opus extension and correct content type
        const processedKey = talk.storageKey!
          .replace(/^talks\//, 'talks/processed/')
          .replace(/\.\w+$/, '.opus');
        console.log(`[talks:process] Talk ${talkId}: uploading Opus to R2 (${(result.processedSize / 1024 / 1024).toFixed(1)} MB)…`);
        await uploadBuffer(processedKey, result.buffer, 'audio/ogg');

        // 5. Update talk record
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        await db.update(schema.talks).set({
          processingStatus: "ready",
          processedStorageKey: processedKey,
          processedAt: new Date(),
          duration: result.duration || talk.duration,
          fileSize: result.processedSize,
          processingError: null,
        }).where(eq(schema.talks.id, talkId));

        console.log(
          `[talks:process] Talk ${talkId} done in ${elapsed}s — ` +
          `${(originalSize / 1024 / 1024).toFixed(1)} MB → ${(result.processedSize / 1024 / 1024).toFixed(1)} MB ` +
          `(${((1 - result.processedSize / originalSize) * 100).toFixed(0)}% smaller)`
        );
      } catch (err) {
        if (watchdogFired) return;
        const errorMsg = err instanceof Error ? err.message : "Unknown processing error";
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logError(err, { route: "admin/talks/process", talkId, elapsedSeconds: elapsed });
        try {
          await db.update(schema.talks).set({
            processingStatus: "failed",
            processingError: errorMsg.slice(0, 500),
          }).where(eq(schema.talks.id, talkId));
        } catch (updateError) {
          logError(updateError, { route: "admin/talks/process", talkId, phase: "mark-failed" });
        }
      } finally {
        clearTimeout(watchdog);
        await unlink(inputPath).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, message: "Compression started." });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/talks/process", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

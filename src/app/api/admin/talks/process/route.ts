import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";
import { downloadObject, uploadBuffer } from "@/lib/r2/client";
import { processAudioWithMetadata, DEFAULT_PROCESSING_OPTIONS, type ProcessingOptions } from "@/lib/audio/process";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — Vercel Pro max for background processing

function processingOptions(value: unknown): ProcessingOptions {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: string, min: number, max: number, fallback: number) => {
    const candidate = input[key];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : fallback;
  };
  const bool = (key: string, fallback: boolean) => typeof input[key] === "boolean" ? input[key] as boolean : fallback;
  const bitrate = typeof input.mp3Bitrate === "string" && ["96k", "128k", "160k", "192k", "256k"].includes(input.mp3Bitrate)
    ? input.mp3Bitrate
    : DEFAULT_PROCESSING_OPTIONS.mp3Bitrate;
  return {
    ...DEFAULT_PROCESSING_OPTIONS,
    targetLufs: number("targetLufs", -30, 0, DEFAULT_PROCESSING_OPTIONS.targetLufs!),
    truePeak: number("truePeak", -3, 0, DEFAULT_PROCESSING_OPTIONS.truePeak!),
    silenceThreshold: number("silenceThreshold", -80, 0, DEFAULT_PROCESSING_OPTIONS.silenceThreshold!),
    silenceDuration: number("silenceDuration", 0.1, 5, DEFAULT_PROCESSING_OPTIONS.silenceDuration!),
    silencePadding: number("silencePadding", 0, 1, DEFAULT_PROCESSING_OPTIONS.silencePadding!),
    noiseReductionStrength: number("noiseReductionStrength", 0, 30, DEFAULT_PROCESSING_OPTIONS.noiseReductionStrength!),
    enableNoiseReduction: bool("enableNoiseReduction", DEFAULT_PROCESSING_OPTIONS.enableNoiseReduction!),
    enableLoudnessNormalization: bool("enableLoudnessNormalization", DEFAULT_PROCESSING_OPTIONS.enableLoudnessNormalization!),
    enableDeEssing: bool("enableDeEssing", DEFAULT_PROCESSING_OPTIONS.enableDeEssing!),
    enableSpeechEQ: bool("enableSpeechEQ", DEFAULT_PROCESSING_OPTIONS.enableSpeechEQ!),
    enableLimiter: bool("enableLimiter", DEFAULT_PROCESSING_OPTIONS.enableLimiter!),
    mp3Bitrate: bitrate,
  };
}

/**
 * POST /api/admin/talks/process
 * Triggers audio processing for a talk.
 *
 * The processing runs in the background using `after()` from next/server.
 * This means the response is sent immediately and processing continues
 * within the function invocation lifetime (up to maxDuration seconds).
 *
 * Pipeline:
 *   1. Download original audio from R2
 *   2. Probe audio metadata (sample rate, channels, duration)
 *   3. Measure true integrated loudness (Pass 1 of two-pass loudnorm)
 *   4. Process: silence removal → highpass/lowpass → noise reduction →
 *      de-essing → speech EQ → two-pass loudnorm → dynaudnorm → soft limiter
 *   5. Upload processed MP3 to R2
 *   6. Update talk record with processing metadata
 *
 * For talks that require more than 5 minutes of processing, consider using
 * Trigger.dev or QStash for durable background jobs.
 *
 * Body: { talkId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    let body: { talkId?: string; options?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { talkId } = body;
    const options = processingOptions(body.options);

    if (!talkId || !isValidUUID(talkId)) {
      return NextResponse.json({ error: "A valid talk ID is required." }, { status: 400 });
    }

    const [talk] = await db.select({
      id: schema.talks.id,
      storageKey: schema.talks.storageKey,
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

    // Process in the background using after()
    // This continues after the response is sent, within the function lifetime
    after(async () => {
      const startTime = Date.now();
      try {
        // 1. Download original audio from R2
        console.log(`[talks:process] Talk ${talkId}: downloading original from R2…`);
        const originalBuffer = await downloadObject(talk.storageKey!);

        // 2-4. Full processing pipeline (probe + measure + process)
        console.log(`[talks:process] Talk ${talkId}: processing audio (${(originalBuffer.length / 1024 / 1024).toFixed(1)} MB)…`);
        const result = await processAudioWithMetadata(originalBuffer, options);

        // 5. Upload processed audio to R2
        const processedKey = talk.storageKey!.replace(/^talks\//, 'talks/processed/');
        console.log(`[talks:process] Talk ${talkId}: uploading processed audio to R2…`);
        await uploadBuffer(processedKey, result.buffer);

        // 6. Update talk record with full metadata
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
          `[talks:process] Talk ${talkId} processed successfully in ${elapsed}s — ` +
          `original: ${(result.originalSize / 1024 / 1024).toFixed(1)} MB → ` +
          `processed: ${(result.processedSize / 1024 / 1024).toFixed(1)} MB, ` +
          `LUFS: ${result.originalLufs?.toFixed(1) || 'N/A'} → ${result.finalLufs?.toFixed(1) || 'N/A'}`
        );
      } catch (err) {
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
      }
    });

    return NextResponse.json({ success: true, message: "Processing started." });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/talks/process", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";
import { downloadObject, uploadBuffer } from "@/lib/r2/client";
import { processAudioWithMetadata, DEFAULT_PROCESSING_OPTIONS } from "@/lib/audio/process";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — Vercel Pro max for background processing

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

    const body = await request.json();
    const { talkId } = body as { talkId?: string };

    if (!talkId) {
      return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
    }

    // Get the talk
    const [talk] = await db.select().from(schema.talks).where(eq(schema.talks.id, talkId)).limit(1);
    if (!talk) {
      return NextResponse.json({ error: "Talk not found." }, { status: 404 });
    }

    if (!talk.storageKey) {
      return NextResponse.json({ error: "Talk has no audio file to process." }, { status: 400 });
    }

    if (talk.processingStatus === "processing") {
      return NextResponse.json({ error: "Talk is already being processed." }, { status: 409 });
    }

    if (talk.processingStatus === "published" || talk.processingStatus === "ready") {
      return NextResponse.json({ error: "Talk is already processed." }, { status: 409 });
    }

    // Mark as processing
    await db.update(schema.talks).set({
      processingStatus: "processing",
      processingError: null,
    }).where(eq(schema.talks.id, talkId));

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
        const result = await processAudioWithMetadata(originalBuffer, DEFAULT_PROCESSING_OPTIONS);

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
        console.error(`[talks:process] Talk ${talkId} processing failed after ${elapsed}s:`, errorMsg);
        await db.update(schema.talks).set({
          processingStatus: "failed",
          processingError: errorMsg.slice(0, 500),
        }).where(eq(schema.talks.id, talkId));
      }
    });

    return NextResponse.json({ success: true, message: "Processing started." });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/talks/process", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

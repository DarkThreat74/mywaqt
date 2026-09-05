import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";
import { downloadObject, uploadBuffer } from "@/lib/r2/client";
import { processAudio, getAudioDuration, DEFAULT_PROCESSING_OPTIONS } from "@/lib/audio/process";

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
      try {
        // 1. Download original audio from R2
        const originalBuffer = await downloadObject(talk.storageKey!);

        // 2. Get duration of original
        const duration = await getAudioDuration(originalBuffer);

        // 3. Process audio (silence removal + loudness normalization + noise reduction)
        const processedBuffer = await processAudio(originalBuffer, DEFAULT_PROCESSING_OPTIONS);

        // 4. Upload processed audio to R2
        const processedKey = talk.storageKey!.replace(/^talks\//, 'talks/processed/');
        await uploadBuffer(processedKey, processedBuffer);

        // 5. Update talk record
        await db.update(schema.talks).set({
          processingStatus: "ready",
          processedStorageKey: processedKey,
          processedAt: new Date(),
          duration: duration || talk.duration,
          fileSize: processedBuffer.length,
          processingError: null,
        }).where(eq(schema.talks.id, talkId));

        console.log(`[talks:process] Talk ${talkId} processed successfully`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown processing error";
        console.error(`[talks:process] Talk ${talkId} processing failed:`, errorMsg);
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

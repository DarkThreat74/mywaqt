import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { getUploadUrl, deleteObject, makeStorageKey } from "@/lib/r2/client";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Clips are short recitations — cap well below the talks limit.
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "ogg", "opus", "flac", "wma"];
const AUDIO_EXT_REGEX = new RegExp(`\\.(${AUDIO_EXTENSIONS.join("|")})$`, "i");
const STORAGE_KEY_REGEX = /^recite-clips\/[a-z0-9-]+\/\d+-[a-z0-9-]+\.(mp3|m4a|aac|wav|ogg|opus|flac|wma)$/;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-recite-read", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    const clips = await db.select().from(schema.reciteClips)
      .orderBy(desc(schema.reciteClips.addedAt)).limit(500);
    const staleBefore = Date.now() - 300 * 1000; // matches maxDuration in process/route.ts
    return NextResponse.json({
      clips: clips.map(({ processedAt, ...clip }) => ({
        ...clip,
        canRetryProcessing: clip.processingStatus === "processing" && (!processedAt || processedAt.getTime() <= staleBefore),
      })),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/recite-clips", method: "GET" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-recite-mutate", getClientIp(request.headers), 60, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { action } = body as { action?: string };

    // ── Get presigned upload URL ──
    if (action === "get-upload-url") {
      const { filename, fileSize, reciter } = body as { filename?: string; fileSize?: number; reciter?: string };
      if (!filename?.trim() || !AUDIO_EXT_REGEX.test(filename.trim())) {
        return NextResponse.json({ error: "A valid audio filename is required (mp3, m4a, aac, wav, ogg, opus, flac)." }, { status: 400 });
      }
      if (!Number.isInteger(fileSize) || fileSize! <= 0 || fileSize! > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Audio files must be 40 MB or smaller." }, { status: 400 });
      }
      const storageKey = makeStorageKey(reciter?.trim() || "clips", filename!, "recite-clips");
      const ext = filename!.toLowerCase().split(".").pop();
      const contentTypeMap: Record<string, string> = {
        mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
        wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg",
        flac: "audio/flac", wma: "audio/x-ms-wma",
      };
      const uploadUrl = await getUploadUrl(storageKey, contentTypeMap[ext || ""] || "audio/mpeg");
      return NextResponse.json({ uploadUrl, storageKey, fileSize: fileSize || null });
    }

    if (action === "delete-upload") {
      const { storageKey } = body as { storageKey?: string };
      if (!storageKey || !STORAGE_KEY_REGEX.test(storageKey)) {
        return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
      }
      const [referenced] = await db.select({ id: schema.reciteClips.id })
        .from(schema.reciteClips).where(eq(schema.reciteClips.storageKey, storageKey)).limit(1);
      if (referenced) return NextResponse.json({ error: "Uploaded file is already attached to a clip." }, { status: 409 });
      await deleteObject(storageKey);
      return NextResponse.json({ success: true });
    }

    // ── Create clip (after upload completes) ──
    if (action === "create-clip") {
      const { title, reciter, passage, style, storageKey, fileSize, duration } = body as {
        title?: string; reciter?: string; passage?: string; style?: string;
        storageKey?: string; fileSize?: number; duration?: number;
      };
      if (!title?.trim()) {
        return NextResponse.json({ error: "Title is required." }, { status: 400 });
      }
      if (!storageKey || !STORAGE_KEY_REGEX.test(storageKey) || !Number.isInteger(fileSize) || fileSize! <= 0 || fileSize! > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Invalid uploaded audio file." }, { status: 400 });
      }
      if (duration !== undefined && (!Number.isInteger(duration) || duration < 0)) {
        return NextResponse.json({ error: "Invalid audio duration." }, { status: 400 });
      }
      const [clip] = await db.insert(schema.reciteClips).values({
        title: title.trim().slice(0, 200),
        reciter: reciter?.trim().slice(0, 100) || null,
        passage: passage?.trim().slice(0, 50) || null,
        style: style?.trim().slice(0, 50) || null,
        storageKey,
        fileSize: fileSize || null,
        duration: duration || null,
        processingStatus: "pending",
      }).returning();
      return NextResponse.json(clip, { status: 201 });
    }

    // ── Edit clip metadata (title/reciter/passage/style — any state) ──
    if (action === "update-clip") {
      const { clipId, title, reciter, passage, style } = body as {
        clipId?: string; title?: string; reciter?: string | null; passage?: string | null; style?: string | null;
      };
      if (!clipId || !isValidUUID(clipId)) {
        return NextResponse.json({ error: "Clip ID is required." }, { status: 400 });
      }
      if (title !== undefined && !title?.trim()) {
        return NextResponse.json({ error: "Title can't be empty." }, { status: 400 });
      }
      const [updated] = await db.update(schema.reciteClips).set({
        ...(title !== undefined ? { title: title.trim().slice(0, 200) } : {}),
        ...(reciter !== undefined ? { reciter: reciter?.trim().slice(0, 100) || null } : {}),
        ...(passage !== undefined ? { passage: passage?.trim().slice(0, 50) || null } : {}),
        ...(style !== undefined ? { style: style?.trim().slice(0, 50) || null } : {}),
      }).where(eq(schema.reciteClips.id, clipId)).returning();
      if (!updated) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
      return NextResponse.json(updated);
    }

    // ── Publish clip (after processing is complete) ──
    if (action === "publish-clip") {
      const { clipId } = body as { clipId?: string };
      if (!clipId || !isValidUUID(clipId)) {
        return NextResponse.json({ error: "Clip ID is required." }, { status: 400 });
      }
      const [clip] = await db.select({ processingStatus: schema.reciteClips.processingStatus })
        .from(schema.reciteClips).where(eq(schema.reciteClips.id, clipId)).limit(1);
      if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
      if (clip.processingStatus !== "ready") {
        return NextResponse.json({ error: `Cannot publish: processing status is '${clip.processingStatus}'. Clip must be processed first.` }, { status: 400 });
      }
      const [updated] = await db.update(schema.reciteClips).set({
        processingStatus: "published",
        publishedAt: new Date(),
      }).where(eq(schema.reciteClips.id, clipId)).returning();
      return NextResponse.json(updated);
    }

    // ── Unpublish (back to ready — stays processed) ──
    if (action === "unpublish-clip") {
      const { clipId } = body as { clipId?: string };
      if (!clipId || !isValidUUID(clipId)) {
        return NextResponse.json({ error: "Clip ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.reciteClips).set({
        processingStatus: "ready",
        publishedAt: null,
      }).where(and(eq(schema.reciteClips.id, clipId), eq(schema.reciteClips.processingStatus, "published"))).returning();
      if (!updated) return NextResponse.json({ error: "Only published clips can be unpublished." }, { status: 409 });
      return NextResponse.json(updated);
    }

    // ── Retry processing ──
    if (action === "retry-processing") {
      const { clipId } = body as { clipId?: string };
      if (!clipId || !isValidUUID(clipId)) {
        return NextResponse.json({ error: "Clip ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.reciteClips).set({
        processingStatus: "pending",
        processingError: null,
        processedAt: null,
      }).where(and(eq(schema.reciteClips.id, clipId), eq(schema.reciteClips.processingStatus, "failed"))).returning();
      if (!updated) return NextResponse.json({ error: "Only failed clips can be retried." }, { status: 409 });
      return NextResponse.json(updated);
    }

    // ── Force reprocess (reset stuck "processing" to "pending") ──
    if (action === "force-reprocess") {
      const { clipId } = body as { clipId?: string };
      if (!clipId || !isValidUUID(clipId)) {
        return NextResponse.json({ error: "Clip ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.reciteClips).set({
        processingStatus: "pending",
        processingError: null,
        processedAt: null,
      }).where(eq(schema.reciteClips.id, clipId)).returning({ id: schema.reciteClips.id });
      if (!updated) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    // ── Delete clip ──
    if (action === "delete-clip") {
      const { clipId } = body as { clipId?: string };
      if (!clipId || !isValidUUID(clipId)) {
        return NextResponse.json({ error: "Clip ID is required." }, { status: 400 });
      }
      const [deleted] = await db.delete(schema.reciteClips)
        .where(eq(schema.reciteClips.id, clipId))
        .returning({ storageKey: schema.reciteClips.storageKey, processedStorageKey: schema.reciteClips.processedStorageKey });
      if (!deleted) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
      if (deleted.storageKey) {
        try { await deleteObject(deleted.storageKey); } catch (e) { logError(e, { route: "admin/recite-clips", action: "delete-clip", key: deleted.storageKey }); }
      }
      if (deleted.processedStorageKey && deleted.processedStorageKey !== deleted.storageKey) {
        try { await deleteObject(deleted.processedStorageKey); } catch (e) { logError(e, { route: "admin/recite-clips", action: "delete-clip", key: deleted.processedStorageKey }); }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/recite-clips", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

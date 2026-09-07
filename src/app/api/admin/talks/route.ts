import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { getUploadUrl, deleteObject, makeStorageKey } from "@/lib/r2/client";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isValidDate(value?: string): boolean {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// ── Folders ──

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const folderQuery = db.select({
      id: schema.talkFolders.id,
      name: schema.talkFolders.name,
      description: schema.talkFolders.description,
      imageKey: schema.talkFolders.imageKey,
      startDate: schema.talkFolders.startDate,
      endDate: schema.talkFolders.endDate,
      sortOrder: schema.talkFolders.sortOrder,
    }).from(schema.talkFolders)
      .orderBy(asc(schema.talkFolders.sortOrder), asc(schema.talkFolders.name))
      .limit(200);

    if (type === "folders") return NextResponse.json({ folders: await folderQuery });

    const [folders, talks] = await Promise.all([
      folderQuery,
      db.select({
        id: schema.talks.id,
        title: schema.talks.title,
        speaker: schema.talks.speaker,
        description: schema.talks.description,
        topics: schema.talks.topics,
        folderId: schema.talks.folderId,
        storageKey: schema.talks.storageKey,
        processedStorageKey: schema.talks.processedStorageKey,
        fileSize: schema.talks.fileSize,
        duration: schema.talks.duration,
        externalUrl: schema.talks.externalUrl,
        processingStatus: schema.talks.processingStatus,
        processingError: schema.talks.processingError,
        processedAt: schema.talks.processedAt,
        addedAt: schema.talks.addedAt,
        publishedAt: schema.talks.publishedAt,
      }).from(schema.talks).orderBy(desc(schema.talks.addedAt)).limit(500),
    ]);
    const staleBefore = Date.now() - 800 * 1000; // matches maxDuration=800s in process route
    return NextResponse.json({
      folders,
      talks: talks.map(({ processedAt, ...talk }) => ({
        ...talk,
        canRetryProcessing: talk.processingStatus === "processing" && (!processedAt || processedAt.getTime() <= staleBefore),
      })),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/talks", method: "GET" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("admin-talks-create", ip, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { action } = body as { action?: string };

    // ── Create folder ──
    if (action === "create-folder") {
      const { name, description, startDate, endDate } = body as { name?: string; description?: string; startDate?: string; endDate?: string };
      if (!name?.trim()) {
        return NextResponse.json({ error: "Folder name is required." }, { status: 400 });
      }
      if (!isValidDate(startDate) || !isValidDate(endDate) || (startDate && endDate && startDate > endDate)) {
        return NextResponse.json({ error: "Enter a valid folder date range." }, { status: 400 });
      }
      const [folder] = await db.insert(schema.talkFolders).values({
        name: name.trim().slice(0, 100),
        description: description?.trim().slice(0, 500) || null,
        startDate: startDate || null,
        endDate: endDate || null,
      }).returning();
      return NextResponse.json(folder, { status: 201 });
    }

    // ── Update folder (image, description, dates) ──
    if (action === "update-folder") {
      const { folderId, description, imageKey, startDate, endDate } = body as {
        folderId?: string; description?: string; imageKey?: string; startDate?: string; endDate?: string;
      };
      if (!folderId || !isValidUUID(folderId)) {
        return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
      }
      if (!isValidDate(startDate) || !isValidDate(endDate) || (startDate && endDate && startDate > endDate)) {
        return NextResponse.json({ error: "Enter a valid folder date range." }, { status: 400 });
      }
      const [current] = await db.select({ imageKey: schema.talkFolders.imageKey })
        .from(schema.talkFolders)
        .where(eq(schema.talkFolders.id, folderId))
        .limit(1);
      if (!current) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
      const [updated] = await db.update(schema.talkFolders).set({
        description: description?.trim().slice(0, 500) || null,
        imageKey: imageKey || null,
        startDate: startDate || null,
        endDate: endDate || null,
      }).where(eq(schema.talkFolders.id, folderId)).returning();
      if (current.imageKey && current.imageKey !== updated.imageKey) {
        try { await deleteObject(current.imageKey); } catch (e) { logError(e, { route: "admin/talks", action: "update-folder", key: current.imageKey }); }
      }
      return NextResponse.json(updated);
    }

    // ── Delete folder ──
    if (action === "delete-folder") {
      const { folderId } = body as { folderId?: string };
      if (!folderId || !isValidUUID(folderId)) {
        return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
      }
      const [deleted] = await db.delete(schema.talkFolders)
        .where(eq(schema.talkFolders.id, folderId))
        .returning({ imageKey: schema.talkFolders.imageKey });
      if (!deleted) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
      if (deleted.imageKey) {
        try { await deleteObject(deleted.imageKey); } catch (e) { logError(e, { route: "admin/talks", action: "delete-folder", key: deleted.imageKey }); }
      }
      return NextResponse.json({ success: true });
    }

    // ── Get presigned upload URL ──
    if (action === "get-upload-url") {
      const { folderId, filename, fileSize } = body as { folderId?: string; filename?: string; fileSize?: number };
      if (!filename?.trim().toLowerCase().endsWith(".mp3")) {
        return NextResponse.json({ error: "A valid MP3 filename is required." }, { status: 400 });
      }
      if (!Number.isInteger(fileSize) || fileSize! <= 0 || fileSize! > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "MP3 files must be 150 MB or smaller." }, { status: 400 });
      }
      if (folderId && !isValidUUID(folderId)) {
        return NextResponse.json({ error: "Invalid folder ID." }, { status: 400 });
      }

      let folderName = "uncategorized";
      if (folderId) {
        const [folder] = await db.select({ name: schema.talkFolders.name }).from(schema.talkFolders).where(eq(schema.talkFolders.id, folderId)).limit(1);
        if (!folder) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
        folderName = folder.name;
      }

      const storageKey = makeStorageKey(folderName, filename);
      const uploadUrl = await getUploadUrl(storageKey, "audio/mpeg");

      return NextResponse.json({
        uploadUrl,
        storageKey,
        fileSize: fileSize || null,
      });
    }

    // ── Get presigned upload URL for folder image ──
    if (action === "get-folder-image-url") {
      const { folderId, filename, fileSize } = body as { folderId?: string; filename?: string; fileSize?: number };
      if (!folderId || !isValidUUID(folderId)) {
        return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
      }
      if (!filename?.trim()) {
        return NextResponse.json({ error: "Filename is required." }, { status: 400 });
      }
      if (!Number.isInteger(fileSize) || fileSize! <= 0 || fileSize! > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Folder images must be 5 MB or smaller." }, { status: 400 });
      }

      // Validate file extension
      const ext = filename.toLowerCase().split('.').pop();
      const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (!ext || !allowed.includes(ext)) {
        return NextResponse.json({ error: "Image must be JPG, PNG, WebP, or GIF." }, { status: 400 });
      }

      const [folder] = await db.select({ id: schema.talkFolders.id })
        .from(schema.talkFolders)
        .where(eq(schema.talkFolders.id, folderId))
        .limit(1);
      if (!folder) return NextResponse.json({ error: "Folder not found." }, { status: 404 });

      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      const imageKey = `folder-images/${folderId}/${Date.now()}-${filename.replace(/[^a-z0-9.-]/gi, '-').toLowerCase()}`;
      const uploadUrl = await getUploadUrl(imageKey, contentType);

      return NextResponse.json({ uploadUrl, imageKey, contentType });
    }

    if (action === "delete-folder-image-upload") {
      const { imageKey } = body as { imageKey?: string };
      if (!imageKey || !/^folder-images\/[0-9a-f-]{36}\/\d+-[a-z0-9.-]+$/.test(imageKey)) {
        return NextResponse.json({ error: "Invalid image key." }, { status: 400 });
      }
      const [referenced] = await db.select({ id: schema.talkFolders.id })
        .from(schema.talkFolders)
        .where(eq(schema.talkFolders.imageKey, imageKey))
        .limit(1);
      if (referenced) return NextResponse.json({ error: "Image is already attached to a folder." }, { status: 409 });
      await deleteObject(imageKey);
      return NextResponse.json({ success: true });
    }

    if (action === "delete-upload") {
      const { storageKey } = body as { storageKey?: string };
      if (!storageKey || !/^talks\/[a-z0-9-]+\/\d+-[a-z0-9.-]+\.mp3$/.test(storageKey)) {
        return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
      }
      const [referenced] = await db.select({ id: schema.talks.id })
        .from(schema.talks)
        .where(eq(schema.talks.storageKey, storageKey))
        .limit(1);
      if (referenced) return NextResponse.json({ error: "Uploaded file is already attached to a talk." }, { status: 409 });
      await deleteObject(storageKey);
      return NextResponse.json({ success: true });
    }

    // ── Create talk (after upload completes) ──
    if (action === "create-talk") {
      const { title, speaker, description, topics, folderId, storageKey, fileSize, duration, externalUrl } = body as {
        title?: string; speaker?: string; description?: string; topics?: string;
        folderId?: string; storageKey?: string; fileSize?: number; duration?: number;
        externalUrl?: string;
      };

      if (!title?.trim()) {
        return NextResponse.json({ error: "Title is required." }, { status: 400 });
      }
      const trimmedExternalUrl = externalUrl?.trim();
      if (!storageKey && !trimmedExternalUrl) {
        return NextResponse.json({ error: "Either an uploaded file or external URL is required." }, { status: 400 });
      }
      if (storageKey && trimmedExternalUrl) {
        return NextResponse.json({ error: "Choose either an uploaded file or an external URL." }, { status: 400 });
      }
      if (folderId && !isValidUUID(folderId)) {
        return NextResponse.json({ error: "Invalid folder ID." }, { status: 400 });
      }
      if (storageKey && (!/^talks\/[a-z0-9-]+\/\d+-[a-z0-9.-]+\.mp3$/.test(storageKey) || !Number.isInteger(fileSize) || fileSize! <= 0 || fileSize! > MAX_AUDIO_BYTES)) {
        return NextResponse.json({ error: "Invalid uploaded MP3." }, { status: 400 });
      }
      if (duration !== undefined && (!Number.isInteger(duration) || duration < 0)) {
        return NextResponse.json({ error: "Invalid audio duration." }, { status: 400 });
      }
      if (trimmedExternalUrl) {
        try {
          const url = new URL(trimmedExternalUrl);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
        } catch {
          return NextResponse.json({ error: "External URL must use HTTP or HTTPS." }, { status: 400 });
        }
      }

      const isExternal = !storageKey && !!trimmedExternalUrl;
      const processingStatus = isExternal ? "published" : "pending";

      const [talk] = await db.insert(schema.talks).values({
        title: title.trim().slice(0, 200),
        speaker: speaker?.trim().slice(0, 100) || null,
        description: description?.trim().slice(0, 1000) || null,
        topics: topics?.trim().slice(0, 500) || null,
        folderId: folderId || null,
        storageKey: storageKey || null,
        fileSize: fileSize || null,
        duration: duration || null,
        externalUrl: trimmedExternalUrl || null,
        processingStatus,
        publishedAt: isExternal ? new Date() : null,
      }).returning();

      return NextResponse.json(talk, { status: 201 });
    }

    // ── Publish talk (after processing is complete) ──
    if (action === "publish-talk") {
      const { talkId } = body as { talkId?: string };
      if (!talkId || !isValidUUID(talkId)) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }

      const [talk] = await db.select({
        processingStatus: schema.talks.processingStatus,
        externalUrl: schema.talks.externalUrl,
      }).from(schema.talks).where(eq(schema.talks.id, talkId)).limit(1);
      if (!talk) {
        return NextResponse.json({ error: "Talk not found." }, { status: 404 });
      }

      // Only allow publishing if processing is ready (or it's an external URL talk)
      if (talk.processingStatus !== "ready" && !talk.externalUrl) {
        return NextResponse.json({ error: `Cannot publish: processing status is '${talk.processingStatus}'. Talk must be processed first.` }, { status: 400 });
      }

      const [updated] = await db.update(schema.talks).set({
        processingStatus: "published",
        publishedAt: new Date(),
      }).where(eq(schema.talks.id, talkId)).returning();

      return NextResponse.json(updated);
    }

    // ── Retry processing ──
    if (action === "retry-processing") {
      const { talkId } = body as { talkId?: string };
      if (!talkId || !isValidUUID(talkId)) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.talks).set({
        processingStatus: "pending",
        processingError: null,
        processedAt: null,
      }).where(and(
        eq(schema.talks.id, talkId),
        eq(schema.talks.processingStatus, "failed"),
      )).returning();
      if (!updated) return NextResponse.json({ error: "Only failed talks can be retried." }, { status: 409 });
      return NextResponse.json(updated);
    }

    // ── Force reprocess (reset stuck "processing" status to "pending") ──
    if (action === "force-reprocess") {
      const { talkId } = body as { talkId?: string };
      if (!talkId || !isValidUUID(talkId)) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.talks).set({
        processingStatus: "pending",
        processingError: null,
        processedAt: null,
      }).where(eq(schema.talks.id, talkId)).returning({ id: schema.talks.id });
      if (!updated) return NextResponse.json({ error: "Talk not found." }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    // ── Delete talk ──
    if (action === "delete-talk") {
      const { talkId } = body as { talkId?: string };
      if (!talkId || !isValidUUID(talkId)) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }

      const [deleted] = await db.delete(schema.talks)
        .where(eq(schema.talks.id, talkId))
        .returning({
          storageKey: schema.talks.storageKey,
          processedStorageKey: schema.talks.processedStorageKey,
        });
      if (!deleted) return NextResponse.json({ error: "Talk not found." }, { status: 404 });

      if (deleted.storageKey) {
        try { await deleteObject(deleted.storageKey); } catch (e) { logError(e, { route: "admin/talks", action: "delete-talk", key: deleted.storageKey }); }
      }
      if (deleted.processedStorageKey && deleted.processedStorageKey !== deleted.storageKey) {
        try { await deleteObject(deleted.processedStorageKey); } catch (e) { logError(e, { route: "admin/talks", action: "delete-talk", key: deleted.processedStorageKey }); }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/talks", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

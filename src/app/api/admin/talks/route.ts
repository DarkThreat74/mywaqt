import { NextRequest, NextResponse } from "next/server";
import { eq, asc, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { getUploadUrl, deleteObject, makeStorageKey } from "@/lib/r2/client";

export const dynamic = "force-dynamic";

// ── Folders ──

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "folders") {
      const folders = await db.select().from(schema.talkFolders).orderBy(asc(schema.talkFolders.sortOrder), asc(schema.talkFolders.name));
      return NextResponse.json({ folders });
    }

    // Default: return folders + talks together
    const [folders, talks] = await Promise.all([
      db.select().from(schema.talkFolders).orderBy(asc(schema.talkFolders.sortOrder), asc(schema.talkFolders.name)),
      db.select().from(schema.talks).orderBy(desc(schema.talks.addedAt)),
    ]);
    return NextResponse.json({ folders, talks });
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

    const body = await request.json();
    const { action } = body as { action?: string };

    // ── Create folder ──
    if (action === "create-folder") {
      const { name, description, startDate, endDate } = body as { name?: string; description?: string; startDate?: string; endDate?: string };
      if (!name?.trim()) {
        return NextResponse.json({ error: "Folder name is required." }, { status: 400 });
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
      if (!folderId) {
        return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.talkFolders).set({
        description: description?.trim().slice(0, 500) || null,
        imageKey: imageKey || null,
        startDate: startDate || null,
        endDate: endDate || null,
      }).where(eq(schema.talkFolders.id, folderId)).returning();
      return NextResponse.json(updated);
    }

    // ── Delete folder ──
    if (action === "delete-folder") {
      const { folderId } = body as { folderId?: string };
      if (!folderId) {
        return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
      }
      // Talks in this folder will have folderId set to null (ON DELETE SET NULL)
      await db.delete(schema.talkFolders).where(eq(schema.talkFolders.id, folderId));
      return NextResponse.json({ success: true });
    }

    // ── Get presigned upload URL ──
    if (action === "get-upload-url") {
      const { folderId, filename, fileSize } = body as { folderId?: string; filename?: string; fileSize?: number };
      if (!filename?.trim()) {
        return NextResponse.json({ error: "Filename is required." }, { status: 400 });
      }

      // Get folder name for the storage key
      let folderName = "uncategorized";
      if (folderId) {
        const [folder] = await db.select().from(schema.talkFolders).where(eq(schema.talkFolders.id, folderId)).limit(1);
        if (folder) folderName = folder.name;
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
      const { folderId, filename } = body as { folderId?: string; filename?: string };
      if (!folderId) {
        return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
      }
      if (!filename?.trim()) {
        return NextResponse.json({ error: "Filename is required." }, { status: 400 });
      }

      // Validate file extension
      const ext = filename.toLowerCase().split('.').pop();
      const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (!ext || !allowed.includes(ext)) {
        return NextResponse.json({ error: "Image must be JPG, PNG, WebP, or GIF." }, { status: 400 });
      }

      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      const imageKey = `folder-images/${folderId}/${Date.now()}-${filename.replace(/[^a-z0-9.-]/gi, '-').toLowerCase()}`;
      const uploadUrl = await getUploadUrl(imageKey, contentType);

      return NextResponse.json({ uploadUrl, imageKey });
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
      if (!storageKey && !externalUrl?.trim()) {
        return NextResponse.json({ error: "Either an uploaded file or external URL is required." }, { status: 400 });
      }
      if (externalUrl) {
        try { new URL(externalUrl); } catch {
          return NextResponse.json({ error: "External URL must be a valid URL." }, { status: 400 });
        }
      }

      // External URL talks are immediately published (no processing needed)
      // Self-hosted talks start as 'pending' and require processing before publishing
      const isExternal = !!externalUrl;
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
        externalUrl: externalUrl?.trim() || null,
        processingStatus,
        publishedAt: isExternal ? new Date() : null,
      }).returning();

      return NextResponse.json(talk, { status: 201 });
    }

    // ── Publish talk (after processing is complete) ──
    if (action === "publish-talk") {
      const { talkId } = body as { talkId?: string };
      if (!talkId) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }

      const [talk] = await db.select().from(schema.talks).where(eq(schema.talks.id, talkId)).limit(1);
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
      if (!talkId) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }
      const [updated] = await db.update(schema.talks).set({
        processingStatus: "pending",
        processingError: null,
      }).where(eq(schema.talks.id, talkId)).returning();
      return NextResponse.json(updated);
    }

    // ── Delete talk ──
    if (action === "delete-talk") {
      const { talkId } = body as { talkId?: string };
      if (!talkId) {
        return NextResponse.json({ error: "Talk ID is required." }, { status: 400 });
      }

      // Get the talk to find its storage key
      const [talk] = await db.select().from(schema.talks).where(eq(schema.talks.id, talkId)).limit(1);
      if (!talk) {
        return NextResponse.json({ error: "Talk not found." }, { status: 404 });
      }

      // Delete from R2 if self-hosted
      if (talk.storageKey) {
        try { await deleteObject(talk.storageKey); } catch { /* best-effort */ }
      }

      // Delete from DB
      await db.delete(schema.talks).where(eq(schema.talks.id, talkId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/talks", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

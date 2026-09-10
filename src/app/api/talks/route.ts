import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { getStreamUrl } from "@/lib/r2/client";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("stream");
    const folderImageId = searchParams.get("folderImage");

    if (streamId) {
      if (!isValidUUID(streamId)) return NextResponse.json({ error: "Invalid talk ID." }, { status: 400 });
      const [talk] = await db.select({
        storageKey: schema.talks.storageKey,
        processedStorageKey: schema.talks.processedStorageKey,
      }).from(schema.talks).where(and(
        eq(schema.talks.id, streamId),
        eq(schema.talks.processingStatus, "published"),
      )).limit(1);
      const key = talk?.processedStorageKey || talk?.storageKey;
      if (!key) return NextResponse.json({ error: "Talk audio not found." }, { status: 404 });
      const response = NextResponse.redirect(await getStreamUrl(key), 307);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    if (folderImageId) {
      if (!isValidUUID(folderImageId)) return NextResponse.json({ error: "Invalid folder ID." }, { status: 400 });
      const [folder] = await db.select({ imageKey: schema.talkFolders.imageKey })
        .from(schema.talkFolders)
        .where(eq(schema.talkFolders.id, folderImageId))
        .limit(1);
      if (!folder?.imageKey) return NextResponse.json({ error: "Folder image not found." }, { status: 404 });
      const response = NextResponse.redirect(await getStreamUrl(folder.imageKey), 307);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    const [folders, talks, progress] = await Promise.all([
      db.select({
        id: schema.talkFolders.id,
        name: schema.talkFolders.name,
        description: schema.talkFolders.description,
        imageKey: schema.talkFolders.imageKey,
        folderColor: schema.talkFolders.folderColor,
        sortOrder: schema.talkFolders.sortOrder,
      }).from(schema.talkFolders)
        .orderBy(asc(schema.talkFolders.sortOrder), asc(schema.talkFolders.name))
        .limit(200),
      db.select({
        id: schema.talks.id,
        title: schema.talks.title,
        speaker: schema.talks.speaker,
        description: schema.talks.description,
        topics: schema.talks.topics,
        folderId: schema.talks.folderId,
        fileSize: schema.talks.fileSize,
        duration: schema.talks.duration,
        externalUrl: schema.talks.externalUrl,
        addedAt: schema.talks.addedAt,
        hasAudio: schema.talks.storageKey,
      }).from(schema.talks)
        .where(eq(schema.talks.processingStatus, "published"))
        .orderBy(asc(schema.talks.title))
        .limit(500),
      // Fetch user's progress for all talks (bounded to 500)
      db.select({
        talkId: schema.talkProgress.talkId,
        position: schema.talkProgress.position,
        completed: schema.talkProgress.completed,
      }).from(schema.talkProgress)
        .where(eq(schema.talkProgress.userId, session.userId))
        .limit(500),
    ]);

    // Build progress map for quick lookup
    const progressMap = new Map(progress.map(p => [p.talkId, p]));

    return NextResponse.json({
      folders: folders.map(({ imageKey, ...folder }) => ({
        ...folder,
        imageUrl: imageKey ? `/api/talks?folderImage=${folder.id}` : null,
      })),
      talks: talks.map(({ hasAudio, ...talk }) => ({
        ...talk,
        streamUrl: hasAudio ? `/api/talks?stream=${talk.id}` : null,
        progress: progressMap.get(talk.id) || null,
      })),
    });
  } catch (err) {
    logError(err, { route: "talks GET" });
    return NextResponse.json({ error: "Failed to load talks." }, { status: 500 });
  }
}

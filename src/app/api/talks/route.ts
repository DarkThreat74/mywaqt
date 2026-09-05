import { NextRequest, NextResponse } from "next/server";
import { eq, asc, desc, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { getStreamUrl } from "@/lib/r2/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/talks
 * Returns folders + published talks only. Self-hosted talks get a presigned stream URL
 * from the processed audio key (if available), falling back to the original.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [folders, talks] = await Promise.all([
      db.select().from(schema.talkFolders).orderBy(asc(schema.talkFolders.sortOrder), asc(schema.talkFolders.name)),
      db.select().from(schema.talks)
        .where(eq(schema.talks.processingStatus, "published"))
        .orderBy(desc(schema.talks.addedAt)),
    ]);

    // Generate presigned URLs for folder images
    const foldersWithUrls = await Promise.all(
      folders.map(async (folder) => {
        if (folder.imageKey) {
          try {
            const imageUrl = await getStreamUrl(folder.imageKey);
            return { ...folder, imageUrl };
          } catch {
            return { ...folder, imageUrl: null };
          }
        }
        return { ...folder, imageUrl: null };
      }),
    );

    // Generate presigned stream URLs for self-hosted talks
    // Prefer processed audio, fall back to original
    const talksWithUrls = await Promise.all(
      talks.map(async (talk) => {
        const streamKey = talk.processedStorageKey || talk.storageKey;
        if (streamKey) {
          try {
            const streamUrl = await getStreamUrl(streamKey);
            return { ...talk, streamUrl };
          } catch {
            return { ...talk, streamUrl: null };
          }
        }
        return { ...talk, streamUrl: null };
      }),
    );

    return NextResponse.json({ folders: foldersWithUrls, talks: talksWithUrls });
  } catch (err) {
    logError(err, { route: "talks GET" });
    return NextResponse.json(
      { error: "Failed to load talks." },
      { status: 500 },
    );
  }
}

// Avoid unused import warning
void and;

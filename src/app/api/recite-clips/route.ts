import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { getStreamUrl } from "@/lib/r2/client";
import { isValidUUID } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/recite-clips
 *   (no params)      → published clip list (metadata only, no keys)
 *   ?stream=<id>     → 307 to a signed R2 URL for the processed audio
 *   ?stream=<id>&proxy=1 → bytes proxied through this origin (offline-safe)
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("recite-clips", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("stream");

    if (streamId) {
      if (!isValidUUID(streamId)) return NextResponse.json({ error: "Invalid clip ID." }, { status: 400 });
      const [clip] = await db.select({
        storageKey: schema.reciteClips.storageKey,
        processedStorageKey: schema.reciteClips.processedStorageKey,
      }).from(schema.reciteClips).where(and(
        eq(schema.reciteClips.id, streamId),
        eq(schema.reciteClips.processingStatus, "published"),
      )).limit(1);
      const key = clip?.processedStorageKey || clip?.storageKey;
      if (!key) return NextResponse.json({ error: "Clip audio not found." }, { status: 404 });
      const signed = await getStreamUrl(key);
      if (searchParams.get("proxy") === "1") {
        const upstream = await fetch(signed, {
          headers: request.headers.get("range") ? { range: request.headers.get("range")! } : {},
        });
        const headers = new Headers();
        for (const h of ["content-type", "content-length", "accept-ranges", "content-range"]) {
          const v = upstream.headers.get(h);
          if (v) headers.set(h, v);
        }
        if (!headers.has("content-type")) headers.set("content-type", "audio/ogg");
        headers.set("cache-control", "private, no-store");
        return new NextResponse(upstream.body, { status: upstream.status, headers });
      }
      const response = NextResponse.redirect(signed, 307);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    const clips = await db.select({
      id: schema.reciteClips.id,
      title: schema.reciteClips.title,
      reciter: schema.reciteClips.reciter,
      passage: schema.reciteClips.passage,
      style: schema.reciteClips.style,
      duration: schema.reciteClips.duration,
      fileSize: schema.reciteClips.fileSize,
      analysis: schema.reciteClips.analysis,
      publishedAt: schema.reciteClips.publishedAt,
    }).from(schema.reciteClips)
      .where(eq(schema.reciteClips.processingStatus, "published"))
      .orderBy(desc(schema.reciteClips.publishedAt))
      .limit(500);
    return NextResponse.json({ clips });
  } catch (e) {
    logError(e, { route: "recite-clips", method: "GET" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

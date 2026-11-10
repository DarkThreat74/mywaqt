import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(_request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = await db.select({ id: schema.friendPhotos.id, createdAt: schema.friendPhotos.createdAt, mime: schema.friendPhotos.photoMime })
      .from(schema.friendPhotos)
      .where(and(eq(schema.friendPhotos.friendId, id), eq(schema.friendPhotos.userId, session.userId)))
      .orderBy(desc(schema.friendPhotos.createdAt)).limit(100);
    return NextResponse.json({ photos: rows });
  } catch (err) {
    logError(err, { route: "friends/photos/GET" });
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

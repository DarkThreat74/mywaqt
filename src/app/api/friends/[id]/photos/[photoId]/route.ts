import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, photoId } = await params;
    if (!isValidUUID(id) || !isValidUUID(photoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [row] = await db.select({ data: schema.friendPhotos.photoData, mime: schema.friendPhotos.photoMime })
      .from(schema.friendPhotos).where(and(eq(schema.friendPhotos.id, photoId), eq(schema.friendPhotos.friendId, id), eq(schema.friendPhotos.userId, session.userId))).limit(1);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(Buffer.from(row.data, "base64"), { headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch (err) {
    logError(err, { route: "friends/photos/GET" });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

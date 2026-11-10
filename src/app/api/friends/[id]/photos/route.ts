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
    const [friend] = await db.select({ photoData: schema.friends.photoData }).from(schema.friends)
      .where(and(eq(schema.friends.id, id), eq(schema.friends.userId, session.userId))).limit(1);
    if (!friend) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = await db.select({ id: schema.friendPhotos.id, createdAt: schema.friendPhotos.createdAt, mime: schema.friendPhotos.photoMime, data: schema.friendPhotos.photoData })
      .from(schema.friendPhotos)
      .where(and(eq(schema.friendPhotos.friendId, id), eq(schema.friendPhotos.userId, session.userId)))
      .orderBy(desc(schema.friendPhotos.createdAt)).limit(100);
    return NextResponse.json({ photos: rows.map(({ data, ...photo }) => ({ ...photo, isCurrent: data === friend.photoData })) });
  } catch (err) {
    logError(err, { route: "friends/photos/GET" });
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const photoId = (await request.json().catch(() => ({}))).photoId;
    if (!isValidUUID(id) || typeof photoId !== "string" || !isValidUUID(photoId)) return NextResponse.json({ error: "Invalid photo" }, { status: 400 });
    const [photo] = await db.select({ data: schema.friendPhotos.photoData, mime: schema.friendPhotos.photoMime })
      .from(schema.friendPhotos).where(and(eq(schema.friendPhotos.id, photoId), eq(schema.friendPhotos.friendId, id), eq(schema.friendPhotos.userId, session.userId))).limit(1);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [friend] = await db.update(schema.friends).set({ photoData: photo.data, photoMime: photo.mime, updatedAt: new Date() })
      .where(and(eq(schema.friends.id, id), eq(schema.friends.userId, session.userId))).returning({ id: schema.friends.id });
    if (!friend) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "friends/photos/PATCH" });
    return NextResponse.json({ error: "Failed to set profile photo" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const photoId = new URL(request.url).searchParams.get("photoId");
    if (!isValidUUID(id) || !photoId || !isValidUUID(photoId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const deleted = await db.delete(schema.friendPhotos).where(and(eq(schema.friendPhotos.id, photoId), eq(schema.friendPhotos.friendId, id), eq(schema.friendPhotos.userId, session.userId))).returning({ id: schema.friendPhotos.id });
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "friends/photos/DELETE" });
    return NextResponse.json({ error: "Failed to delete photo" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = await db.select({
      id: schema.events.id, title: schema.events.title, details: schema.events.details,
      startAt: schema.events.startAt, endAt: schema.events.endAt,
      placeName: schema.events.tagPlaceName, placeAddress: schema.events.tagPlaceAddress,
    }).from(schema.events).where(and(
      eq(schema.events.userId, session.userId),
      or(eq(schema.events.hangoutFriendId, id), sql`${schema.events.hangoutFriendIds} @> ARRAY[${id}]::uuid[]`),
    )).orderBy(desc(schema.events.startAt)).limit(200);
    const now = Date.now();
    return NextResponse.json({
      hangouts: rows,
      stats: {
        total: rows.length,
        last30: rows.filter((row) => now - new Date(row.startAt).getTime() <= 30 * 86400000).length,
        last90: rows.filter((row) => now - new Date(row.startAt).getTime() <= 90 * 86400000).length,
        lastAt: rows[0]?.startAt ?? null,
      },
    });
  } catch (err) {
    logError(err, { route: "friends/hangouts" });
    return NextResponse.json({ error: "Failed to fetch hangouts" }, { status: 500 });
  }
}

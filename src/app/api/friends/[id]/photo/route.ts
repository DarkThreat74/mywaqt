import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Serves a friend's avatar. Owner-only — the row is scoped by session
// userId, so a guessed id returns 404, not the image.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [row] = await db
      .select({ photoData: schema.friends.photoData, photoMime: schema.friends.photoMime })
      .from(schema.friends)
      .where(and(eq(schema.friends.id, id), eq(schema.friends.userId, session.userId)))
      .limit(1);

    if (!row?.photoData || !row.photoMime) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(Buffer.from(row.photoData, "base64"), {
      headers: {
        "Content-Type": row.photoMime,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logError(err, { route: "friends/photo" });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

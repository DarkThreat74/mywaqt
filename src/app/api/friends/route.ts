import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const MET_TAGS = new Set(["school", "childhood", "work", "online", "family", "masjid", "other"]);
const TALK_FREQS = new Set(["daily", "weekly", "monthly", "rarely"]);
const PHOTO_MIMES = new Set(["image/jpeg", "image/webp", "image/png"]);
const MAX_PHOTO_B64 = 800_000;

interface FriendBody {
  id?: string;
  name?: string;
  metTag?: string | null;
  metDetail?: string | null;
  talkFreq?: string | null;
  notes?: string | null;
  photo?: string | null;
  photoMime?: string | null;
  clientId?: string;
}

function validateFields(body: FriendBody, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) errors.push("Name must be 1–80 characters");
    else out.name = name;
  }
  if (body.metTag !== undefined) {
    const t = typeof body.metTag === "string" ? body.metTag.trim().toLowerCase() : null;
    if (t && !MET_TAGS.has(t)) errors.push("Invalid met tag");
    else out.metTag = t;
  }
  if (body.metDetail !== undefined) {
    const d = typeof body.metDetail === "string" ? body.metDetail.trim() || null : null;
    if (d && d.length > 80) errors.push("Detail too long");
    else out.metDetail = d;
  }
  if (body.talkFreq !== undefined) {
    const f = typeof body.talkFreq === "string" ? body.talkFreq.trim().toLowerCase() : null;
    if (f && !TALK_FREQS.has(f)) errors.push("Invalid talk frequency");
    else out.talkFreq = f;
  }
  if (body.notes !== undefined) {
    const n = typeof body.notes === "string" ? body.notes.trim() || null : null;
    if (n && n.length > 2000) errors.push("Notes too long");
    else out.notes = n;
  }
  if (body.photo !== undefined) {
    if (body.photo === null) {
      out.photoData = null;
      out.photoMime = null;
    } else if (typeof body.photo === "string") {
      const mime = typeof body.photoMime === "string" ? body.photoMime : "";
      if (!PHOTO_MIMES.has(mime)) {
        errors.push("Photo must be jpeg/webp/png");
      } else if (body.photo.length > MAX_PHOTO_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) {
        errors.push("Photo too large or invalid");
      } else {
        out.photoData = body.photo;
        out.photoMime = mime;
      }
    }
  }

  return { out, errors };
}

// GET /api/friends — list the user's friends (photo bytes excluded)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("friends-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const rows = await db
      .select({
        id: schema.friends.id,
        name: schema.friends.name,
        metTag: schema.friends.metTag,
        metDetail: schema.friends.metDetail,
        talkFreq: schema.friends.talkFreq,
        notes: schema.friends.notes,
        hasPhoto: sql<boolean>`${schema.friends.photoData} IS NOT NULL`,
        createdAt: schema.friends.createdAt,
        updatedAt: schema.friends.updatedAt,
      })
      .from(schema.friends)
      .where(eq(schema.friends.userId, session.userId))
      .orderBy(schema.friends.name)
      .limit(500);

    return NextResponse.json({ friends: rows });
  } catch (err) {
    logError(err, { route: "friends/GET" });
    return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
  }
}

// POST /api/friends — add a friend
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("friends-post", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: FriendBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, false);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const [row] = await db
      .insert(schema.friends)
      .values({
        id: validClientId,
        userId: session.userId,
        name: out.name as string,
        metTag: (out.metTag as string | null) ?? null,
        metDetail: (out.metDetail as string | null) ?? null,
        talkFreq: (out.talkFreq as string | null) ?? null,
        notes: (out.notes as string | null) ?? null,
        photoData: (out.photoData as string | null) ?? null,
        photoMime: (out.photoMime as string | null) ?? null,
      })
      .onConflictDoNothing({ target: schema.friends.id })
      .returning();

    if (!row && validClientId) {
      const [existing] = await db
        .select()
        .from(schema.friends)
        .where(and(eq(schema.friends.id, validClientId), eq(schema.friends.userId, session.userId)))
        .limit(1);
      if (existing) return NextResponse.json({ friend: existing, deduped: true });
      return NextResponse.json({ error: "Failed to save friend" }, { status: 500 });
    }

    return NextResponse.json({ friend: row });
  } catch (err) {
    logError(err, { route: "friends/POST" });
    return NextResponse.json({ error: "Failed to save friend" }, { status: 500 });
  }
}

// PATCH /api/friends — update a friend the user owns
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("friends-patch", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: FriendBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string" || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, true);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const [row] = await db
      .update(schema.friends)
      .set({ ...out, updatedAt: new Date() })
      .where(and(eq(schema.friends.id, body.id), eq(schema.friends.userId, session.userId)))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ friend: row });
  } catch (err) {
    logError(err, { route: "friends/PATCH" });
    return NextResponse.json({ error: "Failed to update friend" }, { status: 500 });
  }
}

// DELETE /api/friends?id= — remove a friend the user owns
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("friends-delete", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.friends)
      .where(and(eq(schema.friends.id, id), eq(schema.friends.userId, session.userId)))
      .returning({ id: schema.friends.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "friends/DELETE" });
    return NextResponse.json({ error: "Failed to delete friend" }, { status: 500 });
  }
}

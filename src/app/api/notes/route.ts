import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/notes — list all notes for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit("notes-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const notes = await db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.userId, session.userId))
      .orderBy(desc(schema.notes.updatedAt))
      .limit(500);

    return NextResponse.json(notes);
  } catch (err) {
    logError(err, { route: "notes/GET" });
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST /api/notes — create a new note
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("notes-post", ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { title?: string; content?: string; pinned?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // content is required but may be an empty string
    if (body.content === undefined || body.content === null) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    const content = body.content;
    if (content.length > 50_000) {
      return NextResponse.json({ error: "Content must be 50,000 characters or less" }, { status: 400 });
    }

    // title is optional, max 200 chars if provided
    let title: string | null = null;
    if (body.title !== undefined && body.title !== null) {
      const trimmed = body.title.trim();
      if (trimmed.length > 200) {
        return NextResponse.json({ error: "Title must be 200 characters or less" }, { status: 400 });
      }
      title = trimmed || null;
    }

    const pinned = body.pinned === true;

    const [note] = await db
      .insert(schema.notes)
      .values({
        userId: session.userId,
        title,
        content,
        pinned,
      })
      .returning();

    return NextResponse.json(note);
  } catch (err) {
    logError(err, { route: "notes/POST" });
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}

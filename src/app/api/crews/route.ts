import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/crews — the user's crews (all fields, they're small).
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const crews = await db
      .select({
        id: schema.friendCrews.id,
        name: schema.friendCrews.name,
        hiddenFromAll: schema.friendCrews.hiddenFromAll,
      })
      .from(schema.friendCrews)
      .where(eq(schema.friendCrews.userId, session.userId))
      .orderBy(schema.friendCrews.name)
      .limit(200);
    return NextResponse.json({ crews });
  } catch (err) {
    logError(err, { route: "crews/GET" });
    return NextResponse.json({ error: "Failed to fetch crews" }, { status: 500 });
  }
}

// POST /api/crews — create a crew. { name, hiddenFromAll? }
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("crews-post", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { name?: unknown; hiddenFromAll?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    // Case-insensitive dedupe — return the existing crew instead of 409.
    const [existing] = await db
      .select()
      .from(schema.friendCrews)
      .where(and(eq(schema.friendCrews.userId, session.userId), sql`lower(${schema.friendCrews.name}) = lower(${name})`))
      .limit(1);
    if (existing) return NextResponse.json({ crew: existing, deduped: true });

    const [crew] = await db
      .insert(schema.friendCrews)
      .values({ userId: session.userId, name, hiddenFromAll: body.hiddenFromAll === true })
      .returning();
    return NextResponse.json({ crew });
  } catch (err) {
    logError(err, { route: "crews/POST" });
    return NextResponse.json({ error: "Failed to create crew" }, { status: 500 });
  }
}

// PATCH /api/crews — toggle hidden flag. { id, hiddenFromAll }
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("crews-patch", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { id?: unknown; hiddenFromAll?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string" || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }
    if (typeof body.hiddenFromAll !== "boolean") {
      return NextResponse.json({ error: "hiddenFromAll must be boolean" }, { status: 400 });
    }

    const [crew] = await db
      .update(schema.friendCrews)
      .set({ hiddenFromAll: body.hiddenFromAll })
      .where(and(eq(schema.friendCrews.id, body.id), eq(schema.friendCrews.userId, session.userId)))
      .returning();
    if (!crew) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ crew });
  } catch (err) {
    logError(err, { route: "crews/PATCH" });
    return NextResponse.json({ error: "Failed to update crew" }, { status: 500 });
  }
}

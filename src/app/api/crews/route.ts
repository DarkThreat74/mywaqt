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

// PATCH /api/crews — update a crew. { id, hiddenFromAll?, name? }
// Renaming also rewrites the groupLabel on every friend in the crew.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("crews-patch", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { id?: unknown; hiddenFromAll?: unknown; name?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string" || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }
    if (body.hiddenFromAll === undefined && body.name === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(schema.friendCrews)
      .where(and(eq(schema.friendCrews.id, body.id), eq(schema.friendCrews.userId, session.userId)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newName = typeof body.name === "string" ? body.name.trim().slice(0, 60) : null;
    if (body.name !== undefined && !newName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (newName && newName.toLowerCase() !== existing.name.toLowerCase()) {
      const [dupe] = await db
        .select({ id: schema.friendCrews.id })
        .from(schema.friendCrews)
        .where(and(
          eq(schema.friendCrews.userId, session.userId),
          sql`lower(${schema.friendCrews.name}) = lower(${newName})`,
        ))
        .limit(1);
      if (dupe) return NextResponse.json({ error: "A crew with that name already exists" }, { status: 409 });
    }

    const [crew] = await db
      .update(schema.friendCrews)
      .set({
        ...(body.hiddenFromAll !== undefined ? { hiddenFromAll: body.hiddenFromAll === true } : {}),
        ...(newName ? { name: newName } : {}),
      })
      .where(eq(schema.friendCrews.id, body.id))
      .returning();

    if (newName && newName !== existing.name) {
      await db
        .update(schema.friends)
        .set({ groupLabel: newName })
        .where(and(eq(schema.friends.userId, session.userId), eq(schema.friends.groupLabel, existing.name)));
    }

    return NextResponse.json({ crew });
  } catch (err) {
    logError(err, { route: "crews/PATCH" });
    return NextResponse.json({ error: "Failed to update crew" }, { status: 500 });
  }
}

// DELETE /api/crews?id= — delete a crew; members keep their accounts but lose
// the crew label.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("crews-delete", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const [crew] = await db
      .delete(schema.friendCrews)
      .where(and(eq(schema.friendCrews.id, id), eq(schema.friendCrews.userId, session.userId)))
      .returning({ name: schema.friendCrews.name });
    if (!crew) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db
      .update(schema.friends)
      .set({ groupLabel: null })
      .where(and(eq(schema.friends.userId, session.userId), eq(schema.friends.groupLabel, crew.name)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "crews/DELETE" });
    return NextResponse.json({ error: "Failed to delete crew" }, { status: 500 });
  }
}

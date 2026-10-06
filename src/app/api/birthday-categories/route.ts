import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";
import { CATEGORY_COLORS } from "@/lib/birthdays/palette";

export const dynamic = "force-dynamic";

const VALID_COLORS = new Set<string>(CATEGORY_COLORS);

// POST /api/birthday-categories — create { name, color }
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("bcat-post", getClientIp(request.headers), 20, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { name?: string; color?: string; clientId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 40) {
      return NextResponse.json({ error: "A category name (1–40 chars) is required" }, { status: 400 });
    }
    if (!body.color || !VALID_COLORS.has(body.color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    // Unique per (user, name) — a repeat just returns the existing category.
    const [row] = await db
      .insert(schema.birthdayCategories)
      .values({ id: validClientId, userId: session.userId, name, color: body.color })
      // No target — suppress BOTH conflict shapes: duplicate (userId,name)
      // and a retried offline replay colliding on the id PK.
      .onConflictDoNothing()
      .returning();

    const category = row ?? (await db
      .select()
      .from(schema.birthdayCategories)
      .where(and(
        eq(schema.birthdayCategories.userId, session.userId),
        eq(schema.birthdayCategories.name, name),
      ))
      .limit(1))[0];

    return NextResponse.json({ category });
  } catch (err) {
    logError(err, { route: "birthday-categories/POST" });
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

// DELETE /api/birthday-categories?id= — remove (birthdays keep existing, categoryId → null)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("bcat-delete", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.birthdayCategories)
      .where(and(eq(schema.birthdayCategories.id, id), eq(schema.birthdayCategories.userId, session.userId)))
      .returning({ id: schema.birthdayCategories.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "birthday-categories/DELETE" });
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}

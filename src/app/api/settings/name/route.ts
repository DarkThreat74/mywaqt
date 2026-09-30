import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { slugifyName } from "@/lib/slugify";

export const dynamic = "force-dynamic";

// POST /api/settings/name — update the user's display name
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("settings-name", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { displayName } = body as { displayName?: string };

  if (!displayName?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const trimmed = displayName.trim();
  if (trimmed.length > 50) {
    return NextResponse.json({ error: "Name must be 50 characters or less." }, { status: 400 });
  }

  // first_name is the legacy column every display surface reads FIRST
  // (firstName || displayName) — leaving it stale would shadow the new
  // name everywhere: friends list, matches, notifications, admin.
  await db
    .update(schema.users)
    .set({ displayName: trimmed, firstName: trimmed })
    .where(eq(schema.users.id, session.userId));

  const nameSlug = slugifyName(trimmed);

  return NextResponse.json({ ok: true, displayName: trimmed, nameSlug });
}

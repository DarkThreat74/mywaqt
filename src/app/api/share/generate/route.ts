import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomInt } from "crypto";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { slugifyName } from "@/lib/slugify";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Generate a short 6-character share code using an unambiguous alphabet
// (no I, O, 0, 1). 32^6 ≈ 1 billion possibilities — collision-resistant at
// 100k users with a DB uniqueness check. The code is URL-friendly and
// easy to share verbally.
const SHARE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHARE_CODE_LENGTH = 6;

function generateShareCode(): string {
  let code = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_ALPHABET[randomInt(SHARE_ALPHABET.length)];
  }
  return code;
}

// POST /api/share/generate — create or regenerate the public share code.
// Regenerating overwrites the old code, which deactivates the previous link.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 generations per hour per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("share-generate", ip, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Get the user's display name for the URL
  const [userRow] = await db
    .select({ displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  const nameSlug = slugifyName(userRow?.displayName || "shared");

  // Generate a unique 6-char code (collisions checked against DB)
  let code = generateShareCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.publicShareToken, code))
      .limit(1);
    if (!existing) break;
    code = generateShareCode();
  }

  // Overwrite the old token — this deactivates any previously shared link
  await db
    .update(schema.users)
    .set({ publicShareToken: code })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ token: code, url: `/${nameSlug}/${code}/public` });
}

// DELETE /api/share/generate — disable sharing (clears the token)
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(schema.users)
    .set({ publicShareToken: null })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ ok: true });
}

// GET /api/share/generate — check if sharing is enabled and get current token
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [user] = await db
      .select({
        publicShareToken: schema.users.publicShareToken,
        displayName: schema.users.displayName,
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const nameSlug = slugifyName(user.displayName || "shared");

    return NextResponse.json({
      enabled: !!user.publicShareToken,
      token: user.publicShareToken,
      url: user.publicShareToken ? `/${nameSlug}/${user.publicShareToken}/public` : null,
    });
  } catch (err) {
    logError(err, { route: "share/generate GET" });
    return NextResponse.json({ error: "Failed to load share status." }, { status: 500 });
  }
}

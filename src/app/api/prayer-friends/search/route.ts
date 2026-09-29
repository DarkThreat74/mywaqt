import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, ne, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/prayer-friends/search?q=… — find users by display/first name.
 *
 * Deliberately narrow for privacy:
 * - prefix match only (no substring trawling the whole user table)
 * - returns name + prayer code only — no id, no email
 * - respects friends_searchable opt-out and blocks (either direction)
 * - hard rate limit; results capped at 10
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("friend-search", ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (raw.length < 2 || raw.length > 40) {
    return NextResponse.json({ results: [] });
  }
  // Prefix match expressed as a range scan on lower(name): "sa%" ≡
  // >= 'sa' AND < 'sa\uFFFF'. Unlike a parameterized LIKE, this ALWAYS hits
  // the text_pattern_ops index — at 100k users a seq scan per keystroke
  // would hurt. (Appending the max BMP char also survives edge inputs like
  // a query ending in U+FFFF, where incrementing the last code unit wraps.)
  const lo = raw.toLowerCase();
  const hi = lo + "￿";

  const rows = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      displayName: schema.users.displayName,
      prayerCode: schema.users.prayerCode,
      avatarUrl: schema.users.avatarUrl,
      searchable: schema.prayerSettings.friendsSearchable,
    })
    .from(schema.users)
    .leftJoin(schema.prayerSettings, eq(schema.prayerSettings.userId, schema.users.id))
    .where(
      and(
        ne(schema.users.id, session.userId),
        or(
          and(
            sql`lower(${schema.users.firstName}) >= ${lo}`,
            sql`lower(${schema.users.firstName}) < ${hi}`,
          ),
          and(
            sql`lower(${schema.users.displayName}) >= ${lo}`,
            sql`lower(${schema.users.displayName}) < ${hi}`,
          ),
        ),
      ),
    )
    .limit(15);

  const candidates = rows.filter((r) => r.searchable !== false && r.prayerCode);
  if (candidates.length === 0) return NextResponse.json({ results: [] });
  const ids = candidates.map((r) => r.id);

  const [blocks, relations] = await Promise.all([
    db
      .select({ userId: schema.prayerBlocks.userId, blockedUserId: schema.prayerBlocks.blockedUserId })
      .from(schema.prayerBlocks)
      .where(
        or(
          and(eq(schema.prayerBlocks.userId, session.userId), inArray(schema.prayerBlocks.blockedUserId, ids)),
          and(inArray(schema.prayerBlocks.userId, ids), eq(schema.prayerBlocks.blockedUserId, session.userId)),
        ),
      ),
    db
      .select({ userId: schema.prayerFriends.userId, friendId: schema.prayerFriends.friendId, status: schema.prayerFriends.status })
      .from(schema.prayerFriends)
      .where(
        or(
          and(eq(schema.prayerFriends.userId, session.userId), inArray(schema.prayerFriends.friendId, ids)),
          and(inArray(schema.prayerFriends.userId, ids), eq(schema.prayerFriends.friendId, session.userId)),
        ),
      ),
  ]);

  const blockedIds = new Set(
    blocks.map((b) => (b.userId === session.userId ? b.blockedUserId : b.userId)),
  );
  const relationOf = new Map<string, string>();
  for (const r of relations) {
    const other = r.userId === session.userId ? r.friendId : r.userId;
    relationOf.set(other, r.status);
  }

  return NextResponse.json({
    results: candidates
      .filter((r) => !blockedIds.has(r.id))
      .slice(0, 10)
      .map((r) => ({
        name: r.firstName || r.displayName || "Waqt user",
        code: r.prayerCode,
        avatarUrl: r.avatarUrl,
        relation: relationOf.get(r.id) ?? null, // 'accepted' | 'pending' | null
      })),
  });
}

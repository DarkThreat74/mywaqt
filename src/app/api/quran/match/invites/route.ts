import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/quran/match/invites — incoming pending challenges (toast source)
// plus my own active matches so the toast can also surface "accepted — go!".
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-invites", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const fresh = new Date(Date.now() - 30 * 60 * 1000); // invites go stale after 30min
  const rows = await db
    .select({
      id: schema.quranMatches.id,
      creatorId: schema.quranMatches.creatorId,
      difficulty: schema.quranMatches.difficulty,
      rounds: schema.quranMatches.rounds,
    })
    .from(schema.quranMatches)
    .where(
      and(
        eq(schema.quranMatches.opponentId, session.userId),
        eq(schema.quranMatches.status, "pending"),
        gt(schema.quranMatches.createdAt, fresh),
      ),
    )
    .limit(10);

  if (rows.length === 0) return NextResponse.json({ invites: [] });

  const creators = await db
    .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(inArray(schema.users.id, rows.map((r) => r.creatorId)));
  const nameOf = new Map(creators.map((u) => [u.id, u.firstName || u.displayName || "A friend"]));

  return NextResponse.json({
    invites: rows.map((r) => ({
      id: r.id,
      from: nameOf.get(r.creatorId) ?? "A friend",
      difficulty: r.difficulty,
      rounds: r.rounds,
    })),
  });
}

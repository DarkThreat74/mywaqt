import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { rankFor, nextRank, TIMED_LIMIT_MS } from "@/lib/quran-rank";

export const dynamic = "force-dynamic";

// GET /api/profile — my own profile card: identity + Elite ranked standing.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("profile", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const [u] = await db
    .select({
      firstName: schema.users.firstName,
      displayName: schema.users.displayName,
      prayerCode: schema.users.prayerCode,
      avatarUrl: schema.users.avatarUrl,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  if (!u) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [s] = await db
    .select({ isHifidh: schema.prayerSettings.isHifidh, gender: schema.prayerSettings.gender })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, session.userId))
    .limit(1);

  const [r] = await db
    .select()
    .from(schema.quranRatings)
    .where(eq(schema.quranRatings.userId, session.userId))
    .limit(1);

  const rating = r?.rating ?? 0;
  const rank = rankFor(rating);
  const next = nextRank(rating);

  return NextResponse.json({
    name: u.firstName || u.displayName || "Friend",
    displayName: u.displayName,
    prayerCode: u.prayerCode,
    avatarUrl: u.avatarUrl,
    joinedAt: u.createdAt.toISOString(),
    isHifidh: s?.isHifidh ?? false,
    gender: s?.gender ?? null,
    quran: {
      rating,
      played: r?.played ?? 0,
      correct: r?.correct ?? 0,
      bestStreak: r?.bestStreak ?? 0,
      rank: { id: rank.id, en: rank.en, ar: rank.ar, min: rank.min, timed: rank.timed },
      nextRank: next ? { en: next.en, ar: next.ar, min: next.min } : null,
      timedLimitMs: rank.timed ? TIMED_LIMIT_MS : null,
    },
  });
}

// POST /api/profile — set the profile photo. Accepts a small data: URL
// (client downscales to 128px webp) — kept in the users row, no object
// storage. Send { avatar: null } to remove.
const AVATAR_RE = /^data:image\/(webp|jpeg|png);base64,/;
const AVATAR_MAX_CHARS = 90_000; // ~65KB decoded — generous for 128px webp

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("profile-avatar", getClientIp(request.headers), 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { avatar?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const avatar = body.avatar;
  if (avatar !== null && avatar !== undefined) {
    if (typeof avatar !== "string" || avatar.length > AVATAR_MAX_CHARS || !AVATAR_RE.test(avatar)) {
      return NextResponse.json({ error: "Avatar must be a webp/jpeg/png data URL under ~65KB." }, { status: 400 });
    }
  }

  await db
    .update(schema.users)
    .set({ avatarUrl: (avatar as string | undefined) ?? null })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ ok: true, avatarUrl: avatar ?? null });
}

import { eq, and, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { sendPrayerPush } from "@/lib/notifications/push";

/** Pending challenges live for 5 minutes, then expire server-side. */
export const INVITE_TTL_MS = 5 * 60 * 1000;

/** An active match with no round activity for 10 min is abandoned — both
 * players walked away, nobody gets penalized. */
export const MATCH_ABANDON_MS = 10 * 60 * 1000;

/**
 * Lazily close stale active matches. Called before reading the active-match
 * set (inbox) and before create/respond so zombies can't pin the return pill
 * or block rematches. Idempotent; no rating changes.
 */
// Runs inside per-user inbox polls — throttle the sweep so 100k users
// polling every 12s don't each fire a table UPDATE. Per-instance, best
// effort (ponytail: stragglers can lag up to ~30s extra before closing).
let lastSweep = 0;
export async function expireStaleMatches() {
  if (Date.now() - lastSweep < 30_000) return;
  lastSweep = Date.now();
  await db.execute(sql`
    UPDATE quran_matches m
    SET status = 'done', end_reason = 'abandoned', ended_at = now()
    WHERE m.status = 'active'
      AND COALESCE(
        (SELECT MAX(GREATEST(r.resolved_at, r.started_at, r.creator_ready_at, r.opponent_ready_at))
         FROM quran_match_rounds r WHERE r.match_id = m.id),
        m.started_at, m.created_at
      ) < now() - interval '10 minutes'
  `);
}

/** Record one rating change on the shared ladder for match history. */
export async function recordRatingEvent(e: {
  userId: string;
  matchId?: string;
  game: string;
  source: "solo" | "match" | "forfeit" | "abort";
  delta: number;
  ratingAfter: number;
  verseIdx?: number;
  mode?: string;
  correct?: boolean;
  ms?: number;
}) {
  await db.insert(schema.quranRatingEvents).values({
    userId: e.userId,
    matchId: e.matchId ?? null,
    game: e.game,
    source: e.source,
    delta: e.delta,
    ratingAfter: e.ratingAfter,
    verseIdx: e.verseIdx ?? null,
    mode: e.mode ?? null,
    correct: e.correct ?? null,
    ms: e.ms ?? null,
  });
}

/** Verify the pair are accepted friends (either direction). */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.prayerFriends.id })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.status, "accepted"),
        or(
          and(eq(schema.prayerFriends.userId, a), eq(schema.prayerFriends.friendId, b)),
          and(eq(schema.prayerFriends.userId, b), eq(schema.prayerFriends.friendId, a)),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

/** Best-effort push to every subscription a user has — never throws. */
export async function notifyUser(userId: string, title: string, body: string, url: string) {
  try {
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId));
    for (const sub of subs) {
      await sendPrayerPush(sub, JSON.stringify({ title, body, url }));
    }
  } catch { /* push is best-effort */ }
}

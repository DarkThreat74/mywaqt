import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, desc, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

/**
 * GET /api/quran/history — chess.com-style log for the shared ladder:
 * finished 1v1 matches with full round replay data, plus solo ranked answers
 * and a per-day rollup (day boundaries in the user's own timezone).
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("quran-history", getClientIp(request.headers), 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const [matches, soloEvents, tzRows] = await Promise.all([
      db
        .select()
        .from(schema.quranMatches)
        .where(
          and(
            or(eq(schema.quranMatches.creatorId, session.userId), eq(schema.quranMatches.opponentId, session.userId)),
            eq(schema.quranMatches.status, "done"),
          ),
        )
        .orderBy(desc(schema.quranMatches.endedAt))
        .limit(30),

      db
        .select()
        .from(schema.quranRatingEvents)
        .where(and(eq(schema.quranRatingEvents.userId, session.userId), isNull(schema.quranRatingEvents.matchId)))
        .orderBy(desc(schema.quranRatingEvents.createdAt))
        .limit(300),

      db
        .select({ timezone: schema.prayerSettings.timezone })
        .from(schema.prayerSettings)
        .where(eq(schema.prayerSettings.userId, session.userId))
        .limit(1),
    ]);

    const matchIds = matches.map((m) => m.id);
    const [rounds, myEvents, oppUsers] = matchIds.length
      ? await Promise.all([
          db.select().from(schema.quranMatchRounds).where(inArray(schema.quranMatchRounds.matchId, matchIds)),
          db
            .select()
            .from(schema.quranRatingEvents)
            .where(and(eq(schema.quranRatingEvents.userId, session.userId), inArray(schema.quranRatingEvents.matchId, matchIds))),
          db
            .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl })
            .from(schema.users)
            .where(inArray(schema.users.id, [...new Set(matches.map((m) => (m.creatorId === session.userId ? m.opponentId : m.creatorId)))])),
        ])
      : [[], [], []];

    const eventByMatch = new Map(myEvents.map((e) => [e.matchId, e]));
    const oppById = new Map(oppUsers.map((u) => [u.id, u]));

    // Daily rollup for solo answers — bucketed in the user's own timezone.
    let tz = tzRows[0]?.timezone ?? "UTC";
    try {
      new Date().toLocaleDateString("en-CA", { timeZone: tz });
    } catch {
      tz = "UTC"; // corrupt/unknown tz stored — don't 500 the whole route
    }
    const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
    const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
    const days = new Map<string, { day: string; delta: number; played: number; correct: number }>();
    for (const e of soloEvents) {
      const k = dayKey(e.createdAt);
      const d = days.get(k) ?? { day: dayLabel(e.createdAt), delta: 0, played: 0, correct: 0 };
      d.delta += e.delta;
      d.played += 1;
      d.correct += e.correct ? 1 : 0;
      days.set(k, d);
    }

    return NextResponse.json({
      matches: matches.map((m) => {
        const meIsCreator = m.creatorId === session.userId;
        const oppId = meIsCreator ? m.opponentId : m.creatorId;
        const opp = oppById.get(oppId);
        const ev = eventByMatch.get(m.id);
        return {
          id: m.id,
          game: m.game,
          difficulty: m.difficulty,
          totalRounds: m.rounds,
          endReason: m.endReason ?? "completed",
          iSurrendered: m.forfeitedBy === session.userId,
          winnerId: m.winnerId,
          youWin: m.winnerId === null ? null : m.winnerId === session.userId,
          endedAt: (m.endedAt ?? m.createdAt).toISOString(),
          opponent: {
            id: oppId,
            name: opp?.firstName || opp?.displayName || "Opponent",
            avatarUrl: opp?.avatarUrl ?? null,
          },
          myDelta: ev?.delta ?? null,
          myRatingAfter: ev?.ratingAfter ?? null,
          rounds: rounds
            .filter((r) => r.matchId === m.id)
            .sort((a, b) => a.round - b.round)
            .map((r) => ({
              n: r.round,
              verseIdx: r.verseIdx,
              winnerId: r.winnerId,
              meCorrect: meIsCreator ? r.creatorCorrect : r.opponentCorrect,
              meMs: meIsCreator ? r.creatorMs : r.opponentMs,
              oppCorrect: meIsCreator ? r.opponentCorrect : r.creatorCorrect,
              oppMs: meIsCreator ? r.opponentMs : r.creatorMs,
            })),
        };
      }),
      solo: {
        days: [...days.values()],
        events: soloEvents.slice(0, 60).map((e) => ({
          id: e.id,
          game: e.game,
          verseIdx: e.verseIdx,
          mode: e.mode,
          correct: e.correct,
          ms: e.ms,
          delta: e.delta,
          ratingAfter: e.ratingAfter,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    });
  } catch (e) {
    logError(e, { route: "quran/history" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

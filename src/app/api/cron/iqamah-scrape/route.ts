import { NextRequest, NextResponse } from "next/server";
import { eq, isNotNull, or, and, lt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { verifyCronAuth } from "@/lib/cronAuth";
import { scrapeIqamah } from "@/lib/masjid/iqamah";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/cron/iqamah-scrape — nightly sweep: scrape every registered
// masjid's published schedule (fetch_url, falling back to its homepage) and
// cache tonight's iqamah so tomorrow's reads are instant — the fajrlabs
// "refresh every night from the masjid's own published schedule" model.
//
// Sources are scraped with a bounded worker pool; each write updates
// iqamah_cache + iqamah_checked_at (null cache = "checked, nothing published"
// — suppresses lazy refetches for 12h). Idempotent; safe to re-run.
const CONCURRENCY = 20; // 819 sources ≈ 205s worst case at 5s timeout — fits maxDuration 300
const STALE_MS = 20 * 60 * 60 * 1000; // only scrape rows not checked in 20h
const BATCH = 1000;

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get("authorization"), request.headers.get("x-vercel-cron") === "1")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - STALE_MS);
    const rows = await db
      .select({
        externalId: schema.masjidSources.externalId,
        fetchUrl: schema.masjidSources.fetchUrl,
        website: schema.masjidSources.website,
        timezone: schema.masjidSources.timezone,
      })
      .from(schema.masjidSources)
      .where(
        and(
          or(isNotNull(schema.masjidSources.fetchUrl), isNotNull(schema.masjidSources.website)),
          or(isNull(schema.masjidSources.iqamahCheckedAt), lt(schema.masjidSources.iqamahCheckedAt, cutoff)),
        ),
      )
      // Stalest first — if the registry ever exceeds BATCH, starvation is
      // impossible: least-recently-checked always goes before fresh rows.
      .orderBy(sql`${schema.masjidSources.iqamahCheckedAt} ASC NULLS FIRST`)
      .limit(BATCH);

    let scraped = 0;
    let found = 0;
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (idx < rows.length) {
        const s = rows[idx++];
        const url = s.fetchUrl ?? s.website;
        if (!url) continue;
        const p = await scrapeIqamah(url, s.timezone);
        scraped++;
        if (p) found++;
        // Only overwrite the cache on a successful parse — a down/broken
        // source must never erase last-known-good iqamah. checked_at still
        // advances so the row isn't retried until tomorrow.
        await db
          .update(schema.masjidSources)
          .set(p ? { iqamahCache: p, iqamahCheckedAt: new Date() } : { iqamahCheckedAt: new Date() })
          .where(eq(schema.masjidSources.externalId, s.externalId))
          .catch(() => {});
      }
    });
    await Promise.all(workers);

    return NextResponse.json({ ok: true, scraped, found, remaining: rows.length >= BATCH });
  } catch (err) {
    logError(err, { route: "cron/iqamah-scrape" });
    return NextResponse.json({ error: "Scrape failed." }, { status: 500 });
  }
}

// Vercel cron hits paths with GET — the sweep is idempotent so both are safe.
export { POST as GET };

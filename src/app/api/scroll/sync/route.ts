import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimitAsync } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

type DayPayload = {
  date: string;
  total: number;
  apps?: Record<string, number>;
  sec?: Record<string, number>;
  hours?: Record<string, number>;
  sessions?: { p: string; t: number; c: number; d: number }[];
  px?: Record<string, number>;
  pxTotal?: number;
  dpi?: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const mapNums = (v: unknown): Record<string, number> | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n)) out[k] = Math.max(0, Math.floor(n));
  }
  return out;
};

/** Push device-local scroll days; upsert one row per (user, date). */
export async function POST(request: NextRequest) {
  try {
    if (!await checkRateLimitAsync("scroll-sync", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null) as { days?: DayPayload[] } | null;
    if (!body || !Array.isArray(body.days) || body.days.length === 0 || body.days.length > 40) {
      return NextResponse.json({ error: "days[] required (1-40)" }, { status: 400 });
    }
    for (const d of body.days) {
      if (!d || !DATE_RE.test(d.date ?? "")) continue;
      const sessions = Array.isArray(d.sessions)
        ? d.sessions.slice(0, 250).map((s) => ({
            p: String(s.p ?? "").slice(0, 80), t: num(s.t), c: num(s.c), d: num(s.d),
          })).filter((s) => s.c > 0)
        : undefined;
      const values = {
        userId: session.userId,
        date: d.date,
        total: num(d.total),
        apps: mapNums(d.apps),
        sec: mapNums(d.sec),
        hours: mapNums(d.hours),
        sessions,
        px: mapNums(d.px),
        pxTotal: typeof d.pxTotal === "number" ? num(d.pxTotal) : null,
        dpi: typeof d.dpi === "number" && d.dpi > 0 && d.dpi < 2000 ? Math.floor(d.dpi) : null,
        updatedAt: new Date(),
      };
      await db.insert(schema.scrollDays).values(values)
        .onConflictDoUpdate({
          target: [schema.scrollDays.userId, schema.scrollDays.date],
          set: {
            total: values.total, apps: values.apps, sec: values.sec,
            hours: values.hours, sessions: values.sessions,
            px: values.px, pxTotal: values.pxTotal, dpi: values.dpi,
            updatedAt: values.updatedAt,
          },
        });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "scroll/sync/POST" });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

/** Last 90 days of stats for the Scrolls page. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.select().from(schema.scrollDays)
      .where(eq(schema.scrollDays.userId, session.userId))
      .orderBy(desc(schema.scrollDays.date)).limit(90);
    return NextResponse.json({ days: rows });
  } catch (err) {
    logError(err, { route: "scroll/sync/GET" });
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

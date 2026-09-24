import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
const MODES = ["push", "silent", "off"] as const;

type PerPrayer = Partial<Record<(typeof PRAYERS)[number], { mode: (typeof MODES)[number]; beforeMin: number }>>;

function sanitizePerPrayer(input: unknown): PerPrayer | null {
  if (input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) return undefined as never;
  const out: PerPrayer = {};
  for (const p of PRAYERS) {
    const v = (input as Record<string, unknown>)[p];
    if (typeof v !== "object" || v === null) continue;
    const mode = (v as Record<string, unknown>).mode;
    const beforeMin = (v as Record<string, unknown>).beforeMin;
    out[p] = {
      mode: MODES.includes(mode as never) ? (mode as (typeof MODES)[number]) : "push",
      beforeMin:
        typeof beforeMin === "number" && Number.isInteger(beforeMin) && beforeMin >= 0 && beforeMin <= 60
          ? beforeMin
          : 0,
    };
  }
  return out;
}

// GET /api/notifications/prefs — notification preferences incl. per-prayer
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [prefs] = await db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, session.userId))
    .limit(1);

  return NextResponse.json(
    prefs ?? { prayerEarlyMid: "push", prayerFinal: "push", otherReminders: "push", perPrayer: null },
  );
}

// PATCH /api/notifications/prefs — update global toggles and/or per-prayer config
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("notif-prefs", ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (!checkRateLimit("notif-prefs-read", getClientIp(request.headers), 60, 60000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { prayerEarlyMid?: string; prayerFinal?: string; otherReminders?: string; perPrayer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validGlobal = ["push", "push_sms", "sms", "none"];
  const updates: Record<string, unknown> = {};
  if (body.prayerEarlyMid && validGlobal.includes(body.prayerEarlyMid)) updates.prayerEarlyMid = body.prayerEarlyMid;
  if (body.prayerFinal && validGlobal.includes(body.prayerFinal)) updates.prayerFinal = body.prayerFinal;
  if (body.otherReminders && ["push", "none"].includes(body.otherReminders)) updates.otherReminders = body.otherReminders;
  if (body.perPrayer !== undefined) {
    const clean = sanitizePerPrayer(body.perPrayer);
    if (clean === undefined) {
      return NextResponse.json({ error: "Invalid perPrayer payload." }, { status: 400 });
    }
    updates.perPrayer = clean;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(schema.notificationPrefs)
      .values({ userId: session.userId, ...updates } as typeof schema.notificationPrefs.$inferInsert)
      .onConflictDoUpdate({ target: schema.notificationPrefs.userId, set: updates })
      .returning();
    return NextResponse.json(row);
  } catch (err) {
    logError(err, { route: "notifications/prefs PATCH" });
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}

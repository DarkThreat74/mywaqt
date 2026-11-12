import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const THEMES = new Set(["light", "dark", "system"]);

// GET /api/settings/prefs — roaming UI preferences (theme, knowledge cards)
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db
    .select({ uiPrefs: schema.users.uiPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  return NextResponse.json({ prefs: row?.uiPrefs ?? {} });
}

// PUT+PATCH /api/settings/prefs — merge patch into ui_prefs. Unknown keys dropped.
async function updatePrefs(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("settings-prefs", ip, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof b.theme === "string" && THEMES.has(b.theme)) patch.theme = b.theme;
  if (typeof b.funfactDisabled === "boolean") patch.funfactDisabled = b.funfactDisabled;
  if (Array.isArray(b.appLayout) && b.appLayout.length <= 100) {
    patch.appLayout = b.appLayout;
  }
  // Fitness profile — canonical metric values; display units stored too.
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : undefined);
  const bw = num(b.bodyWeightKg, 20, 500); if (bw !== undefined) patch.bodyWeightKg = bw;
  const ht = num(b.heightCm, 80, 280); if (ht !== undefined) patch.heightCm = ht;
  const bf = num(b.bodyfatPct, 2, 70); if (bf !== undefined) patch.bodyfatPct = bf;
  if (b.bodyfatPct === null) patch.bodyfatPct = null;
  if (typeof b.weightUpdatedAt === "string" && !Number.isNaN(Date.parse(b.weightUpdatedAt))) patch.weightUpdatedAt = b.weightUpdatedAt;
  if (b.unitWeight === "kg" || b.unitWeight === "lb") patch.unitWeight = b.unitWeight;
  if (b.unitHeight === "cm" || b.unitHeight === "ft") patch.unitHeight = b.unitHeight;
  if (b.sex === "m" || b.sex === "f") patch.sex = b.sex;
  const qp = b.quranPosition;
  if (qp && typeof qp === "object") {
    const q = qp as { surah?: unknown; ayah?: unknown };
    if (typeof q.surah === "number" && typeof q.ayah === "number" && q.surah >= 1 && q.surah <= 114 && q.ayah >= 1 && q.ayah <= 286) {
      patch.quranPosition = { surah: q.surah, ayah: q.ayah, updatedAt: new Date().toISOString() };
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const [row] = await db
    .select({ uiPrefs: schema.users.uiPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  const prefs = { ...(row?.uiPrefs ?? {}), ...patch };
  await db.update(schema.users).set({ uiPrefs: prefs }).where(eq(schema.users.id, session.userId));
  // Keep a dated measurement history for time-correct strength/BMI analysis;
  // the roaming preference remains the current display value.
  if (bw !== undefined) {
    await db.insert(schema.bodyMetrics).values({
      userId: session.userId,
      weightKg: String(bw),
      bodyfatPct: bf !== undefined ? String(bf) : null,
    });
  }

  return NextResponse.json({ ok: true, prefs });
}

export const PUT = updatePrefs;
export const PATCH = updatePrefs;

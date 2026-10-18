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

// PUT /api/settings/prefs — merge patch into ui_prefs. Unknown keys dropped.
export async function PUT(request: NextRequest) {
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

  const b = body as { theme?: unknown; funfactDisabled?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof b.theme === "string" && THEMES.has(b.theme)) patch.theme = b.theme;
  if (typeof b.funfactDisabled === "boolean") patch.funfactDisabled = b.funfactDisabled;
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

  return NextResponse.json({ ok: true, prefs });
}

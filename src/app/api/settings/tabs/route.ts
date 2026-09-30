import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { HIDEABLE_SET } from "@/lib/nav-tabs";

export const dynamic = "force-dynamic";

// GET /api/settings/tabs — which nav/tool tabs the user hid
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db
    .select({ hiddenTabs: schema.users.hiddenTabs })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  // null = never touched → default is "secondary tabs hidden" (main 4 only).
  // Once the user toggles anything, the column holds the explicit set.
  const hiddenTabs = row?.hiddenTabs == null
    ? [...HIDEABLE_SET]
    : row.hiddenTabs.filter((k) => HIDEABLE_SET.has(k));
  return NextResponse.json({ hiddenTabs });
}

// PUT /api/settings/tabs — replace the hidden set. Only registry keys accepted.
export async function PUT(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("settings-tabs", ip, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = (body as { hiddenTabs?: unknown }).hiddenTabs;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "hiddenTabs must be an array." }, { status: 400 });
  }
  const hiddenTabs = raw.filter((k): k is string => typeof k === "string" && HIDEABLE_SET.has(k));

  await db
    .update(schema.users)
    .set({ hiddenTabs })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ ok: true, hiddenTabs });
}

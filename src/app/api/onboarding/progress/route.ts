import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const STEPS = new Set([
  "terms", "name", "avatar", "gender", "hayd", "theme", "location",
  "madhab", "hifidh", "notifications", "install", "tour", "guide", "done",
]);

/** POST — persist the wizard position so onboarding resumes after logout. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("onboarding-progress", ip, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { step } = body as { step?: string };
  if (typeof step !== "string" || !STEPS.has(step)) {
    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  }

  await db.update(schema.users).set({ onboardingStep: step }).where(eq(schema.users.id, session.userId));
  try { revalidateTag(`user-gate-${session.userId}`, "max"); } catch { /* non-critical */ }
  return NextResponse.json({ ok: true });
}

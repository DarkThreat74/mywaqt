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
  const { step, firstName, lastName, middleInitial } = body as {
    step?: string; firstName?: string; lastName?: string; middleInitial?: string;
  };
  if (typeof step !== "string" || !STEPS.has(step)) {
    return NextResponse.json({ error: "Invalid step." }, { status: 400 });
  }

  // Progress doubles as the server-side draft: any name fields typed so far
  // are saved with the step, so leaving mid-onboarding never loses answers.
  const fn = typeof firstName === "string" ? firstName.trim().slice(0, 50) : "";
  const ln = typeof lastName === "string" ? lastName.trim().slice(0, 50) : "";
  const mi = typeof middleInitial === "string" ? middleInitial.trim().slice(0, 1) : "";
  const set: Record<string, unknown> = { onboardingStep: step };
  if (fn) set.firstName = fn;
  if (ln) set.lastName = ln;
  if (mi) set.middleInitial = mi;
  if (fn || ln) set.displayName = [fn, ln].filter(Boolean).join(" ");

  await db.update(schema.users).set(set).where(eq(schema.users.id, session.userId));
  try { revalidateTag(`user-gate-${session.userId}`, "max"); } catch { /* non-critical */ }
  return NextResponse.json({ ok: true });
}

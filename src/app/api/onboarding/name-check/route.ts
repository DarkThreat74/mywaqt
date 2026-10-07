import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Name-collision check during onboarding — authenticated only, so it can't be
 * used by strangers to probe which names hold accounts. Returns which level
 * of the name is already taken:
 *   firstTaken:  another account shares this first name
 *   fullTaken:   another account shares first + last (+middle if given)
 * The client escalates: first only → ask last → ask middle initial → digits.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("onboarding-name-check", ip, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { first, last, middle } = body as { first?: string; last?: string; middle?: string };

  const f = typeof first === "string" ? first.trim() : "";
  const l = typeof last === "string" ? last.trim() : "";
  const m = typeof middle === "string" ? middle.trim().slice(0, 1) : "";
  if (!f) return NextResponse.json({ firstTaken: false, fullTaken: false, suggested: null });

  const ci = (col: typeof schema.users.firstName | typeof schema.users.lastName | typeof schema.users.middleInitial) =>
    sql`lower(${col})`;

  const [firstRows, fullRows] = await Promise.all([
    db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(ci(schema.users.firstName), f.toLowerCase()), sql`${schema.users.id} <> ${session.userId}`))
      .limit(1),
    l
      ? db.select({ id: schema.users.id }).from(schema.users)
          .where(and(
            eq(ci(schema.users.firstName), f.toLowerCase()),
            eq(ci(schema.users.lastName), l.toLowerCase()),
            ...(m ? [eq(ci(schema.users.middleInitial), m.toLowerCase())] : []),
            sql`${schema.users.id} <> ${session.userId}`,
          ))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const firstTaken = firstRows.length > 0;
  const fullTaken = fullRows.length > 0;
  // On a full collision, offer a two-digit suffix the user can keep or change.
  const suggested = fullTaken ? String(Math.floor(Math.random() * 90) + 10) : null;

  return NextResponse.json({ firstTaken, fullTaken, suggested });
}

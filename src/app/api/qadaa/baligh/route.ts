import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// POST /api/qadaa/baligh — record when the user became baligh for the lifetime
// view. Body: { balighDate?: "YYYY-MM-DD", balighAge?: number }.
// balighAge requires a "me" birthday with a known birth year to compute the
// exact date; otherwise pass balighDate directly.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("qadaa-baligh", getClientIp(request.headers), 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { balighDate?: unknown; balighAge?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let balighDate: string | null = null;
  let balighAge: number | null = null;

  if (typeof body.balighDate === "string" && validDate(body.balighDate)) {
    if (body.balighDate > today || body.balighDate < "1900-01-01") {
      return NextResponse.json({ error: "Invalid baligh date." }, { status: 400 });
    }
    balighDate = body.balighDate;
  }

  if (body.balighAge !== undefined && body.balighAge !== null) {
    const age = Number(body.balighAge);
    if (!Number.isInteger(age) || age < 5 || age > 40) {
      return NextResponse.json({ error: "Baligh age must be 5–40." }, { status: 400 });
    }
    balighAge = age;
    if (!balighDate) {
      // Derive the date from the "me" birthday: birthdate + balighAge years.
      const [b] = await db
        .select({
          birthYear: schema.birthdays.birthYear,
          birthMonth: schema.birthdays.birthMonth,
          birthDay: schema.birthdays.birthDay,
        })
        .from(schema.birthdays)
        .where(and(eq(schema.birthdays.userId, session.userId), eq(schema.birthdays.isSelf, true)))
        .limit(1);
      if (!b || b.birthYear == null) {
        return NextResponse.json(
          { error: "Add your birthday under Birthdays and mark it 'This is me', or pick the baligh date directly." },
          { status: 400 },
        );
      }
      const year = b.birthYear + age;
      // Clamp day for short months / Feb 29.
      const dim = new Date(Date.UTC(year, b.birthMonth, 0)).getUTCDate();
      const day = Math.min(b.birthDay, dim);
      balighDate = `${year}-${String(b.birthMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (balighDate > today) {
        return NextResponse.json({ error: "That baligh date is in the future — check the age or birthday." }, { status: 400 });
      }
    }
  }

  if (!balighDate) {
    return NextResponse.json({ error: "Provide balighDate or balighAge." }, { status: 400 });
  }

  try {
    const [ledger] = await db
      .select()
      .from(schema.qadaaLedger)
      .where(eq(schema.qadaaLedger.userId, session.userId))
      .limit(1);

    // Snapshot the setup-time owed counts once — the lifetime backfill is
    // built from this, not the live (adjustable) columns.
    const initialOwed = ledger?.initialOwed ?? (ledger ? {
      fajr: ledger.fajrOwed, dhuhr: ledger.dhuhrOwed, asr: ledger.asrOwed,
      maghrib: ledger.maghribOwed, isha: ledger.ishaOwed,
    } : null);

    const values = {
      balighDate,
      balighAge,
      ...(initialOwed ? { initialOwed } : {}),
      updatedAt: new Date(),
    };
    if (ledger) {
      await db.update(schema.qadaaLedger).set(values).where(eq(schema.qadaaLedger.userId, session.userId));
    } else {
      await db.insert(schema.qadaaLedger).values({ userId: session.userId, ...values });
    }
    return NextResponse.json({ ok: true, balighDate, balighAge });
  } catch (e) {
    logError(e, { route: "qadaa/baligh POST" });
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

// GET /api/qadaa/baligh — birthdays with a known birth year, so the setup
// flow can ask "is this you?" before asking for an exact baligh date.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: schema.birthdays.id,
      name: schema.birthdays.name,
      birthMonth: schema.birthdays.birthMonth,
      birthDay: schema.birthdays.birthDay,
      birthYear: schema.birthdays.birthYear,
      isSelf: schema.birthdays.isSelf,
    })
    .from(schema.birthdays)
    .where(and(eq(schema.birthdays.userId, session.userId)))
    .limit(500);
  return NextResponse.json({ birthdays: rows.filter((r) => r.birthYear != null) });
}

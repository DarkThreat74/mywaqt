import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { setSessionCookie } from "@/lib/auth/session";
import { isValidEmail, isHoneypotTripped, isTimeTrapTripped } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("admin-login", ip, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { email, password, website, company, renderedAt } = body as {
      email?: string; password?: string;
      website?: string; company?: string; renderedAt?: number;
    };

    // ── Honeypot check — if filled, reject as bot ──
    if (isHoneypotTripped({ website, company })) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // ── Time-trap — bots submit in <2s, humans can't type that fast ──
    // Note: renderedAt = -1 means the client hasn't mounted yet.
    // Treat -1 as valid to avoid false positives on fast connections.
    if (renderedAt !== undefined && renderedAt !== -1 && isTimeTrapTripped(renderedAt, 2)) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !isValidEmail(normalizedEmail) || !password) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    // Dummy compare on unknown email — equalizes timing so the 401 can't
    // reveal whether the email exists.
    const hashToCheck = user?.passwordHash ?? "$2b$10$uT60q.5Lut0JznWahyk/b.OebDf.1G2b697Gce6MV0DHdEISsp4VW";
    if (!user || !(await bcrypt.compare(password, hashToCheck))) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 },
      );
    }

    await setSessionCookie({ id: user.id, email: user.email });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "admin/auth" });
    return NextResponse.json(
      { error: "Could not sign in. Please try again." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-dhikr-read", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    const sequences = await db.select().from(schema.dhikrSequences).orderBy(schema.dhikrSequences.sequenceOrder);
    return NextResponse.json(sequences);
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/dhikr", method: "GET" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

// POST — create a dhikr sequence (rate limited: 20 creates per hour per IP)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("admin-dhikr-create", ip, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }
    const body = await request.json();
    const { phraseArabic, phraseTransliteration, targetCount, sequenceOrder, sourceCitation } = body as {
      phraseArabic?: string; phraseTransliteration?: string; targetCount?: number;
      sequenceOrder?: number; sourceCitation?: string;
    };
    if (!phraseArabic?.trim() || !phraseTransliteration?.trim() || !sourceCitation?.trim()) {
      return NextResponse.json({ error: "Arabic phrase, transliteration, and source citation are required." }, { status: 400 });
    }
    if (!targetCount || targetCount < 1) {
      return NextResponse.json({ error: "Target count must be at least 1." }, { status: 400 });
    }
    const [seq] = await db.insert(schema.dhikrSequences).values({
      phraseArabic: phraseArabic.trim(),
      phraseTransliteration: phraseTransliteration.trim(),
      targetCount,
      sequenceOrder: sequenceOrder ?? 0,
      sourceCitation: sourceCitation.trim(),
    }).returning();
    return NextResponse.json(seq);
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    logError(e, { route: "admin/dhikr", method: "POST" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

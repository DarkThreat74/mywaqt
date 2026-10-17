import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";
import { friendScore } from "@/lib/friends-score";

export const dynamic = "force-dynamic";

const MET_TAGS = new Set(["school", "childhood", "work", "online", "family", "masjid", "neighbor", "mutual", "sports", "travel", "other"]);
const TALK_FREQS = new Set(["daily", "weekly", "monthly", "rarely"]);
const KNOWN_YEARS = new Set(["lt1", "y1_3", "y3_7", "y7p"]);
const TRUST = new Set(["definitely", "topfew", "probably", "depends", "unsure"]);
const OPENNESS = new Set(["always", "mostly", "rarely", "everything", "most", "light", "notmuch"]);
const MISS = new Set(["gutted", "alot", "alittle"]);
const TELL = new Set(["first", "eventually", "rarely"]);
const PHASE = new Set(["steady", "wascloser", "distant"]);
const VIBE = new Set(["person", "goodtime", "easygoing", "new"]);
const SACRIFICE = new Set(["noask", "asked", "cost", "excuse"]);
const LOYALTY = new Set(["absolutely", "probably", "unsure", "no"]);
const GAP = new Set(["notime", "backup", "awkward", "strangers"]);
const PLANS = new Set(["both", "easy", "them", "me"]);
const HANGOUT = new Set(["doing", "mix", "talking", "texting"]);
const SHORTLIST = new Set(["definitely", "probably", "unsure", "no"]);
const VOLITION = new Set(["choose", "mix", "context"]);
const ATTUNE = new Set(["notice", "eventually", "told", "wouldnt"]);
const PHOTO_MIMES = new Set(["image/jpeg", "image/webp", "image/png"]);
const MAX_PHOTO_B64 = 1_200_000;

interface FriendBody {
  id?: string;
  name?: string;
  metTag?: string | null;
  metDetail?: string | null;
  talkFreq?: string | null;
  knownYears?: string | null;
  trust?: string | null;
  openness?: string | null;
  miss?: string | null;
  tell?: string | null;
  phase?: string | null;
  vibe?: string | null;
  sacrifice?: string | null;
  loyalty?: string | null;
  gap?: string | null;
  plans?: string | null;
  hangout?: string | null;
  shortlist?: string | null;
  volition?: string | null;
  attune?: string | null;
  groupLabel?: string | null;
  phone?: string | null;
  notes?: string | null;
  photo?: string | null;
  photoMime?: string | null;
  clientId?: string;
}

function validateFields(body: FriendBody, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) errors.push("Name must be 1–80 characters");
    else out.name = name;
  }
  if (body.metTag !== undefined) {
    const t = typeof body.metTag === "string" ? body.metTag.trim().toLowerCase() : null;
    if (t && !MET_TAGS.has(t)) errors.push("Invalid met tag");
    else out.metTag = t;
  }
  if (body.metDetail !== undefined) {
    const d = typeof body.metDetail === "string" ? body.metDetail.trim() || null : null;
    if (d && d.length > 80) errors.push("Detail too long");
    else out.metDetail = d;
  }
  if (body.talkFreq !== undefined) {
    const f = typeof body.talkFreq === "string" ? body.talkFreq.trim().toLowerCase() : null;
    if (f && !TALK_FREQS.has(f)) errors.push("Invalid talk frequency");
    else out.talkFreq = f;
  }
  if (body.knownYears !== undefined) {
    const v = typeof body.knownYears === "string" ? body.knownYears.trim().toLowerCase() : null;
    if (v && !KNOWN_YEARS.has(v)) errors.push("Invalid known duration");
    else out.knownYears = v;
  }
  if (body.trust !== undefined) {
    const v = typeof body.trust === "string" ? body.trust.trim().toLowerCase() : null;
    if (v && !TRUST.has(v)) errors.push("Invalid trust answer");
    else out.trust = v;
  }
  if (body.openness !== undefined) {
    const v = typeof body.openness === "string" ? body.openness.trim().toLowerCase() : null;
    if (v && !OPENNESS.has(v)) errors.push("Invalid openness answer");
    else out.openness = v;
  }
  if (body.miss !== undefined) {
    const v = typeof body.miss === "string" ? body.miss.trim().toLowerCase() : null;
    if (v && !MISS.has(v)) errors.push("Invalid miss answer");
    else out.miss = v;
  }
  if (body.tell !== undefined) {
    const v = typeof body.tell === "string" ? body.tell.trim().toLowerCase() : null;
    if (v && !TELL.has(v)) errors.push("Invalid tell answer");
    else out.tell = v;
  }
  if (body.phase !== undefined) {
    const v = typeof body.phase === "string" ? body.phase.trim().toLowerCase() : null;
    if (v && !PHASE.has(v)) errors.push("Invalid phase answer");
    else out.phase = v;
  }
  if (body.vibe !== undefined) {
    const v = typeof body.vibe === "string" ? body.vibe.trim().toLowerCase() : null;
    if (v && !VIBE.has(v)) errors.push("Invalid vibe answer");
    else out.vibe = v;
  }
  for (const [key, allowed] of [
    ["sacrifice", SACRIFICE],
    ["loyalty", LOYALTY],
    ["gap", GAP],
    ["plans", PLANS],
    ["hangout", HANGOUT],
    ["shortlist", SHORTLIST],
    ["volition", VOLITION],
    ["attune", ATTUNE],
  ] as const) {
    const raw = body[key];
    if (raw !== undefined) {
      const v = typeof raw === "string" ? raw.trim().toLowerCase() : null;
      if (v && !allowed.has(v)) errors.push(`Invalid ${key} answer`);
      else out[key] = v;
    }
  }
  if (body.groupLabel !== undefined) {
    const g = typeof body.groupLabel === "string" ? body.groupLabel.trim() || null : null;
    if (g && g.length > 60) errors.push("Group name too long");
    else out.groupLabel = g;
  }
  if (body.phone !== undefined) {
    const p = typeof body.phone === "string" ? body.phone.trim() || null : null;
    if (p && (p.length > 40 || !/^[\d+\-()\s.]+$/.test(p))) errors.push("Invalid phone number");
    else out.phone = p;
  }
  if (body.notes !== undefined) {
    const n = typeof body.notes === "string" ? body.notes.trim() || null : null;
    if (n && n.length > 2000) errors.push("Notes too long");
    else out.notes = n;
  }
  if (body.photo !== undefined) {
    if (body.photo === null) {
      out.photoData = null;
      out.photoMime = null;
    } else if (typeof body.photo === "string") {
      const mime = typeof body.photoMime === "string" ? body.photoMime : "";
      if (!PHOTO_MIMES.has(mime)) {
        errors.push("Photo must be jpeg/webp/png");
      } else if (body.photo.length > MAX_PHOTO_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) {
        errors.push("Photo too large or invalid");
      } else {
        out.photoData = body.photo;
        out.photoMime = mime;
      }
    }
  }

  return { out, errors };
}

// GET /api/friends — list the user's friends (photo bytes excluded)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("friends-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const rows = await db
      .select({
        id: schema.friends.id,
        name: schema.friends.name,
        metTag: schema.friends.metTag,
        metDetail: schema.friends.metDetail,
        talkFreq: schema.friends.talkFreq,
        knownYears: schema.friends.knownYears,
        trust: schema.friends.trust,
        openness: schema.friends.openness,
        score: schema.friends.score,
        miss: schema.friends.miss,
        tell: schema.friends.tell,
        phase: schema.friends.phase,
        vibe: schema.friends.vibe,
        sacrifice: schema.friends.sacrifice,
        loyalty: schema.friends.loyalty,
        gap: schema.friends.gap,
        plans: schema.friends.plans,
        hangout: schema.friends.hangout,
        shortlist: schema.friends.shortlist,
        volition: schema.friends.volition,
        attune: schema.friends.attune,
        groupLabel: schema.friends.groupLabel,
        phone: schema.friends.phone,
        notes: schema.friends.notes,
        hasPhoto: sql<boolean>`${schema.friends.photoData} IS NOT NULL`,
        createdAt: schema.friends.createdAt,
        updatedAt: schema.friends.updatedAt,
      })
      .from(schema.friends)
      .where(eq(schema.friends.userId, session.userId))
      .orderBy(schema.friends.name)
      .limit(500);

    return NextResponse.json({ friends: rows });
  } catch (err) {
    logError(err, { route: "friends/GET" });
    return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
  }
}

// POST /api/friends — add a friend
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("friends-post", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: FriendBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, false);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const [row] = await db
      .insert(schema.friends)
      .values({
        id: validClientId,
        userId: session.userId,
        name: out.name as string,
        metTag: (out.metTag as string | null) ?? null,
        metDetail: (out.metDetail as string | null) ?? null,
        talkFreq: (out.talkFreq as string | null) ?? null,
        knownYears: (out.knownYears as string | null) ?? null,
        trust: (out.trust as string | null) ?? null,
        openness: (out.openness as string | null) ?? null,
        score: friendScore(out as Parameters<typeof friendScore>[0]),
        miss: (out.miss as string | null) ?? null,
        tell: (out.tell as string | null) ?? null,
        phase: (out.phase as string | null) ?? null,
        vibe: (out.vibe as string | null) ?? null,
        sacrifice: (out.sacrifice as string | null) ?? null,
        loyalty: (out.loyalty as string | null) ?? null,
        gap: (out.gap as string | null) ?? null,
        plans: (out.plans as string | null) ?? null,
        hangout: (out.hangout as string | null) ?? null,
        shortlist: (out.shortlist as string | null) ?? null,
        volition: (out.volition as string | null) ?? null,
        attune: (out.attune as string | null) ?? null,
        groupLabel: (out.groupLabel as string | null) ?? null,
        phone: (out.phone as string | null) ?? null,
        notes: (out.notes as string | null) ?? null,
        photoData: (out.photoData as string | null) ?? null,
        photoMime: (out.photoMime as string | null) ?? null,
      })
      .onConflictDoNothing({ target: schema.friends.id })
      .returning();

    if (!row && validClientId) {
      const [existing] = await db
        .select()
        .from(schema.friends)
        .where(and(eq(schema.friends.id, validClientId), eq(schema.friends.userId, session.userId)))
        .limit(1);
      if (existing) return NextResponse.json({ friend: existing, deduped: true });
      return NextResponse.json({ error: "Failed to save friend" }, { status: 500 });
    }

    return NextResponse.json({ friend: row });
  } catch (err) {
    logError(err, { route: "friends/POST" });
    return NextResponse.json({ error: "Failed to save friend" }, { status: 500 });
  }
}

// PATCH /api/friends — update a friend the user owns
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("friends-patch", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: FriendBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string" || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, true);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const scored = ["metTag", "talkFreq", "knownYears", "trust", "openness", "miss", "tell", "phase", "vibe", "sacrifice", "loyalty", "gap", "plans", "hangout", "shortlist", "volition", "attune"].some((k) => k in out);
    const [row] = await db
      .update(schema.friends)
      .set({ ...out, updatedAt: new Date() })
      .where(and(eq(schema.friends.id, body.id), eq(schema.friends.userId, session.userId)))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (scored) {
      const [rescored] = await db
        .update(schema.friends)
        .set({ score: friendScore(row) })
        .where(eq(schema.friends.id, row.id))
        .returning();
      return NextResponse.json({ friend: rescored });
    }
    return NextResponse.json({ friend: row });
  } catch (err) {
    logError(err, { route: "friends/PATCH" });
    return NextResponse.json({ error: "Failed to update friend" }, { status: 500 });
  }
}

// DELETE /api/friends?id= — remove a friend the user owns
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("friends-delete", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.friends)
      .where(and(eq(schema.friends.id, id), eq(schema.friends.userId, session.userId)))
      .returning({ id: schema.friends.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "friends/DELETE" });
    return NextResponse.json({ error: "Failed to delete friend" }, { status: 500 });
  }
}

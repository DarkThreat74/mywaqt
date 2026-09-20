import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { sendPrayerPush } from "@/lib/notifications/push";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/prayer-friends/invite — create a shareable invite link
// Returns { url } — a single-use link valid for 7 days. The raw token only
// exists in the URL; the DB stores its SHA-256 hash.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-invite-create", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(schema.prayerInvites).values({
      inviterId: session.userId,
      tokenHash,
      expiresAt,
    });

    const url = new URL("/add-friend", request.nextUrl.origin);
    url.searchParams.set("token", token);
    return NextResponse.json({ url: url.toString() });
  } catch (err) {
    logError(err, { route: "prayer-friends/invite POST" });
    return NextResponse.json({ error: "Could not create invite." }, { status: 500 });
  }
}

// PUT /api/prayer-friends/invite — accept an invite link
// Body: { token: string }
//
// Both parties consented: the inviter generated the link, the invitee chose
// to open it — so the friendship is created mutually-accepted immediately.
export async function PUT(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-invite-accept", ip, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { token } = body as { token?: string };
  if (!token || typeof token !== "string" || token.length > 128) {
    return NextResponse.json({ error: "Invalid invite." }, { status: 400 });
  }

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [invite] = await db
      .select()
      .from(schema.prayerInvites)
      .where(
        and(
          eq(schema.prayerInvites.tokenHash, tokenHash),
          isNull(schema.prayerInvites.usedAt),
          gt(schema.prayerInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invite) {
      return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });
    }

    if (invite.inviterId === session.userId) {
      return NextResponse.json({ error: "You can't use your own invite link." }, { status: 400 });
    }

    // Already friends? Mark used and report success — idempotent
    const [existing] = await db
      .select({ id: schema.prayerFriends.id, status: schema.prayerFriends.status })
      .from(schema.prayerFriends)
      .where(
        and(
          eq(schema.prayerFriends.userId, session.userId),
          eq(schema.prayerFriends.friendId, invite.inviterId),
        ),
      )
      .limit(1);
    if (existing?.status === "accepted") {
      await db.update(schema.prayerInvites)
        .set({ usedBy: session.userId, usedAt: new Date() })
        .where(eq(schema.prayerInvites.id, invite.id));
      return NextResponse.json({ ok: true, alreadyFriends: true });
    }

    // Block check — either direction
    const [block] = await db
      .select({ id: schema.prayerBlocks.id })
      .from(schema.prayerBlocks)
      .where(
        or(
          and(eq(schema.prayerBlocks.userId, session.userId), eq(schema.prayerBlocks.blockedUserId, invite.inviterId)),
          and(eq(schema.prayerBlocks.userId, invite.inviterId), eq(schema.prayerBlocks.blockedUserId, session.userId)),
        ),
      )
      .limit(1);
    if (block) {
      return NextResponse.json({ error: "This invite can't be used." }, { status: 403 });
    }

    // Cap accepted friends at 100 for both parties
    const [myCount, theirCount] = await Promise.all([
      db
        .select({ id: schema.prayerFriends.id })
        .from(schema.prayerFriends)
        .where(and(eq(schema.prayerFriends.userId, session.userId), eq(schema.prayerFriends.status, "accepted"))),
      db
        .select({ id: schema.prayerFriends.id })
        .from(schema.prayerFriends)
        .where(and(eq(schema.prayerFriends.userId, invite.inviterId), eq(schema.prayerFriends.status, "accepted"))),
    ]);
    if (myCount.length >= 100 || theirCount.length >= 100) {
      return NextResponse.json(
        { error: "One of you has reached the 100-friend limit." },
        { status: 429 },
      );
    }

    // Atomically claim the invite — concurrent accepts race on usedAt
    const claimed = await db
      .update(schema.prayerInvites)
      .set({ usedBy: session.userId, usedAt: new Date() })
      .where(and(eq(schema.prayerInvites.id, invite.id), isNull(schema.prayerInvites.usedAt)))
      .returning({ id: schema.prayerInvites.id });
    if (claimed.length === 0) {
      return NextResponse.json({ error: "This invite was already used." }, { status: 409 });
    }

    // Create mutual accepted rows (any pre-existing pending/rejected rows get
    // upgraded — both sides consented via the link).
    const now = new Date();
    await db
      .insert(schema.prayerFriends)
      .values([
        { userId: session.userId, friendId: invite.inviterId, status: "accepted", respondedAt: now },
        { userId: invite.inviterId, friendId: session.userId, status: "accepted", respondedAt: now },
      ])
      .onConflictDoUpdate({
        target: [schema.prayerFriends.userId, schema.prayerFriends.friendId],
        set: { status: "accepted", respondedAt: now },
      });

    // Notify the inviter — best effort
    try {
      const [accepter] = await db
        .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      const name = accepter?.firstName || accepter?.displayName || "Someone";
      const subs = await db
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.userId, invite.inviterId));
      for (const sub of subs) {
        await sendPrayerPush(sub, JSON.stringify({
          title: "New prayer buddy",
          body: `${name} joined you as a prayer buddy on Waqt!`,
          url: "/prayer?tab=friends",
        }));
      }
    } catch {
      // Push is best-effort
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "prayer-friends/invite PUT" });
    return NextResponse.json({ error: "Could not accept invite." }, { status: 500 });
  }
}

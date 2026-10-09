import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, desc, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { sendPrayerPush } from "@/lib/notifications/push";

export const dynamic = "force-dynamic";

const MAX_LEN = 2000;
const PAGE = 100;

// Accepted friendship is the authorization boundary — no RLS in this stack,
// so every query is scoped to the (me, friend) pair explicitly.
async function requireFriendship(userId: string, friendId: string) {
  const [row] = await db
    .select({ id: schema.prayerFriends.id })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.userId, userId),
        eq(schema.prayerFriends.friendId, friendId),
        eq(schema.prayerFriends.status, "accepted"),
      ),
    )
    .limit(1);
  if (!row) return null;
  // Defense in depth: a block in either direction cuts messaging even if a
  // friendship row still exists (e.g. accepted before the block landed).
  const [block] = await db
    .select({ id: schema.prayerBlocks.id })
    .from(schema.prayerBlocks)
    .where(
      or(
        and(eq(schema.prayerBlocks.userId, userId), eq(schema.prayerBlocks.blockedUserId, friendId)),
        and(eq(schema.prayerBlocks.userId, friendId), eq(schema.prayerBlocks.blockedUserId, userId)),
      ),
    )
    .limit(1);
  return block ? null : row;
}

function shape(m: typeof schema.friendMessages.$inferSelect, replyToContent: string | null) {
  return {
    id: m.id,
    senderId: m.senderId,
    content: m.deletedAt ? "" : m.content,
    deleted: !!m.deletedAt,
    replyToId: m.replyToId,
    replyToContent,
    deliveredAt: m.deliveredAt,
    readAt: m.readAt,
    createdAt: m.createdAt,
  };
}

// GET /api/messages?friend=<uuid> — thread history + stamps incoming
// undelivered rows so the sender's ✓ becomes ✓✓.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("messages", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const friendId = request.nextUrl.searchParams.get("friend") ?? "";

  // No friend param → conversation list: every accepted friend, their last
  // message and unread count.
  if (!friendId) {
    try {
      const friendships = await db
        .select({ friendId: schema.prayerFriends.friendId })
        .from(schema.prayerFriends)
        .where(and(eq(schema.prayerFriends.userId, session.userId), eq(schema.prayerFriends.status, "accepted")))
        .limit(100);
      if (friendships.length === 0) return NextResponse.json({ conversations: [] });
      const ids = friendships.map((f) => f.friendId);

      const [names, recent, unreadRows] = await Promise.all([
        db
          .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl })
          .from(schema.users)
          .where(inArray(schema.users.id, ids)),
        db
          .select()
          .from(schema.friendMessages)
          .where(or(
            and(eq(schema.friendMessages.senderId, session.userId), inArray(schema.friendMessages.recipientId, ids)),
            and(inArray(schema.friendMessages.senderId, ids), eq(schema.friendMessages.recipientId, session.userId)),
          ))
          .orderBy(desc(schema.friendMessages.createdAt))
          .limit(500),
        db
          .select({ senderId: schema.friendMessages.senderId, n: sql<number>`count(*)::int` })
          .from(schema.friendMessages)
          .where(and(eq(schema.friendMessages.recipientId, session.userId), inArray(schema.friendMessages.senderId, ids), isNull(schema.friendMessages.readAt)))
          .groupBy(schema.friendMessages.senderId),
      ]);

      const nameById = new Map(names.map((u) => [u.id, u]));
      const unreadById = new Map(unreadRows.map((r) => [r.senderId, r.n]));
      const lastById = new Map<string, typeof recent[number]>();
      for (const m of recent) {
        const other = m.senderId === session.userId ? m.recipientId : m.senderId;
        if (!lastById.has(other)) lastById.set(other, m);
      }

      const conversations = ids
        .map((id) => {
          const u = nameById.get(id);
          const last = lastById.get(id);
          return {
            friendId: id,
            name: u?.firstName || u?.displayName || "Friend",
            avatarUrl: u?.avatarUrl ?? null,
            lastMessage: last ? (last.deletedAt ? "" : last.content) : null,
            lastAt: last?.createdAt ?? null,
            lastFromMe: last?.senderId === session.userId,
            unread: unreadById.get(id) ?? 0,
          };
        })
        .sort((a, b) => new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime());

      return NextResponse.json({ conversations });
    } catch (err) {
      logError(err, { route: "messages/list" });
      return NextResponse.json({ error: "Could not load conversations." }, { status: 500 });
    }
  }

  if (!/^[0-9a-f-]{36}$/i.test(friendId)) {
    return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  }

  try {
    if (!(await requireFriendship(session.userId, friendId))) {
      return NextResponse.json({ error: "Not friends." }, { status: 403 });
    }

    const pair = or(
      and(eq(schema.friendMessages.senderId, session.userId), eq(schema.friendMessages.recipientId, friendId)),
      and(eq(schema.friendMessages.senderId, friendId), eq(schema.friendMessages.recipientId, session.userId)),
    );

    const rows = await db
      .select()
      .from(schema.friendMessages)
      .where(pair)
      .orderBy(desc(schema.friendMessages.createdAt))
      .limit(PAGE);

    // Mark incoming as delivered (not read — the client posts /read when the
    // thread is actually on screen).
    const undelivered = rows.filter((r) => r.senderId === friendId && !r.deliveredAt).map((r) => r.id);
    if (undelivered.length > 0) {
      const now = new Date();
      await db
        .update(schema.friendMessages)
        .set({ deliveredAt: now })
        .where(inArray(schema.friendMessages.id, undelivered));
      for (const r of rows) if (undelivered.includes(r.id)) r.deliveredAt = now;
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const me = session.userId;

    const [friend] = await db
      .select({ firstName: schema.users.firstName, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl })
      .from(schema.users)
      .where(eq(schema.users.id, friendId))
      .limit(1);

    return NextResponse.json({
      friend: {
        id: friendId,
        name: friend?.firstName || friend?.displayName || "Friend",
        avatarUrl: friend?.avatarUrl ?? null,
      },
      messages: rows.reverse().map((m) =>
        shape(m, m.replyToId ? (byId.get(m.replyToId)?.deletedAt ? null : (byId.get(m.replyToId)?.content ?? null)) : null),
      ),
      unreadIncoming: rows.filter((r) => r.senderId === friendId && !r.readAt).length,
      me,
    });
  } catch (err) {
    logError(err, { route: "messages/GET" });
    return NextResponse.json({ error: "Could not load messages." }, { status: 500 });
  }
}

// POST /api/messages — send { friendId, content, replyToId? }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("messages", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { friendId?: string; content?: string; replyToId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const friendId = typeof body.friendId === "string" ? body.friendId : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const replyToId = typeof body.replyToId === "string" && /^[0-9a-f-]{36}$/i.test(body.replyToId) ? body.replyToId : null;
  if (!/^[0-9a-f-]{36}$/i.test(friendId)) return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  if (!content || content.length > MAX_LEN) {
    return NextResponse.json({ error: `Message must be 1–${MAX_LEN} characters.` }, { status: 400 });
  }

  try {
    if (!(await requireFriendship(session.userId, friendId))) {
      return NextResponse.json({ error: "Not friends." }, { status: 403 });
    }

    // Reply must reference a message inside this same thread.
    if (replyToId) {
      const [orig] = await db
        .select({ id: schema.friendMessages.id })
        .from(schema.friendMessages)
        .where(
          and(
            eq(schema.friendMessages.id, replyToId),
            or(
              and(eq(schema.friendMessages.senderId, session.userId), eq(schema.friendMessages.recipientId, friendId)),
              and(eq(schema.friendMessages.senderId, friendId), eq(schema.friendMessages.recipientId, session.userId)),
            ),
          ),
        )
        .limit(1);
      if (!orig) return NextResponse.json({ error: "Invalid reply target." }, { status: 400 });
    }

    const [msg] = await db
      .insert(schema.friendMessages)
      .values({ senderId: session.userId, recipientId: friendId, content, replyToId })
      .returning();

    // Notify — in-app toast + push, best effort.
    try {
      const [me] = await db
        .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      const myName = me?.firstName || me?.displayName || "A friend";
      const preview = content.length > 80 ? content.slice(0, 77) + "…" : content;

      await db.insert(schema.appNotifications).values({
        userId: friendId,
        type: "message",
        title: `${myName} sent you a message`,
        body: preview,
      });

      const subs = await db
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.userId, friendId));
      const expiredIds: string[] = [];
      for (const sub of subs) {
        const r = await sendPrayerPush(sub, JSON.stringify({
          title: myName,
          body: preview,
          url: `/messages/${session.userId}`,
        }), { topic: `msg-${session.userId}`, ttl: 24 * 60 * 60 });
        if (r.expired) expiredIds.push(sub.id);
      }
      if (expiredIds.length > 0) {
        await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, expiredIds));
      }
    } catch {
      // notify is best-effort — the message is saved
    }

    return NextResponse.json({ message: shape(msg, null) });
  } catch (err) {
    logError(err, { route: "messages/POST" });
    return NextResponse.json({ error: "Could not send." }, { status: 500 });
  }
}

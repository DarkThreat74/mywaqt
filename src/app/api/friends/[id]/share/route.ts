import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { isValidUUID } from "@/lib/validation";
import { env } from "@/lib/env";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [friend] = await db.select({ id: schema.friends.id }).from(schema.friends).where(and(eq(schema.friends.id, id), eq(schema.friends.userId, session.userId))).limit(1);
  if (!friend) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.friendProfileShares).values({ userId: session.userId, friendId: id, tokenHash: hash(token) });
  const origin = env.appUrl.replace(/\/$/, "");
  return NextResponse.json({ url: `${origin}/friend-share/${token}` });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.update(schema.friendProfileShares).set({ revokedAt: new Date() }).where(and(eq(schema.friendProfileShares.friendId, id), eq(schema.friendProfileShares.userId, session.userId)));
  return NextResponse.json({ ok: true });
}

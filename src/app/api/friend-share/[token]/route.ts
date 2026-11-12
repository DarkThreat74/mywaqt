import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, gt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { createHash } from "crypto";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [share] = await db.select({ friendId: schema.friendProfileShares.friendId, userId: schema.friendProfileShares.userId }).from(schema.friendProfileShares).where(and(eq(schema.friendProfileShares.tokenHash, hash(token)), isNull(schema.friendProfileShares.revokedAt), or(isNull(schema.friendProfileShares.expiresAt), gt(schema.friendProfileShares.expiresAt, new Date())))).limit(1);
  if (!share) return NextResponse.json({ error: "This profile link is no longer available." }, { status: 404 });
  const [friend] = await db.select({ name: schema.friends.name, groupLabel: schema.friends.groupLabel, metTag: schema.friends.metTag, metDetail: schema.friends.metDetail, phone: schema.friends.phone, notes: schema.friends.notes, photoData: schema.friends.photoData, photoMime: schema.friends.photoMime }).from(schema.friends).where(eq(schema.friends.id, share.friendId)).limit(1);
  if (!friend) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  const [birthday] = await db.select({ month: schema.birthdays.birthMonth, day: schema.birthdays.birthDay, year: schema.birthdays.birthYear }).from(schema.birthdays).where(and(eq(schema.birthdays.friendId, share.friendId), eq(schema.birthdays.userId, share.userId))).limit(1);
  return NextResponse.json({ friend: { ...friend, photoData: undefined, photoMime: undefined }, birthday: birthday ?? null });
}

import { notFound } from "next/navigation";
import { createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared friend profile · Waqt", robots: { index: false, follow: false } };

export default async function FriendSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [share] = await db.select({ friendId: schema.friendProfileShares.friendId, userId: schema.friendProfileShares.userId }).from(schema.friendProfileShares)
    .where(and(eq(schema.friendProfileShares.tokenHash, tokenHash), isNull(schema.friendProfileShares.revokedAt))).limit(1);
  if (!share) notFound();
  const [friend] = await db.select({ name: schema.friends.name, groupLabel: schema.friends.groupLabel, metTag: schema.friends.metTag, metDetail: schema.friends.metDetail, phone: schema.friends.phone, notes: schema.friends.notes, photoData: schema.friends.photoData, photoMime: schema.friends.photoMime }).from(schema.friends).where(eq(schema.friends.id, share.friendId)).limit(1);
  if (!friend) notFound();
  const [birthday] = await db.select({ month: schema.birthdays.birthMonth, day: schema.birthdays.birthDay, year: schema.birthdays.birthYear }).from(schema.birthdays).where(and(eq(schema.birthdays.friendId, share.friendId), eq(schema.birthdays.userId, share.userId))).limit(1);
  const photo = friend.photoData && friend.photoMime ? `data:${friend.photoMime};base64,${friend.photoData}` : null;
  return (
    <main className="min-h-dvh bg-[var(--color-paper)] px-5 py-10 text-[var(--color-ink)]">
      <div className="mx-auto max-w-md rounded-3xl border bg-[var(--color-paper)] p-6 shadow-sm" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="flex flex-col items-center text-center">
          <div className="h-24 w-24 overflow-hidden rounded-full border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            {photo ? <><span className="sr-only">Profile photo</span>{/* eslint-disable-next-line @next/next/no-img-element -- data URL from private profile */}<img src={photo} alt="" className="h-full w-full object-cover" /></> : <span className="flex h-full items-center justify-center text-3xl font-semibold text-[var(--color-accent)]">{friend.name[0]?.toUpperCase()}</span>}
          </div>
          <h1 className="mt-4 text-2xl font-semibold">{friend.name}</h1>
          {friend.groupLabel && <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{friend.groupLabel}</p>}
        </div>
        <div className="mt-6 space-y-3 text-sm">
          {friend.metTag && <div><b>Where we met</b><p className="text-[var(--color-ink-muted)]">{friend.metTag}{friend.metDetail ? ` · ${friend.metDetail}` : ""}</p></div>}
          {birthday && <div><b>Birthday</b><p className="text-[var(--color-ink-muted)]">{birthday.month}/{birthday.day}{birthday.year ? `/${birthday.year}` : ""}</p></div>}
          {friend.phone && <div><b>Phone</b><p className="text-[var(--color-ink-muted)]">{friend.phone}</p></div>}
          {friend.notes && <div><b>Notes</b><p className="whitespace-pre-wrap text-[var(--color-ink-muted)]">{friend.notes}</p></div>}
        </div>
        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">Shared from Waqt</p>
      </div>
    </main>
  );
}

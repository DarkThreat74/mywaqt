import Link from "next/link";
import { createHash } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import ShareLinkExpired from "@/components/share-link-expired";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared friend profile · Waqt", robots: { index: false, follow: false } };

// Public share pages get a hard payload budget — base64 photos inline at
// ~1.33×, and an unbounded gallery was pushing pages past a megabyte.
const PHOTO_BUDGET = 600_000; // total base64 chars across avatar + gallery
const GALLERY_LIMIT = 12;
const MET_LABELS: Record<string, string> = {
  childhood: "childhood", family: "family", school: "school", masjid: "the masjid",
  work: "work", neighbor: "the neighborhood", mutual: "a mutual friend",
  sports: "sports", travel: "travel", online: "online", other: "somewhere along the way",
};

export default async function FriendSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [share] = await db.select({ friendId: schema.friendProfileShares.friendId, userId: schema.friendProfileShares.userId }).from(schema.friendProfileShares)
    .where(and(eq(schema.friendProfileShares.tokenHash, tokenHash), isNull(schema.friendProfileShares.revokedAt))).limit(1);
  if (!share) return <ShareLinkExpired />;
  // Owner-scoped: never render a friend row that belongs to someone else.
  const [friend] = await db.select({ name: schema.friends.name, groupLabel: schema.friends.groupLabel, metTag: schema.friends.metTag, photoData: schema.friends.photoData, photoMime: schema.friends.photoMime })
    .from(schema.friends)
    .where(and(eq(schema.friends.id, share.friendId), eq(schema.friends.userId, share.userId))).limit(1);
  if (!friend) return <ShareLinkExpired />;
  const avatarOk = !!(friend.photoData && friend.photoMime && friend.photoData.length <= PHOTO_BUDGET);
  const photo = avatarOk ? `data:${friend.photoMime};base64,${friend.photoData}` : null;
  const avatarSize = avatarOk ? friend.photoData!.length : 0;
  // Past profile photos — the same gallery the owner sees, minus the current
  // avatar (already shown up top) and anything over the payload budget.
  const candidates = (await db.select({ data: schema.friendPhotos.photoData, mime: schema.friendPhotos.photoMime }).from(schema.friendPhotos)
    .where(and(eq(schema.friendPhotos.friendId, share.friendId), eq(schema.friendPhotos.userId, share.userId)))
    .orderBy(desc(schema.friendPhotos.createdAt)).limit(GALLERY_LIMIT))
    .filter((g) => g.data !== friend.photoData);
  const gallery = candidates
    .filter((_, i) => avatarSize + candidates.slice(0, i + 1).reduce((s, g) => s + g.data.length, 0) <= PHOTO_BUDGET)
    .map((g) => `data:${g.mime};base64,${g.data}`);
  return (
    <main className="min-h-dvh bg-[var(--color-paper)] px-5 py-10 text-[var(--color-ink)]">
      <div className="mx-auto max-w-md rounded-3xl border bg-[var(--color-paper)] p-6 shadow-sm" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="flex flex-col items-center text-center">
          <div className="h-24 w-24 overflow-hidden rounded-full border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            {photo ? (
              <>
                <span className="sr-only">Profile photo</span>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL from private profile */}
                <img src={photo} alt="" className="h-full w-full object-cover" />
              </>
            ) : (
              <span className="flex h-full items-center justify-center text-3xl font-semibold text-[var(--color-accent)]">{friend.name[0]?.toUpperCase()}</span>
            )}
          </div>
          <h1 className="mt-4 text-2xl font-semibold">{friend.name}</h1>
          {friend.groupLabel && <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{friend.groupLabel}</p>}
        </div>
        {/* Scope is fixed: name, crew, where-they-met tag, and photos only.
            Notes, phone, birthday, and met details are the owner's private
            data — never selected above, so they can never leak here. */}
        {friend.metTag && (
          <p className="mt-6 text-center text-sm text-[var(--color-ink-muted)]">
            Met through <span className="text-[var(--color-ink)]">{MET_LABELS[friend.metTag] ?? friend.metTag}</span>
          </p>
        )}
        {gallery.length > 0 && (
          <div className="mt-6">
            <b className="text-sm">Photos</b>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {gallery.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- data URLs from private profile
                <img key={i} src={src} alt="" className="aspect-square w-full rounded-xl border object-cover" style={{ borderColor: "var(--color-paper-3)" }} />
              ))}
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/"
            className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Go to Waqt
          </Link>
          <p className="text-center text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">Shared from Waqt</p>
        </div>
      </div>
    </main>
  );
}

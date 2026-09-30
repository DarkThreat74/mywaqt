"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bell, Swords, Megaphone, X, Clock, UserPlus, UserMinus, HandHeart, BellRing, ChevronDown, CalendarClock, MessageCircle, Swords as SwordsIcon } from "lucide-react";
import { useInbox, refreshInbox, type Inbox } from "@/lib/inbox";

const DIFF_LABEL: Record<string, string> = { easy: "Easy", medium: "Medium", advanced: "Advanced", elite: "Elite" };
const SNOOZE_CUTOFF_MS = 2 * 60 * 60 * 1000;

function typeIcon(type: string) {
  const cls = "h-4 w-4";
  const style = { color: "var(--color-accent)" } as const;
  switch (type) {
    case "friend_accepted": return <UserPlus className={cls} style={style} />;
    case "friend_removed": return <UserMinus className={cls} style={style} />;
    case "match_ended": return <Swords className={cls} style={style} />;
    case "nudge": return <BellRing className={cls} style={style} />;
    case "dua_received": return <HandHeart className={cls} style={style} />;
    case "message": return <MessageCircle className={cls} style={style} />;
    default: return <Megaphone className={cls} style={style} />;
  }
}

export function inboxCount(inbox: Inbox) {
  return inbox.notifications.length + inbox.friendRequests.length + inbox.gameInvites.length;
}

/* ── Bell button — sits next to the tools opener in both shells ── */
export function NotificationBell() {
  const inbox = useInbox();
  const count = inboxCount(inbox);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count ? `Notifications (${count} new)` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (() => {
        // Today's history — acked rows dimmed below the live ones.
        const liveIds = new Set(inbox.notifications.map((n) => n.id));
        const seenToday = (inbox.recent ?? []).filter((n) => n.acked && !liveIds.has(n.id));
        return (
        <div
          className="absolute right-0 top-11 z-[90] w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md max-lg:fixed max-lg:left-1/2 max-lg:right-auto max-lg:top-[calc(env(safe-area-inset-top)+3.25rem)] max-lg:w-[calc(100vw-1.5rem)] max-lg:max-w-sm max-lg:-translate-x-1/2 lg:bottom-12 lg:left-0 lg:right-auto lg:top-auto"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 94%, transparent)" }}
          role="dialog"
          aria-label="Notifications"
        >
          <p className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            Notifications
          </p>
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {count === 0 && seenToday.length === 0 && (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>You&apos;re all caught up.</p>
            )}
            {inbox.notifications.map((n) => (
              <PanelRow key={n.id} icon={typeIcon(n.type)}
                title={n.title} sub={n.body ?? undefined} time={n.createdAt} />
            ))}
            {inbox.friendRequests.map((r) => (
              <button key={r.id} type="button"
                onClick={() => { setOpen(false); router.push("/prayer?tab=friends"); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]">
                <Avatar name={r.name} url={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>{r.name}</p>
                  <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Friend request — tap to answer</p>
                </div>
              </button>
            ))}
            {inbox.gameInvites.map((g) => (
              <PanelRow key={g.id} icon={<Swords className="h-4 w-4" style={{ color: "var(--color-accent)" }} />}
                title={`${g.from} challenged you`} sub={`${g.game === "mutashabih" ? "Mutashabih" : "AyaTrace"} — answer in the toast`} time={g.expiresAt} />
            ))}
            {seenToday.length > 0 && (
              <>
                <p className="border-t px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                  Earlier today
                </p>
                {seenToday.map((n) => (
                  <div key={n.id} className="opacity-60">
                    <PanelRow icon={typeIcon(n.type)} title={n.title} sub={n.body ?? undefined} time={n.createdAt} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function PanelRow({ icon, title, sub, time }: { icon: React.ReactNode; title: string; sub?: string; time?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{title}</p>
        {sub && <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>{sub}</p>}
        {time && <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{new Date(time).toLocaleString()}</p>}
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL / API-served avatar
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "var(--color-accent)" }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ── Persistent toast tray — items stay until acted on ── */
export function NotificationTray() {
  const inbox = useInbox();
  const router = useRouter();
  const pathname = usePathname();
  const openMatch = useSearchParams().get("match");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const needsClock = inbox.gameInvites.length > 0 || inbox.friendRequests.length > 0 || inbox.outgoingInvites.length > 0;
  useEffect(() => {
    if (!needsClock) return;
    setNow(Date.now()); // eslint-disable-line react-hooks/set-state-in-effect -- seed countdown clock
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [needsClock]);

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try { await fn(); } finally { setBusy(null); refreshInbox(); }
  }

  const ack = (id: string) =>
    act(`ack-${id}`, async () => {
      await fetch("/api/notifications/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    });

  const friend = (r: { id: string }, action: "accept" | "reject" | "later") =>
    act(`fr-${r.id}`, async () => {
      if (action === "later") {
        await fetch("/api/prayer-friends/snooze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id }) });
      } else {
        await fetch("/api/prayer-friends/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, action }) });
      }
    });

  const game = (g: { id: string; game: string }, accept: boolean) =>
    act(`gi-${g.id}`, async () => {
      const res = await fetch(`/api/quran/match/${g.id}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) });
      if (res.ok && accept) router.push(`${g.game === "mutashabih" ? "/mutashabihat" : "/quran"}?match=${g.id}`);
    });

  const cancelInvite = (id: string) =>
    act(`cancel-${id}`, async () => {
      await fetch(`/api/quran/match/${id}/cancel`, { method: "POST" });
    });

  const visibleInvites = inbox.gameInvites.filter((g) => g.id !== openMatch && new Date(g.expiresAt).getTime() > now);
  const visibleOutgoing = inbox.outgoingInvites.filter((g) => new Date(g.expiresAt).getTime() > now);
  const onGamePage = pathname === "/quran" || pathname === "/mutashabihat";
  // Inside the messenger, incoming "sent you a message" toasts would just
  // echo what the thread already shows — hide them there.
  const onMessages = pathname.startsWith("/messages");
  // Cap visible notif toasts — a user with many unacked rows would otherwise
  // get a wall of cards covering the whole screen. The bell lists them all.
  const shownNotifs = inbox.notifications.slice(0, 3);
  const hiddenNotifs = inbox.notifications.length - shownNotifs.length;
  const shown = onMessages ? shownNotifs.filter((n) => n.type !== "message") : shownNotifs;
  const toastCount = shown.length + inbox.friendRequests.length + visibleInvites.length + visibleOutgoing.length + (inbox.qadaaReview ? 1 : 0);

  return (
    <>
      {/* Toast stack — portaled to body so no ancestor transform/blur can
          skew the fixed centering; persists until acted on */}
      {toastCount > 0 && createPortal(
        <div
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+3.75rem)] z-[85] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 lg:top-4"
          style={{ paddingLeft: "calc(0.75rem + env(safe-area-inset-left))", paddingRight: "calc(0.75rem + env(safe-area-inset-right))" }}
        >
          {inbox.qadaaReview && <QadaaReviewCard review={inbox.qadaaReview} />}
          {shown.map((n) => (
            <ToastCard key={n.id} icon={typeIcon(n.type)} title={n.title} sub={n.body ?? undefined}>
              {n.type === "message" && (
                <Link href="/messages" onClick={() => void ack(n.id)}
                  className="flex h-8 shrink-0 items-center rounded-lg border px-2.5 text-[11px] font-semibold transition-colors enabled:hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                  Open
                </Link>
              )}
              <ToastBtn solid disabled={busy === `ack-${n.id}`} onClick={() => void ack(n.id)}>Got it</ToastBtn>
            </ToastCard>
          ))}

          {hiddenNotifs > 0 && (
            <p className="text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
              +{hiddenNotifs} more — tap the bell to see all
            </p>
          )}

          {inbox.friendRequests.map((r) => {
            const lifeLeft = new Date(r.expiresAt).getTime() - now;
            const canSnooze = lifeLeft > SNOOZE_CUTOFF_MS;
            return (
              <ToastCard key={r.id} avatar={<Avatar name={r.name} url={r.avatarUrl} />}
                title={`${r.name} sent you a friend request`} sub="Tap to answer">
                <ToastBtn solid onClick={() => void friend(r, "accept")} disabled={busy === `fr-${r.id}`}>Accept</ToastBtn>
                <ToastBtn onClick={() => void friend(r, "reject")} disabled={busy === `fr-${r.id}`}>Decline</ToastBtn>
                {canSnooze && (
                  <button type="button" onClick={() => void friend(r, "later")} disabled={busy === `fr-${r.id}`}
                    aria-label="Answer later"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors enabled:hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                    <Clock className="h-3.5 w-3.5" />
                  </button>
                )}
              </ToastCard>
            );
          })}

          {visibleInvites.map((g) => {
            // now starts at 0 until the clock effect seeds it — without the
            // guard the countdown would flash a huge garbage number first.
            const secs = now ? Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - now) / 1000)) : 0;
            const clock = now ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "…";
            return (
              <ToastCard key={g.id} icon={<Swords className="h-4 w-4" style={{ color: "var(--color-accent)" }} />}
                title={`${g.from} challenges you`}
                sub={`${DIFF_LABEL[g.difficulty] ?? g.difficulty} · ${clock}`}>
                <ToastBtn solid onClick={() => void game(g, true)} disabled={busy === `gi-${g.id}`}>Accept</ToastBtn>
                <ToastBtn onClick={() => void game(g, false)} disabled={busy === `gi-${g.id}`}>Decline</ToastBtn>
              </ToastCard>
            );
          })}

          {visibleOutgoing.map((g) => (
            <OutgoingInviteCard key={g.id} inv={g} now={now} busy={busy === `cancel-${g.id}`}
              accepted={inbox.activeMatch?.id === g.id}
              onCancel={() => void cancelInvite(g.id)} />
          ))}
        </div>,
        document.body,
      )}

      {/* Return-to-match pill */}
      <MatchPill inbox={inbox} hidden={!inbox.activeMatch || (onGamePage && openMatch === inbox.activeMatch.id)} />
    </>
  );
}

function ToastCard({ icon, avatar, title, sub, children }: {
  icon?: React.ReactNode; avatar?: React.ReactNode; title: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <div role="alert"
      className="flex items-center gap-2.5 rounded-xl border py-2 pl-2.5 pr-2 shadow-lg backdrop-blur-md"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 97%, transparent)" }}>
      {avatar ?? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, var(--color-paper))" }}>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--color-ink)" }}>{title}</p>
        {sub && <p className="truncate text-[11px] leading-tight" style={{ color: "var(--color-ink-muted)" }}>{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/* ── Weekly qadaa review — Sundays after Fajr ends. Stays until the user
     absorbs the misses into the ledger or dismisses (waterline advances,
     count restarts from that Fajr onward). ── */
const QADAA_LABEL: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

function QadaaReviewCard({ review }: { review: NonNullable<Inbox["qadaaReview"]> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const byPrayer = Object.entries(review.byPrayer)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${QADAA_LABEL[k] ?? k}`)
    .join(", ");

  async function resolve(action: "absorb" | "dismiss") {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/qadaa/unlogged", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      refreshInbox();
    } finally { setBusy(false); }
  }

  return (
    <div role="alert"
      className="rounded-xl border py-2 pl-2.5 pr-2 shadow-lg backdrop-blur-md"
      style={{ borderColor: "var(--color-warmth)", backgroundColor: "color-mix(in oklab, var(--color-paper) 97%, transparent)" }}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 14%, var(--color-paper))" }}>
          <CalendarClock className="h-4 w-4" style={{ color: "var(--color-warmth)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--color-ink)" }}>
            Weekly review — {review.count} missed {review.count === 1 ? "prayer" : "prayers"}
          </p>
          <p className="truncate text-[11px] leading-tight" style={{ color: "var(--color-ink-muted)" }}>{byPrayer}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide details" : "Show details"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors enabled:hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
          <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </button>
        <ToastBtn solid onClick={() => void resolve("absorb")} disabled={busy}>Add to qadaa</ToastBtn>
        <ToastBtn onClick={() => void resolve("dismiss")} disabled={busy}>Dismiss</ToastBtn>
      </div>
      {open && (
        <div className="mt-2 max-h-40 overflow-y-auto overscroll-contain rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)" }}>
          {review.rows.map((r, i) => (
            <p key={i} className="flex justify-between py-0.5 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
              <span className="font-medium">{QADAA_LABEL[r.prayerName] ?? r.prayerName}</span>
              <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                {new Date(r.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sender-side challenge card — persistent while the invite is pending.
     Minimizes to a small square, expands again on tap, and can be cancelled
     (which also clears the opponent's card on their next inbox poll). ── */
function OutgoingInviteCard({ inv, now, busy, accepted, onCancel }: {
  inv: Inbox["outgoingInvites"][number];
  now: number;
  busy: boolean;
  accepted: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [min, setMin] = useState(false);
  const secs = now ? Math.max(0, Math.ceil((new Date(inv.expiresAt).getTime() - now) / 1000)) : 0;
  const clock = now ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "…";
  const gameLabel = inv.game === "mutashabih" ? "Mutashabih" : "AyaTrace";
  const href = `${inv.game === "mutashabih" ? "/mutashabihat" : "/quran"}?match=${inv.id}`;

  if (min) {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        aria-label={`Expand challenge to ${inv.to} — ${clock} left`}
        className="ml-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl border shadow-lg backdrop-blur-md transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 97%, transparent)" }}
      >
        <Swords className="h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} />
        <span className="text-[8px] font-bold tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{clock}</span>
      </button>
    );
  }

  return (
    <ToastCard icon={<Swords className="h-4 w-4" style={{ color: "var(--color-accent)" }} />}
      title={accepted ? `${inv.to} accepted!` : `Waiting for ${inv.to}`}
      sub={`${gameLabel} · ${DIFF_LABEL[inv.difficulty] ?? inv.difficulty} · ${accepted ? "match is live" : `${clock} left`}`}>
      {accepted ? (
        <ToastBtn solid onClick={() => router.push(href)}>Enter</ToastBtn>
      ) : (
        <>
          <ToastBtn onClick={onCancel} disabled={busy}>{busy ? "…" : "Cancel"}</ToastBtn>
          <button type="button" onClick={() => setMin(true)} aria-label="Minimize"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors enabled:hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </ToastCard>
  );
}

function ToastBtn({ solid, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { solid?: boolean }) {
  return solid ? (
    <button type="button" {...props}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-50"
      style={{ backgroundColor: "var(--color-accent)", minHeight: 32 }} />
  ) : (
    <button type="button" {...props}
      className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors enabled:hover:bg-[var(--color-paper-2)] disabled:opacity-50"
      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 32 }} />
  );
}

/* ── Hovering pill for a live match you navigated away from ── */
function MatchPill({ inbox, hidden }: { inbox: Inbox; hidden: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (hidden || !inbox.activeMatch) return null;
  const m = inbox.activeMatch;

  function back() {
    router.push(`${m.game === "mutashabih" ? "/mutashabihat" : "/quran"}?match=${m.id}`);
  }

  async function surrender() {
    setBusy(true);
    try {
      await fetch(`/api/quran/match/${m.id}/forfeit`, { method: "POST" });
      setConfirming(false);
      refreshInbox();
    } finally { setBusy(false); }
  }

  return createPortal(
    <div className="fixed inset-x-3 z-[84] mx-auto max-w-sm lg:right-6 lg:left-auto lg:mx-0 lg:w-80"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}>
      {confirming ? (
        <div className="rounded-2xl border p-4 shadow-xl backdrop-blur-md"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 94%, transparent)" }}
          role="alertdialog" aria-label="Surrender match">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Surrender to {m.opponentName}?</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            You&apos;ll lose 5 rating points. Under 2 rounds done counts as an abort — they gain nothing.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void surrender()} disabled={busy}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#b42318" }}>
              Surrender
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}
              className="flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors enabled:hover:bg-[var(--color-paper-2)] disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
              Keep playing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-full border p-1.5 pl-4 shadow-xl backdrop-blur-md"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 94%, transparent)" }}
          role="status">
          <SwordsIcon className="h-4 w-4 shrink-0 animate-pulse" style={{ color: "var(--color-accent)" }} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            Match vs {m.opponentName}
          </p>
          <button type="button" onClick={back}
            className="shrink-0 rounded-full px-3.5 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}>
            Finish it
          </button>
          <button type="button" onClick={() => setConfirming(true)} aria-label="Surrender match"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

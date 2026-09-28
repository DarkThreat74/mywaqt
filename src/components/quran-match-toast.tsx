"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Swords } from "lucide-react";

interface Invite {
  id: string;
  from: string;
  difficulty: string;
  rounds: number;
}

const DIFF_LABEL: Record<string, string> = { easy: "Easy", medium: "Medium", advanced: "Advanced", elite: "Elite" };
const POLL_MS = 20_000;

/**
 * App-wide challenge toast — polls for pending Quran match invites and offers
 * Accept / Decline. Accept routes to /quran?match=… (the match view also polls
 * once you're inside). Matches the PendingInvite pattern: quiet card, no modal.
 */
export default function QuranMatchToast() {
  const router = useRouter();
  const pathname = usePathname();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let live = true;
    async function check() {
      try {
        const res = await fetch("/api/quran/match/invites", { cache: "no-store" });
        if (!res.ok) return;
        const data: { invites?: Invite[] } = await res.json();
        if (live) setInvite(data.invites?.[0] ?? null); // one at a time — next shows after this resolves
      } catch { /* transient — next poll retries */ }
    }
    void check();
    timer.current = setInterval(() => { if (!document.hidden) void check(); }, POLL_MS);
    return () => { live = false; if (timer.current) clearInterval(timer.current); };
  }, []);

  // Hide while on the quran page — the match view is the place to be.
  const hidden = pathname === "/quran" || !invite;

  async function respond(accept: boolean) {
    if (!invite || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/quran/match/${invite.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (res.ok && accept) {
        const id = invite.id;
        setInvite(null);
        router.push(`/quran?match=${id}`);
        return;
      }
      setInvite(null); // declined or gone — either way, stop showing it
    } catch { /* next poll refetches if still pending */ }
    setBusy(false);
  }

  if (hidden) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-3 z-[80] mx-auto max-w-sm rounded-2xl border p-4 shadow-xl"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 72px)",
        borderColor: "var(--color-paper-3)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, var(--color-paper))" }}>
          <Swords className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {invite.from} challenges you
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Quran Challenge · {DIFF_LABEL[invite.difficulty] ?? invite.difficulty} · Best of {invite.rounds}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void respond(true)}
              disabled={busy}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Accept
            </button>
            <button
              onClick={() => void respond(false)}
              disabled={busy}
              className="flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors enabled:hover:bg-[var(--color-paper-2)] disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Flag } from "lucide-react";

/* Small in-match surrender control — same confirm flow as the return pill.
   The match's own state poll picks up the done state after the POST lands. */
export function MatchSurrender({ matchId }: { matchId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function surrender() {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch(`/api/quran/match/${matchId}/forfeit`, { method: "POST" });
      if (!res.ok) setErr(true);
      else setConfirming(false);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void surrender()}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#b42318" }}
        >
          {busy ? "Surrendering…" : "Yes, surrender"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Keep playing
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <Flag className="h-3 w-3" />
        Surrender
      </button>
      {err && <span className="text-[11px]" style={{ color: "#b42318" }}>Couldn&apos;t — try again</span>}
    </div>
  );
}

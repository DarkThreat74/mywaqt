"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";
import { DUA_PRESETS, DUA_MAX_CHARS, validateDua } from "@/lib/dua";

interface DueSender {
  senderId: string;
  name: string;
}

const PRAYER_LABEL: Record<string, string> = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

/**
 * The "make a dua for them" card — pops top-of-screen after you mark a salah
 * a friend nudged you for. Self-closes after 2 minutes; presets are one tap,
 * "Other" opens a validated text field (local cleanliness filter — nothing
 * hostile or unreadable reaches the nudger).
 */
export default function DuaToast() {
  const [due, setDue] = useState<{ senders: DueSender[]; prayerName: string } | null>(null);
  const [idx, setIdx] = useState(0);
  const [custom, setCustom] = useState<string | null>(null); // null = presets view, string = typing
  const [customErr, setCustomErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { play } = useUISFX();

  useEffect(() => {
    function onDue(e: Event) {
      const detail = (e as CustomEvent).detail as { senders?: DueSender[]; prayerName?: string };
      if (!detail?.senders?.length || !detail.prayerName) return;
      setDue({ senders: detail.senders, prayerName: detail.prayerName });
      setIdx(0);
      setDone(new Set());
      setCustom(null);
      setCustomErr(null);
      play("notification");
    }
    window.addEventListener("waqt:dua-due", onDue);
    return () => window.removeEventListener("waqt:dua-due", onDue);
  }, [play]);

  // Self-dismiss at 2 minutes — also re-arms if a new due arrives while open.
  useEffect(() => {
    if (!due) return;
    timer.current = setTimeout(() => setDue(null), 120_000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [due]);

  if (!due) return null;

  const remaining = due.senders.filter((s) => !done.has(s.senderId));
  if (remaining.length === 0) return null;
  const sender = remaining[Math.min(idx, remaining.length - 1)];
  const prayer = PRAYER_LABEL[due.prayerName] ?? due.prayerName;

  async function sendDua(payload: { preset: number } | { text: string }) {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/prayer-friends/dua", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: sender.senderId, prayerName: due!.prayerName, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        play("success");
        setDone((prev) => new Set(prev).add(sender.senderId));
        setCustom(null);
        setCustomErr(null);
        setIdx(0);
      } else {
        play("error");
        if (res.status === 422 && typeof payload === "object" && "text" in payload) {
          // Invalid dua: clear the field and say why, per spec.
          setCustom("");
          setCustomErr(data.error || "That's not a proper dua — write a short prayer for them.");
        } else {
          setCustomErr(data.error || "Couldn't send — try again.");
        }
      }
    } catch {
      play("error");
      setCustomErr("Network error — try again.");
    } finally {
      setSending(false);
    }
  }

  function onCustomChange(v: string) {
    if (v.length > DUA_MAX_CHARS + 40) v = v.slice(0, DUA_MAX_CHARS + 40);
    setCustom(v);
    // Live feedback: clear the error as soon as they're typing again.
    setCustomErr(null);
  }

  const customValid = custom !== null && custom.trim().length >= 2 && !validateDua(custom);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[110] flex justify-center px-3 pt-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <div
        role="dialog"
        aria-label="Make a dua"
        className="waqt-dua-in pointer-events-auto w-full max-w-sm rounded-2xl border p-3.5 shadow-2xl"
        style={{
          borderColor: "var(--color-accent)",
          backgroundColor: "var(--color-paper)",
          animation: "waqtToastIn 0.28s ease-out",
        }}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-lg leading-none" aria-hidden>🤲</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>
              {sender.name} reminded you — you prayed {prayer}.
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
              Make a dua for them.
            </p>
          </div>
          <button
            onClick={() => setDue(null)}
            aria-label="Close"
            className="rounded-full p-1.5"
            style={{ color: "var(--color-ink-muted)", minWidth: 32, minHeight: 32 }}
          >
            <X size={14} />
          </button>
        </div>

        {custom === null ? (
          <div className="mt-2.5 space-y-1.5">
            {DUA_PRESETS.map((d, i) => (
              <button
                key={i}
                disabled={sending}
                onClick={() => void sendDua({ preset: i })}
                className="w-full rounded-xl border px-3 py-2 text-left text-[12.5px] font-medium leading-snug disabled:opacity-50"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "color-mix(in oklab, var(--color-accent) 5%, transparent)", minHeight: 40 }}
              >
                {d}
              </button>
            ))}
            <button
              onClick={() => setCustom("")}
              className="w-full rounded-xl border border-dashed px-3 py-2 text-center text-[12px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 36 }}
            >
              Write your own…
            </button>
          </div>
        ) : (
          <div className="mt-2.5">
            <textarea
              autoFocus
              value={custom}
              onChange={(e) => onCustomChange(e.target.value)}
              rows={2}
              maxLength={DUA_MAX_CHARS}
              placeholder="May Allah bless them and their family…"
              className="w-full resize-none rounded-xl border px-3 py-2 text-[13px] leading-snug"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-[10.5px]" style={{ color: customErr ? "var(--color-error, #c0392b)" : "var(--color-ink-muted)" }}>
                {customErr ?? `${custom.trim().split(/\s+/).filter(Boolean).length}/25 words`}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setCustom(null); setCustomErr(null); }}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
                  style={{ color: "var(--color-ink-muted)", minHeight: 32 }}
                >
                  Back
                </button>
                <button
                  disabled={!customValid || sending}
                  onClick={() => void sendDua({ text: custom })}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: "var(--color-accent)", minHeight: 32 }}
                >
                  <Send size={12} /> Send dua
                </button>
              </div>
            </div>
          </div>
        )}

        {remaining.length > 1 && (
          <p className="mt-1.5 text-center text-[10.5px]" style={{ color: "var(--color-ink-muted)" }}>
            +{remaining.length - 1} more friend{remaining.length - 1 > 1 ? "s" : ""} after this
          </p>
        )}
      </div>
    </div>
  );
}

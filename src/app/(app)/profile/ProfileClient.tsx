"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, Swords, Camera } from "lucide-react";
import { RANKS, MATCH_WIN_PTS, MATCH_LOSS_PTS } from "@/lib/quran-rank";

/** Rank medallion — tone deepens as you climb; Shaykh carries warmth + glow. */
const BADGE_TONE: Record<string, { bg: string; ring: string; glow: boolean }> = {
  tilawa: { bg: "var(--color-ink)", ring: "transparent", glow: false },
  talib: { bg: "var(--color-ink)", ring: "color-mix(in oklab, var(--color-accent) 45%, transparent)", glow: false },
  qari: { bg: "color-mix(in oklab, var(--color-ink) 55%, var(--color-accent))", ring: "var(--color-accent)", glow: false },
  hafidh: { bg: "color-mix(in oklab, var(--color-ink) 25%, var(--color-accent))", ring: "var(--color-accent)", glow: true },
  shaykh: { bg: "var(--color-warmth)", ring: "var(--color-accent)", glow: true },
};

function RankBadge({ rank, size }: { rank: { id: string; ar: string }; size: number }) {
  const t = BADGE_TONE[rank.id] ?? BADGE_TONE.tilawa;
  const ring = Math.max(3, Math.round(size * 0.055));
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        fontFamily: "var(--font-arabic)",
        fontSize: size * 0.42,
        color: "var(--color-paper)",
        backgroundColor: t.bg,
        boxShadow:
          `0 0 0 ${ring}px var(--color-paper), 0 0 0 ${ring + 1.5}px ${t.ring === "transparent" ? "var(--color-paper-3)" : t.ring}` +
          (t.glow ? `, 0 ${size * 0.08}px ${size * 0.3}px color-mix(in oklab, ${t.bg} 45%, transparent)` : ""),
      }}
      aria-hidden="true"
    >
      {rank.ar.charAt(0)}
    </div>
  );
}

/** Client-side downscale: center-crop to a 128px webp data URL (~6KB). */
function readAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const s = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/webp", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

interface Profile {
  name: string;
  displayName: string | null;
  prayerCode: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  isHifidh: boolean;
  gender: string | null;
  quran: {
    rating: number;
    played: number;
    correct: number;
    bestStreak: number;
    rank: { id: string; en: string; ar: string; min: number; timed: boolean };
    nextRank: { en: string; ar: string; min: number } | null;
    timedLimitMs: number | null;
  };
}

export default function ProfileClient() {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState(false);
  const [barIn, setBarIn] = useState(false);
  const [ladderOpen, setLadderOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await readAvatar(file);
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      if (res.ok) setP((prev) => (prev ? { ...prev, avatarUrl: dataUrl } : prev));
    } catch { /* non-critical — avatar unchanged */ }
    finally { setAvatarBusy(false); }
  }

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setP(d);
          // Let the badge settle, then grow the progress bar.
          setTimeout(() => setBarIn(true), 250);
        } else setErr(true);
      })
      .catch(() => setErr(true));
  }, []);

  if (err) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>Couldn&rsquo;t load your profile.</p>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <div className="mx-auto h-24 w-24 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
        <div className="mx-auto mt-4 h-4 w-32 animate-pulse rounded" style={{ backgroundColor: "var(--color-paper-3)" }} />
      </div>
    );
  }

  const { quran: q } = p;
  const span = q.nextRank ? q.nextRank.min - q.rank.min : 1;
  const pct = q.nextRank ? Math.min(100, Math.round(((q.rating - q.rank.min) / span) * 100)) : 100;
  const accuracy = q.played > 0 ? Math.round((q.correct / q.played) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      {/* Identity */}
      <div className="mt-4 flex flex-col items-center text-center">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={avatarBusy}
          className="waqt-scale-in group relative block h-20 w-20 overflow-hidden rounded-full transition-opacity hover:opacity-90 disabled:opacity-60"
          aria-label="Change profile photo"
          title="Change profile photo"
        >
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, no optimization needed
            <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-2xl font-bold"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
            >
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 pb-1 pt-4 text-[8px] font-semibold uppercase tracking-wider"
            style={{ background: "linear-gradient(transparent, color-mix(in oklab, var(--color-ink) 70%, transparent))", color: "var(--color-paper)" }}
          >
            <Camera className="h-2.5 w-2.5" /> {avatarBusy ? "…" : p.avatarUrl ? "Edit" : "Photo"}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
        <h1 className="mt-3 text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>{p.name}</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Joined {new Date(p.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          {p.gender ? ` · ${p.gender === "male" ? "Male" : "Female"}` : ""}
          {p.prayerCode ? ` · ${p.prayerCode}` : ""}
        </p>
        {p.isHifidh && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
            <span style={{ fontFamily: "var(--font-arabic)" }}>حَافِظ</span> Hafidh
          </span>
        )}
      </div>

      {/* Ranked card */}
      <div
        className="waqt-fade-up mt-6 rounded-2xl border p-5"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
            Elite rank
          </p>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{q.rating} pts</span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <RankBadge rank={q.rank} size={64} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
              {q.rank.en}
              <span className="text-sm" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}>{q.rank.ar}</span>
            </p>
            {q.rank.timed && (
              <p className="mt-0.5 text-[11px] font-medium" style={{ color: "var(--color-warmth)" }}>
                Ranked — {Math.round((q.timedLimitMs ?? 0) / 1000)}s per question
              </p>
            )}
            {/* Progress to next rank */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${barIn ? pct : 0}%`,
                  backgroundColor: "var(--color-accent)",
                  transition: "width 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              {q.nextRank ? `${q.nextRank.min - q.rating} pts to ${q.nextRank.en}` : "Highest rank reached"}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Answered", value: String(q.played) },
            { label: "Accuracy", value: accuracy === null ? "—" : `${accuracy}%` },
            { label: "Best streak", value: String(q.bestStreak) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl py-3" style={{ backgroundColor: "var(--color-paper-2)" }}>
              <p className="text-base font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        <Link
          href="/quran"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <Swords className="h-4 w-4" /> Play Elite — climb the ladder
        </Link>

        {/* Ladder & scoring — tap to expand */}
        <button
          onClick={() => setLadderOpen((o) => !o)}
          className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)" }}
          aria-expanded={ladderOpen}
        >
          The ladder &amp; scoring
          <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: ladderOpen ? "rotate(180deg)" : undefined }} />
        </button>

        {ladderOpen && (
          <div className="waqt-fade-up mt-1 rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            {/* Tiers */}
            <div className="space-y-2">
              {RANKS.map((r) => {
                const isMine = r.id === q.rank.id;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg px-2.5 py-2"
                    style={{
                      backgroundColor: isMine ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                      outline: isMine ? "1px solid var(--color-accent)" : "none",
                    }}
                  >
                    <RankBadge rank={r} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {r.en} <span className="text-xs" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}>{r.ar}</span>
                      </span>
                      <span className="block text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        {r.min}+ pts{r.timed ? " · 60s per question" : ""}
                      </span>
                    </span>
                    {isMine && <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>You</span>}
                  </div>
                );
              })}
            </div>

            {/* Scoring rules */}
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>Scoring</p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                <li>Correct Elite answer: <b>+16</b>, up to <b>+8</b> more for speed.</li>
                <li>Wrong answer: <b>−half</b> the points you could have gained.</li>
                <li>Rough patch protection: 4+ wrong in a row caps each loss at <b>−2</b> until one lands right. Rating can never go below 0.</li>
                <li>Qari and above: Elite questions are timed — 60 seconds each.</li>
                <li>
                  Ranked 1v1: finish an Elite match for <b>+{MATCH_WIN_PTS}</b> on a win,
                  only <b>{MATCH_LOSS_PTS}</b> on a loss. Opponents must be your tier
                  or one directly above or below.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

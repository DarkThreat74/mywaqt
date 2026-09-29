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

export default function ProfileClient({ userId }: { userId?: string } = {}) {
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
    fetch(userId ? `/api/profile?user=${encodeURIComponent(userId)}` : "/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setP(d);
          // Let the badge settle, then grow the progress bar.
          setTimeout(() => setBarIn(true), 250);
        } else setErr(true);
      })
      .catch(() => setErr(true));
  }, [userId]);

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
  const pct = q.nextRank ? Math.min(1, (q.rating - q.rank.min) / span) : 1;
  const accuracy = q.played > 0 ? Math.round((q.correct / q.played) * 100) : null;
  // Progress ring around the medallion — circumference of r=44.
  const RING_C = 2 * Math.PI * 44;

  const avatar = (
    <>
      {p.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, no optimization needed
        <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
        >
          {p.name.charAt(0).toUpperCase()}
        </span>
      )}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10">
      <Link
        href={userId ? "/prayer?tab=friends" : "/settings"}
        className="inline-flex items-center gap-1 rounded-lg py-2 pr-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {userId ? "Friends" : "Settings"}
      </Link>

      {/* Hero — portrait on a quiet radial field, name, then meta chips */}
      <div className="relative mt-2 flex flex-col items-center pb-8 pt-6 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-44"
          style={{ background: "radial-gradient(ellipse 65% 90% at 50% 0%, color-mix(in oklab, var(--color-accent) 9%, transparent), transparent)" }}
        />
        {userId ? (
          <div
            className="waqt-scale-in h-24 w-24 overflow-hidden rounded-full"
            style={{ boxShadow: "0 0 0 4px var(--color-paper), 0 0 0 5px var(--color-paper-3)" }}
          >
            {avatar}
          </div>
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="waqt-scale-in group relative block h-24 w-24 overflow-hidden rounded-full transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ boxShadow: "0 0 0 4px var(--color-paper), 0 0 0 5px var(--color-paper-3)" }}
              aria-label="Change profile photo"
              title="Change profile photo"
            >
              {avatar}
              <span
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 pb-1.5 pt-5 text-[8px] font-semibold uppercase tracking-wider"
                style={{ background: "linear-gradient(transparent, color-mix(in oklab, var(--color-ink) 70%, transparent))", color: "var(--color-paper)" }}
              >
                <Camera className="h-2.5 w-2.5" /> {avatarBusy ? "…" : p.avatarUrl ? "Edit" : "Photo"}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          </>
        )}
        <h1 className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>{p.name}</h1>
        {p.isHifidh && (
          <span
            className="mt-1.5 text-base"
            style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}
          >
            حَافِظ
          </span>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {[
            `Since ${new Date(p.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`,
            p.gender === "male" ? "Male" : p.gender === "female" ? "Female" : null,
            p.prayerCode,
          ]
            .filter(Boolean)
            .map((m) => (
              <span
                key={m}
                className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", backgroundColor: "var(--color-paper)" }}
              >
                {m}
              </span>
            ))}
        </div>
      </div>

      {/* Rank card — medallion wears the progress ring */}
      <div
        className="waqt-fade-up rounded-2xl border px-5 pb-4 pt-5"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
            Quran ladder — AyaTrace + Mutashabih
          </p>
          <p className="text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            <span className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>{q.rating}</span> pts
          </p>
        </div>

        <div className="mt-5 flex items-center gap-5">
          {/* Medallion + progress ring */}
          <div className="relative h-[104px] w-[104px] shrink-0">
            <svg viewBox="0 0 104 104" className="absolute inset-0 -rotate-90">
              <circle cx="52" cy="52" r="44" fill="none" strokeWidth="4" style={{ stroke: "var(--color-paper-3)" }} />
              <circle
                cx="52" cy="52" r="44" fill="none" strokeWidth="4" strokeLinecap="round"
                style={{
                  stroke: "var(--color-accent)",
                  strokeDasharray: RING_C,
                  strokeDashoffset: barIn ? RING_C * (1 - pct) : RING_C,
                  transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <RankBadge rank={q.rank} size={72} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {q.rank.en}
              <span className="ml-2 align-middle text-base" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}>{q.rank.ar}</span>
            </p>
            {q.rank.timed && (
              <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--color-warmth)" }}>
                {Math.round((q.timedLimitMs ?? 0) / 1000)}s per question
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              {q.nextRank ? `${q.nextRank.min - q.rating} pts to ${q.nextRank.en}` : "The summit — nothing above."}
            </p>
          </div>
        </div>

        {/* Stats — hairline dividers, not boxes */}
        <div className="mt-6 flex divide-x border-y py-3 text-center" style={{ borderColor: "var(--color-paper-3)", ["--tw-divide-opacity" as never]: 1 }}>
          {[
            { label: "Answered", value: String(q.played) },
            { label: "Accuracy", value: accuracy === null ? "—" : `${accuracy}%` },
            { label: "Best streak", value: String(q.bestStreak) },
          ].map((s) => (
            <div key={s.label} className="flex-1 px-1" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.value}</p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 text-center">
          <Link
            href="/quran"
            className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-[var(--color-accent)]"
            style={{ color: "var(--color-ink-soft)" }}
          >
            <Swords className="h-3.5 w-3.5" /> {userId ? "Challenge in a match" : "Enter Elite"}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

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
                <li>One ladder across both games — every answer in AyaTrace and Mutashabih moves the same rating.</li>
                <li>Correct answer: <b>+16</b>, up to <b>+8</b> more for speed. Mutashabih&rsquo;s multi-pick modes pay <b>¾</b>.</li>
                <li>Wrong answer: <b>−half</b> the points you could have gained (lighter modes lose less too).</li>
                <li>Rough patch protection: 4+ wrong in a row caps each loss at <b>−2</b> until one lands right. Rating can never go below 0.</li>
                <li>Qari and above: questions are timed — 60 seconds each.</li>
                <li>
                  Ranked 1v1 (either game): finish the match for <b>+{MATCH_WIN_PTS}</b> on a win,
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

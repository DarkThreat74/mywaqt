"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, Swords } from "lucide-react";
import { RANKS, MATCH_WIN_PTS, MATCH_LOSS_PTS } from "@/lib/quran-rank";

interface Profile {
  name: string;
  displayName: string | null;
  prayerCode: string | null;
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
        <div
          className="waqt-scale-in flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold"
          style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
        >
          {p.name.charAt(0).toUpperCase()}
        </div>
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
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{
              fontFamily: "var(--font-arabic)",
              color: "var(--color-paper)",
              backgroundColor: "var(--color-ink)",
              boxShadow: "0 4px 14px color-mix(in oklab, var(--color-accent) 30%, transparent)",
            }}
          >
            {q.rank.ar.charAt(0)}
          </div>
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
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                      style={{ fontFamily: "var(--font-arabic)", color: "var(--color-paper)", backgroundColor: isMine ? "var(--color-accent)" : "var(--color-ink)" }}
                    >
                      {r.ar.charAt(0)}
                    </span>
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

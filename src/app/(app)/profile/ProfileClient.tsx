"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, Swords, Camera, Flame, Check, MapPin, Link2, EyeOff, Eye } from "lucide-react";
import { RANKS, MATCH_WIN_PTS, MATCH_LOSS_PTS } from "@/lib/quran-rank";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { readAvatarFile } from "@/lib/avatar";

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

/** Client-side downscale — shared with onboarding. */
const readAvatar = readAvatarFile;

/** What the friends API shares about a friend — gated by their privacy toggles. */
interface FriendSalah {
  id: string;
  streak: number | null;
  thisWeekPrayed: number | null;
  totalCompleteDays: number | null;
  masjidPct: number | null;
  todayVisible: boolean;
  todayLogs: Array<{ prayerName: string; status: string }>;
  sharedStreak: { streak: number; bestStreak: number } | null;
  hiddenFromLeague?: boolean;
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
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState(false);
  const [barIn, setBarIn] = useState(false);
  const [ladderOpen, setLadderOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [salah, setSalah] = useState<FriendSalah | null | undefined>(undefined);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const [unfriendBusy, setUnfriendBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function toggleLeagueHide() {
    if (!userId || !salah) return;
    const next = !salah.hiddenFromLeague;
    setSalah({ ...salah, hiddenFromLeague: next });
    const res = await fetch("/api/prayer-friends/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: userId, hiddenFromLeague: next }),
    }).catch(() => null);
    if (res?.ok) invalidateApiCache("/api/prayer-friends");
    else setSalah((prev) => (prev ? { ...prev, hiddenFromLeague: !next } : prev));
  }

  async function unfriend() {
    if (!userId || unfriendBusy) return;
    setUnfriendBusy(true);
    try {
      const res = await fetch(`/api/prayer-friends/remove?friendId=${userId}`, { method: "DELETE" });
      if (res.ok) {
        invalidateApiCache("/api/prayer-friends");
        router.push("/prayer?tab=friends");
        return;
      }
      setConfirmUnfriend(false);
    } catch { /* offline — stay put */ }
    setUnfriendBusy(false);
  }

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
    if (userId) {
      // Friend profiles get the salah card too — the friends API already
      // computes exactly what they chose to share.
      fetch("/api/prayer-friends")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: FriendSalah[]) => setSalah(rows.find((f) => f.id === userId) ?? null))
        .catch(() => {});
    }
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

      {/* Salah card — the point of the friendship. Only what they share. */}
      {userId && (
        <div
          className="waqt-fade-up mb-4 rounded-2xl border px-5 py-4"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
            Their salah
          </p>
          {salah ? (
            <div className="mt-3 space-y-3">
              <div className="flex divide-x border-y py-3 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
                {[
                  { icon: <Flame className="mx-auto h-3.5 w-3.5" style={{ color: "var(--color-warmth)" }} />, label: "Streak", value: salah.streak !== null ? `${salah.streak}d` : "—" },
                  { icon: <Check className="mx-auto h-3.5 w-3.5" style={{ color: "var(--color-success)" }} />, label: "This week", value: salah.thisWeekPrayed !== null ? String(salah.thisWeekPrayed) : "—" },
                  { icon: <Check className="mx-auto h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} />, label: "Complete days", value: salah.totalCompleteDays !== null ? String(salah.totalCompleteDays) : "—" },
                  { icon: <MapPin className="mx-auto h-3.5 w-3.5" style={{ color: "var(--color-ink-soft)" }} />, label: "Masjid", value: salah.masjidPct !== null ? `${salah.masjidPct}%` : "—" },
                ].map((s) => (
                  <div key={s.label} className="flex-1 px-1">
                    {s.icon}
                    <p className="mt-1 text-base font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.value}</p>
                    <p className="text-[9px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--color-ink-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Today's prayers */}
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-muted)" }}>Today</p>
                {salah.todayVisible ? (
                  <div className="flex items-center gap-2">
                    {["fajr", "dhuhr", "asr", "maghrib", "isha"].map((pr) => {
                      const log = salah.todayLogs.find((l) => l.prayerName === pr);
                      const prayed = log?.status === "prayed" || log?.status === "assumed_prayed";
                      const excused = log?.status === "excused";
                      const color = prayed ? "var(--color-success)" : excused ? "var(--color-accent)" : "var(--color-paper-3)";
                      return (
                        <div key={pr} className="flex flex-col items-center gap-0.5">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-[9px] font-bold uppercase"
                            style={{
                              borderColor: color,
                              backgroundColor: prayed ? color : excused ? "color-mix(in oklab, var(--color-accent) 12%, transparent)" : "transparent",
                              color: prayed ? "var(--color-paper)" : excused ? "var(--color-accent)" : "var(--color-ink-muted)",
                            }}
                            title={pr.charAt(0).toUpperCase() + pr.slice(1)}
                          >
                            {prayed ? <Check className="h-3.5 w-3.5" /> : excused ? "E" : pr.charAt(0)}
                          </span>
                        </div>
                      );
                    })}
                    <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {salah.todayLogs.filter((l) => l.status === "prayed" || l.status === "assumed_prayed").length}/5
                    </span>
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: "var(--color-ink-muted)" }}>
                    {p.name} doesn&apos;t share today&apos;s status.
                  </p>
                )}
              </div>

              {salah.sharedStreak && salah.sharedStreak.streak > 0 && (
                <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                  <Link2 className="h-3.5 w-3.5" />
                  {salah.sharedStreak.streak}-day complete-day chain together
                  {salah.sharedStreak.bestStreak > salah.sharedStreak.streak && (
                    <span style={{ color: "var(--color-ink-muted)" }}>(best {salah.sharedStreak.bestStreak})</span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {salah === undefined ? "Loading…" : "Not friends yet — salah stats appear once you're connected."}
            </p>
          )}
        </div>
      )}

      {/* League visibility — compact toggle, lives on the profile not the
          leaderboard row so cards stay clean on small screens. */}
      {userId && salah && (
        <button
          onClick={() => void toggleLeagueHide()}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          {salah.hiddenFromLeague ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {salah.hiddenFromLeague ? "Show in leaderboard" : "Hide from leaderboard"}
        </button>
      )}

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

      {/* Unfriend — quiet, tucked at the bottom. Custom confirm, never window.confirm. */}
      {userId && (
        <div className="mt-6">
          {confirmUnfriend ? (
            <div
              role="alertdialog"
              aria-label={`Unfriend ${p.name}`}
              className="waqt-fade-up rounded-2xl border p-4"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                Unfriend {p.name}?
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                You&apos;ll both stop seeing each other&apos;s salah and streaks. They&apos;ll be notified.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void unfriend()}
                  disabled={unfriendBusy}
                  className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "#b42318" }}
                >
                  {unfriendBusy ? "Removing…" : "Yes, unfriend"}
                </button>
                <button
                  onClick={() => setConfirmUnfriend(false)}
                  disabled={unfriendBusy}
                  className="flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors enabled:hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  No, keep them
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmUnfriend(true)}
              className="mx-auto block rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Remove from friends
            </button>
          )}
        </div>
      )}
    </div>
  );
}

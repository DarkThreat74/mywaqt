"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, RefreshCw, Trophy, ChevronDown, Eye, Timer, Swords } from "lucide-react";
import Link from "next/link";
import {
  SURAHS, plausibleOptions, loadCorpus, buildIndex, uniqueFragment, leaksAnswer,
  type Surah, type Verse, type CorpusIndex,
} from "@/lib/content/quran";
import MatchView from "./MatchView";
import FriendPicker from "@/components/friend-picker";
import { MatchHistory } from "@/components/match-history";
import { refreshInbox } from "@/lib/inbox";

type Difficulty = "easy" | "medium" | "advanced" | "elite";

const DIFFS: {
  id: Difficulty; label: string; arabic: string; desc: string;
  options: number; frag: "full" | "unique"; points: number;
}[] = [
  { id: "easy", label: "Easy", arabic: "سهل", desc: "Full ayah · 4 options · hints", options: 4, frag: "full", points: 50 },
  { id: "medium", label: "Medium", arabic: "متوسط", desc: "A fragment that exists nowhere else · 6 options", options: 6, frag: "unique", points: 100 },
  { id: "advanced", label: "Advanced", arabic: "متقدم", desc: "Full ayah · all 114 surahs", options: 114, frag: "full", points: 150 },
  { id: "elite", label: "Elite", arabic: "نخبة", desc: "Unique fragment · all 114 · ranked", options: 114, frag: "unique", points: 250 },
];

interface Rating {
  rating: number;
  delta: number;
  played: number;
  streak: number;
  rank: { id: string; en: string; ar: string; timed: boolean };
  nextRank: { en: string; ar: string; min: number } | null;
  timedLimitMs: number | null;
  rankedUp?: { en: string } | null;
}

interface Round {
  verse: Verse;
  verseIdx: number;   // index into corpus.verses — recorded in rating history
  fragText: string;   // arabic fragment (uthmani) or null → full ayah
  side: "start" | "end" | null;
}

async function fetchCorpus(): Promise<{ verses: Verse[]; idx: CorpusIndex }> {
  const res = await fetch("/data/quran.json");
  if (!res.ok) throw new Error("corpus");
  const verses = loadCorpus(await res.json());
  return { verses, idx: buildIndex(verses) };
}

/** Pick a verse fitting the difficulty — uniform random, leak-free,
 *  unique-fragment required for medium/elite. ~89% of verses qualify. */
function pickRound(corpus: Verse[], idx: CorpusIndex, frag: "full" | "unique"): Round | null {
  for (let i = 0; i < 80; i++) {
    const vi = Math.floor(Math.random() * corpus.length);
    const v = corpus[vi];
    if (leaksAnswer(v)) continue;
    if (frag === "full") return { verse: v, verseIdx: vi, fragText: v.w.join(" "), side: null };
    const f = uniqueFragment(v, idx);
    if (f) return { verse: v, verseIdx: vi, fragText: f.text, side: f.side };
  }
  return null;
}

const SPEED_WINDOW_S = 20; // full speed bonus under 5s, none past 25s

export default function QuranChallengeClient() {
  const [corpus, setCorpus] = useState<{ verses: Verse[]; idx: CorpusIndex } | null>(null);
  const [corpusErr, setCorpusErr] = useState(false);
  const [hifidh, setHifidh] = useState(false);
  // ?match= must be reactive — the toast accept does a client-side push to
  // this same path, and a useState-initializer read would never see it.
  const router = useRouter();
  const urlMatch = useSearchParams().get("match");
  const [matchId, setMatchId] = useState<string | null>(null);
  const activeMatchId = urlMatch ?? matchId;
  const [diff, setDiff] = useState<Difficulty | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [options, setOptions] = useState<Surah[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    try { return Number(localStorage.getItem("quran-best-streak")) || 0; } catch { return 0; }
  });
  const [score, setScore] = useState({ points: 0, rounds: 0, correct: 0 });
  const [hintsUsed, setHintsUsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rating, setRating] = useState<Rating | null>(null);
  const [deltaFlash, setDeltaFlash] = useState<{ v: number; key: number } | null>(null);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const startRef = useRef(0);
  const roundRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load the corpus once on mount — game is fully local after this.
  useEffect(() => {
    let live = true;
    fetchCorpus()
      .then((c) => { if (live) setCorpus(c); })
      .catch(() => { if (live) setCorpusErr(true); });
    fetch("/api/settings/prayer-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (live && s?.isHifidh) setHifidh(true); })
      .catch(() => {});
    fetch("/api/quran/rating")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setRating(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Elite becomes a timed mode once ranked at Qari+ — 60s per question.
  const timedMs = diff === "elite" ? rating?.timedLimitMs ?? null : null;

  // Per-question elapsed timer (score speed bonus + displayed); in timed
  // Elite, hitting the cap forfeits the question as a wrong answer.
  useEffect(() => {
    if (!round || picked !== null) return;
    startRef.current = Date.now();
    const t = setInterval(() => {
      const secs = (Date.now() - startRef.current) / 1000;
      setElapsed(secs);
      if (timedMs !== null && secs * 1000 >= timedMs) answer(-1);
    }, 250);
    return () => clearInterval(t);
  }, [round, picked, timedMs]); // eslint-disable-line react-hooks/exhaustive-deps -- answer is stable enough: it only reads round/picked guards

  const d = diff ? DIFFS.find((x) => x.id === diff)! : null;

  const nextRound = useCallback((dc: Difficulty) => {
    if (!corpus) return;
    const frag = DIFFS.find((x) => x.id === dc)!.frag;
    const id = ++roundRef.current;
    const r = pickRound(corpus.verses, corpus.idx, frag);
    if (id !== roundRef.current || !r) return;
    setPicked(null);
    setDeltaFlash(null);
    setHintsUsed(new Set());
    setQuery("");
    setListOpen(false);
    setElapsed(0);
    setRound(r);
    const answer = SURAHS[r.verse.s - 1];
    setOptions(DIFFS.find((x) => x.id === dc)!.options <= 6
      ? plausibleOptions(answer, DIFFS.find((x) => x.id === dc)!.options)
      : SURAHS);
  }, [corpus]);

  // Elite answers are ranked — the server owns the delta math. Timeout
  // forfeits arrive as n=-1, i.e. a wrong answer at the time cap.
  function postRating(correct: boolean, ms: number, verseIdx: number) {
    if (diff !== "elite") return;
    fetch("/api/quran/rating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correct, ms, verseIdx }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Rating & { offline?: boolean } | null) => {
        // Offline — the SW queued the write for sync; the synthetic 202 has
        // no rating payload, so don't overwrite the live rating with it.
        if (!d || d.offline) return;
        setRating(d);
        setDeltaFlash({ v: d.delta, key: d.played });
        if (d.rankedUp) {
          setRankUp(d.rankedUp.en);
          setTimeout(() => setRankUp(null), 4500);
        }
      })
      .catch(() => {});
  }

  function answer(n: number) {
    if (picked !== null || !round || !d) return;
    setPicked(n);
    const correct = n === round.verse.s;
    const s = correct ? streak + 1 : 0;
    setStreak(s);
    const secs = elapsed; // ticks every 250ms while unanswered — fine for scoring
    const speedBonus = Math.max(0, 1 - (secs - 5) / SPEED_WINDOW_S); // 1.0 @5s → 0 @25s
    const mult = 1 + Math.min(streak, 10) * 0.1;
    const pts = correct ? Math.round(d.points * speedBonus * mult) : 0;
    setScore((p) => ({ points: p.points + pts, rounds: p.rounds + 1, correct: p.correct + (correct ? 1 : 0) }));
    if (s > best) {
      setBest(s);
      try { localStorage.setItem("quran-best-streak", String(s)); } catch { /* ignore */ }
    }
    postRating(correct, Math.round(secs * 1000), round.verseIdx);
  }

  function guess(n: number) { answer(n); }

  const surah = round ? SURAHS[round.verse.s - 1] : null;
  const filtered = query.trim()
    ? SURAHS.filter((s) => (s.name + " " + s.english).toLowerCase().includes(query.trim().toLowerCase()))
    : SURAHS;

  const hints: { key: string; label: string; value: string }[] = round && surah
    ? [
        { key: "rev", label: "Revelation", value: round.verse.en && SURAHS[round.verse.s - 1].meccan ? "Revealed in Makkah" : "Revealed in Madinah" },
        { key: "pos", label: "Position", value: `Ayah ${round.verse.a} of ${surah.ayahs}` },
        { key: "len", label: "Length", value: surah.ayahs > 100 ? "A long surah" : surah.ayahs > 20 ? "A medium surah" : "A short surah" },
      ]
    : [];

  /* ── Loading / error states ── */
  if (corpusErr) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-16 text-center">
        <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>Couldn&rsquo;t load the Quran text — check your connection and refresh.</p>
      </div>
    );
  }
  if (!corpus) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-16">
        <p className="text-center text-3xl leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }} aria-hidden="true">تحدي القرآن</p>
        <div className="mt-8 animate-pulse space-y-3">
          <div className="h-4 w-2/3 rounded" style={{ backgroundColor: "var(--color-paper-3)" }} />
          <div className="h-4 w-1/2 rounded" style={{ backgroundColor: "var(--color-paper-3)" }} />
        </div>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading the Quran…</p>
      </div>
    );
  }

  /* ── 1v1 match mode ── */
  if (activeMatchId) {
    return (
      <MatchView
        key={activeMatchId}
        matchId={activeMatchId}
        corpus={corpus}
        onExit={() => { setMatchId(null); router.replace("/quran"); }}
      />
    );
  }

  /* ── Difficulty picker ── */
  if (!diff || !d) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-8">
        <p className="text-center text-3xl leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }} aria-hidden="true">
          تحدي القرآن
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          AyaTrace
        </h1>
        <p className="mt-1 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Which surah is this ayah from?
        </p>
        {hifidh && (
          <p className="mt-2 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
              <span style={{ fontFamily: "var(--font-arabic)" }}>حَافِظ</span> Hafidh
            </span>
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          {DIFFS.map((x) => (
            <button
              key={x.id}
              onClick={() => { setDiff(x.id); nextRound(x.id); }}
              className="flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors hover:bg-[var(--color-paper-2)] active:bg-[var(--color-paper-3)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <span>
                <span className="flex items-baseline gap-2">
                  <span className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>{x.label}</span>
                  <span className="text-sm" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}>{x.arabic}</span>
                </span>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--color-ink-muted)" }}>{x.desc}</span>
              </span>
              <span className="flex items-center gap-2">
                {x.id === "elite" && rating && (
                  <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
                    {rating.rank.en} · {rating.rating}
                  </span>
                )}
                <ChevronDown className="h-4 w-4 -rotate-90" style={{ color: "var(--color-ink-muted)" }} />
              </span>
            </button>
          ))}
        </div>
        {/* Sending a challenge no longer strands you on a waiting screen —
            the global tray card tracks it (countdown, minimize, cancel). */}
        <ChallengePanel onMatch={() => refreshInbox()} />
        <div className="mt-4"><MatchHistory /></div>
        <p className="mt-6 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          Fragments on Medium/Elite are verified unique — no other ayah in the Quran contains them.
        </p>
      </div>
    );
  }

  /* ── Game ── */
  return (
    <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-6">
      {/* Header row: difficulty + score + streak */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setDiff(null); setRound(null); setStreak(0); setScore({ points: 0, rounds: 0, correct: 0 }); }}
          className="rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          ← {d.label}
        </button>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {diff === "elite" && rating && (
            <Link
              href="/profile"
              title="Your rank — view the ladder & scoring"
              className="relative flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-accent)" }}
            >
              <span style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}>{rating.rank.ar}</span>
              <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{rating.rating}</span>
              {deltaFlash && (
                <span
                  key={deltaFlash.key}
                  className="waqt-fade-up absolute -top-6 right-0 text-sm font-bold"
                  style={{ color: deltaFlash.v >= 0 ? "var(--color-accent)" : "#dc2626" }}
                >
                  {deltaFlash.v >= 0 ? `+${deltaFlash.v}` : deltaFlash.v}
                </span>
              )}
            </Link>
          )}
          {score.rounds > 0 && <span className="font-semibold" style={{ color: "var(--color-ink)" }}>{score.points} pts</span>}
          {score.rounds > 0 && <span>{score.correct}/{score.rounds}</span>}
          <span className="flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--color-paper-3)", color: streak > 0 ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
            <Trophy className="h-3 w-3" /> {streak}{best > 0 && ` · best ${best}`}
          </span>
        </div>
      </div>

      {/* Rank-up celebration */}
      {rankUp && (
        <div
          className="waqt-scale-in mt-3 rounded-xl border px-4 py-3 text-center"
          style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, var(--color-paper))" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
            Ranked up — you are now <span className="font-bold">{rankUp}</span>
          </p>
        </div>
      )}

      {round && surah && (
        <>
          {/* The ayah — correct: accent border flash; wrong: shake + red */}
          <div
            className={`mt-5 rounded-2xl border p-5 sm:p-6 ${picked !== null && picked !== round.verse.s ? "waqt-answer-shake" : ""}`}
            style={{
              borderColor: picked === null
                ? "var(--color-paper-3)"
                : picked === round.verse.s ? "var(--color-accent)" : "#dc2626",
              borderWidth: picked !== null ? 2 : 1,
              backgroundColor: picked !== null && picked === round.verse.s
                ? "color-mix(in oklab, var(--color-accent) 5%, var(--color-paper))"
                : "var(--color-paper)",
              transition: "border-color 0.25s, background-color 0.25s",
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
                Which surah is this from?
              </p>
              {picked === null && (
                <span
                  className="flex items-center gap-1 text-[11px] tabular-nums"
                  style={{ color: timedMs !== null && elapsed * 1000 > timedMs - 10000 ? "#dc2626" : "var(--color-ink-muted)" }}
                >
                  <Timer className="h-3 w-3" />
                  {timedMs !== null ? `${Math.ceil(Math.max(0, timedMs - elapsed * 1000) / 1000)}s` : `${elapsed.toFixed(0)}s`}
                </span>
              )}
            </div>

            {/* Ranked countdown — the bar drains over the 60s window */}
            {timedMs !== null && picked === null && (
              <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, 100 - (elapsed * 1000 / timedMs) * 100)}%`,
                    backgroundColor: elapsed * 1000 > timedMs - 10000 ? "#dc2626" : "var(--color-accent)",
                    transition: "width 0.25s linear",
                  }}
                />
              </div>
            )}

            {/* Arabic — the actual challenge surface */}
            <p
              className="mt-4 leading-[2.2]"
              dir="rtl"
              lang="ar"
              style={{
                fontFamily: "var(--font-arabic)",
                color: "var(--color-ink)",
                fontSize: round.side ? "1.6rem" : "1.45rem",
              }}
            >
              {picked === null ? round.fragText : round.verse.w.join(" ")}
            </p>

            {/* English — full-ayah modes get the translation too */}
            {d.frag === "full" && (
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--color-ink-soft)", fontFamily: "var(--font-serif, Georgia, serif)" }}>
                “{round.verse.en}”
              </p>
            )}

            {picked !== null && (
              <>
                <div className="mt-4 h-px" style={{ backgroundColor: "var(--color-paper-3)" }} />
                <p className="mt-3 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                  {surah.n}. {surah.name} — {surah.english} · {surah.meccan ? "Makki" : "Madani"} · Ayah {round.verse.a}/{surah.ayahs}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-serif, Georgia, serif)" }}>
                  {round.verse.en}
                </p>
              </>
            )}
          </div>

          {/* Hints (easy only) — tap to reveal */}
          {diff === "easy" && picked === null && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hints.map((h) => (
                <button
                  key={h.key}
                  onClick={() => setHintsUsed((p) => new Set(p).add(h.key))}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: hintsUsed.has(h.key) ? "var(--color-ink)" : "var(--color-ink-muted)" }}
                >
                  {hintsUsed.has(h.key) ? h.value : <><Eye className="h-3 w-3" /> Hint: {h.label}</>}
                </button>
              ))}
            </div>
          )}

          {/* Easy/medium: option buttons */}
          {d.options <= 6 && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const isAnswer = picked !== null && o.n === round.verse.s;
                const isWrongPick = picked === o.n && o.n !== round.verse.s;
                return (
                  <button
                    key={o.n}
                    onClick={() => guess(o.n)}
                    disabled={picked !== null}
                    className="rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default enabled:hover:bg-[var(--color-paper-2)] enabled:active:bg-[var(--color-paper-3)]"
                    style={{
                      borderColor: isAnswer ? "var(--color-accent)" : "var(--color-paper-3)",
                      backgroundColor: isAnswer ? "color-mix(in oklab, var(--color-accent) 10%, var(--color-paper))" : "var(--color-paper)",
                      opacity: picked !== null && !isAnswer && !isWrongPick ? 0.5 : 1,
                    }}
                  >
                    <span className="text-sm font-semibold" style={{ color: isAnswer ? "var(--color-accent)" : isWrongPick ? "#dc2626" : "var(--color-ink)" }}>
                      {o.n}. {o.name}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--color-ink-muted)" }}>{o.english}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Advanced/elite: searchable 114-surah dropdown */}
          {d.options === 114 && (
            <div className="relative mt-4">
              <input
                ref={searchRef}
                value={query}
                disabled={picked !== null}
                onChange={(e) => { setQuery(e.target.value); setListOpen(true); }}
                onFocus={() => setListOpen(true)}
                onBlur={() => setTimeout(() => setListOpen(false), 150)}
                placeholder="Type to search — “ba” → Baqarah, Balad, Bayyinah…"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                aria-label="Search surahs"
              />
              {listOpen && picked === null && (
                <div
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border shadow-lg"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                >
                  {filtered.length === 0 && (
                    <p className="px-4 py-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>No surah matches “{query}”</p>
                  )}
                  {filtered.map((o) => (
                    <button
                      key={o.n}
                      role="option"
                      aria-selected={false}
                      onClick={() => { setListOpen(false); guess(o.n); }}
                      className="flex w-full items-baseline justify-between px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                    >
                      <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{o.n}. {o.name}</span>
                      <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{o.english}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Result + next */}
          {picked !== null && (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: picked === round.verse.s ? "var(--color-accent)" : "#dc2626" }}>
                {picked === round.verse.s ? "Correct — well done." : `Not quite — it was ${surah.name}.`}
              </p>
              <button
                onClick={() => nextRound(d.id)}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Next ayah
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-8 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
        <Sparkles className="mr-1 inline h-3 w-3" /> Uthmani text & Saheeh International · Tanzil
      </p>
    </div>
  );
}

/* ── 1v1 challenge setup ───────────────────────────────────────────── */

const ROUND_CHOICES = [3, 5, 7, 10];

function ChallengePanel({ onMatch }: { onMatch: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<{ id: string; name: string; avatarUrl?: string | null }[] | null>(null);
  const [friendId, setFriendId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [rounds, setRounds] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    setOpen((o) => !o);
    if (!friends) {
      fetch("/api/prayer-friends")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: { id: string; firstName: string | null; displayName: string | null; avatarUrl?: string | null }[]) =>
          setFriends(rows.map((f) => ({ id: f.id, name: f.firstName || f.displayName || "Friend", avatarUrl: f.avatarUrl }))),
        )
        .catch(() => setFriends([]));
    }
  }

  async function send() {
    if (!friendId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/quran/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opponentId: friendId, difficulty, rounds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "Couldn’t create the match."); return; }
      onMatch(data.matchId);
    } catch {
      setErr("Couldn’t create the match — try again.");
    } finally {
      setBusy(false);
    }
  }

  const friend = friends?.find((f) => f.id === friendId);

  return (
    <div className="mt-6 rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--color-paper-2)] rounded-2xl"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Swords className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          <span className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>1v1 a friend</span>
        </span>
        <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && (
        <div className="border-t px-5 py-4" style={{ borderColor: "var(--color-paper-3)" }}>
          {friends === null ? (
            <p className="animate-pulse text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
              No friends yet — add one in Prayer → Friends, then challenge them here.
            </p>
          ) : (
            <>
              <label className="block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }} htmlFor="match-friend">Opponent</label>
              <FriendPicker id="match-friend" friends={friends} value={friendId} onChange={setFriendId} />

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }} htmlFor="match-diff">Difficulty</label>
                  <select
                    id="match-diff"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                  >
                    {DIFFS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }} htmlFor="match-rounds">Rounds</label>
                  <select
                    id="match-rounds"
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                  >
                    {ROUND_CHOICES.map((n) => <option key={n} value={n}>Best of {n}</option>)}
                  </select>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                Best of {rounds} — {rounds === 1 ? "one question" : `${rounds} questions`}. You both get the same ayah at the same time; the first correct answer takes the round. Most round wins takes the match. Leaving mid-match forfeits (−5 rating).{friend ? ` ${friend.name} gets a notification to accept.` : ""}
              </p>

              {difficulty === "elite" && (
                <p className="mt-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, transparent)" }}>
                  Ranked — triple points at stake. Finish the whole match: winner +48, loser −6. You can only challenge ranks within one tier of yours.
                </p>
              )}

              {err && <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>{err}</p>}

              <button
                onClick={send}
                disabled={!friendId || busy}
                className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {busy ? "Sending challenge…" : "Send challenge"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

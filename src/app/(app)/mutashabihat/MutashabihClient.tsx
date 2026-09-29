"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Flame } from "lucide-react";
import { SURAHS } from "@/lib/content/quran";

// ── Dataset types (public/data/mutashabihat.json — built by
//    scripts/build-mutashabihat.ts, 100% offline) ──
interface Instance { s: number; a: number; ar: string; i0: number; i1: number }
interface Family { frag: string; instances: Instance[]; ctx?: number; curated?: boolean }

type Mode = "count" | "homes" | "ending";

const MODES: { id: Mode; en: string; ar: string; desc: string }[] = [
  { id: "count", en: "How many times?", ar: "كم مرة", desc: "A shared fragment — how many ayahs carry it?" },
  { id: "homes", en: "Every home", ar: "كل موضع", desc: "It appears N times — mark every surah." },
  { id: "ending", en: "Which ending?", ar: "أي خاتمة", desc: "Same opening, different tails — pick the one in the named surah." },
];

const surahName = (n: number) => SURAHS[n - 1]?.name ?? `#${n}`;

/** Divergent tail: up to 6 display words after the shared span. */
function tailOf(inst: Instance): string {
  const w = inst.ar.split(/\s+/).filter(Boolean);
  return w.slice(inst.i1, inst.i1 + 6).join(" ") || "—end of the ayah—";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Rating {
  rating: number; streak: number; rank: { en: string; ar: string };
}

export default function MutashabihClient() {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [fam, setFam] = useState<Family | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rating, setRating] = useState<Rating | null>(null);
  const [done, setDone] = useState(false);          // reveal phase
  const [picked, setPicked] = useState<number[]>([]); // homes-mode: found surah indexes
  const [missed, setMissed] = useState(false);
  const startedAt = useRef(0);
  const lastFrag = useRef<string | null>(null);

  useEffect(() => {
    fetch("/data/mutashabihat.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.length ? setFamilies(d) : setLoadErr(true)))
      .catch(() => setLoadErr(true));
    fetch("/api/mutashabihat/rating")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.rank) setRating(d); })
      .catch(() => {});
  }, []);

  const postRating = useCallback((correct: boolean, ms: number) => {
    fetch("/api/mutashabihat/rating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correct, ms }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.rank) setRating(d); })
      .catch(() => {});
  }, []);

  const nextRound = useCallback((m: Mode) => {
    if (!families) return;
    // Pools per mode — all capped at ≤7 occurrences by the build script.
    let pool = families;
    if (m === "ending") {
      pool = families.filter((f) => {
        const tails = new Set(f.instances.map((i) => tailOf(i)));
        return tails.size >= 2;
      });
    }
    if (m === "count") {
      // Counts 2-5 are guessable; 6-7 reserved for streak ≥5 spice.
      pool = families.filter((f) => f.instances.length <= 5);
    }
    let f = pick(pool);
    if (f.frag === lastFrag.current && pool.length > 1) f = pick(pool); // no back-to-back repeats
    lastFrag.current = f.frag;
    setFam(f);
    setDone(false);
    setPicked([]);
    setMissed(false);
    startedAt.current = Date.now();
    setRound((r) => r + 1);
  }, [families]);

  const settle = useCallback((correct: boolean, ptsWin: number, ptsLose: number) => {
    const ms = Date.now() - startedAt.current;
    setDone(true);
    if (correct) {
      setScore((s) => s + ptsWin);
      setStreak((s) => s + 1);
    } else {
      setScore((s) => s - ptsLose);
      setStreak(0);
    }
    postRating(correct, ms);
  }, [postRating]);

  if (loadErr) {
    return <Shell><p className="py-16 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>Couldn&rsquo;t load the mutashabihat set. Reconnect once and it caches for offline.</p></Shell>;
  }
  if (!families) {
    return <Shell><div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} /></div></Shell>;
  }

  /* ── Mode picker ── */
  if (!mode || !fam) {
    return (
      <Shell>
        <div className="mt-6 space-y-3">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); nextRound(m.id); }}
              className="waqt-fade-up flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition-colors hover:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animationDelay: `${i * 60}ms` }}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{m.en}</span>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--color-ink-muted)" }}>{m.desc}</span>
              </span>
              <span className="shrink-0 text-lg" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}>{m.ar}</span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          Only fragments that repeat 2–7 times in the Quran — the ones a hafiz can actually hold.
        </p>
      </Shell>
    );
  }

  /* ── Round ── */
  const n = fam.instances.length;
  const target = fam.instances[round % n]; // ending mode target cycles

  return (
    <Shell>
      {/* Status row */}
      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setMode(null)} className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
          ← Modes
        </button>
        <div className="flex items-center gap-3 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
          {rating && <span>{rating.rank.en} · {rating.rating}</span>}
          <span className="flex items-center gap-1"><Flame className="h-3 w-3" style={{ color: "var(--color-warmth)" }} />{streak}</span>
          <span className="font-semibold" style={{ color: "var(--color-ink)" }}>{score}</span>
        </div>
      </div>

      {/* The shared fragment */}
      <div className="mt-6 rounded-2xl border p-5 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
          {MODES.find((m) => m.id === mode)!.en}
        </p>
        <p dir="rtl" className="mt-3 text-2xl leading-loose" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink)" }}>
          …{fam.frag}…
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {mode === "count" && "How many ayahs in the Quran carry this fragment?"}
          {mode === "homes" && `This fragment appears in ${n} places — mark every surah. (${picked.length}/${new Set(fam.instances.map((i) => i.s)).size})`}
          {mode === "ending" && `Which continuation belongs to ${surahName(target.s)}?`}
        </p>
      </div>

      {/* Options */}
      <div className="mt-4">
        {mode === "count" && !done && (
          <CountOptions key={round} n={n} onPick={(c) => settle(c === n, 10, 5)} />
        )}
        {mode === "homes" && !done && (
          <HomesOptions
            key={round}
            fam={fam}
            picked={picked}
            onPick={(s) => {
              // A family can hold two instances in one surah — marking the
              // surah covers all of them, or the round could never complete.
              const idxs = fam.instances.map((i, ix) => (i.s === s ? ix : -1)).filter((ix) => ix >= 0 && !picked.includes(ix));
              if (idxs.length > 0) {
                const np = [...picked, ...idxs];
                setPicked(np);
                const done_ = new Set(np.map((i) => fam.instances[i].s)).size === new Set(fam.instances.map((i) => i.s)).size;
                if (done_) settle(true, 8 + n * 4, 0);
              } else {
                setMissed(true);
                settle(false, 0, 8);
              }
            }}
          />
        )}
        {mode === "ending" && !done && (
          <EndingOptions
            key={round}
            fam={fam}
            onPick={(t) => settle(t === tailOf(target), 12, 6)}
          />
        )}
        {done && <NextButton onNext={() => nextRound(mode)} />}
      </div>

      {/* Reveal — every instance, shared span lit, tails diverging */}
      {done && <FamilyReveal fam={fam} missed={missed} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-2">
      <div className="flex items-center justify-between">
        <Link href="/quran" className="inline-flex items-center gap-1 rounded-lg py-2 pr-2 text-xs font-medium hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }}>
          <ChevronLeft className="h-3.5 w-3.5" /> AyaTrace
        </Link>
      </div>
      <div className="mt-2 text-center">
        <p className="text-lg" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}>مُتَشَابِه</p>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Mutashabih</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>The verses that look alike — train the difference.</p>
      </div>
      {children}
    </div>
  );
}

function CountOptions({ n, onPick }: { n: number; onPick: (c: number) => void }) {
  const [opts] = useState(() => {
    const s = new Set<number>([n]);
    while (s.size < Math.min(4, 6)) s.add(2 + Math.floor(Math.random() * 6));
    return shuffle([...s]);
  });
  return (
    <div className="grid grid-cols-4 gap-2">
      {opts.map((c) => (
        <button key={c} onClick={() => onPick(c)}
          className="rounded-xl border py-4 text-xl font-bold tabular-nums transition-colors hover:border-[var(--color-accent)]"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}>
          {c}
        </button>
      ))}
    </div>
  );
}

function HomesOptions({ fam, picked, onPick }: { fam: Family; picked: number[]; onPick: (s: number) => void }) {
  const [opts] = useState(() => {
    const real = [...new Set(fam.instances.map((i) => i.s))];
    const distract = new Set<number>();
    while (distract.size < Math.max(4, real.length * 2)) {
      const s = 1 + Math.floor(Math.random() * 114);
      if (!real.includes(s)) distract.add(s);
    }
    return shuffle([...real, ...distract]);
  });
  const foundSurahs = picked.map((i) => fam.instances[i].s);
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((s) => {
        const found = foundSurahs.includes(s);
        return (
          <button key={s} onClick={() => onPick(s)} disabled={found}
            className="rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              borderColor: found ? "var(--color-success)" : "var(--color-paper-3)",
              backgroundColor: found ? "color-mix(in oklab, var(--color-success) 10%, var(--color-paper))" : "var(--color-paper)",
              color: "var(--color-ink)",
            }}>
            {surahName(s)} {found && "✓"}
          </button>
        );
      })}
    </div>
  );
}

function EndingOptions({ fam, onPick }: { fam: Family; onPick: (t: string) => void }) {
  const [opts] = useState(() => shuffle([...new Set(fam.instances.map(tailOf))]));
  return (
    <div className="space-y-2">
      {opts.map((t) => (
        <button key={t} onClick={() => onPick(t)}
          className="w-full rounded-xl border px-4 py-3 text-right text-lg leading-loose transition-colors hover:border-[var(--color-accent)]"
          dir="rtl"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", fontFamily: "var(--font-arabic)" }}>
          …{t}
        </button>
      ))}
    </div>
  );
}

function NextButton({ onNext }: { onNext: () => void }) {
  return (
    <button onClick={onNext}
      className="mt-2 w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
      style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
      Next fragment →
    </button>
  );
}

/** Post-answer reveal: every instance rendered with the shared span lit in
 *  accent and the divergent remainder in warmth — the difference is the lesson. */
function FamilyReveal({ fam, missed }: { fam: Family; missed: boolean }) {
  return (
    <div className="waqt-fade-up mt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
        {missed ? "Missed — here's every home" : `Every home — ${fam.instances.length} places`}
      </p>
      <div className="mt-2 space-y-2">
        {fam.instances.map((inst, ix) => {
          const w = inst.ar.split(/\s+/).filter(Boolean);
          return (
            <div key={ix} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                {surahName(inst.s)} · {inst.a}
              </p>
              <p dir="rtl" className="text-base leading-loose" style={{ fontFamily: "var(--font-arabic)" }}>
                {w.map((word, wi) => (
                  <span
                    key={wi}
                    style={{
                      color: wi >= inst.i0 && wi < inst.i1
                        ? "var(--color-accent)"
                        : "color-mix(in oklab, var(--color-ink) 70%, var(--color-warmth))",
                    }}
                  >
                    {word}{" "}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
        Accent = the shared fragment · warm ink = what differs.
      </p>
    </div>
  );
}

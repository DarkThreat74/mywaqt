"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { redirect } from "next/navigation";
import { Swords, Timer } from "lucide-react";
import {
  SURAHS, uniqueFragment,
  type Surah, type Verse, type CorpusIndex,
} from "@/lib/content/quran";

interface MatchState {
  status: "pending" | "active" | "done" | "declined" | "expired";
  game: string;
  inviteExpiresAt: string | null;
  role: "creator" | "opponent";
  difficulty: "easy" | "medium" | "advanced" | "elite";
  totalRounds: number;
  opponentName: string;
  myWins: number;
  oppWins: number;
  roundsPlayed: number;
  youWin: boolean | null;
  ratingDelta: number | null;
  round: {
    n: number; verseIdx: number | null; started: boolean; startedAt: string | null;
    meReady: boolean; oppReady: boolean; meAnswered: boolean; oppAnswered: boolean;
    options: number[] | null;
  } | null;
  lastResult: {
    n: number; won: boolean | null; winnerId: string | null; verseIdx: number;
    meMs: number | null; oppMs: number | null; meCorrect: boolean | null; oppCorrect: boolean | null;
  } | null;
}

const DIFF_LABEL: Record<string, string> = { easy: "Easy", medium: "Medium", advanced: "Advanced", elite: "Elite" };
const POLL_MS = 1400;
const RESULT_PAUSE_MS = 3200;

export default function MatchView({
  matchId, corpus, onExit,
}: {
  matchId: string;
  corpus: { verses: Verse[]; idx: CorpusIndex };
  onExit: () => void;
}) {
  const [st, setSt] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [options, setOptions] = useState<Surah[]>([]);
  const [verse, setVerse] = useState<Verse | null>(null);
  const [frag, setFrag] = useState<{ text: string; side: "start" | "end" } | null>(null);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [result, setResult] = useState<MatchState["lastResult"]>(null);
  const shownAtRef = useRef(0);
  const sentRef = useRef<{ ready: number | null; answered: number | null }>({ ready: null, answered: null });
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fragMode = st?.difficulty === "medium" || st?.difficulty === "elite" ? "unique" : "full";
  const optCount = st?.difficulty === "easy" ? 4 : st?.difficulty === "medium" ? 6 : 114;

  /* ── Poll loop ── */
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/quran/match/${matchId}/state`, { cache: "no-store" });
      if (!res.ok) { setErr("Match unavailable."); return; }
      const s: MatchState = await res.json();
      setSt(s);
    } catch { /* keep polling — transient blips are fine */ }
  }, [matchId]);

  useEffect(() => {
    let live = true;
    async function first() {
      try {
        const res = await fetch(`/api/quran/match/${matchId}/state`, { cache: "no-store" });
        if (!res.ok) { if (live) setErr("Match unavailable."); return; }
        const s: MatchState = await res.json();
        if (live) setSt(s);
      } catch { /* interval retries */ }
    }
    void first();
    const t = setInterval(() => { if (!document.hidden) void poll(); }, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [matchId, poll]);

  /* ── Ready / round transitions driven by polled state ── */
  useEffect(() => {
    if (!st || st.status !== "active" || !st.round) return;
    const r = st.round;

    // Waiting for a result pause? Don't act until it clears.
    if (result) return;

    if (!r.meReady && sentRef.current.ready !== r.n) {
      sentRef.current.ready = r.n;
      fetch(`/api/quran/match/${matchId}/ready`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round: r.n }),
      })
        // ANY failure — network or a rejected status — must clear the flag,
        // otherwise we never retry and the round resolves without us.
        .then((res) => { if (!res.ok) sentRef.current.ready = null; })
        .catch(() => { sentRef.current.ready = null; });
      return;
    }

    // Round just started — materialize the verse + server-provided options.
    // (≤6-option modes must wait for the option list, never fall back to 114.)
    if (r.started && r.verseIdx !== null && sentRef.current.answered !== r.n && picked === null && !verse
        && !(optCount <= 6 && !r.options)) {
      const v = corpus.verses[r.verseIdx];
      setVerse(v);
      setFrag(fragMode === "unique" ? uniqueFragment(v, corpus.idx) : null);
      setOptions(r.options ? r.options.map((n) => SURAHS[n - 1]) : SURAHS);
      shownAtRef.current = Date.now();
    }
  }, [st, result, verse, picked, corpus, fragMode, optCount, matchId]);

  // Show the result when the state reports the round resolved — detect via lastResult.n
  useEffect(() => {
    if (!st?.lastResult || result) return;
    const lr = st.lastResult;
    // Only flash it once — after meAnswered or when waiting, the newest resolved round
    if (sentRef.current.answered === lr.n || (st.round && st.round.n > lr.n)) {
      setResult(lr);
      resultTimer.current = setTimeout(() => {
        setResult(null);
        setVerse(null);
        setPicked(null);
        setQuery("");
        void poll(); // pull the next round immediately
      }, RESULT_PAUSE_MS);
    }
  }, [st, result, poll]);

  useEffect(() => () => { if (resultTimer.current) clearTimeout(resultTimer.current); }, []);

  // 1s tick drives the pending-invite countdown on both sides.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (st?.status !== "pending") return;
    setNowTick(Date.now()); // eslint-disable-line react-hooks/set-state-in-effect -- seed the countdown clock
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [st?.status]);

  const inviteSecs = st?.inviteExpiresAt
    ? Math.max(0, Math.ceil((new Date(st.inviteExpiresAt).getTime() - nowTick) / 1000))
    : null;
  const inviteClock = inviteSecs === null ? null
    : `${Math.floor(inviteSecs / 60)}:${String(inviteSecs % 60).padStart(2, "0")}`;

  async function respond(accept: boolean) {
    try {
      const res = await fetch(`/api/quran/match/${matchId}/respond`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (res.ok) void poll();
      else onExit(); // match already gone — leave
    } catch { /* next poll refetches */ }
  }

  function guess(n: number) {
    if (picked !== null || !verse || !st?.round) return;
    setPicked(n);
    const correct = n === verse.s;
    // eslint-disable-next-line react-hooks/purity -- event handler: measuring answer latency is the point
    const ms = Math.round(Date.now() - shownAtRef.current);
    sentRef.current.answered = st.round.n;
    fetch(`/api/quran/match/${matchId}/answer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: st.round.n, correct, ms }),
    }).catch(() => {});
  }

  const filtered = query.trim()
    ? SURAHS.filter((s) => (s.name + " " + s.english).toLowerCase().includes(query.trim().toLowerCase()))
    : SURAHS;

  /* ── Render ── */
  // Wrong page — a Mutashabih invite that landed here hands off. Below all
  // hooks so the throw can't short-circuit hook order.
  if (st?.game === "mutashabih") redirect(`/mutashabihat?match=${matchId}`);

  if (err || !st) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-16 text-center">
        <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>{err ?? "Loading match…"}</p>
        <button onClick={onExit} className="mt-4 text-sm font-medium" style={{ color: "var(--color-accent)" }}>Back to solo</button>
      </div>
    );
  }

  if (st.status === "pending") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-16 text-center">
        <Swords className="mx-auto h-8 w-8" style={{ color: "var(--color-accent)" }} />
        {st.role === "opponent" ? (
          <>
            <h2 className="mt-4 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
              {st.opponentName} challenges you
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {DIFF_LABEL[st.difficulty]} · best of {st.totalRounds}
            </p>
            {st.difficulty === "elite" && (
              <p className="mt-1.5 text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>
                Ranked — finish the match: winner +48, loser −6
              </p>
            )}
            {inviteClock && (
              <p className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                Expires in {inviteClock}
              </p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => void respond(true)}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                Accept
              </button>
              <button
                onClick={() => void respond(false)}
                className="rounded-xl border px-5 py-2.5 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
              >
                Decline
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Challenge sent</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              Waiting for {st.opponentName}&rsquo;s reply — {DIFF_LABEL[st.difficulty]}, best of {st.totalRounds}.
            </p>
            {inviteClock && (
              <p className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                Closes in {inviteClock}
              </p>
            )}
            <button onClick={onExit} className="mt-6 text-sm font-medium" style={{ color: "var(--color-ink-muted)" }}>Leave</button>
          </>
        )}
      </div>
    );
  }

  if (st.status === "declined" || st.status === "expired") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-16 text-center">
        <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
          {st.status === "expired"
            ? "The challenge expired — send a new one."
            : `${st.opponentName} declined the match.`}
        </p>
        <button onClick={onExit} className="mt-4 text-sm font-medium" style={{ color: "var(--color-accent)" }}>Back</button>
      </div>
    );
  }

  const meWon = st.youWin === true;
  const draw = st.status === "done" && st.youWin === false && st.myWins === st.oppWins;

  return (
    <div className="mx-auto w-full max-w-lg px-4 lg:max-w-none lg:px-10 py-6">
      {/* Scoreboard */}
      <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>You</span>
        <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>
          {st.myWins}<span className="mx-2 text-sm font-normal" style={{ color: "var(--color-ink-muted)" }}>—</span>{st.oppWins}
        </span>
        <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{st.opponentName}</span>
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
        {DIFF_LABEL[st.difficulty]} · Round {st.round?.n ?? st.totalRounds}/{st.totalRounds}
      </p>

      {/* Done */}
      {st.status === "done" && (
        <div className="mt-6 rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-4xl">{meWon ? "🏆" : draw ? "🤝" : "🕌"}</p>
          <h2 className="mt-3 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
            {meWon ? "You win!" : draw ? "A draw — honorable match" : `${st.opponentName} takes it`}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>{st.myWins} — {st.oppWins} over {st.roundsPlayed} round{st.roundsPlayed === 1 ? "" : "s"}</p>
          {st.ratingDelta !== null && (
            <p className="waqt-scale-in mt-3">
              <span
                className="inline-block rounded-full border px-3 py-1 text-xs font-bold tabular-nums"
                style={{
                  borderColor: st.ratingDelta > 0 ? "var(--color-accent)" : "#dc2626",
                  color: st.ratingDelta > 0 ? "var(--color-accent)" : "#dc2626",
                  backgroundColor: st.ratingDelta > 0 ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "color-mix(in oklab, #dc2626 6%, transparent)",
                }}
              >
                Ranked {st.ratingDelta > 0 ? `+${st.ratingDelta}` : st.ratingDelta} pts
              </span>
            </p>
          )}
          <button onClick={onExit} className="mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: "var(--color-accent)" }}>
            Back to AyaTrace
          </button>
        </div>
      )}

      {/* Result flash between rounds */}
      {result && st.status === "active" && (() => {
        const won = result.won === true;
        const drawR = result.won === null;
        return (
          <div className="mt-6 rounded-2xl border p-6 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-lg font-semibold" style={{ color: won ? "var(--color-accent)" : drawR ? "var(--color-ink-muted)" : "#dc2626" }}>
              {won ? "Your round!" : drawR ? "No one got it" : `${st.opponentName} got there first`}
            </p>
            <p className="mt-2 text-sm tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
              you {result.meMs !== null ? `${(result.meMs / 1000).toFixed(1)}s ${result.meCorrect ? "✓" : "✗"}` : "—"} · {st.opponentName} {result.oppMs !== null ? `${(result.oppMs / 1000).toFixed(1)}s ${result.oppCorrect ? "✓" : "✗"}` : "—"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {SURAHS[corpus.verses[result.verseIdx].s - 1].name} {corpus.verses[result.verseIdx].s}:{corpus.verses[result.verseIdx].a}
            </p>
          </div>
        );
      })()}

      {/* Waiting — opponent hasn't readied, or round starting */}
      {st.status === "active" && !result && st.round && !verse && (
        <div className="mt-6 animate-pulse rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
            {st.round.started
              ? `Round ${st.round.n} — get ready…`
              : `Round ${st.round.n} — waiting for ${st.opponentName}…`}
          </p>
        </div>
      )}

      {/* Live round */}
      {st.status === "active" && !result && verse && st.round?.started && (
        <>
          <div
            className={`mt-5 rounded-2xl border p-5 sm:p-6 ${picked !== null && picked !== verse.s ? "waqt-answer-shake" : ""}`}
            style={{
              borderColor: picked === null
                ? "var(--color-paper-3)"
                : picked === verse.s ? "var(--color-accent)" : "#dc2626",
              borderWidth: picked !== null ? 2 : 1,
              backgroundColor: picked !== null && picked === verse.s
                ? "color-mix(in oklab, var(--color-accent) 5%, var(--color-paper))"
                : "var(--color-paper)",
              transition: "border-color 0.25s, background-color 0.25s",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
              First to answer wins
            </p>
            <p className="mt-4 leading-[2.2]" dir="rtl" lang="ar"
              style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink)", fontSize: frag && picked === null ? "1.6rem" : "1.45rem" }}>
              {picked === null ? (frag ? frag.text : verse.w.join(" ")) : verse.w.join(" ")}
            </p>
            {(fragMode === "full" || picked !== null) && (
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--color-ink-soft)", fontFamily: "var(--font-serif, Georgia, serif)" }}>
                “{verse.en}”
              </p>
            )}
          </div>

          {/* Answered → waiting on opponent */}
          {picked !== null ? (
            <div className="mt-4 animate-pulse rounded-xl border p-4 text-center text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
              <Timer className="mr-1 inline h-3.5 w-3.5" /> Waiting for {st.opponentName}&rsquo;s answer…
            </div>
          ) : optCount <= 6 ? (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((o) => (
                <button
                  key={o.n}
                  onClick={() => guess(o.n)}
                  className="rounded-xl border px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)] active:bg-[var(--color-paper-3)]"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{o.n}. {o.name}</span>
                  <span className="block text-xs" style={{ color: "var(--color-ink-muted)" }}>{o.english}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="relative mt-4">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setListOpen(true); }}
                onFocus={() => setListOpen(true)}
                onBlur={() => setTimeout(() => setListOpen(false), 150)}
                placeholder="Type to search — “ba” → Baqarah, Balad, Bayyinah…"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                aria-label="Search surahs"
              />
              {listOpen && (
                <div role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border shadow-lg"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                  {filtered.length === 0 && <p className="px-4 py-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>No match</p>}
                  {filtered.map((o) => (
                    <button key={o.n} role="option" aria-selected={false}
                      onClick={() => { setListOpen(false); guess(o.n); }}
                      className="flex w-full items-baseline justify-between px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-paper-2)]">
                      <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{o.n}. {o.name}</span>
                      <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{o.english}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

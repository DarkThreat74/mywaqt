"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { redirect } from "next/navigation";
import { Swords, Timer } from "lucide-react";
import { SURAHS } from "@/lib/content/quran";
import {
  tailOf, distinctSurahs,
  type MutashabihFamily, type MutashabihMode,
} from "@/lib/mutashabih";
import { CountOptions, HomesOptions, EndingOptions, FamilyReveal } from "./MutashabihClient";

interface MatchState {
  status: "pending" | "active" | "done" | "declined" | "expired";
  game: string;
  inviteExpiresAt: string | null;
  role: "creator" | "opponent";
  difficulty: string;
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
    mode: MutashabihMode | null; target: number | null; frag: string | null;
  } | null;
  lastResult: {
    n: number; won: boolean | null; winnerId: string | null; verseIdx: number;
    meMs: number | null; oppMs: number | null; meCorrect: boolean | null; oppCorrect: boolean | null;
  } | null;
}

const MODE_LABEL: Record<MutashabihMode, string> = {
  count: "How many times?",
  homes: "Every home",
  ending: "Which ending?",
};

const POLL_MS = 1400;
const RESULT_PAUSE_MS = 4200; // a beat longer than AyaTrace — the family reveal is worth reading

export default function MutashabihMatchView({
  matchId, families, onExit,
}: {
  matchId: string;
  families: MutashabihFamily[];
  onExit: () => void;
}) {
  const [st, setSt] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fam, setFam] = useState<MutashabihFamily | null>(null);
  const [answered, setAnswered] = useState<"correct" | "wrong" | null>(null);
  const [homesPicked, setHomesPicked] = useState<number[]>([]);
  const [result, setResult] = useState<MatchState["lastResult"]>(null);
  const [matRound, setMatRound] = useState<number | null>(null); // round # the shown family belongs to
  const [shownAt, setShownAt] = useState(0);
  const sentRef = useRef<{ ready: number | null; answered: number | null }>({ ready: null, answered: null });
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Poll loop ── */
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/quran/match/${matchId}/state`, { cache: "no-store" });
      if (!res.ok) { setErr("Match unavailable."); return; }
      setSt(await res.json());
    } catch { /* keep polling — transient blips are fine */ }
  }, [matchId]);

  useEffect(() => {
    let live = true;
    async function first() {
      try {
        const res = await fetch(`/api/quran/match/${matchId}/state`, { cache: "no-store" });
        if (!res.ok) { if (live) setErr("Match unavailable."); return; }
        if (live) setSt(await res.json());
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
    if (result) return; // result pause — don't advance until it clears

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
    }
  }, [st, result, matchId]);

  // Round materialization — adjust-state-during-render: when the poll brings
  // a new started round, materialize its family. verseIdx is the family index
  // for mutashabih matches.
  const liveRound = st?.status === "active" && !result ? st.round : null;
  if (
    liveRound?.started && liveRound.verseIdx !== null
    && !liveRound.meAnswered
    && matRound !== liveRound.n
  ) {
    const f = families[liveRound.verseIdx];
    // Stale cached dataset → family indexes diverge from the server's. Fail
    // loudly rather than playing (and judging) the wrong question.
    if (!f) {
      setErr("Your mutashabihat data is out of date — reconnect once, then rejoin the match.");
    } else if (liveRound.frag && f.frag !== liveRound.frag) {
      setErr("Your mutashabihat data is out of date — reconnect once, then rejoin the match.");
    } else {
      setMatRound(liveRound.n);
      setFam(f);
      setAnswered(null);
      setHomesPicked([]);
      setShownAt(Date.now()); // eslint-disable-line react-hooks/purity -- measuring answer latency is the point
    }
  }

  // Result flash once the round resolves.
  useEffect(() => {
    if (!st?.lastResult || result) return;
    const lr = st.lastResult;
    if (sentRef.current.answered === lr.n || (st.round && st.round.n > lr.n)) {
      setResult(lr);
      resultTimer.current = setTimeout(() => {
        setResult(null);
        setFam(null);
        setAnswered(null);
        setHomesPicked([]);
        setMatRound(null);
        void poll();
      }, RESULT_PAUSE_MS);
    }
  }, [st, result, poll]);

  useEffect(() => () => { if (resultTimer.current) clearTimeout(resultTimer.current); }, []);

  // 1s tick drives the pending-invite countdown.
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
      else onExit();
    } catch { /* next poll refetches */ }
  }

  function submit(correct: boolean) {
    if (!st?.round || sentRef.current.answered === st.round.n) return;
    setAnswered(correct ? "correct" : "wrong");
    try { navigator.vibrate?.(correct ? 15 : [50, 40, 50]); } catch { /* unsupported */ }
    const ms = Math.round(Date.now() - shownAt);
    sentRef.current.answered = st.round.n;
    fetch(`/api/quran/match/${matchId}/answer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: st.round.n, correct, ms }),
    }).catch(() => {});
  }

  // Wrong page — an AyaTrace invite that landed here hands off to /quran.
  // Below all hooks so the throw can't short-circuit hook order.
  if (st?.game === "trace") redirect(`/quran?match=${matchId}`);

  const surahName = (n: number) => SURAHS[n - 1]?.name ?? `#${n}`;
  const mode = st?.round?.mode ?? null;
  const target = mode === "ending" && fam && st?.round?.target !== null && st?.round?.target !== undefined
    ? fam.instances[st.round.target]
    : null;

  /* ── Render ── */
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
              Mutashabih · best of {st.totalRounds} — modes cycle each round
            </p>
            <p className="mt-1.5 text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>
              Ranked — shared ladder. Finish the match: winner +48, loser −6
            </p>
            {inviteClock && (
              <p className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>Expires in {inviteClock}</p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => void respond(true)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: "var(--color-accent)" }}>Accept</button>
              <button onClick={() => void respond(false)} className="rounded-xl border px-5 py-2.5 text-sm font-medium" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>Decline</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Challenge sent</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              Waiting for {st.opponentName}&rsquo;s reply — Mutashabih, best of {st.totalRounds}.
            </p>
            {inviteClock && (
              <p className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>Closes in {inviteClock}</p>
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
          {st.status === "expired" ? "The challenge expired — send a new one." : `${st.opponentName} declined the match.`}
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
        Mutashabih · {mode ? MODE_LABEL[mode] + " · " : ""}Round {st.round?.n ?? st.totalRounds}/{st.totalRounds}
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
            Back to Mutashabih
          </button>
        </div>
      )}

      {/* Result flash between rounds — verdict + the family it was on */}
      {result && st.status === "active" && (() => {
        const won = result.won === true;
        const drawR = result.won === null;
        const rf = families[result.verseIdx];
        return (
          <div className="mt-6">
            <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-lg font-semibold" style={{ color: won ? "var(--color-accent)" : drawR ? "var(--color-ink-muted)" : "#dc2626" }}>
                {won ? "Your round!" : drawR ? "No one got it" : `${st.opponentName} got there first`}
              </p>
              <p className="mt-2 text-sm tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                you {result.meMs !== null ? `${(result.meMs / 1000).toFixed(1)}s ${result.meCorrect ? "✓" : "✗"}` : "—"} · {st.opponentName} {result.oppMs !== null ? `${(result.oppMs / 1000).toFixed(1)}s ${result.oppCorrect ? "✓" : "✗"}` : "—"}
              </p>
            </div>
            {rf && <FamilyReveal fam={rf} missed={!result.meCorrect} />}
          </div>
        );
      })()}

      {/* Waiting */}
      {st.status === "active" && !result && st.round && !fam && (
        <div className="mt-6 animate-pulse rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
            {st.round.started ? `Round ${st.round.n} — get ready…` : `Round ${st.round.n} — waiting for ${st.opponentName}…`}
          </p>
        </div>
      )}

      {/* Live round */}
      {st.status === "active" && !result && fam && st.round?.started && (
        <>
          <div
            className={`mt-5 rounded-2xl border p-5 text-center ${answered === "wrong" ? "waqt-answer-shake" : ""}`}
            style={{
              borderColor: answered === "correct" ? "var(--color-success)" : answered === "wrong" ? "var(--color-error, #dc2626)" : "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              transition: "border-color 0.25s",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
              {mode ? MODE_LABEL[mode] : ""} — first to answer wins
            </p>
            <p dir="rtl" className="mt-3 text-2xl leading-loose" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink)" }}>
              …{fam.frag}…
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {mode === "count" && "How many ayahs in the Quran carry this fragment?"}
              {mode === "homes" && `Appears in ${distinctSurahs(fam)} surahs — mark them all. (${new Set(homesPicked.map((i) => fam.instances[i].s)).size}/${distinctSurahs(fam)})`}
              {mode === "ending" && target && `Which continuation belongs to ${surahName(target.s)}?`}
            </p>
          </div>

          {answered !== null ? (
            <div className="mt-4 animate-pulse rounded-xl border p-4 text-center text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
              <Timer className="mr-1 inline h-3.5 w-3.5" /> Waiting for {st.opponentName}&rsquo;s answer…
            </div>
          ) : mode === "count" ? (
            <div className="mt-4">
              <CountOptions key={st.round.n} n={fam.instances.length} onPick={(c) => submit(c === fam.instances.length)} />
            </div>
          ) : mode === "homes" ? (
            <div className="mt-4">
              <HomesOptions
                key={st.round.n}
                fam={fam}
                picked={homesPicked}
                onPick={(s) => {
                  const idxs = fam.instances.map((i, ix) => (i.s === s ? ix : -1)).filter((ix) => ix >= 0 && !homesPicked.includes(ix));
                  if (idxs.length > 0) {
                    const np = [...homesPicked, ...idxs];
                    setHomesPicked(np);
                    if (new Set(np.map((i) => fam.instances[i].s)).size === distinctSurahs(fam)) submit(true);
                  } else {
                    submit(false);
                  }
                }}
              />
            </div>
          ) : mode === "ending" && target ? (
            <div className="mt-4">
              <EndingOptions key={st.round.n} fam={fam} onPick={(t) => submit(t === tailOf(target))} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

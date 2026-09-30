"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronRight, Check, X, Minus, Trophy } from "lucide-react";
import { matchMode, type MutashabihFamily } from "@/lib/mutashabih";
import { SURAHS, loadCorpus, type Verse } from "@/lib/content/quran";

/* Chess.com-style history for the shared Quran ladder: 1v1 matches with a
   per-round replay, plus solo ranked days/answers. Datasets load lazily on
   first open — both are public SW-cached JSON. */

type MatchRound = {
  n: number;
  verseIdx: number;
  winnerId: string | null;
  meCorrect: boolean | null;
  meMs: number | null;
  oppCorrect: boolean | null;
  oppMs: number | null;
};

type MatchRow = {
  id: string;
  game: string;
  difficulty: string;
  totalRounds: number;
  endReason: string;
  iSurrendered: boolean;
  winnerId: string | null;
  youWin: boolean | null;
  endedAt: string;
  opponent: { id: string; name: string; avatarUrl: string | null };
  myDelta: number | null;
  myRatingAfter: number | null;
  rounds: MatchRound[];
};

type SoloEvent = {
  id: string;
  game: string;
  verseIdx: number | null;
  mode: string | null;
  correct: boolean | null;
  ms: number | null;
  delta: number;
  ratingAfter: number;
  createdAt: string;
};

type HistoryData = {
  matches: MatchRow[];
  solo: { days: { day: string; delta: number; played: number; correct: number }[]; events: SoloEvent[] };
};

const MODE_LABEL: Record<string, string> = { count: "How many times", homes: "Every home", ending: "Which ending" };

const fmtMs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function MatchHistory() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"matches" | "solo">("matches");
  const [data, setData] = useState<HistoryData | null>(null);
  const [verses, setVerses] = useState<Verse[] | null>(null);
  const [families, setFamilies] = useState<MutashabihFamily[] | null>(null);
  const [err, setErr] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  /** Question text for a stored index — trace corpus ayah or mutashabih family. */
  function questionFor(game: string, verseIdx: number | null): React.ReactNode {
    if (verseIdx === null) return "—";
    if (game === "mutashabih") {
      const f = families?.[verseIdx];
      if (!f) return "Mutashabih fragment";
      return `“${f.frag}” — ${f.instances.length} occurrences`;
    }
    const v = verses?.[verseIdx];
    if (!v) return "Ayah";
    return `${SURAHS[v.s - 1]?.name ?? v.s} ${v.s}:${v.a} — ${v.w.slice(0, 8).join(" ")}…`;
  }

  function toggle() {
    setOpen((o) => {
      if (!o && !data) {
        fetch("/api/quran/history")
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d: HistoryData) => {
            setData(d);
            const needTrace = d.matches.some((m) => m.game !== "mutashabih") || d.solo.events.some((e) => e.game !== "mutashabih");
            const needMuta = d.matches.some((m) => m.game === "mutashabih") || d.solo.events.some((e) => e.game === "mutashabih");
            if (needTrace) {
              fetch("/data/quran.json").then((r) => r.json()).then((raw) => setVerses(loadCorpus(raw))).catch(() => {});
            }
            if (needMuta) {
              fetch("/data/mutashabihat.json").then((r) => r.json()).then(setFamilies).catch(() => {});
            }
          })
          .catch(() => setErr(true));
      }
      return !o;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--color-paper-2)]"
      >
        <History className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
        <span className="flex-1 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          Match history
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }}>
          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-3">
            {([["matches", "1v1 matches"], ["solo", "Ranked solo"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  color: tab === k ? "var(--color-paper)" : "var(--color-ink-muted)",
                  backgroundColor: tab === k ? "var(--color-ink)" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="px-4 pb-4 pt-2">
            {err && <p className="py-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>Couldn&apos;t load history.</p>}
            {!err && !data && <p className="py-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>}

            {data && tab === "matches" && (
              data.matches.length === 0 ? (
                <p className="py-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
                  No finished matches yet — challenge a friend above.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.matches.map((m) => (
                    <MatchCard key={m.id} m={m} expanded={expanded === m.id} onToggle={() => setExpanded((e) => (e === m.id ? null : m.id))} questionFor={questionFor} />
                  ))}
                </div>
              )
            )}

            {data && tab === "solo" && (
              data.solo.events.length === 0 ? (
                <p className="py-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
                  No ranked answers yet — play Elite to climb the ladder.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Day rollups */}
                  <div className="flex flex-col gap-1.5">
                    {data.solo.days.slice(0, 14).map((d) => (
                      <div key={d.day} className="flex items-center gap-3 text-sm">
                        <span className="w-16 shrink-0 text-xs" style={{ color: "var(--color-ink-muted)" }}>{d.day}</span>
                        <span className="text-xs tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
                          {d.correct}/{d.played}
                        </span>
                        <Delta v={d.delta} />
                      </div>
                    ))}
                  </div>
                  {/* Recent answers */}
                  <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                      Recent answers
                    </p>
                    {data.solo.events.slice(0, 25).map((e) => (
                      <div key={e.id} className="flex items-start gap-3 text-sm">
                        <span
                          className="mt-0.5 flex shrink-0 items-center justify-center rounded-full"
                          style={{
                            width: 18,
                            height: 18,
                            backgroundColor: e.correct ? "color-mix(in oklab, var(--color-success) 15%, transparent)" : "color-mix(in oklab, #b42318 12%, transparent)",
                            color: e.correct ? "var(--color-success)" : "#b42318",
                          }}
                        >
                          {e.correct ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs" style={{ color: "var(--color-ink)" }}>
                            {e.game === "mutashabih" && e.mode ? `${MODE_LABEL[e.mode] ?? e.mode} — ` : ""}
                            {questionFor(e.game, e.verseIdx)}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                            {fmtMs(e.ms)} · now {e.ratingAfter}
                          </p>
                        </div>
                        <Delta v={e.delta} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>±0</span>;
  return (
    <span className="text-xs font-semibold tabular-nums" style={{ color: v > 0 ? "var(--color-success)" : "#b42318" }}>
      {v > 0 ? `+${v}` : v}
    </span>
  );
}

function MatchCard({
  m, expanded, onToggle, questionFor,
}: {
  m: MatchRow;
  expanded: boolean;
  onToggle: () => void;
  questionFor: (game: string, verseIdx: number | null) => React.ReactNode;
}) {
  const myWins = m.rounds.filter((r) => r.winnerId !== null && r.winnerId !== m.opponent.id).length;
  const oppWins = m.rounds.filter((r) => r.winnerId === m.opponent.id).length;
  const played = m.rounds.filter((r) => r.meCorrect !== null || r.oppCorrect !== null).length;

  const result = m.endReason === "abandoned" ? { t: "Abandoned", c: "var(--color-ink-muted)" }
    : m.endReason === "aborted" ? { t: m.iSurrendered ? "Aborted by you" : "They aborted", c: "var(--color-ink-muted)" }
    : m.youWin === null ? { t: "Draw", c: "var(--color-ink-soft)" }
    : m.youWin ? { t: "Won", c: "var(--color-success)" }
    : { t: "Lost", c: "#b42318" };

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-paper-3)" }}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]">
        {m.opponent.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL avatar
          <img src={m.opponent.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "var(--color-accent)" }}>
            {m.opponent.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            {m.opponent.name}
            <span className="ml-2 text-[10px] font-normal uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              {m.game === "mutashabih" ? "Mutashabih" : "AyaTrace"} · {m.difficulty}
            </span>
          </p>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {fmtDay(m.endedAt)} · {myWins}–{oppWins}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium" style={{ color: result.c }}>{result.t}</span>
        {m.myDelta !== null ? <Delta v={m.myDelta} /> : <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>–</span>}
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--color-ink-muted)", transform: expanded ? "rotate(90deg)" : "none" }} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t px-3.5 py-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
          {played === 0 && (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>No rounds were played.</p>
          )}
          {m.rounds.slice(0, played).map((r) => {
            const iWon = r.winnerId !== null && r.winnerId !== m.opponent.id;
            const oppWon = r.winnerId === m.opponent.id;
            return (
              <div key={r.n} className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                    Round {r.n}{m.game === "mutashabih" ? ` · ${MODE_LABEL[matchMode(r.n)] ?? matchMode(r.n)}` : ""}
                  </span>
                  {(iWon || oppWon) && <Trophy className="h-3 w-3" style={{ color: iWon ? "var(--color-success)" : "var(--color-ink-muted)" }} />}
                  <span className="ml-auto text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    {r.winnerId === null ? "draw" : iWon ? "you took it" : "they took it"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed" dir="auto" style={{ color: "var(--color-ink)" }}>
                  {questionFor(m.game, r.verseIdx)}
                </p>
                <div className="mt-1.5 flex gap-4 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  <RoundSide label="You" correct={r.meCorrect} ms={r.meMs} />
                  <RoundSide label={m.opponent.name} correct={r.oppCorrect} ms={r.oppMs} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoundSide({ label, correct, ms }: { label: string; correct: boolean | null; ms: number | null }) {
  return (
    <span className="flex items-center gap-1">
      {correct === null ? <Minus className="h-3 w-3" /> : correct ? <Check className="h-3 w-3" style={{ color: "var(--color-success)" }} /> : <X className="h-3 w-3" style={{ color: "#b42318" }} />}
      {label} · {fmtMs(ms)}
    </span>
  );
}

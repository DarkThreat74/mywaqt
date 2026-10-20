"use client";

import { useState } from "react";
import type { Report } from "../engine/analyze";
import type { DeepGrade, WordSpan, WordVerdict } from "../engine/deepGrade";
import { nextRungs, type LadderRow } from "../engine/ladder";
import type { CompareResult } from "../engine/align";
import type { PitchFrame } from "../live/pitch";
import { SURAHS } from "@/lib/content/quran";

// Teacher-shaped report: composite score, then the recitation itself —
// each matched āyah rendered word-by-word with its verdicts, elongations,
// and a click-to-inspect pitch view. Axes carry a measured value plus a
// plain-language "why" so a number never stands alone.

const KIND_LABEL: Record<string, string> = {
  possible_omission: "missed word",
  possible_substitution: "wrong word",
  possible_vowel: "vowel slip",
  possible_repetition: "repetition",
  possible_skipped_ayah: "skipped āyah",
  unclear_ayah: "unclear āyah",
};

const STAGE_TICKS = [160, 320, 480, 640, 800];

function noteOf(hz: number): string {
  if (hz <= 0) return "—";
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function stageOf(score: number) {
  return score >= 800 ? "Muqrin-adjacent" : score >= 640 ? "Mubdiʿ" : score >= 480 ? "Mujawwid"
    : score >= 320 ? "Mutamakkin" : score >= 160 ? "Muntasil" : "Ṭālib";
}

const clsName = (cls?: string) => cls === "lazim" ? "lāzim" : cls === "jaiz" ? "jāʾiz" : "madd";
const minH = (cls?: string) => cls === "lazim" ? 5.5 : cls === "jaiz" ? 3.5 : 1.5;

function verdictOf(verdicts: WordVerdict[], w: { surah: number; ayah: number; word: number; wordIndex: number }) {
  return verdicts.find((v) =>
    v.wordIndex === w.wordIndex ||
    (v.surah === w.surah && v.ayah === w.ayah && v.word === w.word));
}
const verdictBad = (v?: WordVerdict | null) =>
  !!v && (!!v.slip || (v.vowelErrors?.length ?? 0) > 0 || (v.state != null && v.state !== "heard" && v.state !== "ok"));

// Tiny pitch sparkline for a word/span — voiced frames inside the window,
// log-scaled, with the reached notes labelled. This is "show me my pitch
// over there" made literal.
function SpanPitch({ frames, t0, t1 }: { frames: PitchFrame[]; t0: number; t1: number }) {
  const v = frames.filter((f) => f.t >= t0 - 0.05 && f.t <= t1 + 0.05 && f.voiced && f.hz > 0);
  if (v.length < 2) return <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>no pitch data in this span</p>;
  const lo = Math.min(...v.map((f) => f.hz)), hi = Math.max(...v.map((f) => f.hz));
  const med = v.map((f) => f.hz).sort((a, b) => a - b)[v.length >> 1];
  const W = 260, H = 56, pad = 4;
  const loL = Math.log2(lo * 0.9), hiL = Math.log2(hi * 1.1);
  const x = (t: number) => pad + ((t - v[0].t) / Math.max(0.01, v[v.length - 1].t - v[0].t)) * (W - pad * 2);
  const y = (hz: number) => H - pad - ((Math.log2(hz) - loL) / (hiL - loL || 1)) * (H - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
        <polyline
          points={v.map((f) => `${x(f.t).toFixed(1)},${y(f.hz).toFixed(1)}`).join(" ")}
          fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinejoin="round"
        />
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
        <span>{noteOf(lo)} {Math.round(lo)}Hz</span>
        <span style={{ color: "var(--color-ink)" }}>median {noteOf(med)} {Math.round(med)}Hz</span>
        <span>{noteOf(hi)} {Math.round(hi)}Hz</span>
      </div>
    </div>
  );
}

export default function ReportCard({ report, deep, ladder, recT0, cmp, frames, verseText }: {
  report: Report; deep?: DeepGrade | null; ladder?: LadderRow[] | null; recT0?: number;
  cmp?: CompareResult | null; frames?: PitchFrame[] | null;
  verseText?: (s: number, a: number) => string | undefined;
}) {
  const [sel, setSel] = useState<WordSpan | null>(null);

  // Classify each substantial pause: aligned with a heard saktah mark →
  // "saktah"; breathy → "breath"; otherwise a clean stop. Pause `start` is
  // AudioContext time; saktah positions are PCM ms — recT0 bridges them.
  const pauses = report.pauses
    .filter((p) => p.dur >= 0.5)
    .map((p) => {
      const ms = (p.start - (recT0 ?? 0)) * 1000;
      const saktah = deep?.saktahs?.some((s) => Math.abs(s - ms) < 400 || (s > ms && s < ms + p.dur * 1000));
      return { dur: p.dur, kind: saktah ? "saktah" : p.breathy ? "breath" : "stop" as const };
    });

  const band = stageOf(report.score);

  // The āyah-by-āyah view is the report's centerpiece — it must render
  // whenever the engine produced ANY word-level data. Prefer measured
  // spans (timing + madds); fall back to bare verdicts so the breakdown
  // never disappears when tracker-trail internals are missing.
  const displayWords: WordSpan[] = deep?.words?.length
    ? deep.words
    : (deep?.wordVerdicts ?? [])
        .filter((v) => v.surah != null && v.ayah != null && v.word != null)
        .map((v) => ({
          surah: v.surah!, ayah: v.ayah!, word: v.word!, wordIndex: v.wordIndex,
          startSec: 0, endSec: 0, heard: "", madds: [], ghunnahMs: 0,
        }));

  // Group measured words by āyah, in recitation order.
  const ayahGroups: { s: number; a: number; words: WordSpan[] }[] = [];
  for (const w of displayWords) {
    const g = ayahGroups[ayahGroups.length - 1];
    if (g && g.s === w.surah && g.a === w.ayah) g.words.push(w);
    else ayahGroups.push({ s: w.surah, a: w.ayah, words: [w] });
  }

  return (
    <div className="px-5 pb-8">
      {/* hero — stage + composite + stage-ticked bar */}
      <div className="rounded-2xl border p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "#0E1116" }}>
        <p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>{band}</p>
        <div className="mt-1 flex items-end justify-between">
          <p className="font-serif text-4xl tabular-nums" style={{ color: "#e7e9ec" }}>
            {report.score}<span className="text-base" style={{ color: "var(--color-ink-muted)" }}>/1000</span>
          </p>
          <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            {Math.round(report.durationSec)}s · {Math.round(report.voicedRatio * 100)}% voiced
          </p>
        </div>
        <div className="relative mt-3 h-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${report.score / 10}%`, background: "linear-gradient(90deg,#4ade80,#fbbf24)" }} />
          {STAGE_TICKS.map((t) => (
            <div key={t} className="absolute inset-y-0 w-px" style={{ left: `${t / 10}%`, backgroundColor: "rgba(255,255,255,0.25)" }} />
          ))}
        </div>
      </div>

      {/* the recitation itself — every matched āyah, word by word. Tap a
          word for its pitch span, elongations, and what the engine heard. */}
      {deep && ayahGroups.length > 0 && (
        <>
          <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Word by word · tap any word
          </h2>
          <div className="space-y-3">
            {ayahGroups.map((g) => {
              const text = verseText?.(g.s, g.a);
              const textWords = text?.split(/\s+/).filter(Boolean) ?? [];
              const gIssues = deep.issues.filter((i) => i.surah === g.s && i.ayah === g.a);
              return (
                <div key={`${g.s}:${g.a}`} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11px] font-medium" style={{ color: "var(--color-ink)" }}>
                      {SURAHS[g.s - 1]?.name ?? `Surah ${g.s}`} · {g.s}:{g.a}
                    </p>
                    <p className="text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {g.words.filter((w) => !verdictBad(verdictOf(deep.wordVerdicts, w))).length}/{g.words.length} clean
                    </p>
                  </div>

                  {/* the āyah — words tinted by verdict, tap to inspect */}
                  <p dir="rtl" className="mt-2 leading-[2.1]" style={{ fontFamily: "var(--font-arabic)", fontSize: "1.25rem" }}>
                    {textWords.length
                      ? textWords.map((tw, i) => {
                          const gw = g.words.find((w) => w.word === i + 1);
                          const v = gw ? verdictOf(deep.wordVerdicts, gw) : undefined;
                          const bad = verdictBad(v);
                          const isSel = sel === gw;
                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={!gw}
                              onClick={() => setSel(isSel ? null : gw!)}
                              className="rounded px-0.5 transition-colors"
                              style={{
                                fontFamily: "inherit", fontSize: "inherit",
                                color: bad ? "#f87171" : "var(--color-ink)",
                                backgroundColor: isSel ? "color-mix(in oklab, var(--color-accent) 20%, transparent)" : "transparent",
                                textDecoration: bad ? "underline dotted" : "none",
                              }}
                            >
                              {tw}{" "}
                            </button>
                          );
                        })
                      // No mushaf text loaded — numbered words still inspectable.
                      : g.words.map((w) => {
                          const v = verdictOf(deep.wordVerdicts, w);
                          const bad = verdictBad(v);
                          return (
                            <button
                              key={w.wordIndex}
                              type="button"
                              onClick={() => setSel(sel === w ? null : w)}
                              className="rounded px-1.5 py-0.5 text-[11px] tabular-nums"
                              style={{
                                fontFamily: "var(--font-sans)",
                                color: bad ? "#f87171" : "var(--color-ink-muted)",
                                backgroundColor: sel === w ? "color-mix(in oklab, var(--color-accent) 20%, transparent)" : "var(--color-paper-2)",
                                margin: "0 2px",
                              }}
                            >
                              {w.word}
                            </button>
                          );
                        })}
                  </p>

                  {/* issues anchored to this āyah */}
                  {gIssues.length > 0 && (
                    <ul className="mt-2 space-y-1" dir="ltr">
                      {gIssues.map((it, i) => (
                        <li key={i} className="flex items-center gap-2 text-[11px]" style={{ color: "#f87171" }}>
                          <span aria-hidden>⚑</span>
                          word {it.word} — {KIND_LABEL[it.kind] ?? it.kind}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* selected word — pitch across its span + the measured detail */}
          {sel && (() => {
            const v = verdictOf(deep.wordVerdicts, sel);
            const issues = deep.issues.filter((i) => i.surah === sel.surah && i.ayah === sel.ayah && i.word === sel.word);
            return (
              <div className="mt-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 5%, transparent)" }}>
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>
                    {sel.surah}:{sel.ayah} · word {sel.word}
                  </p>
                  {(sel.endSec > sel.startSec || sel.heard) && (
                    <p className="text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {sel.startSec.toFixed(1)}–{sel.endSec.toFixed(1)}s · heard “{sel.heard}”
                    </p>
                  )}
                </div>
                {frames && sel.endSec > sel.startSec && (
                  <div className="mt-2">
                    <SpanPitch frames={frames} t0={(recT0 ?? 0) + sel.startSec} t1={(recT0 ?? 0) + sel.endSec} />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {sel.madds.map((m, i) => {
                    const short = m.haraka != null && m.haraka < minH(m.cls);
                    return (
                      <span key={i} className="rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                        style={{ backgroundColor: short ? "#f8717122" : "var(--color-paper-3)", color: short ? "#f87171" : "var(--color-ink-muted)" }}
                        title={`${clsName(m.cls)} · ${m.ms.toFixed(0)}ms`}>
                        {clsName(m.cls)} {m.haraka != null ? `${m.haraka.toFixed(1)}ḥ` : `${m.ms.toFixed(0)}ms`}{short ? " short" : ""}
                      </span>
                    );
                  })}
                  {sel.ghunnahMs > 0 && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                      style={{ backgroundColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                      ghunnah {sel.ghunnahMs.toFixed(0)}ms
                    </span>
                  )}
                  {v && (
                    <span className="rounded px-1.5 py-0.5 text-[10px]"
                      style={{ backgroundColor: verdictBad(v) ? "#f8717122" : "#4ade8022", color: verdictBad(v) ? "#f87171" : "#4ade80" }}>
                      {v.state ?? "heard"}{v.gop != null ? ` · gop ${v.gop.toFixed(2)}` : ""}{v.slip ? " · slip" : ""}
                      {v.vowelErrors?.length ? ` · ${v.vowelErrors.length} vowel` : ""}
                    </span>
                  )}
                  {issues.map((it, i) => (
                    <span key={i} className="rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "#f8717122", color: "#f87171" }}>
                      {KIND_LABEL[it.kind] ?? it.kind}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* no word-level data at all — say so plainly instead of a blank gap */}
      {deep && ayahGroups.length === 0 && (
        <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            The engine couldn&rsquo;t place any words in this take{deep.verses.length ? ` — nearest match ${deep.verses.join(", ")}` : ""}.
          </p>
        </div>
      )}

      {/* madd/ghunnah roll-up when there was no per-word detail */}
      {deep && !deep.words?.length && (deep.madds.length > 0 || deep.ghunnahs.length > 0) && (
        <div className="mt-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <div className="flex gap-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {deep.madds.length > 0 && (
              <span>{deep.madds.length} elongation{deep.madds.length === 1 ? "" : "s"} · longest {(Math.max(...deep.madds.map(m => m.ms)) / 1000).toFixed(1)}s</span>
            )}
            {deep.ghunnahs.length > 0 && (
              <span>{deep.ghunnahs.length} nasal hold{deep.ghunnahs.length === 1 ? "" : "s"} · avg {(deep.ghunnahs.reduce((s, g) => s + g.ms, 0) / deep.ghunnahs.length).toFixed(0)}ms</span>
            )}
          </div>
        </div>
      )}

      {/* vs reference — localized diffs lead, not a bare number */}
      {cmp && (
        <>
          <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>vs the reference</h2>
          <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-baseline justify-between">
              <p className="font-serif text-xl tabular-nums" style={{ color: "var(--color-ink)" }}>
                {Math.round(cmp.match)}<span className="text-sm" style={{ color: "var(--color-ink-muted)" }}>% shape match</span>
              </p>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {cmp.meanCents.toFixed(0)}¢ mean gap · tempo ×{cmp.tempoRatio.toFixed(2)}
              </p>
            </div>
            {cmp.divergences.length > 0 && (
              <ul className="mt-2 space-y-1">
                {cmp.divergences.map((d, i) => (
                  <li key={i} className="flex justify-between text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    <span>at {d.tSec.toFixed(1)}s for {d.durSec.toFixed(1)}s</span>
                    <span style={{ color: d.centsOff < 0 ? "#f87171" : "var(--color-accent)" }}>
                      {d.centsOff > 0 ? "+" : ""}{Math.round(d.centsOff)}¢ {d.centsOff > 0 ? "higher" : "lower"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* stops — pauses classified by evidence */}
      {pauses.length > 0 && (
        <>
          <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Stops</h2>
          <div className="flex flex-wrap gap-1.5">
            {pauses.map((p, i) => (
              <span
                key={i}
                className="rounded-full border px-2.5 py-1 text-[11px] tabular-nums"
                style={{
                  borderColor: "var(--color-paper-3)",
                  color: p.kind === "breath" ? "var(--color-accent)" : "var(--color-ink-muted)",
                }}
              >
                {p.dur.toFixed(1)}s {p.kind}
              </span>
            ))}
          </div>
        </>
      )}

      {/* axes — each score carries its measurement AND the plain-language
          reason, so "why is it like this" is answered inline */}
      <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>The breakdown</h2>
      <div className="space-y-2.5">
        {report.axes.map((a) => (
          <div key={a.key} className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-baseline justify-between text-xs">
              <span style={{ color: "var(--color-ink)" }}>{a.label}</span>
              <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{a.value}<span style={{ opacity: 0.55 }}>/100</span></span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${a.value}%`,
                  backgroundColor: a.value >= 75 ? "#4ade80" : a.value >= 45 ? "var(--color-accent)" : "#f87171",
                }}
              />
            </div>
            <p className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{a.note}</p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink)", opacity: 0.8 }}>{a.why}</p>
          </div>
        ))}
      </div>

      {/* ladder — position vs own history; next rungs ranked by gap */}
      {ladder && ladder.length > 0 && (
        <>
          <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Your ladder</h2>
          <ul className="space-y-1.5">
            {ladder.map((r) => (
              <li
                key={r.key}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: "var(--color-paper-3)" }}
              >
                <span className="capitalize" style={{ color: "var(--color-ink)" }}>{r.key}</span>
                <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {r.stage}
                  {r.delta != null && r.delta !== 0 && (
                    <span style={{ color: r.delta > 0 ? "#4ade80" : "#f87171" }}>
                      {" "}{r.delta > 0 ? "+" : ""}{r.delta.toFixed(0)}
                    </span>
                  )}
                  {r.toNext > 0 && <span> · {r.toNext.toFixed(0)} to next</span>}
                </span>
              </li>
            ))}
          </ul>
          {(() => {
            const rungs = nextRungs(ladder);
            return rungs.length > 0 ? (
              <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                Nearest rung: {rungs[0].key} — {rungs[0].toNext.toFixed(0)} points to the next stage.
              </p>
            ) : null;
          })()}
        </>
      )}

      {/* session stats */}
      <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Session</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [`${report.phrases.length}`, "phrases"],
          [`${report.pauses.length}`, "pauses"],
          [`${report.pitch.medianHz.toFixed(0)} Hz`, "median pitch"],
          [
            `${noteOf(report.pitch.medianHz * Math.pow(2, report.pitch.rangeCents[0] / 1200))}–${noteOf(report.pitch.medianHz * Math.pow(2, report.pitch.rangeCents[1] / 1200))}`,
            "pitch reached",
          ],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg border px-2 py-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-sm font-medium tabular-nums" style={{ color: "var(--color-ink)" }}>{v}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-muted)" }}>{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

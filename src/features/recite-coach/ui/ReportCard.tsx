"use client";

import type { Report } from "../engine/analyze";
import type { DeepGrade } from "../engine/deepGrade";
import { nextRungs, type LadderRow } from "../engine/ladder";
import type { CompareResult } from "../engine/align";

// Teacher-shaped report: composite + three tiers, fix-list, then the
// evidence sections. Bars are the primary encoding (mobile comprehension),
// never a radar. Tier weights mirror the rubric: Law 400, Craft 350, Mind 250.

const KIND_LABEL: Record<string, string> = {
  possible_omission: "possible omission",
  possible_substitution: "possible substitution",
  possible_vowel: "possible vowel slip",
  possible_repetition: "possible repetition",
  possible_skipped_ayah: "possibly skipped āyah",
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

function TierBar({ label, sub, value, max, note }: { label: string; sub: string; value: number | null; max: number; note?: string }) {
  const pct = value == null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium" style={{ color: "var(--color-ink)" }}>{label}</p>
        <p className="text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
          {value == null ? "—" : Math.round(value)}<span style={{ opacity: 0.6 }}>/{max}</span>
        </p>
      </div>
      <p className="text-[10px]" style={{ color: "var(--color-ink-muted)", opacity: 0.8 }}>{sub}</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: value == null ? "var(--color-paper-3)" : pct >= 75 ? "#4ade80" : pct >= 45 ? "var(--color-accent)" : "#f87171" }} />
      </div>
      {note && <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{note}</p>}
    </div>
  );
}

export default function ReportCard({ report, deep, ladder, recT0, cmp }: { report: Report; deep?: DeepGrade | null; ladder?: LadderRow[] | null; recT0?: number; cmp?: CompareResult | null }) {
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

  // ---- tiers ----
  const axisVal = (k: string) => report.axes.find((a) => a.key === k)?.value ?? 0;
  const craft = ((axisVal("pitch") + axisVal("range") + axisVal("vibrato") + axisVal("cadence") + axisVal("ghunnah")) / 5) * 3.5;
  const mind = ((axisVal("tempo") + axisVal("breath")) / 2) * 2.5;
  const maddShort = deep?.madds.filter((m) => m.haraka != null && m.haraka < (m.cls === "lazim" ? 5.5 : m.cls === "jaiz" ? 3.5 : 1.5)).length ?? 0;
  const law = deep ? Math.max(0, 400 - deep.issues.length * 40 - maddShort * 15) : null;
  const band = stageOf(report.score);

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

      {/* three tiers */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TierBar label="Law" sub="tajwīd" value={law} max={400}
          note={law == null ? "engine off" : deep!.issues.length ? `${deep!.issues.length} flags` : "clean"} />
        <TierBar label="Craft" sub="harmony" value={craft} max={350} />
        <TierBar label="Mind" sub="structure" value={mind} max={250} />
      </div>

      {/* fix list */}
      <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Work on first</h2>
      <ol className="space-y-2">
        {report.fixes.map((f, i) => (
          <li key={i} className="flex gap-2.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
            <span className="tabular-nums" style={{ color: "var(--color-accent)" }}>{i + 1}</span>{f}
          </li>
        ))}
      </ol>

      {/* tajwīd law tier — only when the engine deep-graded the audio */}
      {deep && (
        <>
          <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Correctness</h2>
          {(deep.madds.length > 0 || deep.ghunnahs.length > 0) && (
            <div className="mb-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <div className="flex gap-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {deep.madds.length > 0 && (
                  <span>
                    {deep.madds.length} elongation{deep.madds.length === 1 ? "" : "s"} ·
                    longest {(Math.max(...deep.madds.map(m => m.ms)) / 1000).toFixed(1)}s
                  </span>
                )}
                {deep.ghunnahs.length > 0 && (
                  <span>
                    {deep.ghunnahs.length} nasal hold{deep.ghunnahs.length === 1 ? "" : "s"} ·
                    avg {(deep.ghunnahs.reduce((s, g) => s + g.ms, 0) / deep.ghunnahs.length).toFixed(0)}ms
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {deep.madds.slice(0, 20).map((m, i) => {
                  const minH = m.cls === "lazim" ? 5.5 : m.cls === "jaiz" ? 3.5 : 1.5;
                  const short = m.haraka != null && m.haraka < minH;
                  const clsLabel = m.cls === "lazim" ? "lāzim" : m.cls === "jaiz" ? "jāʾiz" : "madd";
                  return (
                    <span
                      key={i}
                      className="rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                      style={{
                        backgroundColor: short ? "#f8717122" : "var(--color-paper-3)",
                        color: short ? "#f87171" : "var(--color-ink-muted)",
                      }}
                      title={`${clsLabel} · ${(m.ms / 1000).toFixed(2)}s`}
                    >
                      {m.haraka != null ? `${m.haraka.toFixed(1)}ḥ` : `${(m.ms / 1000).toFixed(1)}s`}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {/* word-for-word verdicts — every word the tracker graded */}
          {deep.wordVerdicts.length > 0 && (
            <div className="mb-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Word for word · {deep.wordVerdicts.filter((w) => !w.slip && !(w.vowelErrors?.length)).length}/{deep.wordVerdicts.length} clean
              </p>
              <div className="flex flex-wrap gap-1">
                {deep.wordVerdicts.slice(0, 60).map((w, i) => {
                  const bad = w.slip || (w.vowelErrors?.length ?? 0) > 0 || (w.state && w.state !== "heard" && w.state !== "ok");
                  const loc = w.surah && w.ayah ? `${w.surah}:${w.ayah}` : "";
                  return (
                    <span
                      key={i}
                      className="rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                      style={{
                        backgroundColor: bad ? "#f8717122" : "var(--color-paper-3)",
                        color: bad ? "#f87171" : "var(--color-ink-muted)",
                      }}
                      title={`${loc}${w.word ? ` w${w.word}` : ""}${w.state ? ` · ${w.state}` : ""}${w.gop != null ? ` · gop ${w.gop.toFixed(2)}` : ""}${w.vowelErrors?.length ? ` · ${w.vowelErrors.length} vowel err` : ""}`}
                    >
                      w{w.wordIndex + 1}{bad ? " ⚑" : ""}
                    </span>
                  );
                })}
                {deep.wordVerdicts.length > 60 && (
                  <span className="px-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    +{deep.wordVerdicts.length - 60}
                  </span>
                )}
              </div>
            </div>
          )}
          {deep.issues.length === 0 ? (
            <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-sm" style={{ color: "var(--color-ink)" }}>
                No issues detected{deep.verses.length ? ` — ${deep.verses.length} verse${deep.verses.length === 1 ? "" : "s"} matched` : ""}.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {deep.issues.slice(0, 12).map((it, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--color-paper-3)" }}
                >
                  <span style={{ color: "var(--color-ink)" }}>{it.surah}:{it.ayah}</span>
                  <span className="text-xs" style={{ color: "#f87171" }}>{KIND_LABEL[it.kind] ?? it.kind}</span>
                </li>
              ))}
              {deep.issues.length > 12 && (
                <li className="text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  +{deep.issues.length - 12} more
                </li>
              )}
            </ul>
          )}
        </>
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

      {/* axes */}
      <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>The breakdown</h2>
      <div className="space-y-2.5">
        {report.axes.map((a) => (
          <div key={a.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span style={{ color: "var(--color-ink)" }}>{a.label}</span>
              <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{a.value}</span>
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
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{a.note}</p>
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

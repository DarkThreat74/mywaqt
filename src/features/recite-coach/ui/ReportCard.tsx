"use client";

import type { Report } from "../engine/analyze";
import type { DeepGrade } from "../engine/deepGrade";
import { nextRungs, type LadderRow } from "../engine/ladder";

// Teacher-shaped report: fix-list on top, axis bars in the middle, session
// stats at the bottom. Bars are the primary encoding (mobile comprehension),
// never a radar.

const KIND_LABEL: Record<string, string> = {
  possible_omission: "possible omission",
  possible_substitution: "possible substitution",
  possible_vowel: "possible vowel slip",
  possible_repetition: "possible repetition",
  possible_skipped_ayah: "possibly skipped āyah",
  unclear_ayah: "unclear āyah",
};

export default function ReportCard({ report, deep, ladder }: { report: Report; deep?: DeepGrade | null; ladder?: LadderRow[] | null }) {
  const band = report.score >= 800 ? "Muqrin-adjacent" : report.score >= 640 ? "Mubdiʿ" : report.score >= 480 ? "Mujawwid" : report.score >= 320 ? "Mutamakkin" : report.score >= 160 ? "Muntasil" : "Ṭālib";
  return (
    <div className="px-5 pb-8">
      {/* composite */}
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2, var(--color-paper))" }}>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-serif text-2xl tabular-nums" style={{ color: "var(--color-ink)" }}>
              {report.score}<span className="text-sm" style={{ color: "var(--color-ink-muted)" }}>/1000</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-muted)" }}>{band} · {Math.round(report.durationSec)}s · {Math.round(report.voicedRatio * 100)}% voiced</p>
          </div>
        </div>
        {/* ladder bar */}
        <div className="relative mt-3 h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${report.score / 10}%`, backgroundColor: "var(--color-accent)" }} />
        </div>
      </div>

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

      {/* fix list */}
      <h2 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Work on</h2>
      <ul className="space-y-2">
        {report.fixes.map((f, i) => (
          <li key={i} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>{f}</li>
        ))}
      </ul>

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

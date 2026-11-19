"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const MuscleBody = dynamic(() => import("@/components/workout/MuscleBody"), { ssr: false });
const XRayVisualizer = dynamic(() => import("@/components/workout/XRayVisualizer"), { ssr: false });
import MuscleBody2D from "@/components/workout/MuscleBody2D";
import { bucketOf, type BodyBucket } from "@/lib/workout/muscleBodyMap";
import { muscleInfo } from "@/lib/workout/muscleAnatomy";

interface MuscleStat {
  muscle: string;
  effSetsWeek: number;
  freshness: number; // 0..100 recovered (capped at 48h)
  status: string;
  slopePct: number;
}

const BUCKET_LABEL: Record<BodyBucket, string> = {
  chest: "Chest", front_delts: "Front delts", side_delts: "Side delts", rear_delts: "Rear delts",
  lats: "Lats", mid_back: "Mid back", traps: "Traps", lower_back: "Lower back",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", grip: "Grip",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", adductors: "Adductors",
  calves: "Calves", abs: "Abs", obliques: "Obliques", neck: "Neck",
};

// Buckets with no single muscle key get a representative key for atlas info.
const BUCKET_INFO_KEY: Record<BodyBucket, string> = {
  chest: "chest", front_delts: "front_delts", side_delts: "side_delts", rear_delts: "rear_delts",
  lats: "lats", mid_back: "mid_back", traps: "upper_traps", lower_back: "erectors",
  biceps: "biceps", triceps: "triceps", forearms: "forearms", grip: "grip",
  quads: "quads", hamstrings: "hamstrings", glutes: "glutes", adductors: "adductors",
  calves: "gastroc", abs: "abs", obliques: "obliques", neck: "neck",
};

const STATE_LABEL = ["fresh", "recovering", "tired", "overdue"] as const;
const stateOf = (f: number) => (f < 0.15 ? 0 : f < 0.45 ? 1 : f < 0.75 ? 2 : 3);
const STATE_COLOR = ["#7fbf6b", "#d4a843", "#c96b45", "#8e3419"];

export default function MusclesPage() {
  const [stats, setStats] = useState<MuscleStat[] | null>(null);
  const [sel, setSel] = useState<{ bucket: BodyBucket; label: string } | null>(null);
  const [use3D, setUse3D] = useState(true);
  const [xray, setXray] = useState(false);

  useEffect(() => {
    fetch("/api/workout/progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStats(j?.muscles ?? []))
      .catch(() => setStats([]));
  }, []);

  // bucket → worst unrecovered fraction across its member muscles
  const fatigue = useMemo(() => {
    const f: Partial<Record<BodyBucket, number>> = {};
    for (const m of stats ?? []) {
      const b = bucketOf(m.muscle);
      if (!b) continue; // unmapped muscle keys don't pollute a bucket
      const v = Math.max(0, 1 - m.freshness / 100);
      f[b] = Math.max(f[b] ?? 0, v);
    }
    return f;
  }, [stats]);

  // Per-muscle-key fatigue — lets the 3D model color soleus/gastroc, deltoid
  // heads, trap parts, etc. independently where we actually track them.
  const keyFatigue = useMemo(() => {
    const f: Record<string, number> = {};
    for (const m of stats ?? []) f[m.muscle] = Math.max(0, 1 - m.freshness / 100);
    return f;
  }, [stats]);

  const rows = useMemo(() =>
    (Object.keys(BUCKET_LABEL) as BodyBucket[])
      .map((b) => ({ bucket: b, f: fatigue[b] ?? 0 }))
      .sort((a, b) => b.f - a.f),
  [fatigue]);

  const selRow = sel ? rows.find((r) => r.bucket === sel.bucket) : null;

  return (
    <div className="page-fade mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/workout" className="text-sm" style={{ color: "var(--color-ink-muted)" }}>←</Link>
        <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Muscle recovery</h1>
        <button type="button" onClick={() => setXray(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", background: "var(--color-paper)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5 21 8v8l-5-2.5" />
          </svg>
          Visualizer
        </button>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        {use3D ? "Drag to rotate · tap a muscle · double-tap to reset · redder = less recovered" : "Tap a muscle · redder = less recovered"}
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", height: "min(52dvh, 460px)", background: "linear-gradient(180deg,#f6f1e6,#efe7d6)" }}>
        {use3D ? (
          <MuscleBody sex="male" fatigue={fatigue} keyFatigue={keyFatigue} selectedBucket={sel?.bucket ?? null}
            onFallback={() => setUse3D(false)}
            onSelect={(bucket, label) => setSel({ bucket, label })} />
        ) : (
          <MuscleBody2D fatigue={fatigue} selectedBucket={sel?.bucket ?? null} onSelect={(bucket, label) => setSel({ bucket, label })} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATE_LABEL.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATE_COLOR[i] }} />{s}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.map(({ bucket, f }) => {
          const st = stateOf(f);
          const members = (stats ?? []).filter((m) => bucketOf(m.muscle) === bucket);
          const sets = members.reduce((s, m) => s + m.effSetsWeek, 0);
          return (
            <button key={bucket} type="button" onClick={() => setSel({ bucket, label: BUCKET_LABEL[bucket] })}
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left"
              style={{ borderColor: "var(--color-paper-3)", background: "var(--color-paper)" }}>
              <span className="w-24 shrink-0 text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{BUCKET_LABEL[bucket]}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-paper-2)" }}>
                <span className="block h-full rounded-full" style={{ width: `${Math.round(f * 100)}%`, background: STATE_COLOR[st] }} />
              </span>
              <span className="w-14 shrink-0 text-right text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                {Math.round(sets)} sets
              </span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setSel(null)}>
          <div className="w-full max-w-md rounded-t-2xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-2xl sm:pb-5"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{sel.label}</h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  {selRow ? `${STATE_LABEL[stateOf(selRow.f)]} · ${Math.round(selRow.f * 100)}% unrecovered` : "No recent data"}
                </p>
              </div>
              <button type="button" onClick={() => setSel(null)} className="text-lg" style={{ color: "var(--color-ink-muted)" }}>✕</button>
            </div>
            <div className="mt-4 space-y-2">
              {(stats ?? []).filter((m) => bucketOf(m.muscle) === sel.bucket).length === 0 && (() => {
                const info = muscleInfo(BUCKET_INFO_KEY[sel.bucket]);
                return info ? (
                  <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: "var(--color-paper-2)" }}>
                    <p className="italic" style={{ color: "var(--color-ink-muted)" }}>{info.latin}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "var(--color-ink-muted)" }}>
                      <span><b style={{ color: "var(--color-ink)" }}>Family:</b> {info.family}</span>
                      <span><b style={{ color: "var(--color-ink)" }}>Fibers:</b> {info.fibers}</span>
                    </div>
                    <p className="mt-1" style={{ color: "var(--color-ink-muted)" }}><b style={{ color: "var(--color-ink)" }}>Does:</b> {info.action}</p>
                    {info.note && <p className="mt-1" style={{ color: "var(--color-ink-muted)" }}><b style={{ color: "var(--color-ink)" }}>Tip:</b> {info.note}</p>}
                    <p className="mt-1.5" style={{ color: "var(--color-ink-muted)" }}>No sets logged yet — train it to start tracking recovery.</p>
                  </div>
                ) : null;
              })()}
              {(stats ?? []).filter((m) => bucketOf(m.muscle) === sel.bucket).map((m) => {
                const info = muscleInfo(m.muscle) ?? muscleInfo(BUCKET_INFO_KEY[sel.bucket]);
                return (
                  <div key={m.muscle} className="rounded-lg px-3 py-2.5 text-xs"
                    style={{ background: "var(--color-paper-2)" }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium" style={{ color: "var(--color-ink)" }}>{m.muscle.replace(/_/g, " ")}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                        {m.effSetsWeek} sets · {m.freshness}% recovered
                      </span>
                    </div>
                    {info && (
                      <div className="mt-1.5 space-y-1">
                        <p className="italic" style={{ color: "var(--color-ink-muted)" }}>{info.latin}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "var(--color-ink-muted)" }}>
                          <span><b style={{ color: "var(--color-ink)" }}>Family:</b> {info.family}</span>
                          <span><b style={{ color: "var(--color-ink)" }}>Fibers:</b> {info.fibers}</span>
                        </div>
                        <p style={{ color: "var(--color-ink-muted)" }}><b style={{ color: "var(--color-ink)" }}>Does:</b> {info.action}</p>
                        {info.note && <p style={{ color: "var(--color-ink-muted)" }}><b style={{ color: "var(--color-ink)" }}>Tip:</b> {info.note}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {xray && <XRayVisualizer keyFatigue={keyFatigue} onClose={() => setXray(false)} />}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type WUnit = "kg" | "lb";
type HUnit = "cm" | "ft";

// Wilks — the powerlifting relative-strength standard. x = bodyweight kg,
// clamped; points = total × 500/poly(x).
const WILKS = {
  m: [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8],
  f: [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8],
} as const;
const wilks = (bw: number, sex: "m" | "f") => {
  const x = Math.min(Math.max(bw, 40), 201.9);
  const [a, b, c, d, e, f] = WILKS[sex];
  return 500 / (a + b * x + c * x ** 2 + d * x ** 3 + e * x ** 4 + f * x ** 5);
};

function UnitBtn<T extends string>({ value, opts, set }: { value: T; opts: readonly T[]; set: (v: T) => void }) {
  return (
    <span className="inline-flex rounded-lg border" style={{ borderColor: "var(--color-paper-3)" }}>
      {opts.map((o) => (
        <button key={o} type="button" onClick={() => set(o)}
          className="px-2.5 py-1.5 text-[11px] font-medium"
          style={{ backgroundColor: value === o ? "var(--color-ink)" : "transparent", color: value === o ? "var(--color-paper)" : "var(--color-ink-muted)", borderRadius: 7 }}>
          {o}
        </button>
      ))}
    </span>
  );
}

export default function WorkoutProfilePage() {
  const [weight, setWeight] = useState(""); // kg canonical
  const [cmVal, setCmVal] = useState(""); // cm mode
  const [ftVal, setFtVal] = useState(""); // ft+in mode
  const [inVal, setInVal] = useState("");
  const [wUnit, setWUnit] = useState<WUnit>("kg");
  const [hUnit, setHUnit] = useState<HUnit>("cm");
  const [sex, setSex] = useState<"m" | "f">("m");
  const [bodyfat, setBodyfat] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<{ tonnage: number; tonWeek: number; prs: number; sessions: number; lifts: { name: string; ratio: number; level: string; e1: number; gainPct: number | null }[]; score: number | null; scoreLabel: string | null; total: number; wilks: number | null; pushPull: number | null; upperLower: number | null } | null>(null);
  const [growth, setGrowth] = useState<{ name: string; first: number; last: number; gainPct: number | null; points: { e1: number }[] }[]>([]);
  const [limbStats, setLimbStats] = useState<{ name: string; left: number; right: number; gap: number | null }[]>([]);
  const [forecasts, setForecasts] = useState<{ name: string; status: string; change: number | null; range: [number, number] | null; confidence: number; limiting: string[] }[]>([]);
  const [algorithmSignals, setAlgorithmSignals] = useState<Record<string, { value: number | null; status: string; confidence: number; source: string }>>({});
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).then(async (d) => {
      const p = d?.prefs;
      const wu: WUnit = p?.unitWeight === "lb" ? "lb" : "kg";
      const hu: HUnit = p?.unitHeight === "ft" ? "ft" : "cm";
      setWUnit(wu); setHUnit(hu);
      if (p?.sex === "m" || p?.sex === "f") setSex(p.sex);
      if (p?.bodyfatPct) setBodyfat(String(p.bodyfatPct));
      const bwKg = p?.bodyWeightKg || 0;
      if (bwKg > 0) setWeight(wu === "lb" ? String(Math.round(bwKg * 2.205)) : String(bwKg));
      if (p?.heightCm) {
        setCmVal(String(p.heightCm));
        setFtVal(String(Math.floor(p.heightCm / 30.48)));
        setInVal(String(Math.round((p.heightCm / 2.54) % 12)));
      }
      setEditing(!bwKg || !p?.heightCm);

      // Strength stats — same data as the Progress card, surfaced here.
      const pr = await fetch("/api/workout/progress").catch(() => null);
      if (pr?.ok) {
        const d = await pr.json();
        const LIFTS: [string[], string, [number, number, number]][] = [
          [["back-squat", "front-squat", "hack-squat", "low-bar-squat", "safety-bar-squat"], "squat", [1.0, 1.5, 2.0]],
          [["deadlift", "rdl", "stiff-leg-deadlift"], "pull", [1.25, 2.0, 2.5]],
          [["barbell-bench-press", "machine-chest-press", "weighted-dip", "incline-bench-30"], "press", [0.75, 1.0, 1.5]],
          [["barbell-ohp", "seated-db-press", "machine-shoulder-press", "standing-db-press"], "ohp", [0.5, 0.75, 1.0]],
          [["pull-up", "weighted-pullup", "chin-up"], "pull-up", [0.9, 1.2, 1.5]],
        ];
        const levelOf = (r: number, [b, i, a]: [number, number, number]) => r >= a ? "advanced" : r >= i ? "intermediate" : r >= b ? "novice" : "beginner";
        const lifts = bwKg > 0 ? LIFTS.map(([slugs, name, marks]) => {
          const best = Math.max(0, ...slugs.map((s) => d.progress?.find((x: { slug: string; bestE1?: number }) => x.slug === s)?.bestE1 || 0));
          const gain = Math.max(-99, ...slugs.map((s) => d.progress?.find((x: { slug: string; gainPct?: number | null }) => x.slug === s)?.gainPct ?? -99));
          return best > 0 ? { name, ratio: best / bwKg, level: levelOf(best / bwKg, marks), e1: best, gainPct: gain > -99 ? gain : null } : null;
        }).filter((l): l is NonNullable<typeof l> => !!l) : [];
        const score = lifts.length > 0 ? Math.round(lifts.reduce((s, l) => s + l.ratio, 0) / (LIFTS.length * 2.2) * 100) : null;
        // Powerlifting total = squat + bench + deadlift e1RMs (the big three).
        const get = (n: string) => lifts.find((l) => l.name === n)?.e1 || 0;
        const total = get("squat") + get("press") + get("pull");
        setStats({
          tonnage: d.totalTonnage || 0, tonWeek: d.tonWeek || 0,
          prs: (d.progress || []).filter((x: { bestE1?: number }) => (x.bestE1 || 0) > 0).length,
          sessions: d.totalSessions || 0,
          lifts, score, total,
          wilks: bwKg > 0 && total > 0 ? Math.round(total * wilks(bwKg, p?.sex === "f" ? "f" : "m")) : null,
          pushPull: get("press") > 0 && get("pull-up") > 0 ? get("press") / get("pull-up") : null,
          upperLower: get("press") > 0 && get("squat") > 0 ? get("press") / get("squat") : null,
          scoreLabel: score === null ? null : score >= 90 ? "elite" : score >= 60 ? "advanced" : score >= 40 ? "intermediate" : score >= 20 ? "novice" : "beginner",
        });
        // Growth-over-time — every logged exercise with its first vs latest e1RM.
        setGrowth((d.progress || [])
          .filter((x: { firstE1?: number | null }) => (x.firstE1 || 0) > 0)
          .map((x: { slug: string; firstE1: number; lastE1: number; gainPct: number | null; points?: { e1: number }[] }) => ({
            name: x.slug.replace(/-/g, " "),
            first: x.firstE1, last: x.lastE1 || 0,
            gainPct: x.gainPct ?? null,
            points: x.points || [],
          }))
          .sort((a: { last: number }, b: { last: number }) => b.last - a.last)
          .slice(0, 10));
        setLimbStats((d.progress || [])
          .filter((x: { limbs?: Record<string, { lastE1?: number }> }) => x.limbs?.left || x.limbs?.right)
          .map((x: { slug: string; limbs: Record<string, { lastE1?: number }> }) => {
            const left = x.limbs.left?.lastE1 || 0;
            const right = x.limbs.right?.lastE1 || 0;
            return {
              name: x.slug.replace(/-/g, " "),
              left, right,
              gap: left && right ? Math.round((Math.abs(left - right) / Math.max(left, right)) * 1000) / 10 : null,
            };
          })
          .sort((a: { gap: number | null }, b: { gap: number | null }) => (b.gap || 0) - (a.gap || 0))
          .slice(0, 8));
        setForecasts((d.progress || [])
          .filter((x: { growthForecast?: { status: string } }) => x.growthForecast)
          .map((x: { slug: string; growthForecast: { status: string; monthlyE1rmChangePct: number | null; expectedMonthlyRangePct: [number, number] | null; confidence: number; limitingSignals: string[] } }) => ({
            name: x.slug.replace(/-/g, " "),
            status: x.growthForecast.status,
            change: x.growthForecast.monthlyE1rmChangePct,
            range: x.growthForecast.expectedMonthlyRangePct,
            confidence: x.growthForecast.confidence,
            limiting: x.growthForecast.limitingSignals,
          }))
          .sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence)
          .slice(0, 8));
        setAlgorithmSignals(d.algorithmSignals || {});
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const saveAll = () => {
    const disp = parseFloat(weight);
    const bw = wUnit === "lb" ? Math.round(disp / 2.205 * 10) / 10 : disp;
    const cm = hUnit === "cm" ? parseFloat(cmVal) : Math.round(((parseFloat(ftVal) || 0) * 12 + (parseFloat(inVal) || 0)) * 2.54);
    if (bw > 0 && cm > 0) {
      save({ bodyWeightKg: bw, heightCm: cm, unitWeight: wUnit, unitHeight: hUnit, sex, bodyfatPct: parseFloat(bodyfat) || null, weightUpdatedAt: new Date().toISOString() });
      router.push("/workout");
    }
  };

  const save = (body: Record<string, unknown>) => {
    void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };

  const dispW = parseFloat(weight);
  const bw = wUnit === "lb" ? dispW / 2.205 : dispW;
  const ht = hUnit === "cm" ? parseFloat(cmVal) : Math.round(((parseFloat(ftVal) || 0) * 12 + (parseFloat(inVal) || 0)) * 2.54);
  const bmi = bw > 0 && ht > 0 ? (bw / ((ht / 100) ** 2)).toFixed(1) : null;

  return (
    <div className="page-fade mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/workout" className="text-sm" style={{ color: "var(--color-ink-muted)" }}>←</Link>
        <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Profile</h1>
      </div>

      {!loaded && <p className="mt-8 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>}
      {loaded && !editing && (() => {
        const LIFT_ROWS = ["squat", "pull", "press", "ohp", "pull-up"].map((n) =>
          stats?.lifts.find((l) => l.name === n) ?? { name: n, ratio: 0, level: "—", e1: 0, gainPct: null });
        return (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-center justify-between">
              <div className="flex gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Weight</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{weight} {wUnit}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Height</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
                    {hUnit === "cm" ? `${cmVal} cm` : `${ftVal}′${inVal}″`}
                  </p>
                </div>
                {bmi && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>BMI</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{bmi}</p>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setEditing(true)}
                className="rounded-full border px-3 py-1.5 text-[11px]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>Edit</button>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Strength score</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats?.score ?? "—"}</p>
                <p className="text-[10px] font-medium" style={{ color: "var(--color-accent)" }}>{stats?.scoreLabel ?? ""}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Total (S+B+D)</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats && stats.total > 0 ? Math.round(stats.total) : "—"}</p>
                <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>kg e1RM</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Wilks</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats?.wilks ?? "—"}</p>
                <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>pts</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Strength levels — e1RM, ratio to bodyweight, tier</p>
            <div className="mt-2 space-y-1.5">
              {LIFT_ROWS.map((l) => (
                <div key={l.name} className="flex items-center gap-2">
                  <span className="w-14 text-[11px]" style={{ color: "var(--color-ink)" }}>{l.name}</span>
                  <span className="w-14 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{l.e1 > 0 ? `${Math.round(l.e1)}kg` : "—"}</span>
                  <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min((l.ratio / 2.5) * 100, 100)}%`, backgroundColor: l.level === "advanced" ? "var(--color-success)" : l.level === "intermediate" ? "var(--color-accent)" : "var(--color-warmth)" }} />
                  </div>
                  <span className="w-24 text-right text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {l.e1 > 0 ? `${l.ratio.toFixed(2)}×bw · ${l.level}${l.gainPct != null ? ` ${l.gainPct > 0 ? "+" : ""}${l.gainPct}%` : ""}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {(stats || bmi) && (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Balance & body</p>
              <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-[11px]" style={{ color: "var(--color-ink)" }}>
                <span>BMI <b>{bmi ?? "—"}</b></span>
                <span>push : pull <b>{stats?.pushPull ? stats.pushPull.toFixed(2) : "—"}</b>
                  {stats?.pushPull ? <span className="text-[9px]" style={{ color: stats.pushPull > 1.25 ? "var(--color-error)" : "var(--color-ink-muted)" }}> {stats.pushPull > 1.25 ? "push-heavy" : "balanced"}</span> : null}
                </span>
                <span>upper : lower <b>{stats?.upperLower ? stats.upperLower.toFixed(2) : "—"}</b>
                  {stats?.upperLower ? <span className="text-[9px]" style={{ color: "var(--color-ink-muted)" }}> {stats.upperLower < 0.5 ? "lower-dominant" : stats.upperLower > 0.8 ? "upper-dominant" : "balanced"}</span> : null}
                </span>
                <span>strength / kg <b>{bw > 0 && stats && stats.total > 0 ? `${(stats.total / bw).toFixed(2)}×` : "—"}</b></span>
                <span>FFMI <b>{(() => {
                  const bf = parseFloat(bodyfat);
                  return bf > 0 && bw > 0 && ht > 0 ? ((bw * (1 - bf / 100)) / ((ht / 100) ** 2)).toFixed(1) : "—";
                })()}</b></span>
                <span>sessions <b>{stats?.sessions || "—"}</b></span>
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Growth since day one — e1RM per session</p>
            {growth.length === 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Log sets to start your trend lines.</p>}
            <div className="mt-2 space-y-1.5">
              {growth.map((g) => {
                const vals = g.points.map((p) => p.e1);
                const min = Math.min(...vals, g.first), max = Math.max(...vals, g.first);
                const span = max - min || 1;
                return (
                  <div key={g.name} className="flex items-center gap-2">
                    <span className="w-28 truncate text-[10px] capitalize" style={{ color: "var(--color-ink)" }}>{g.name}</span>
                    <svg viewBox="0 0 60 16" className="h-4 w-16 shrink-0" preserveAspectRatio="none">
                      <polyline fill="none" stroke="var(--color-accent)" strokeWidth="1.5"
                        points={[g.first, ...vals].map((v, i, a) => `${(i / Math.max(a.length - 1, 1)) * 58},${15 - ((v - min) / span) * 13}`).join(" ")} />
                    </svg>
                    <span className="w-24 text-right text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {Math.round(g.first)}→{Math.round(g.last)}kg
                    </span>
                    <span className="w-12 text-right text-[9px] font-semibold tabular-nums"
                      style={{ color: g.gainPct === null ? "var(--color-ink-muted)" : g.gainPct >= 0 ? "var(--color-success)" : "var(--color-error)" }}>
                      {g.gainPct !== null ? `${g.gainPct > 0 ? "+" : ""}${g.gainPct}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Left / right balance</p>
              <span className="text-[9px]" style={{ color: "var(--color-ink-faint)" }}>latest e1RM · per hand</span>
            </div>
            {limbStats.length === 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Choose 1 hand and log both sides to measure asymmetry.</p>}
            <div className="mt-2 space-y-2">
              {limbStats.map((l) => {
                const max = Math.max(l.left, l.right, 1);
                return (
                  <div key={l.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                    <span className="truncate text-[10px] capitalize" style={{ color: "var(--color-ink)" }}>{l.name}</span>
                    <span className="text-[9px] tabular-nums" style={{ color: l.gap !== null && l.gap >= 10 ? "var(--color-warmth)" : "var(--color-ink-muted)" }}>
                      {l.gap !== null ? `${l.gap}% gap` : "one side"}
                    </span>
                    <div className="col-span-2 flex h-1.5 gap-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
                      <span className="rounded-full" style={{ width: `${(l.left / max) * 50}%`, backgroundColor: "var(--color-accent)" }} />
                      <span className="rounded-full" style={{ width: `${(l.right / max) * 50}%`, backgroundColor: "var(--color-warmth)" }} />
                    </div>
                    <span className="text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>L {l.left ? `${l.left.toFixed(1)}kg` : "—"} · R {l.right ? `${l.right.toFixed(1)}kg` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Growth forecast</p>
              <span className="text-[9px]" style={{ color: "var(--color-ink-faint)" }}>e1RM trend, not muscle mass</span>
            </div>
            {forecasts.length === 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Need at least three sessions across two weeks before forecasting.</p>}
            <div className="mt-2 space-y-2">
              {forecasts.map((f) => (
                <div key={f.name} className="flex items-center gap-2">
                  <span className="w-28 truncate text-[10px] capitalize" style={{ color: "var(--color-ink)" }}>{f.name}</span>
                  <span className="flex-1 text-[9px]" style={{ color: f.status === "forecast" ? "var(--color-success)" : "var(--color-ink-muted)" }}>
                    {f.change !== null && f.range ? `${f.change >= 0 ? "+" : ""}${f.change}% / month (${f.range[0]}–${f.range[1]}%)` : f.status}
                  </span>
                  <span className="text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{Math.round(f.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>What the model actually knows</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(algorithmSignals).map(([key, value]) => (
                <span key={key} className="rounded-full border px-2 py-1 text-[9px]"
                  title={`${value.source} · confidence ${Math.round(value.confidence * 100)}%`}
                  style={{ borderColor: value.status === "missing" ? "var(--color-paper-3)" : "var(--color-accent)", color: value.status === "missing" ? "var(--color-ink-faint)" : "var(--color-ink-muted)" }}>
                  {key}: {value.value === null ? "missing" : typeof value.value === "number" ? Math.round(value.value * 10) / 10 : value.value}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            <span>lifetime volume <b style={{ color: "var(--color-ink)" }}>{stats?.tonnage ? `${(stats.tonnage / 1000).toFixed(1)}t` : "—"}</b></span>
            <span>this week <b style={{ color: "var(--color-ink)" }}>{stats?.tonWeek ? `${(stats.tonWeek / 1000).toFixed(1)}t` : "—"}</b></span>
            <span>PRs <b style={{ color: "var(--color-ink)" }}>{stats?.prs || "—"}</b></span>
          </div>
        </div>
      );})()}
      {loaded && editing && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Body weight</p>
              <UnitBtn value={wUnit} opts={["kg","lb"] as const} set={(v) => {
                // Convert the typed value so the number stays correct across units.
                const d = parseFloat(weight);
                if (d > 0 && v !== wUnit) setWeight(v === "lb" ? String(Math.round(d * 2.205)) : String(Math.round(d / 2.205 * 10) / 10));
                setWUnit(v as WUnit); save({ unitWeight: v });
              }} />
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Updates weekly — it drifts.</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal" placeholder={wUnit === "lb" ? "154" : "70"}
                className="w-24 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{wUnit}</span>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Height</p>
              <UnitBtn value={hUnit} opts={["cm","ft"] as const} set={(v) => {
                // Pre-fill the new unit's fields from the current height.
                const cm = hUnit === "cm" ? parseFloat(cmVal) : Math.round(((parseFloat(ftVal) || 0) * 12 + (parseFloat(inVal) || 0)) * 2.54);
                if (cm > 0 && v !== hUnit) {
                  if (v === "ft") { setFtVal(String(Math.floor(cm / 30.48))); setInVal(String(Math.round((cm / 2.54) % 12))); }
                  else setCmVal(String(cm));
                }
                setHUnit(v as HUnit); save({ unitHeight: v });
              }} />
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Asked once — it doesn&apos;t change.</p>
            {hUnit === "cm" ? (
              <div className="mt-2 flex items-center gap-2">
                <input value={cmVal} onChange={(e) => setCmVal(e.target.value)}
                  inputMode="decimal" placeholder="178"
                  className="w-24 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>cm</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <input value={ftVal} onChange={(e) => setFtVal(e.target.value)}
                  inputMode="numeric" placeholder="5"
                  className="w-16 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>ft</span>
                <input value={inVal} onChange={(e) => setInVal(e.target.value)}
                  inputMode="numeric" placeholder="10"
                  className="w-16 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>in</span>
              </div>
            )}
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Sex</p>
              <UnitBtn value={sex} opts={["m", "f"] as const} set={setSex} />
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Used for the Wilks score — its coefficients differ by sex.</p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Body fat %</p>
              <span className="flex items-center gap-1.5">
                <input value={bodyfat} onChange={(e) => setBodyfat(e.target.value)}
                  inputMode="decimal" placeholder="optional"
                  className="w-20 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>%</span>
              </span>
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Optional — enables FFMI (lean mass per height²).</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { const bw = parseFloat(weight); if (bw > 0) setEditing(false); }}
              className="rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
              Back
            </button>
            <button type="button" onClick={saveAll}
              disabled={!(dispW > 0 && ht > 0)}
              className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
              Save & continue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

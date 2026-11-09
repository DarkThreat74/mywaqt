"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { exerciseName } from "@/lib/workout/exercises";
import { levelFor, thresholdsFor, LIFT_SLUGS } from "@/lib/workout/standards";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<{ tonnage: number; tonWeek: number; prs: number; sessions: number; lifts: { name: string; ratio: number; level: string; nextLevel: string | null; nextKg: number | null; pctToNext: number | null; e1: number; gainPct: number | null }[]; score: number | null; scoreLabel: string | null; comparisonBand: string | null; total: number; wilks: number | null; pushPull: number | null; upperLower: number | null } | null>(null);
  const [growth, setGrowth] = useState<{ name: string; first: number; last: number; gainPct: number | null; points: { e1: number }[] }[]>([]);
  const [forecasts, setForecasts] = useState<{ name: string; status: string; change: number | null; range: [number, number] | null; confidence: number; limiting: string[] }[]>([]);
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
        // Strength-Level (48M+ lifts) standards, interpolated to the user's
        // bodyweight/sex — a 65kg lifter and a 110kg lifter are graded on
        // different curves, not one bodyweight ratio.
        const sexKey = (p?.sex === "f" ? "f" : "m") as "m" | "f";
        const LIFT_ROWS_DEF: [keyof typeof LIFT_SLUGS, string][] = [
          ["squat", "squat"], ["deadlift", "deadlift"], ["bench", "press"],
          ["ohp", "ohp"], ["row", "row"],
        ];
        const lifts = bwKg > 0 ? LIFT_ROWS_DEF.map(([key, name]) => {
          const slugs = LIFT_SLUGS[key];
          const best = Math.max(0, ...slugs.map((s) => {
            const row = d.progress?.find((x: { slug: string; bestE1?: number; comparisonE1?: number }) => x.slug === s);
            return row?.comparisonE1 ?? row?.bestE1 ?? 0;
          }));
          const gain = Math.max(-99, ...slugs.map((s) => d.progress?.find((x: { slug: string; gainPct?: number | null }) => x.slug === s)?.gainPct ?? -99));
          const lv = best > 0 ? levelFor(key as "bench" | "squat" | "deadlift" | "ohp" | "row", best, bwKg, sexKey) : null;
          return best > 0 ? { name, ratio: best / bwKg, level: lv!.level, nextLevel: lv!.next, nextKg: lv!.nextKg, pctToNext: lv!.pctToNext, e1: best, gainPct: gain > -99 ? gain : null } : null;
        }).filter((l): l is NonNullable<typeof l> => !!l) : [];
        const score = lifts.length > 0 ? Math.round(lifts.reduce((s, l) => s + l.ratio, 0) / (LIFT_ROWS_DEF.length * 2.2) * 100) : null;
        const tierIndex: Record<string, number> = { beginner: 0, novice: 1, intermediate: 2, advanced: 3, elite: 4 };
        const averageTier = lifts.length > 0 ? lifts.reduce((sum, lift) => sum + (tierIndex[lift.level] ?? 0), 0) / lifts.length : null;
        const belowBeginner = lifts.filter((lift) => {
          const key = LIFT_ROWS_DEF.find(([, label]) => label === lift.name)?.[0];
          return key ? lift.e1 < thresholdsFor(key, bwKg, sexKey)[0] : false;
        }).length;
        const comparisonBand = averageTier === null ? null
          : averageTier < 0.5 && belowBeginner > lifts.length / 2 ? "below average"
          : averageTier < 1 ? "around average"
          : averageTier < 2 ? "above average"
          : averageTier < 3 ? "strong"
          : "very strong";
        // Powerlifting total = squat + bench + deadlift e1RMs (the big three).
        const get = (n: string) => lifts.find((l) => l.name === n)?.e1 || 0;
        const total = get("squat") + get("press") + get("deadlift");
        setStats({
          tonnage: d.totalTonnage || 0, tonWeek: d.tonWeek || 0,
          prs: (d.progress || []).filter((x: { bestE1?: number }) => (x.bestE1 || 0) > 0).length,
          sessions: d.totalSessions || 0,
          lifts, score, total,
          wilks: bwKg > 0 && total > 0 ? Math.round(total * wilks(bwKg, p?.sex === "f" ? "f" : "m")) : null,
          pushPull: get("press") > 0 && get("row") > 0 ? get("press") / get("row") : null,
          upperLower: get("press") > 0 && get("squat") > 0 ? get("press") / get("squat") : null,
          scoreLabel: score === null ? null : score >= 90 ? "elite" : score >= 60 ? "advanced" : score >= 40 ? "intermediate" : score >= 20 ? "novice" : "beginner",
          comparisonBand,
        });
        // Growth-over-time — every logged exercise with its first vs latest e1RM.
        setGrowth((d.progress || [])
          .filter((x: { firstE1?: number | null }) => (x.firstE1 || 0) > 0)
          .map((x: { slug: string; firstE1: number; lastE1: number; gainPct: number | null; points?: { e1: number }[] }) => ({
            name: exerciseName(x.slug),
            first: x.firstE1, last: x.lastE1 || 0,
            gainPct: x.gainPct ?? null,
            points: x.points || [],
          }))
          .sort((a: { last: number }, b: { last: number }) => b.last - a.last)
          .slice(0, 10));
        setForecasts((d.progress || [])
          .filter((x: { growthForecast?: { status: string } }) => x.growthForecast)
          .map((x: { slug: string; growthForecast: { status: string; monthlyE1rmChangePct: number | null; expectedMonthlyRangePct: [number, number] | null; confidence: number; limitingSignals: string[] } }) => ({
            name: exerciseName(x.slug),
            status: x.growthForecast.status,
            change: x.growthForecast.monthlyE1rmChangePct,
            range: x.growthForecast.expectedMonthlyRangePct,
            confidence: x.growthForecast.confidence,
            limiting: x.growthForecast.limitingSignals,
          }))
          .sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence)
          .slice(0, 8));
      } else {
        setLoadError("Progress could not be loaded. Your saved body details are still available.");
      }
      setLoaded(true);
    }).catch(() => { setLoadError("Profile data could not be loaded. Try again."); setLoaded(true); });
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
        const LIFT_ROWS = ["squat", "deadlift", "press", "ohp", "row"].map((n) =>
          stats?.lifts.find((l) => l.name === n) ?? { name: n, ratio: 0, level: "—", nextLevel: null, nextKg: null, pctToNext: null, e1: 0, gainPct: null });
        const disp = (kg: number) => wUnit === "lb" ? Math.round(kg * 2.205) : Math.round(kg);
        return (
        <div className="mt-4 space-y-3">
          {loadError && <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}>{loadError}</p>}
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
          {stats?.sessions === 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, var(--color-paper))" }}>
              <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Your profile is ready.</p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>Log a completed workout to see lift comparisons, progress, and workload guidance.</p>
              <Link href="/workout/active" className="mt-3 inline-block rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>Start a workout</Link>
            </div>
          )}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider" title="A simple comparison level based on your main-lift estimated maxes and bodyweight." style={{ color: "var(--color-ink-muted)" }}>Strength level</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats?.score ?? "—"}</p>
                <p className="text-[10px] font-medium capitalize" style={{ color: "var(--color-accent)" }}>{stats?.comparisonBand ?? stats?.scoreLabel ?? ""}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Main-lift total</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats && stats.total > 0 ? disp(stats.total) : "—"}</p>
                <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>squat + press + deadlift · {wUnit} total</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" title="A bodyweight-adjusted comparison number. It is not a lift weight or a school grade." style={{ color: "var(--color-ink-muted)" }}>Bodyweight score</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats?.wilks ?? "—"}</p>
                <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>comparison points · placement: {stats?.comparisonBand ?? "not enough data"}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>How your main lifts compare</p>
                <p className="mt-0.5 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>Compared with people of a similar bodyweight and sex. These use direct barbell lifts only; dumbbells and grip variations stay separate.</p>
            <div className="mt-3 space-y-3">
              {LIFT_ROWS.map((l) => {
                const TIER = ["beginner", "novice", "intermediate", "advanced", "elite"];
                const rank = Math.max(0, TIER.indexOf(l.level));
                const tierColor = ["var(--color-paper-3)", "var(--color-warmth)", "var(--color-accent)", "var(--color-success)", "var(--color-warmth)"][rank];
                const fill = l.e1 > 0 ? ((rank + (l.pctToNext ?? 0) / 100) / 5) * 100 : 0;
                return (
                  <div key={l.name}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium" style={{ color: "var(--color-ink)" }}>{l.name}</span>
                      {l.e1 > 0 ? (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize"
                          style={{ backgroundColor: `color-mix(in oklab, ${tierColor} 14%, transparent)`, color: tierColor }}>
                          {l.level}
                        </span>
                      ) : (
                        <span className="text-[9px]" style={{ color: "var(--color-ink-muted)" }}>not logged</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex gap-0.5">
                      {TIER.map((t, i) => {
                        const segFill = Math.max(0, Math.min(100, (fill - i * 20) * 5));
                        return (
                          <div key={t} className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
                            <div className="h-full rounded-full" style={{ width: `${segFill}%`, backgroundColor: tierColor }} />
                          </div>
                        );
                      })}
                    </div>
                    {l.e1 > 0 && (
                      <div className="mt-1 flex items-baseline justify-between text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                        <span>{disp(l.e1)}{wUnit} estimated max{l.gainPct != null ? ` · ${l.gainPct > 0 ? "+" : ""}${l.gainPct}%` : ""}</span>
                        <span>{l.nextKg ? `next: ${l.nextLevel} at ${disp(l.nextKg)}${wUnit}` : "highest comparison tier"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {(stats || bmi) && (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Body & training</p>
              <div className="mt-2 grid grid-cols-1 gap-y-1.5 text-[11px] sm:grid-cols-2" style={{ color: "var(--color-ink)" }}>
                <span>BMI <b>{bmi ?? "—"}</b></span>
                <span>Workouts logged <b>{stats?.sessions || "—"}</b></span>
                <span className="min-w-0">Strength relative to bodyweight <b>{bw > 0 && stats && stats.total > 0 ? `${(stats.total / bw).toFixed(2)}×` : "—"}</b>
                  {bw > 0 && stats && stats.total > 0 && (() => {
                    const ratio = stats.total / bw;
                    const label = ratio < 1 ? "below beginner range" : ratio < 2 ? "beginner range" : ratio < 3 ? "developing" : ratio < 4 ? "strong" : "advanced";
                    return <span className="ml-1" style={{ color: ratio < 1 ? "var(--color-warmth)" : "var(--color-accent)" }}>({label})</span>;
                  })()}
                </span>
                <span>Body-fat estimate <b>{bodyfat ? `${bodyfat}%` : "—"}</b></span>
              </div>
              <p className="mt-2 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                This ratio is your combined squat + press + deadlift estimate divided by bodyweight. For example, 0.42× means your combined estimated max is about 42% of your bodyweight; it is not a percentage grade.
              </p>
            </div>
          )}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Progress since your first workout</p>
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
                      {disp(g.first)}→{disp(g.last)}{wUnit} estimated max
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
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Possible future trend</p>
              <span className="text-[9px]" style={{ color: "var(--color-ink-faint)" }}>based on your logged performance, not muscle size</span>
            </div>
            {forecasts.length === 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Need at least four comparable workouts across three weeks before forecasting.</p>}
            <div className="mt-2 space-y-2">
              {forecasts.map((f) => (
                <div key={f.name} className="flex items-center gap-2">
                  <span className="w-28 truncate text-[10px] capitalize" style={{ color: "var(--color-ink)" }}>{f.name}</span>
                  <span className="flex-1 text-[9px]" style={{ color: f.status === "forecast" ? "var(--color-success)" : "var(--color-ink-muted)" }}>
                    {f.change !== null && f.range ? `${f.change >= 0 ? "+" : ""}${f.change}% per month · likely ${f.range[0]}–${f.range[1]}%` : f.status === "insufficient-data" ? "Need more workouts" : "Still learning your trend"}
                    {f.limiting[0] ? ` · ${f.limiting[0]}` : ""}
                  </span>
                  <span className="text-[9px]" style={{ color: "var(--color-ink-muted)" }}>{f.confidence >= 0.75 ? "high confidence" : f.confidence >= 0.5 ? "medium confidence" : "early estimate"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            <span title="Total weight × reps across completed loaded sets since your first workout">lifetime volume <b style={{ color: "var(--color-ink)" }}>{stats?.tonnage ? `${(stats.tonnage / 1000).toFixed(1)}t` : "—"}</b></span>
            <span title="Total weight × reps across completed loaded sets in the last seven days">last 7 days <b style={{ color: "var(--color-ink)" }}>{stats?.tonWeek ? `${(stats.tonWeek / 1000).toFixed(1)}t` : "—"}</b></span>
            <span>Exercises tracked <b style={{ color: "var(--color-ink)" }}>{stats?.prs || "—"}</b></span>
          </div>
          <p className="px-1 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>Volume is workload, not strength: weight × reps. It helps show training consistency and fatigue, while estimated max describes a single-lift effort.</p>
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

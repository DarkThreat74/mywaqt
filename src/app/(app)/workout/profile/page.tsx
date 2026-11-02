"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type WUnit = "kg" | "lb";
type HUnit = "cm" | "ft";

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
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<{ tonnage: number; tonWeek: number; prs: number; lifts: { name: string; ratio: number; level: string }[]; score: number | null; scoreLabel: string | null } | null>(null);
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).then(async (d) => {
      const p = d?.prefs;
      const wu: WUnit = p?.unitWeight === "lb" ? "lb" : "kg";
      const hu: HUnit = p?.unitHeight === "ft" ? "ft" : "cm";
      setWUnit(wu); setHUnit(hu);
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
          return best > 0 ? { name, ratio: best / bwKg, level: levelOf(best / bwKg, marks), e1: best } : null;
        }).filter((l): l is NonNullable<typeof l> => !!l) : [];
        const score = lifts.length > 0 ? Math.round(lifts.reduce((s, l) => s + l.ratio, 0) / (LIFTS.length * 2.2) * 100) : null;
        setStats({
          tonnage: d.totalTonnage || 0, tonWeek: d.tonWeek || 0,
          prs: (d.progress || []).filter((x: { bestE1?: number }) => (x.bestE1 || 0) > 0).length,
          lifts, score,
          scoreLabel: score === null ? null : score >= 90 ? "elite" : score >= 60 ? "advanced" : score >= 40 ? "intermediate" : score >= 20 ? "novice" : "beginner",
        });
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const saveAll = () => {
    const disp = parseFloat(weight);
    const bw = wUnit === "lb" ? Math.round(disp / 2.205 * 10) / 10 : disp;
    const cm = hUnit === "cm" ? parseFloat(cmVal) : Math.round(((parseFloat(ftVal) || 0) * 12 + (parseFloat(inVal) || 0)) * 2.54);
    if (bw > 0 && cm > 0) {
      save({ bodyWeightKg: bw, heightCm: cm, unitWeight: wUnit, unitHeight: hUnit, weightUpdatedAt: new Date().toISOString() });
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
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/workout" className="text-sm" style={{ color: "var(--color-ink-muted)" }}>←</Link>
        <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Profile</h1>
      </div>

      {!loaded && <p className="mt-8 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>}
      {loaded && !editing && (
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
          {stats?.score !== null && stats?.score !== undefined && (
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Strength score</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{stats.score}</p>
              <p className="text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>{stats.scoreLabel}</p>
            </div>
          )}
          {stats && stats.lifts.length > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Strength levels</p>
              <div className="mt-2 space-y-1.5">
                {stats.lifts.map((l) => (
                  <div key={l.name} className="flex items-center gap-2">
                    <span className="w-14 text-[11px]" style={{ color: "var(--color-ink)" }}>{l.name}</span>
                    <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min((l.ratio / 2.5) * 100, 100)}%`, backgroundColor: l.level === "advanced" ? "var(--color-success)" : l.level === "intermediate" ? "var(--color-accent)" : "var(--color-warmth)" }} />
                    </div>
                    <span className="w-20 text-right text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{l.ratio.toFixed(2)}×bw · {l.level}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
              {stats.tonnage > 0 && <span>lifetime volume <b style={{ color: "var(--color-ink)" }}>{(stats.tonnage / 1000).toFixed(1)}t</b></span>}
              {stats.tonWeek > 0 && <span>this week <b style={{ color: "var(--color-ink)" }}>{(stats.tonWeek / 1000).toFixed(1)}t</b></span>}
              {stats.prs > 0 && <span>PRs <b style={{ color: "var(--color-ink)" }}>{stats.prs}</b></span>}
            </div>
          )}
        </div>
      )}
      {loaded && editing && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Body weight</p>
              <UnitBtn value={wUnit} opts={["kg","lb"] as const} set={(v) => { setWUnit(v as WUnit); save({ unitWeight: v }); }} />
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
              <UnitBtn value={hUnit} opts={["cm","ft"] as const} set={(v) => { setHUnit(v as HUnit); save({ unitHeight: v }); }} />
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
          {bmi && (
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>BMI</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{bmi}</p>
            </div>
          )}
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

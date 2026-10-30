"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  const [height, setHeight] = useState(""); // cm canonical
  const [wUnit, setWUnit] = useState<WUnit>("kg");
  const [hUnit, setHUnit] = useState<HUnit>("cm");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const p = d?.prefs;
      if (p?.bodyWeightKg) setWeight(String(p.bodyWeightKg));
      if (p?.heightCm) setHeight(String(p.heightCm));
      if (p?.unitWeight === "lb" || p?.unitWeight === "kg") setWUnit(p.unitWeight);
      if (p?.unitHeight === "ft" || p?.unitHeight === "cm") setHUnit(p.unitHeight);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = (body: Record<string, unknown>) => {
    void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };

  const bw = parseFloat(weight), ht = parseFloat(height);
  const bmi = bw > 0 && ht > 0 ? (bw / ((ht / 100) ** 2)).toFixed(1) : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/workout" className="text-sm" style={{ color: "var(--color-ink-muted)" }}>←</Link>
        <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Profile</h1>
      </div>

      {!loaded && <p className="mt-8 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>}
      {loaded && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Body weight</p>
              <UnitBtn value={wUnit} opts={["kg","lb"] as const} set={(v) => { setWUnit(v as WUnit); save({ unitWeight: v }); }} />
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Updates weekly — it drifts.</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={bw > 0 ? (wUnit === "lb" ? String(Math.round(bw * 2.205)) : String(bw)) : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setWeight(e.target.value === "" ? "" : String(wUnit === "lb" ? Math.round(v / 2.205 * 10) / 10 : v));
                  if (v > 0) save({ bodyWeightKg: wUnit === "lb" ? Math.round(v / 2.205 * 10) / 10 : v, weightUpdatedAt: new Date().toISOString() });
                }}
                inputMode="decimal" placeholder="0"
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
                <input value={height}
                  onChange={(e) => { setHeight(e.target.value); const v = parseFloat(e.target.value); if (v > 0) save({ heightCm: v }); }}
                  inputMode="decimal" placeholder="0"
                  className="w-24 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>cm</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <input value={ht > 0 ? String(Math.floor(ht / 30.48)) : ""}
                  onChange={(e) => {
                    const ft = parseFloat(e.target.value) || 0;
                    const inch = ht > 0 ? (ht / 2.54) % 12 : 0;
                    const cm = Math.round((ft * 12 + inch) * 2.54);
                    setHeight(String(cm));
                    if (cm > 0) save({ heightCm: cm });
                  }}
                  inputMode="numeric" placeholder="5"
                  className="w-16 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>ft</span>
                <input value={ht > 0 ? String(Math.round((ht / 2.54) % 12)) : ""}
                  onChange={(e) => {
                    const inch = parseFloat(e.target.value) || 0;
                    const ft = ht > 0 ? Math.floor(ht / 30.48) : 0;
                    const cm = Math.round((ft * 12 + inch) * 2.54);
                    setHeight(String(cm));
                    if (cm > 0) save({ heightCm: cm });
                  }}
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
        </div>
      )}
    </div>
  );
}

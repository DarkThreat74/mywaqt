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
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const p = d?.prefs;
      const wu: WUnit = p?.unitWeight === "lb" ? "lb" : "kg";
      const hu: HUnit = p?.unitHeight === "ft" ? "ft" : "cm";
      setWUnit(wu); setHUnit(hu);
      if (p?.bodyWeightKg) setWeight(wu === "lb" ? String(Math.round(p.bodyWeightKg * 2.205)) : String(p.bodyWeightKg));
      if (p?.heightCm) {
        setCmVal(String(p.heightCm));
        setFtVal(String(Math.floor(p.heightCm / 30.48)));
        setInVal(String(Math.round((p.heightCm / 2.54) % 12)));
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
          <button type="button" onClick={saveAll}
            disabled={!(dispW > 0 && ht > 0)}
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
            Save & continue →
          </button>
        </div>
      )}
    </div>
  );
}

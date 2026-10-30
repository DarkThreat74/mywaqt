"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function WorkoutProfilePage() {
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.prefs?.bodyWeightKg) setWeight(String(d.prefs.bodyWeightKg));
      if (d?.prefs?.heightCm) setHeight(String(d.prefs.heightCm));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = (key: "bodyWeightKg" | "heightCm" | "weightUpdatedAt", v: number | string) => {
    void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: v }) }).catch(() => {});
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
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Body weight</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Updates weekly — it drifts.</p>
            <div className="mt-2 flex items-center gap-2">
              <input value={weight} onChange={(e) => { setWeight(e.target.value); const v = parseFloat(e.target.value); if (v > 0) { save("bodyWeightKg", v); save("weightUpdatedAt", new Date().toISOString()); } }}
                inputMode="decimal" placeholder="0.0"
                className="w-24 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>kg</span>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Height</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Asked once — it doesn&apos;t change.</p>
            <div className="mt-2 flex items-center gap-2">
              <input value={height} onChange={(e) => { setHeight(e.target.value); const v = parseFloat(e.target.value); if (v > 0) save("heightCm", v); }}
                inputMode="decimal" placeholder="0"
                className="w-24 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>cm</span>
            </div>
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

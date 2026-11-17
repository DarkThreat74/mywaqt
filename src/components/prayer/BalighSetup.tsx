"use client";

import { useState } from "react";

interface BalighBirthday {
  id: string;
  name: string;
  birthMonth: number;
  birthDay: number;
  birthYear: number | null;
  isSelf: boolean;
}

type Step = "age" | "date" | "candidates" | "create";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const inputStyle = {
  borderColor: "var(--color-paper-3)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink)",
} as const;

async function postBaligh(body: { balighDate?: string; balighAge?: number }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/qadaa/baligh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, error: data.error || "Something went wrong." };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

export default function BalighSetup({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState<Step>("age");
  const [age, setAge] = useState("");
  const [date, setDate] = useState("");
  const [candidates, setCandidates] = useState<BalighBirthday[]>([]);
  const [balighAge, setBalighAge] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => onDone?.();

  async function submitAge() {
    const n = parseInt(age, 10);
    if (!Number.isInteger(n) || n < 5 || n > 40) {
      setError("Enter an age between 5 and 40.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/qadaa/baligh").catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      const list: BalighBirthday[] = Array.isArray(data?.birthdays) ? data.birthdays : [];
      setBalighAge(n);
      if (list.length > 0) {
        setCandidates(list);
        setStep("candidates");
      } else {
        setStep("create");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDate() {
    if (!date) {
      setError("Pick the date you became baligh.");
      return;
    }
    setError(null);
    setBusy(true);
    const r = await postBaligh({ balighDate: date });
    setBusy(false);
    if (r.ok) finish();
    else setError(r.error || "Something went wrong.");
  }

  async function pickCandidate(b: BalighBirthday) {
    if (balighAge == null || busy) return;
    setError(null);
    setBusy(true);
    // Mark the birthday as "me" — if this fails the baligh POST still runs and
    // returns its own helpful error.
    await fetch("/api/birthdays", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, isSelf: true }),
    }).catch(() => null);
    const r = await postBaligh({ balighAge });
    setBusy(false);
    if (r.ok) finish();
    else setError(r.error || "Something went wrong.");
  }

  async function submitOwnBirthday() {
    if (balighAge == null || busy) return;
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    const n = (name || "Me").trim().slice(0, 60);
    if (!n || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > 31 || !Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) {
      setError("Fill in a valid name, month, day, and year.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/birthdays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, birthMonth: m, birthDay: d, birthYear: y, isSelf: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save your birthday.");
        setBusy(false);
        return;
      }
      const r = await postBaligh({ balighAge });
      setBusy(false);
      if (r.ok) finish();
      else setError(r.error || "Something went wrong.");
    } catch {
      setBusy(false);
      setError("Network error. Please try again.");
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>When did you become baligh?</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          Used for your Lifetime view — your prayer history starts here.
        </p>
      </div>
      <div className="px-4 py-4 sm:px-5">
        {step === "age" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }} htmlFor="baligh-age">
              How old were you?
            </label>
            <div className="flex items-center gap-2">
              <input
                id="baligh-age"
                type="number"
                inputMode="numeric"
                min={5}
                max={40}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 13"
                className="w-24 rounded-lg border px-3 py-2 text-center text-sm tabular-nums outline-none"
                style={inputStyle}
              />
              <button
                onClick={() => void submitAge()}
                disabled={busy}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
              >
                {busy ? "Checking…" : "Continue"}
              </button>
            </div>
            <button
              onClick={() => { setError(null); setStep("date"); }}
              className="mt-2 text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--color-ink-muted)" }}
            >
              I know the exact date
            </button>
          </div>
        )}

        {step === "date" && (
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }} htmlFor="baligh-date">
              Baligh date
            </label>
            <input
              id="baligh-date"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => { setError(null); setStep("age"); }}
                className="rounded-lg border px-3 py-2 text-xs font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
              >
                Back
              </button>
              <button
                onClick={() => void submitDate()}
                disabled={busy}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {step === "candidates" && (
          <div>
            <p className="mb-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Does one of these birthdays look like yours?
            </p>
            <div className="space-y-1.5">
              {candidates.map((b) => (
                <button
                  key={b.id}
                  onClick={() => void pickCandidate(b)}
                  disabled={busy}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                >
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {b.birthMonth}/{b.birthDay}/{b.birthYear}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => { setError(null); setStep("create"); }}
                className="text-xs font-medium"
                style={{ color: "var(--color-ink-muted)" }}
              >
                That&apos;s not me
              </button>
              <button
                onClick={finish}
                className="text-xs font-medium"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === "create" && (
          <div>
            <p className="mb-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Create your own birthday — we&apos;ll mark it as you.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Me)"
                maxLength={60}
                className="col-span-2 rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border px-2 py-2 text-sm outline-none"
                style={inputStyle}
                aria-label="Birth month"
              >
                <option value="">Month</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  placeholder="Day"
                  min={1}
                  max={31}
                  className="w-full rounded-lg border px-2 py-2 text-center text-sm tabular-nums outline-none"
                  style={inputStyle}
                  aria-label="Birth day"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Year"
                  min={1900}
                  max={new Date().getFullYear()}
                  className="w-full rounded-lg border px-2 py-2 text-center text-sm tabular-nums outline-none"
                  style={inputStyle}
                  aria-label="Birth year"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => { setError(null); setStep(candidates.length > 0 ? "candidates" : "age"); }}
                className="text-xs font-medium"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Back
              </button>
              <button
                onClick={() => void submitOwnBirthday()}
                disabled={busy}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
              >
                {busy ? "Saving…" : "Save & continue"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div aria-live="polite" className="mt-3 text-xs font-medium" style={{ color: "var(--color-warmth)" }}>
            {error}
          </div>
        )}

        {step !== "create" && step !== "candidates" && (
          <button
            onClick={finish}
            className="mt-3 text-xs font-medium"
            style={{ color: "var(--color-ink-muted)" }}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

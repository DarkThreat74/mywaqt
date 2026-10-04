"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Birthday } from "@/lib/db/schema";
import { birthdayLabel, daysUntilBirthday, turningAge, zodiac } from "@/lib/birthdays/math";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Reminder offsets offered as toggles — days before the birthday.
const REMIND_OPTIONS: { days: number; label: string }[] = [
  { days: 0, label: "On the day" },
  { days: 1, label: "1 day" },
  { days: 2, label: "2 days" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
];

interface FormState {
  name: string;
  month: number;
  day: string;
  year: string;
  remindDays: number[];
}

const EMPTY_FORM: FormState = { name: "", month: 1, day: "", year: "", remindDays: [0, 1] };

export default function BirthdaysClient() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/birthdays")
      .then((r) => (r.ok ? r.json() : { birthdays: [] }))
      .then((d) => setBirthdays(d.birthdays ?? []))
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  const sorted = useMemo(
    () =>
      [...birthdays].sort(
        (a, b) => daysUntilBirthday(a) - daysUntilBirthday(b),
      ),
    [birthdays],
  );

  function startEdit(b: Birthday) {
    setEditingId(b.id);
    setAdding(false);
    setForm({
      name: b.name,
      month: b.birthMonth,
      day: String(b.birthDay),
      year: b.birthYear ? String(b.birthYear) : "",
      remindDays: b.remindDays.length > 0 ? b.remindDays : [0],
    });
    setError(null);
  }

  function toggleRemind(days: number) {
    setForm((f) => {
      const has = f.remindDays.includes(days);
      const next = has ? f.remindDays.filter((d) => d !== days) : [...f.remindDays, days];
      return { ...f, remindDays: next.sort((a, b) => a - b) };
    });
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    const day = parseInt(form.day, 10);
    const year = form.year.trim() ? parseInt(form.year, 10) : null;
    if (!form.name.trim()) { setError("A name is required."); return; }
    if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[form.month - 1]) {
      setError(`Day must be 1–${DAYS_IN_MONTH[form.month - 1]} for ${MONTHS[form.month - 1]}.`);
      return;
    }
    if (form.remindDays.length === 0) { setError("Pick at least one reminder."); return; }
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      birthMonth: form.month,
      birthDay: day,
      birthYear: year,
      remindDays: form.remindDays,
    };
    try {
      const res = editingId
        ? await fetch("/api/birthdays", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch("/api/birthdays", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json().catch(() => ({}));
      const row: Birthday | undefined = data.birthday;
      if (res.ok && (row || data.offline)) {
        const applied: Birthday = row ?? {
          id: data.tempId as string,
          userId: "",
          name: payload.name,
          birthMonth: payload.birthMonth,
          birthDay: payload.birthDay,
          birthYear: payload.birthYear,
          remindDays: payload.remindDays,
          lastNotifiedOn: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setBirthdays((prev) =>
          editingId
            ? prev.map((b) => (b.id === editingId ? { ...b, ...applied, id: editingId } : b))
            : [...prev, applied],
        );
        setForm(EMPTY_FORM);
        setAdding(false);
        setEditingId(null);
      } else {
        setError(data.error || "Could not save");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/birthdays?id=${id}`, { method: "DELETE" });
      if (res.ok || res.status === 202) setBirthdays((prev) => prev.filter((b) => b.id !== id));
    } catch {
      // keep state
    } finally {
      setConfirmDeleteId(null);
    }
  }

  const next = sorted[0];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
            People
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Birthdays
          </h1>
        </div>
      </div>

      {/* Next-up strip */}
      {next && (() => {
        const d = daysUntilBirthday(next);
        const age = turningAge(next);
        return (
          <div className="mt-5 flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-accent-faint)" }}>
            <Cake className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>
              <span className="font-semibold">Next up:</span> {next.name}
              {age !== null && ` turns ${age}`} — {birthdayLabel(next)}
            </p>
            <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
              {d === 0 ? "today!" : `in ${d}d`}
            </span>
          </div>
        );
      })()}

      {error && <p className="mt-4 text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

      {/* Add / edit form */}
      {(adding || editingId) && (
        <form
          onSubmit={saveForm}
          className="mt-5 rounded-2xl border p-4 sm:p-5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {editingId ? "Edit birthday" : "New birthday"}
            </p>
            <button
              type="button"
              onClick={() => { setAdding(false); setEditingId(null); setForm(EMPTY_FORM); setError(null); }}
              className="rounded-md p-1 transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Name</span>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Amina"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Month</span>
              <select
                value={form.month}
                onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Day</span>
                <input
                  type="number"
                  min={1}
                  max={DAYS_IN_MONTH[form.month - 1]}
                  inputMode="numeric"
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  placeholder="14"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Year — optional</span>
                <input
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  inputMode="numeric"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  placeholder="2001"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
              </label>
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Remind me — tap all that apply
            </span>
            <div className="flex flex-wrap gap-2">
              {REMIND_OPTIONS.map((opt) => {
                const on = form.remindDays.includes(opt.days);
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => toggleRemind(opt.days)}
                    className="rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                      backgroundColor: on ? "var(--color-accent-faint)" : "var(--color-paper)",
                      color: on ? "var(--color-accent)" : "var(--color-ink-soft)",
                    }}
                    aria-pressed={on}
                  >
                    {opt.days === 0 ? opt.label : `${opt.label} before`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Save changes" : "Add birthday"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setEditingId(null); setForm(EMPTY_FORM); setError(null); }}
              className="rounded-full px-4 py-2.5 text-sm font-medium"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!adding && !editingId && (
        <button
          onClick={() => { setAdding(true); setForm(EMPTY_FORM); setError(null); }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          <Plus className="h-4 w-4" />
          Add a birthday
        </button>
      )}

      {/* List — sorted by next occurrence */}
      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
        </div>
      ) : birthdays.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Cake className="mb-3 h-8 w-8" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            No birthdays yet — add the first one above.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col">
          {sorted.map((b) => {
            const d = daysUntilBirthday(b);
            const age = turningAge(b);
            return (
              <div
                key={b.id}
                className="flex items-center gap-3 border-b py-3 last:border-0"
                style={{ borderColor: "var(--color-paper-3)" }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: d === 0 ? "var(--color-accent-faint)" : "var(--color-paper-2)" }}
                  aria-hidden
                >
                  <Cake className="h-4 w-4" style={{ color: d === 0 ? "var(--color-accent)" : "var(--color-ink-muted)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {b.name}
                    {age !== null && (
                      <span style={{ color: "var(--color-ink-muted)" }}> · turns {age}</span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {birthdayLabel(b)}{b.birthYear ? `, ${b.birthYear}` : ""} · {zodiac(b.birthMonth, b.birthDay)}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
                  style={
                    d === 0
                      ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
                      : d <= 7
                        ? { backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)" }
                        : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }
                  }
                >
                  {d === 0 ? "today!" : `in ${d}d`}
                </span>
                <button
                  onClick={() => startEdit(b)}
                  className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-muted)" }}
                  aria-label={`Edit ${b.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {confirmDeleteId === b.id ? (
                  <button
                    onClick={() => void remove(b.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(b.id)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label={`Delete ${b.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

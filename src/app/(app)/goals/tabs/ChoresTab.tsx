"use client";

/**
 * Chores — recurring household tasks on an interval, not a streak counter.
 * Tody-style "dueness": how far along the interval the task has drifted since
 * you last did it. Done stamps lastDoneAt; Plan drops it on the calendar as a
 * real timed event so it occupies time like an assignment.
 */

import { useMemo, useState } from "react";
import { BrushCleaning, Check, CalendarClock, Plus, Trash2, Loader2, X } from "lucide-react";
import type { Chore } from "@/lib/db/schema";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { fmtDur } from "@/lib/blocks/gaps";

function fmtDays(n: number) {
  return `${n} day${n === 1 ? "" : "s"}`;
}

interface Dueness {
  pct: number;          // 0..∞ — 1.0 means the interval elapsed
  label: string;
  tone: "fresh" | "soon" | "due" | "overdue";
}

function dueness(c: Chore, nowMs: number): Dueness {
  const freqMs = c.frequencyDays * 86400000;
  if (!c.lastDoneAt) return { pct: 1, label: "never done", tone: "due" };
  const elapsed = nowMs - new Date(c.lastDoneAt).getTime();
  const pct = elapsed / freqMs;
  const left = Math.ceil((freqMs - elapsed) / 86400000);
  const over = Math.floor((elapsed - freqMs) / 86400000);
  if (elapsed < 6 * 3600000) return { pct, label: "done just now", tone: "fresh" };
  if (pct >= 1) return { pct, label: `overdue ${fmtDays(over || 1)}`, tone: "overdue" };
  if (pct >= 0.8) return { pct, label: "due soon", tone: "due" };
  if (pct >= 0.55) return { pct, label: `due in ${fmtDays(Math.max(1, left))}`, tone: "soon" };
  return { pct, label: `in ${fmtDays(Math.max(1, left))}`, tone: "fresh" };
}

const TONE_COLOR: Record<Dueness["tone"], string> = {
  fresh: "var(--color-success)",
  soon: "var(--color-ink-muted)",
  due: "var(--color-accent)",
  overdue: "var(--color-warmth)",
};

export default function ChoresTab({
  chores,
  setChores,
}: {
  chores: Chore[];
  setChores: React.Dispatch<React.SetStateAction<Chore[]>>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [estMin, setEstMin] = useState("30");
  const [freqDays, setFreqDays] = useState("7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plan-it popover state — date + start time for the calendar event.
  const [planning, setPlanning] = useState<Chore | null>(null);
  const [planDate, setPlanDate] = useState("");
  const [planTime, setPlanTime] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [mountNow] = useState(() => Date.now());

  const sorted = useMemo(
    () => [...chores].sort((a, b) => dueness(b, mountNow).pct - dueness(a, mountNow).pct),
    [chores, mountNow],
  );

  async function addChore() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/chores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          estimatedMinutes: Math.max(5, parseInt(estMin) || 30),
          frequencyDays: Math.max(1, parseInt(freqDays) || 7),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setChores((prev) => [...prev, data]);
        setTitle(""); setEstMin("30"); setFreqDays("7"); setShowAdd(false);
        invalidateApiCache("/api/chores");
      } else {
        setError(data?.error || "Could not save chore");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  async function markDone(c: Chore) {
    const optimistic = { ...c, lastDoneAt: new Date() };
    setChores((prev) => prev.map((x) => (x.id === c.id ? optimistic : x)));
    try {
      const res = await fetch("/api/chores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, done: true }),
      });
      if (!res.ok && res.status !== 202) {
        setChores((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        return;
      }
      invalidateApiCache("/api/chores");
    } catch { /* offline — optimistic stands */ }
  }

  async function remove(c: Chore) {
    setChores((prev) => prev.filter((x) => x.id !== c.id));
    try {
      const res = await fetch(`/api/chores?id=${c.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 202) setChores((prev) => [...prev, c]);
      else invalidateApiCache("/api/chores");
    } catch {
      setChores((prev) => [...prev, c]);
    }
  }

  /** Drop the chore on the calendar as a timed task — it occupies real time. */
  async function planChore() {
    if (!planning || !planDate || !planTime) return;
    setSaving(true);
    try {
      const start = new Date(`${planDate}T${planTime}:00`);
      if (isNaN(start.getTime())) { setPlanError("Pick a valid date and time"); setSaving(false); return; }
      const end = new Date(start.getTime() + planning.estimatedMinutes * 60000);
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: planning.title,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          type: "task",
          clientId: crypto.randomUUID(),
        }),
      }).catch(() => null);
      if (res && !res.ok && res.status !== 202) {
        setPlanError("Couldn't add it to the calendar — try again");
        return;
      }
      invalidateApiCache("/api/events");
      setPlanError(null);
      setPlanning(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Chores recur on an interval — they&apos;re due when it&apos;s been long enough, not on a fixed day.
        </p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-85"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Take out the trash, vacuum room, change sheets…"
            className="w-full rounded-lg border px-3 py-2 text-base outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
            autoFocus
          />
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            <span>every</span>
            <input
              value={freqDays}
              onChange={(e) => setFreqDays(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="w-14 rounded-lg border px-2 py-1.5 text-center text-base"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              aria-label="Repeat every N days"
            />
            <span>days ·</span>
            <input
              value={estMin}
              onChange={(e) => setEstMin(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="w-14 rounded-lg border px-2 py-1.5 text-center text-base"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              aria-label="Estimated minutes"
            />
            <span>min</span>
          </div>
          {error && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{error}</p>}
          <button
            onClick={addChore}
            disabled={saving || !title.trim()}
            className="mt-3 rounded-full px-5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save chore"}
          </button>
        </div>
      )}

      {sorted.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
          <BrushCleaning className="h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            No chores yet — add things like taking out the trash or changing sheets.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((c) => {
            const d = dueness(c, mountNow);
            const color = TONE_COLOR[d.tone];
            return (
              <div
                key={c.id}
                className="rounded-xl border p-3"
                style={{ borderColor: "var(--color-paper-3)" }}
              >
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => void markDone(c)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ borderColor: color, color }}
                    aria-label={`Mark ${c.title} done`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>{c.title}</p>
                    <p className="text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      every {fmtDays(c.frequencyDays)} · ~{fmtDur(c.estimatedMinutes)}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`, color }}
                  >
                    {d.label}
                  </span>
                  <button
                    onClick={() => { setPlanning(c); setPlanDate(new Date().toLocaleDateString("en-CA")); setPlanTime(""); }}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label={`Plan ${c.title} on the calendar`}
                    title="Put it on the calendar"
                  >
                    <CalendarClock className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void remove(c)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label={`Delete ${c.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {/* Dueness bar — fills toward the deadline */}
                <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(2, d.pct * 100))}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan-it dialog — date + start time, duration is the chore's estimate */}
      {planning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => setPlanning(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Plan chore"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>
                Plan “{planning.title}” — ~{fmtDur(planning.estimatedMinutes)}
              </h3>
              <button
                onClick={() => setPlanning(null)}
                className="min-h-11 min-w-11 -m-2 rounded-lg p-2 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="flex-1 rounded-lg border px-3 py-2 text-base outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                aria-label="Chore date"
              />
              <input
                type="time"
                value={planTime}
                onChange={(e) => setPlanTime(e.target.value)}
                className="rounded-lg border px-3 py-2 text-base outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                aria-label="Start time"
              />
            </div>
            {planError && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{planError}</p>}
            <button
              onClick={() => void planChore()}
              disabled={saving || !planDate || !planTime}
              className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Put it on the calendar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

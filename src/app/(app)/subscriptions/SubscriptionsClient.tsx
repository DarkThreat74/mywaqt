"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  List,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Subscription } from "@/lib/db/schema";
import {
  type Cycle,
  daysUntil,
  formatMoney,
  monthlyCents,
  nextRenewal,
  paymentsElapsed,
  renewalsInMonth,
} from "@/lib/subscriptions/math";

// Palette offered in the picker — ink/adjacent tones on-theme with the app.
const SUB_COLORS = [
  "#c2410c", "#0f766e", "#1d4ed8", "#a21caf",
  "#b45309", "#475569", "#be123c", "#15803d",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
  "#ea580c", "#334155", "#9333ea", "#ca8a04",
];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "SAR", "AED", "PKR", "INR"];

type View = "list" | "calendar";

interface FormState {
  company: string;
  plan: string;
  amount: string;
  currency: string;
  cycle: Cycle;
  startDate: string;
  remindDays: string;
  color: string;
}

const EMPTY_FORM: FormState = {
  company: "",
  plan: "",
  amount: "",
  currency: "USD",
  cycle: "monthly",
  startDate: new Date().toLocaleDateString("en-CA"),
  remindDays: "3",
  color: SUB_COLORS[0],
};

interface Enriched extends Subscription {
  next: Date;
  inDays: number;
  spentCents: number;
}

export default function SubscriptionsClient() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("list");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((r) => (r.ok ? r.json() : { subscriptions: [] }))
      .then((d) => setSubs(d.subscriptions ?? []))
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  // Enrich each ACTIVE subscription with derived renewal data;
  // cancelled ones only keep their lifetime spend.
  const active = useMemo(() => subs.filter((s) => !s.cancelledAt), [subs]);
  const cancelled = useMemo(() => subs.filter((s) => !!s.cancelledAt), [subs]);

  const enriched: Enriched[] = useMemo(
    () =>
      active
        .map((s) => {
          const next = nextRenewal(s.startDate, s.cycle);
          return {
            ...s,
            next,
            inDays: daysUntil(next),
            spentCents: paymentsElapsed(s.startDate, s.cycle) * s.amountCents,
          };
        })
        .sort((a, b) => a.inDays - b.inDays),
    [active],
  );

  const totals = useMemo(() => {
    const monthly = active.reduce((sum, s) => sum + monthlyCents(s.amountCents, s.cycle), 0);
    const spent = subs.reduce((sum, s) => sum + paymentsElapsed(s.startDate, s.cycle) * s.amountCents, 0);
    const cur = subs[0]?.currency ?? "USD";
    return { monthly, yearly: monthly * 12, spent, cur };
  }, [active, subs]);

  // Renewals landing in the viewed calendar month
  const calDays = useMemo(() => {
    const map = new Map<number, Enriched[]>();
    for (const s of enriched) {
      for (const day of renewalsInMonth(s, calYear, calMonth)) {
        const arr = map.get(day) ?? [];
        arr.push(s);
        map.set(day, arr);
      }
    }
    return map;
  }, [enriched, calYear, calMonth]);

  function shiftMonth(delta: number) {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  }

  function startEdit(s: Subscription) {
    setEditingId(s.id);
    setAdding(false);
    setForm({
      company: s.company,
      plan: s.plan ?? "",
      amount: (s.amountCents / 100).toString(),
      currency: s.currency,
      cycle: s.cycle,
      startDate: s.startDate,
      remindDays: String(s.remindDaysBefore),
      color: s.color,
    });
    setError(null);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.company.trim() || !Number.isFinite(amount) || amount <= 0 || !form.startDate) {
      setError("Company, a positive amount, and a first bill date are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      company: form.company.trim(),
      plan: form.plan.trim() || null,
      amount,
      currency: form.currency,
      cycle: form.cycle,
      startDate: form.startDate,
      remindDaysBefore: parseInt(form.remindDays, 10) || 0,
      color: form.color,
    };
    try {
      const res = editingId
        ? await fetch("/api/subscriptions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch("/api/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json().catch(() => ({}));
      const sub: Subscription | undefined = data.subscription;
      if (res.ok && (sub || data.offline)) {
        // Offline 202s echo a synthetic subscription — apply it optimistically;
        // the queued write resolves to the same id via clientId on sync.
        const applied: Subscription = sub ?? {
          id: data.tempId as string,
          userId: "",
          company: payload.company,
          plan: payload.plan,
          amountCents: Math.round(payload.amount * 100),
          currency: payload.currency,
          cycle: payload.cycle,
          startDate: payload.startDate,
          remindDaysBefore: payload.remindDaysBefore,
          color: payload.color,
          cancelledAt: null,
          lastRenewalNotifiedOn: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setSubs((prev) =>
          editingId
            ? prev.map((s) => (s.id === editingId ? { ...s, ...applied, id: editingId } : s))
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

  async function setCancelled(id: string, cancelled: boolean) {
    try {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cancelled }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.subscription || data.offline)) {
        setSubs((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, cancelledAt: cancelled ? new Date() : null }
              : s,
          ),
        );
        if (cancelled) setEditingId(null);
      }
    } catch {
      // keep state
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/subscriptions?id=${id}`, { method: "DELETE" });
      // Offline deletes come back 202 — still apply optimistically
      if (res.ok || res.status === 202) setSubs((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // keep state
    } finally {
      setConfirmDeleteId(null);
    }
  }

  const dueSoon = (s: Enriched) => s.inDays <= s.remindDaysBefore;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
            Money
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Subscriptions
          </h1>
        </div>
        <div
          className="flex rounded-lg border p-0.5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          role="tablist"
          aria-label="View"
        >
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: view === v ? "var(--color-paper)" : "transparent",
                color: view === v ? "var(--color-ink)" : "var(--color-ink-muted)",
              }}
            >
              {v === "list" ? <List className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
              {v === "list" ? "List" : "Calendar"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats band — editorial figures, not cards */}
      {subs.length > 0 && (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b pb-5" style={{ borderColor: "var(--color-paper-3)" }}>
          <div>
            <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl" style={{ color: "var(--color-ink)" }}>
              {formatMoney(totals.monthly, totals.cur)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
              per month
            </p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
              {formatMoney(totals.yearly, totals.cur)}
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
              per year
            </p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-warmth)" }}>
              {formatMoney(totals.spent, totals.cur)}
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
              spent so far
            </p>
          </div>
          <p className="ml-auto text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {subs.length} active
          </p>
        </div>
      )}

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
              {editingId ? "Edit subscription" : "New subscription"}
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
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Company</span>
              <input
                autoFocus
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Amazon"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Plan</span>
              <input
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                placeholder="Prime"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Amount</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="14.99"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Currency</span>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full rounded-lg border px-2 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Billing</span>
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                {(["monthly", "yearly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, cycle: c })}
                    className="flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors"
                    style={{
                      backgroundColor: form.cycle === c ? "var(--color-ink)" : "transparent",
                      color: form.cycle === c ? "var(--color-paper)" : "var(--color-ink-muted)",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                First bill date
              </span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Remind me — days before
              </span>
              <input
                type="number"
                min={0}
                max={90}
                value={form.remindDays}
                onChange={(e) => setForm({ ...form, remindDays: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
          </div>

          <div className="mt-4">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Color</span>
            <div className="flex flex-wrap gap-2">
              {SUB_COLORS.map((c) => {
                const taken = subs.some((s) => s.color === c && s.id !== editingId);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className="relative h-7 w-7 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      outline: form.color === c ? `2px solid ${c}` : "none",
                      outlineOffset: 2,
                      opacity: form.color === c ? 1 : taken ? 0.45 : 0.65,
                    }}
                    aria-label={taken ? `Color ${c} — already in use` : `Color ${c}`}
                    title={taken ? "Already in use" : undefined}
                  >
                    {taken && (
                      <span
                        className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: "var(--color-paper)" }}
                        aria-hidden
                      />
                    )}
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Save changes" : "Add subscription"}
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

          {editingId && (
            <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                Not subscribed anymore? Cancelling keeps everything you already paid.
              </p>
              <button
                type="button"
                onClick={() => void setCancelled(editingId, true)}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper)]"
                style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}
              >
                Cancel subscription
              </button>
            </div>
          )}
        </form>
      )}

      {/* Add button */}
      {!adding && !editingId && (
        <button
          onClick={() => { setAdding(true); setForm(EMPTY_FORM); setError(null); }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          <Plus className="h-4 w-4" />
          Add a subscription
        </button>
      )}

      {/* Content */}
      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
        </div>
      ) : subs.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <CreditCard className="mb-3 h-8 w-8" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            No subscriptions yet — add the first one above.
          </p>
        </div>
      ) : view === "list" ? (
        /* ── List view — sorted by next renewal ── */
        <div className="mt-5 flex flex-col">
          {/* Next renewal hero strip */}
          {enriched[0] && (
            <div
              className="mb-2 flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ backgroundColor: "var(--color-accent-faint)" }}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: enriched[0].color }} aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>
                <span className="font-semibold">Next up:</span>{" "}
                {enriched[0].company}{enriched[0].plan ? ` ${enriched[0].plan}` : ""} — {formatMoney(enriched[0].amountCents, enriched[0].currency)}
              </p>
              <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                {enriched[0].inDays === 0 ? "today" : `in ${enriched[0].inDays}d`}
              </span>
            </div>
          )}
          {enriched.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 border-b py-3 last:border-0"
              style={{ borderColor: "var(--color-paper-3)" }}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  {s.company}
                  {s.plan && <span style={{ color: "var(--color-ink-muted)" }}> · {s.plan}</span>}
                </p>
                <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  {formatMoney(s.amountCents, s.currency)}/{s.cycle === "monthly" ? "mo" : "yr"}
                  {s.spentCents > 0 && ` · ${formatMoney(s.spentCents, s.currency)} spent`}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
                style={
                  s.inDays === 0
                    ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
                    : dueSoon(s)
                      ? { backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)" }
                      : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }
                }
                title={s.next.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              >
                {s.inDays === 0 ? "due today" : `in ${s.inDays}d`}
              </span>
              <button
                onClick={() => startEdit(s)}
                className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label={`Edit ${s.company}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {confirmDeleteId === s.id ? (
                <button
                  onClick={() => void remove(s.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                  style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}
                >
                  Delete?
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(s.id)}
                  className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-muted)" }}
                  aria-label={`Delete ${s.company}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── Calendar view — renewals on a month grid ── */
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => shiftMonth(-1)}
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              onClick={() => shiftMonth(1)}
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="pb-1 text-center text-[10px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                {d}
              </div>
            ))}
            {(() => {
              const first = new Date(calYear, calMonth, 1).getDay();
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
              const todayStr = new Date().toLocaleDateString("en-CA");
              const cells: React.ReactNode[] = [];
              for (let i = 0; i < first; i++) cells.push(<div key={`e${i}`} />);
              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const due = calDays.get(day);
                const isToday = dateStr === todayStr;
                cells.push(
                  <div
                    key={day}
                    className="flex min-h-14 flex-col rounded-lg border p-1 sm:min-h-16"
                    style={{
                      borderColor: isToday ? "var(--color-accent)" : "var(--color-paper-3)",
                      backgroundColor: due ? "var(--color-paper-2)" : "transparent",
                    }}
                  >
                    <span
                      className="text-[10px] font-medium tabular-nums"
                      style={{ color: isToday ? "var(--color-accent)" : "var(--color-ink-muted)" }}
                    >
                      {day}
                    </span>
                    <div className="mt-auto flex flex-col gap-0.5">
                      {due?.slice(0, 2).map((s) => (
                        <div
                          key={s.id}
                          className="truncate rounded px-1 text-[9px] font-medium leading-4"
                          style={{ backgroundColor: s.color, color: "var(--color-paper)" }}
                          title={`${s.company}${s.plan ? ` ${s.plan}` : ""} — ${formatMoney(s.amountCents, s.currency)}`}
                        >
                          {s.company}
                        </div>
                      ))}
                      {due && due.length > 2 && (
                        <span className="px-1 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                          +{due.length - 2}
                        </span>
                      )}
                    </div>
                  </div>,
                );
              }
              return cells;
            })()}
          </div>

          {/* This month's renewals */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Due this month
            </p>
            {calDays.size === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>Nothing renews this month.</p>
            ) : (
              <div className="mt-2 flex flex-col">
                {[...calDays.entries()]
                  .sort(([a], [b]) => a - b)
                  .flatMap(([day, list]) =>
                    list.map((s) => (
                      <div key={`${day}-${s.id}`} className="flex items-center gap-3 border-b py-2 last:border-0" style={{ borderColor: "var(--color-paper-3)" }}>
                        <span className="w-10 shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-warmth)" }}>
                          {new Date(calYear, calMonth, day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>
                          {s.company}{s.plan ? ` · ${s.plan}` : ""}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
                          {formatMoney(s.amountCents, s.currency)}
                        </span>
                      </div>
                    )),
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cancelled — history preserved, no future renewals ── */}
      {cancelled.length > 0 && (
        <div className="mt-10 border-t pt-5" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Cancelled · {cancelled.length}
          </p>
          <div className="mt-2 flex flex-col">
            {cancelled.map((s) => {
              const spent = paymentsElapsed(s.startDate, s.cycle, s.cancelledAt ? new Date(s.cancelledAt) : new Date()) * s.amountCents;
              return (
                <div key={s.id} className="flex items-center gap-3 py-2.5" style={{ opacity: 0.75 }}>
                  <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" style={{ color: "var(--color-ink-soft)", textDecoration: "line-through" }}>
                      {s.company}{s.plan ? ` · ${s.plan}` : ""}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                      {formatMoney(spent, s.currency)} paid in total
                      {s.cancelledAt && ` · ended ${new Date(s.cancelledAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => void setCancelled(s.id, false)}
                    className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                  >
                    Resubscribe
                  </button>
                  {confirmDeleteId === s.id ? (
                    <button
                      onClick={() => void remove(s.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                      style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}
                    >
                      Delete?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                      style={{ color: "var(--color-ink-muted)" }}
                      aria-label={`Delete ${s.company}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

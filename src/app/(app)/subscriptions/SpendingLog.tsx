"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Fuel,
  Loader2,
  Plus,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { Expense } from "@/lib/db/schema";
import { formatMoney } from "@/lib/subscriptions/math";

// Small tag set — "gas" unlocks gallons + $/gal math; the rest are
// amount + optional place. Tags are stored free-form but the picker
// keeps the list tight.
const TAGS = [
  { id: "gas", label: "Gas", icon: Fuel, unit: "gal", qtyLabel: "Gallons", placeLabel: "Station (optional)" },
  { id: "groceries", label: "Groceries", icon: ShoppingBasket, unit: null, qtyLabel: null, placeLabel: "Store (optional)" },
  { id: "dining", label: "Dining", icon: UtensilsCrossed, unit: null, qtyLabel: null, placeLabel: "Restaurant (optional)" },
  { id: "shopping", label: "Shopping", icon: ShoppingBag, unit: null, qtyLabel: null, placeLabel: "Store (optional)" },
  { id: "other", label: "Other", icon: Receipt, unit: null, qtyLabel: null, placeLabel: "Where (optional)" },
] as const;
type TagId = (typeof TAGS)[number]["id"];

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000);
}

interface FormState {
  tag: TagId;
  amount: string;
  quantity: string;
  place: string;
  occurredOn: string;
}

const today = () => new Date().toLocaleDateString("en-CA");
const EMPTY: FormState = { tag: "gas", amount: "", quantity: "", place: "", occurredOn: today() };

export default function SpendingLog() {
  const [entries, setEntries] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [activeTag, setActiveTag] = useState<TagId | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/expenses")
      .then((r) => (r.ok ? r.json() : { expenses: [] }))
      .then((d) => setEntries(d.expenses ?? []))
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  const shown = useMemo(
    () => (activeTag ? entries.filter((e) => e.tag === activeTag) : entries).slice(0, 30),
    [entries, activeTag],
  );

  // Pattern stats for the selected tag — spent so far, average gap between
  // entries, and a yearly projection: avg amount × (365 / avg gap). With
  // <2 entries there's no pattern yet, just the total.
  const stats = useMemo(() => {
    const list = (activeTag ? entries.filter((e) => e.tag === activeTag) : entries)
      .slice()
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const spent = list.reduce((s, e) => s + e.amountCents, 0);
    const cur = list[0]?.currency ?? "USD";
    if (list.length < 2) return { spent, cur, n: list.length, gapDays: 0, perYear: 0, expectedYear: 0 };
    const gapDays = Math.max(1, daysBetween(list[0].occurredOn, list[list.length - 1].occurredOn) / (list.length - 1));
    const perYear = 365 / gapDays;
    return { spent, cur, n: list.length, gapDays, perYear, expectedYear: (spent / list.length) * perYear };
  }, [entries, activeTag]);

  const tagDef = TAGS.find((t) => t.id === form.tag)!;
  const unitPrice = useMemo(() => {
    const amt = parseFloat(form.amount);
    const qty = parseFloat(form.quantity);
    return Number.isFinite(amt) && amt > 0 && Number.isFinite(qty) && qty > 0 ? amt / qty : null;
  }, [form.amount, form.quantity]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    const quantity = form.quantity ? parseFloat(form.quantity) : null;
    if (!Number.isFinite(amount) || amount <= 0 || !form.occurredOn) {
      setError("An amount and a date are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: form.tag,
          amount,
          currency: "USD",
          occurredOn: form.occurredOn,
          quantity: tagDef.unit ? quantity : null,
          unit: tagDef.unit && quantity ? tagDef.unit : null,
          place: form.place.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.expense || data.offline)) {
        const row: Expense = data.expense ?? {
          id: data.tempId as string,
          userId: "",
          tag: form.tag,
          amountCents: Math.round(amount * 100),
          currency: "USD",
          occurredOn: form.occurredOn,
          quantity,
          unit: tagDef.unit ?? null,
          place: form.place.trim() || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setEntries((prev) =>
          [row, ...prev].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
        );
        setForm({ ...EMPTY, tag: form.tag });
        setAdding(false);
        setActiveTag(form.tag);
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
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (res.ok || res.status === 202) setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // keep state
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="mt-10 border-t pt-6" style={{ borderColor: "var(--color-paper-3)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
          Spending log
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTagsOpen((o) => !o)}
            aria-expanded={tagsOpen || activeTag !== null}
            className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 36 }}
          >
            Tags <ChevronDown className={`h-3 w-3 transition-transform ${tagsOpen || activeTag ? "rotate-180" : ""}`} />
          </button>
          {!adding && (
            <button
              onClick={() => { setAdding(true); setError(null); }}
              className="flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 36 }}
            >
              <Plus className="h-3.5 w-3.5" /> Log
            </button>
          )}
        </div>
      </div>

      {/* Tag chips — tucked away until "Tags" is opened (or a filter is
          already set, so the active scope stays visible + clearable). */}
      {(tagsOpen || activeTag) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TAGS.map((t) => {
            const Icon = t.icon;
            const on = activeTag === t.id;
            const count = entries.filter((e) => e.tag === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTag(on ? null : t.id)}
                aria-pressed={on}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: on ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "transparent",
                  color: on ? "var(--color-accent)" : "var(--color-ink-muted)",
                  minHeight: 34,
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Pattern stats — editorial figures, same language as the subs band:
          spent so far, your rhythm, and the year it adds up to. */}
      {stats.n > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl" style={{ color: "var(--color-ink)" }}>
              {formatMoney(stats.spent, stats.cur)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
              {activeTag ? `${activeTag} so far` : "spent so far"}
            </p>
          </div>
          {stats.n >= 2 && (
            <>
              <div>
                <p className="text-base font-semibold tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
                  ~{Math.round(stats.gapDays)}d <span className="text-xs font-normal" style={{ color: "var(--color-ink-muted)" }}>apart · {formatMoney(Math.round(stats.spent / stats.n), stats.cur)}/entry</span>
                </p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                  your rhythm
                </p>
              </div>
              <div>
                <p className="text-base font-semibold tabular-nums" style={{ color: "var(--color-warmth)" }}>
                  ≈ {formatMoney(stats.expectedYear, stats.cur)} <span className="text-xs font-normal" style={{ color: "var(--color-ink-muted)" }}>· {Math.round(stats.perYear)}×</span>
                </p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                  on pace / year
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add-entry form — gas gets gallons + station; others just place */}
      {adding && (
        <form onSubmit={save} className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {TAGS.map((t) => {
                const Icon = t.icon;
                const on = form.tag === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm({ ...form, tag: t.id })}
                    aria-pressed={on}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                      backgroundColor: on ? "var(--color-accent)" : "var(--color-paper)",
                      color: on ? "var(--color-paper)" : "var(--color-ink-muted)",
                      minHeight: 34,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="rounded-md p-1 transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Date</span>
              <input
                type="date"
                value={form.occurredOn}
                max={today()}
                onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Amount</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="29.95"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            {tagDef.qtyLabel && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{tagDef.qtyLabel}</span>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  inputMode="decimal"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="6.966"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{tagDef.placeLabel}</span>
              <input
                value={form.place}
                onChange={(e) => setForm({ ...form, place: e.target.value })}
                placeholder={form.tag === "gas" ? "Shell" : "Target"}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
          </div>

          {unitPrice !== null && (
            <p className="mt-2 text-sm font-medium tabular-nums" style={{ color: "var(--color-accent)" }}>
              = ${unitPrice.toFixed(2)}/{tagDef.unit}
            </p>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 36 }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Log it"}
          </button>
        </form>
      )}

      {/* Entries */}
      {!loaded ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {entries.length === 0 ? "Nothing logged yet — a fill-up, a receipt, anything." : `No ${activeTag} entries.`}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col">
          {shown.map((e) => {
            const t = TAGS.find((x) => x.id === e.tag) ?? TAGS[TAGS.length - 1];
            const Icon = t.icon;
            const per = e.quantity && e.quantity > 0 ? e.amountCents / 100 / e.quantity : null;
            return (
              <div key={e.id} className="flex items-center gap-3 border-b py-3 last:border-0" style={{ borderColor: "var(--color-paper-3)" }}>
                <span className="w-12 shrink-0 text-sm font-medium tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {new Date(e.occurredOn + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}
                  title={t.label}
                >
                  <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t.label}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink-muted)" }}>
                  {e.quantity && e.unit ? `${e.quantity} ${e.unit}` : ""}
                  {per !== null ? ` · $${per.toFixed(2)}/${e.unit}` : ""}
                  {e.place ? `${e.quantity || per ? " · " : ""}${e.place}` : ""}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
                  {formatMoney(e.amountCents, e.currency)}
                </span>
                {confirmDeleteId === e.id ? (
                  <button
                    onClick={() => void remove(e.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}
                  >
                    Delete?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(e.id)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label="Delete entry"
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

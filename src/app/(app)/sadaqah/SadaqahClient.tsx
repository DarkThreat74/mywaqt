"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Plus, Eye, EyeOff, HandHeart, X } from "lucide-react";

interface SadaqahLog {
  id: string;
  amount: string;
  currency: string;
  category: string;
  note: string | null;
  date: string;
  createdAt: string;
}

interface SadaqahData {
  logs: SadaqahLog[];
  summary: Record<string, { count: number; total: number }>;
  grandTotal: number;
  currency: string;
  cardholderName: string | null;
}

const CATEGORIES = [
  { value: "sadaqah", label: "Sadaqah", color: "var(--color-accent)" },
  { value: "zakat", label: "Zakat", color: "var(--color-warmth)" },
  { value: "fidyah", label: "Fidyah", color: "var(--color-ink-soft)" },
  { value: "charity", label: "General Charity", color: "var(--color-success)" },
] as const;

function getCategoryColor(cat: string): string {
  return CATEGORIES.find((c) => c.value === cat)?.color || "var(--color-accent)";
}

function getCategoryLabel(cat: string): string {
  return CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatCardNumber(total: number): string {
  // Card number = total sadaqah amount, padded to 16 digits.
  // Uses the dollar amount directly (not cents) so $1,000 shows as
  // "0000 0000 0000 1000" — not "0010 0000" which reads as $10,000.
  const rounded = Math.round(total);
  const padded = rounded.toString().padStart(16, "0");
  return padded.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default function SadaqahClient() {
  const [data, setData] = useState<SadaqahData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("sadaqah");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SadaqahLog | null>(null);
  const [showBalance, setShowBalance] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/sadaqah").catch(() => null);
      if (res?.ok) {
        const json = await res.json().catch(() => null);
        if (json) setData(json);
      }
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => void fetchData());
  }, [fetchData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sadaqah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount, category, note: note.trim() || undefined, date }),
      });
      if (res.ok) {
        setAmount("");
        setNote("");
        setCategory("sadaqah");
        setDate(todayStr());
        setShowForm(false);
        await fetchData();
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.error || "Failed to log sadaqah.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }, [amount, category, note, date, fetchData]);

  const handleDelete = useCallback(async (log: SadaqahLog) => {
    try {
      const res = await fetch(`/api/sadaqah?id=${log.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        await fetchData();
      }
    } catch {
      /* non-critical */
    }
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: "var(--color-accent)", borderRightColor: "var(--color-accent)" }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading your Akhirah Card…</p>
        </div>
      </div>
    );
  }

  const currency = data?.currency || "USD";
  const grandTotal = data?.grandTotal ?? 0;
  const entryCount = data?.logs.length ?? 0;
  const cardholderName = data?.cardholderName || "Cardholder";

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── The Akhirah Card ── */}
      <div className="mb-6" style={{ perspective: "1000px" }}>
        <div
          className="relative overflow-hidden rounded-2xl p-4 sm:p-5"
          style={{
            aspectRatio: "1.586 / 1",
            maxWidth: "360px",
            margin: "0 auto",
            background: "linear-gradient(135deg, var(--color-ink) 0%, color-mix(in oklab, var(--color-ink) 82%, var(--color-accent)) 100%)",
            color: "var(--color-paper)",
            boxShadow: "0 16px 48px -16px color-mix(in oklab, var(--color-ink) 55%, transparent), inset 0 1px 0 color-mix(in oklab, var(--color-paper) 15%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-paper) 12%, transparent)",
          }}
        >
          {/* Sheen effect */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(circle at 20% 0%, color-mix(in oklab, var(--color-paper) 18%, transparent), transparent 50%)",
            }}
          />

          {/* Top row: card label + balance toggle */}
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--color-paper) 12%, transparent)" }}>
                <HandHeart className="h-4 w-4" style={{ color: "color-mix(in oklab, var(--color-paper) 80%, transparent)" }} />
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] sm:text-[10px]" style={{ color: "color-mix(in oklab, var(--color-paper) 70%, transparent)" }}>
                  Akhirah Card
                </p>
                <p className="text-[7px] uppercase tracking-wide sm:text-[8px]" style={{ color: "color-mix(in oklab, var(--color-paper) 40%, transparent)" }}>
                  Investment in the Hereafter
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="rounded-md p-1 transition-colors"
              style={{ color: "color-mix(in oklab, var(--color-paper) 60%, transparent)" }}
              aria-label={showBalance ? "Hide balance" : "Show balance"}
              aria-pressed={showBalance}
            >
              {showBalance ? <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            </button>
          </div>

          {/* Chip */}
          <div
            className="relative mt-2 h-5 w-8 rounded-md sm:mt-3 sm:h-6 sm:w-9"
            style={{
              background: "linear-gradient(135deg, #d4a843, #f5c842, #b8860b)",
              boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-paper) 25%, transparent)",
            }}
          >
            <div className="absolute inset-1 rounded-sm" style={{ border: "0.5px solid color-mix(in oklab, #000 20%, transparent)" }} />
          </div>

          {/* Card number */}
          <div className="relative mt-2 sm:mt-3">
            <p className="font-mono text-[11px] tabular-nums tracking-[0.1em] sm:text-[13px]" style={{ color: "color-mix(in oklab, var(--color-paper) 85%, transparent)" }}>
              {showBalance ? formatCardNumber(grandTotal) : "•••• •••• •••• ••••"}
            </p>
          </div>

          {/* Bottom row: balance + cardholder name */}
          <div className="relative mt-auto flex items-end justify-between pt-2 sm:pt-3">
            <div>
              <p className="text-[7px] uppercase tracking-wide sm:text-[8px]" style={{ color: "color-mix(in oklab, var(--color-paper) 45%, transparent)" }}>
                Balance
              </p>
              <p className="text-sm font-bold tabular-nums sm:text-base">
                {showBalance ? formatCurrency(grandTotal, currency) : "••••••"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[7px] uppercase tracking-wide sm:text-[8px]" style={{ color: "color-mix(in oklab, var(--color-paper) 45%, transparent)" }}>
                Cardholder
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wide sm:text-xs" style={{ color: "color-mix(in oklab, var(--color-paper) 80%, transparent)" }}>
                {cardholderName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      {data && entryCount > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-2">
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Entries</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{entryCount}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Total</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>
              {showBalance ? formatCurrency(grandTotal, currency) : "••••"}
            </p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Avg</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
              {showBalance ? formatCurrency(grandTotal / entryCount, currency) : "••••"}
            </p>
          </div>
        </div>
      )}

      {/* ── Category breakdown ── */}
      {data && entryCount > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const s = data.summary[cat.value];
            if (!s || s.count === 0) return null;
            return (
              <div
                key={cat.value}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5"
                style={{ borderColor: `color-mix(in oklab, ${cat.color} 20%, transparent)`, backgroundColor: `color-mix(in oklab, ${cat.color} 6%, transparent)` }}
              >
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="text-[11px] font-medium" style={{ color: "var(--color-ink)" }}>{cat.label}</span>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {showBalance ? formatCurrency(s.total, currency) : "••••"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── History ── */}
      {data && data.logs.length > 0 ? (
        <div className="mb-5">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            History
          </h2>
          <div className="space-y-2">
            {data.logs.map((log) => (
              <div
                key={log.id}
                className="group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
              >
                {/* Category dot */}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in oklab, ${getCategoryColor(log.category)} 10%, transparent)` }}
                >
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(log.category) }} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
                      {showBalance ? formatCurrency(parseFloat(log.amount), log.currency) : "••••"}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {formatDate(log.date)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11px] font-medium" style={{ color: getCategoryColor(log.category) }}>
                      {getCategoryLabel(log.category)}
                    </span>
                    {log.note && (
                      <>
                        <span className="text-[10px]" style={{ color: "var(--color-paper-3)" }}>·</span>
                        <p className="truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{log.note}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => setDeleteConfirm(log)}
                  className="shrink-0 rounded-lg p-2 opacity-60 transition-opacity hover:opacity-100"
                  style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }}
                  aria-label="Delete entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <HandHeart className="h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>No entries yet</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Start investing in your akhirah by logging your first sadaqah.
          </p>
        </div>
      )}

      {/* ── Add button (floating) ── */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 lg:bottom-8 lg:right-8"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-paper)",
          boxShadow: "0 8px 24px -8px color-mix(in oklab, var(--color-accent) 60%, transparent)",
        }}
        aria-label="Add sadaqah entry"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ── Add form (bottom sheet on mobile, dialog on desktop) ── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)",
            animation: "sadaqah-fade-in 0.2s ease-out",
          }}
          onClick={() => setShowForm(false)}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full overflow-hidden rounded-t-3xl border sm:max-w-md sm:rounded-3xl"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
              maxHeight: "90dvh",
              overflowY: "auto",
              animation: "sadaqah-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <div className="h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 sm:pt-4">
              <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Add Entry</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)", minHeight: 44, minWidth: 44 }}
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form body */}
            <div className="space-y-4 px-5 pb-5">
              {error && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "color-mix(in oklab, var(--color-error) 10%, transparent)", color: "var(--color-error)" }} aria-live="polite">
                  {error}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                  className="w-full rounded-xl border px-4 py-3 text-base outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 48 }}
                />
              </div>

              {/* Date + Category */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 48 }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors"
                      style={{
                        borderColor: category === cat.value ? cat.color : "var(--color-paper-3)",
                        color: category === cat.value ? cat.color : "var(--color-ink-muted)",
                        backgroundColor: category === cat.value ? `color-mix(in oklab, ${cat.color} 8%, transparent)` : "transparent",
                        minHeight: 44,
                      }}
                      aria-pressed={category === cat.value}
                    >
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What was it for?"
                  maxLength={500}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 48 }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 48 }}
              >
                {submitting ? "Saving…" : "Add to Akhirah Card"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)",
            animation: "sadaqah-fade-in 0.2s ease-out",
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete entry"
            className="w-full max-w-xs rounded-2xl border p-5 text-center"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              animation: "sadaqah-pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in oklab, var(--color-error) 10%, transparent)" }}>
              <Trash2 className="h-5 w-5" style={{ color: "var(--color-error)" }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Delete entry?</h3>
            <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {formatCurrency(parseFloat(deleteConfirm.amount), deleteConfirm.currency)} · {getCategoryLabel(deleteConfirm.category)}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper-2)", minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors"
                style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)", minHeight: 44 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes sadaqah-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sadaqah-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes sadaqah-pop-in {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @media (min-width: 640px) {
          @keyframes sadaqah-slide-up {
            from { transform: translateY(20px) scale(0.96); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}

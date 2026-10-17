"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Fuel,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { Expense } from "@/lib/db/schema";
import PhotoLightbox from "@/components/photo-lightbox";
import { compressImage } from "@/lib/image";
import { formatMoney } from "@/lib/subscriptions/math";

// Small tag set — "gas" unlocks gallons + $/gal math; "haircut" unlocks
// barber + photo thumbnail. Tags are stored free-form but the picker
// keeps the list tight.
const TAGS = [
  { id: "gas", label: "Gas", icon: Fuel, unit: "gal", qtyLabel: "Gallons", placeLabel: "Station (optional)", detailLabel: null, photo: false },
  { id: "groceries", label: "Groceries", icon: ShoppingBasket, unit: null, qtyLabel: null, placeLabel: "Store (optional)", detailLabel: null, photo: false },
  { id: "dining", label: "Dining", icon: UtensilsCrossed, unit: null, qtyLabel: null, placeLabel: "Restaurant (optional)", detailLabel: null, photo: false },
  { id: "haircut", label: "Haircut", icon: Scissors, unit: null, qtyLabel: null, placeLabel: "Shop (optional)", detailLabel: "Barber (optional)", photo: true },
  { id: "shopping", label: "Shopping", icon: ShoppingBag, unit: null, qtyLabel: null, placeLabel: "Store (optional)", detailLabel: null, photo: false },
  { id: "other", label: "Other", icon: Receipt, unit: null, qtyLabel: null, placeLabel: "Where (optional)", detailLabel: null, photo: false },
] as const;
type TagId = (typeof TAGS)[number]["id"];

// The list API omits photo bytes and sends a flag instead.
type ExpenseRow = Expense & { hasPhoto?: boolean };

// Photo → ≤900px JPEG q0.72, ~60-150KB — small enough to live in the row.
async function compressPhoto(file: File): Promise<{ b64: string; dataUrl: string }> {
  const { data, dataUrl } = await compressImage(file, 1280, 0.8);
  return { b64: data, dataUrl };
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000);
}

interface FormState {
  tag: TagId;
  amount: string;
  quantity: string;
  place: string;
  barber: string;
  occurredOn: string;
  // Preview URL (data: or /api/.../photo) for the picker thumbnail.
  photoUrl: string | null;
  // Fresh base64 when the user picked a new photo this edit.
  photoB64: string | null;
  // True once the user picks/removes — tells PATCH to write the column.
  photoDirty: boolean;
}

const today = () => new Date().toLocaleDateString("en-CA");
const EMPTY: FormState = { tag: "gas", amount: "", quantity: "", place: "", barber: "", occurredOn: today(), photoUrl: null, photoB64: null, photoDirty: false };
// Row shown in the list — `localPhoto` is the canvas data-URL used to render
// the photo before the server row id exists (optimistic save).
type Row = ExpenseRow & { localPhoto?: string };

export default function SpendingLog() {
  const [entries, setEntries] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [activeTag, setActiveTag] = useState<TagId | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/expenses")
      .then((r) => (r.ok ? r.json() : { expenses: [] }))
      .then((d) => setEntries(d.expenses ?? []))
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(
    () => (activeTag ? entries.filter((e) => e.tag === activeTag) : entries),
    [entries, activeTag],
  );

  // Entries grouped under month headers — "November 2025" breaks read
  // better than a flat date column once the log gets long.
  const groups = useMemo(() => {
    const cap = expanded ? filtered.length : 20;
    const out: { label: string; items: Row[] }[] = [];
    for (const e of filtered.slice(0, cap)) {
      const label = new Date(e.occurredOn + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [filtered, expanded]);

  // Pattern stats for the selected tag — spent so far, this month,
  // average gap between entries, yearly projection (avg × 365/gap),
  // and weighted avg unit price (Σamount ÷ Σqty) for measured tags.
  const stats = useMemo(() => {
    const list = filtered
      .slice()
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const spent = list.reduce((s, e) => s + e.amountCents, 0);
    const cur = list[0]?.currency ?? "USD";
    const monthKey = today().slice(0, 7);
    const thisMonth = list.filter((e) => e.occurredOn.startsWith(monthKey)).reduce((s, e) => s + e.amountCents, 0);
    const qtyList = list.filter((e) => e.quantity && e.quantity > 0);
    const totalQty = qtyList.reduce((s, e) => s + (e.quantity ?? 0), 0);
    const totalAmt = qtyList.reduce((s, e) => s + e.amountCents, 0);
    // amountCents → dollars before dividing, or gas reads "$450.70/gal"
    const avgUnit = totalQty > 0 ? totalAmt / 100 / totalQty : null;
    const unit = qtyList[0]?.unit ?? null;
    if (list.length < 2) return { spent, cur, n: list.length, thisMonth, avgUnit, unit, gapDays: 0, perYear: 0, expectedYear: 0 };
    const gapDays = Math.max(1, daysBetween(list[0].occurredOn, list[list.length - 1].occurredOn) / (list.length - 1));
    const perYear = 365 / gapDays;
    return { spent, cur, n: list.length, thisMonth, avgUnit, unit, gapDays, perYear, expectedYear: (spent / list.length) * perYear };
  }, [filtered]);

  // Last 6 months of spend as proportional bars — the shape of the habit.
  const months = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = filtered.filter((e) => e.occurredOn.startsWith(key)).reduce((s, e) => s + e.amountCents, 0);
      out.push({ label: d.toLocaleDateString("en-US", { month: "short" }), total });
    }
    return out;
  }, [filtered]);
  const monthMax = Math.max(1, ...months.map((m) => m.total));

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
    setError(null);
    const payload: Record<string, unknown> = {
      tag: form.tag,
      amount,
      currency: "USD",
      occurredOn: form.occurredOn,
      quantity: tagDef.unit ? quantity : null,
      unit: tagDef.unit && quantity ? tagDef.unit : null,
      place: form.place.trim() || null,
      detail: form.barber.trim() || null,
    };
    if (form.photoDirty) {
      payload.photo = form.photoB64;
      payload.photoMime = form.photoB64 ? "image/jpeg" : null;
    }

    // Optimistic commit — the row lands immediately (photo preview included)
    // and the upload syncs in the background instead of holding the form open.
    const prevRow = editingId ? entries.find((x) => x.id === editingId) : undefined;
    const tempId = editingId ?? `tmp-${crypto.randomUUID()}`;
    const optimistic: Row = {
      id: tempId,
      userId: "",
      tag: form.tag,
      amountCents: Math.round(amount * 100),
      currency: "USD",
      occurredOn: form.occurredOn,
      quantity,
      unit: tagDef.unit && quantity ? tagDef.unit : null,
      place: form.place.trim() || null,
      detail: form.barber.trim() || null,
      photoData: null,
      photoMime: null,
      hasPhoto: Boolean(form.photoB64 || (form.photoUrl && !form.photoDirty)),
      localPhoto: form.photoDirty ? (form.photoUrl ?? undefined) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Row;
    const sortDesc = (a: Row, b: Row) => b.occurredOn.localeCompare(a.occurredOn);
    setEntries((prev) =>
      (editingId ? prev.map((x) => (x.id === editingId ? { ...x, ...optimistic, id: editingId } : x)) : [optimistic, ...prev]).sort(sortDesc),
    );
    const tag = form.tag;
    setForm({ ...EMPTY, tag });
    setAdding(false);
    setEditingId(null);
    setActiveTag(tag);

    const revert = () =>
      setEntries((prev) =>
        (editingId && prevRow
          ? prev.map((x) => (x.id === tempId ? prevRow : x))
          : prev.filter((x) => x.id !== tempId)
        ).sort(sortDesc),
      );
    try {
      const res = await fetch("/api/expenses", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.expense || data.offline)) {
        const exp = (data.expense ?? null) as Expense | null;
        if (exp) {
          // POST/PATCH `.returning()` includes photoData — strip it, keep the flag.
          const real: Row = { ...exp, photoData: null, photoMime: null, hasPhoto: Boolean(exp.photoData) };
          setEntries((prev) => prev.map((x) => (x.id === tempId ? real : x)).sort(sortDesc));
        } else if (data.tempId) {
          setEntries((prev) => prev.map((x) => (x.id === tempId ? { ...x, id: data.tempId as string } : x)));
        }
      } else {
        revert();
        setError(data.error || "Could not save");
      }
    } catch {
      revert();
      setError("Network error — entry not saved");
    }
  }

  function startEdit(e: ExpenseRow) {
    setEditingId(e.id);
    setAdding(true);
    setForm({
      tag: (TAGS.some((t) => t.id === e.tag) ? e.tag : "other") as TagId,
      amount: (e.amountCents / 100).toString(),
      quantity: e.quantity ? String(e.quantity) : "",
      place: e.place ?? "",
      barber: e.detail ?? "",
      occurredOn: e.occurredOn,
      photoUrl: e.hasPhoto ? `/api/expenses/${e.id}/photo` : null,
      photoB64: null,
      photoDirty: false,
    });
    setError(null);
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (res.ok || res.status === 202) setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // keep state
    } finally {
      setConfirmDeleteId(null);
      // Deleting the entry being edited would leave the form bound to a
      // dead id — the next Save would PATCH a 404.
      if (editingId === id) { setEditingId(null); setAdding(false); setForm(EMPTY); }
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
            onClick={() => {
              // "Close" must actually close — while a filter is active the
              // `|| activeTag` render condition kept the chips pinned, so the
              // button looked dead. Closing clears the filter with it.
              if (tagsOpen || activeTag) { setTagsOpen(false); setActiveTag(null); }
              else setTagsOpen(true);
            }}
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
          spent so far, this month, your rhythm, the year it adds up to,
          and weighted avg unit price for measured tags (gas → avg $/gal). */}
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
          {stats.thisMonth > 0 && (
            <div>
              <p className="text-base font-semibold tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
                {formatMoney(stats.thisMonth, stats.cur)}
              </p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                this month
              </p>
            </div>
          )}
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
          {stats.avgUnit !== null && stats.unit && (
            <div>
              <p className="text-base font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                ${stats.avgUnit.toFixed(2)}<span className="text-xs font-normal" style={{ color: "var(--color-ink-muted)" }}>/{stats.unit} avg</span>
              </p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                what you&apos;re paying
              </p>
            </div>
          )}
        </div>
      )}

      {/* Six-month bars — the shape of the habit at a glance */}
      {stats.n > 0 && (
        <div className="mt-4 flex items-end gap-1.5" aria-hidden>
          {months.map((m, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-sm"
                style={{
                  height: Math.max(3, Math.round((m.total / monthMax) * 40)),
                  backgroundColor: i === months.length - 1 ? "var(--color-accent)" : "var(--color-paper-3)",
                }}
                title={`${m.label}: ${formatMoney(m.total, stats.cur)}`}
              />
              <span className="text-[9px] font-medium uppercase" style={{ color: "var(--color-ink-muted)" }}>{m.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add-entry form — gas gets gallons + station; others just place */}
      {adding && (
        <form onSubmit={save} className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
          {editingId && (
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--color-ink)" }}>Editing entry</p>
          )}
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
              onClick={() => { setAdding(false); setEditingId(null); setForm(EMPTY); setError(null); }}
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
            {tagDef.detailLabel && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{tagDef.detailLabel}</span>
                <input
                  value={form.barber}
                  onChange={(e) => setForm({ ...form, barber: e.target.value })}
                  placeholder="Sam"
                  maxLength={80}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
              </label>
            )}
          </div>

          {/* Photo thumbnail — compressed client-side before upload */}
          {tagDef.photo && (
            <div className="mt-3 flex items-center gap-3">
              {form.photoUrl ? (
                <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-paper-3)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumb from canvas/user file */}
                  <img src={form.photoUrl} alt="Haircut" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, photoUrl: null, photoB64: null, photoDirty: true })}
                    className="absolute right-0.5 top-0.5 rounded-full p-0.5"
                    style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 70%, transparent)", color: "var(--color-paper)" }}
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <label
                  className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed transition-colors hover:bg-[var(--color-paper)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                >
                  <ImagePlus className="h-4 w-4" />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      setPhotoBusy(true);
                      try {
                        const { b64, dataUrl } = await compressPhoto(f);
                        setForm((prev) => ({ ...prev, photoUrl: dataUrl, photoB64: b64, photoDirty: true }));
                      } catch {
                        setError("Couldn't read that image");
                      } finally {
                        setPhotoBusy(false);
                      }
                    }}
                  />
                </label>
              )}
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {photoBusy ? "Processing photo…" : form.photoUrl ? "Compressed — saved with the entry." : "Optional — a photo of the cut."}
              </p>
            </div>
          )}

          {unitPrice !== null && (
            <p className="mt-2 text-sm font-medium tabular-nums" style={{ color: "var(--color-accent)" }}>
              = ${unitPrice.toFixed(2)}/{tagDef.unit}
            </p>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{error}</p>}

          <button
            type="submit"
            className="mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 36 }}
          >
            {editingId ? "Save changes" : "Log it"}
          </button>
        </form>
      )}

      {/* Entries */}
      {!loaded ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {entries.length === 0 ? "Nothing logged yet — a fill-up, a receipt, anything." : `No ${activeTag} entries.`}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mt-4 mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                {g.label}
              </p>
              {g.items.map((e) => {
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
                {(e.hasPhoto || e.localPhoto) && (
                  <button
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border"
                    style={{ borderColor: "var(--color-paper-3)" }}
                    onClick={() => setLightbox({ src: e.localPhoto ?? `/api/expenses/${e.id}/photo`, alt: e.place ?? t.label })}
                    aria-label="View photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- owner-scoped thumb */}
                    <img src={e.localPhoto ?? `/api/expenses/${e.id}/photo`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink-muted)" }}>
                  {e.quantity && e.unit ? `${e.quantity} ${e.unit}` : ""}
                  {per !== null ? ` · $${per.toFixed(2)}/${e.unit}` : ""}
                  {e.place ? `${e.quantity || per ? " · " : ""}${e.place}` : ""}
                  {e.detail ? `${e.quantity || per || e.place ? " · " : ""}${e.detail}` : ""}
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
                  <>
                    <button
                      onClick={() => startEdit(e)}
                      className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                      style={{ color: "var(--color-ink-muted)" }}
                      aria-label="Edit entry"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(e.id)}
                      className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                      style={{ color: "var(--color-ink-muted)" }}
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
            </div>
          ))}
          {filtered.length > 20 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 self-start text-xs font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              Show all {filtered.length} entries
            </button>
          )}
        </div>
      )}

      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
}

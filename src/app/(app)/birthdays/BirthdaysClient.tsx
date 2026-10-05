"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cake, CalendarDays, Check, ChevronDown, List, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import type { Birthday, BirthdayCategory } from "@/lib/db/schema";
import { birthdayLabel, daysUntilBirthday, turningAge, zodiac } from "@/lib/birthdays/math";
import { CATEGORY_COLORS } from "@/lib/birthdays/palette";

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
  categoryId: string | null;
}

const EMPTY_FORM: FormState = { name: "", month: 1, day: "", year: "", remindDays: [0, 1], categoryId: null };

/** Theme-styled dropdown — replaces native <select> for pickers. */
function CustomSelect({
  value,
  onChange,
  options,
  ariaLabel,
  align = "left",
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: React.ReactNode; dividerAbove?: boolean }[];
  ariaLabel: string;
  align?: "left" | "right";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border text-sm outline-none transition-colors ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2"}`}
        style={{
          borderColor: open ? "var(--color-accent)" : "var(--color-paper-3)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink)",
        }}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute z-30 mt-1 max-h-64 min-w-full overflow-y-auto rounded-xl border py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)", width: "max-content", minWidth: "100%" }}
        >
          {options.map((o) => (
            <li key={o.value}>
              {o.dividerAbove && <div className="my-1 border-t" style={{ borderColor: "var(--color-paper-3)" }} />}
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink)" }}
              >
                {o.label}
                {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-accent)" }} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BirthdaysClient() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [categories, setCategories] = useState<BirthdayCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "year">("list");
  const [makingCat, setMakingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0]);
  const [armDeleteCatId, setArmDeleteCatId] = useState<string | null>(null);
  // Two independent, persisted filters — sort order and category. Whatever the
  // user picks last becomes the remembered default across visits.
  const [sort, setSort] = useState<"earliest" | "latest">(() => {
    try {
      const raw = localStorage.getItem("waqt-birthday-filters");
      const v = raw ? (JSON.parse(raw) as { sort?: string }).sort : undefined;
      return v === "latest" ? "latest" : "earliest";
    } catch { return "earliest"; }
  });
  const [catFilter, setCatFilter] = useState<string>(() => {
    try {
      const raw = localStorage.getItem("waqt-birthday-filters");
      return (raw ? (JSON.parse(raw) as { cat?: string }).cat : undefined) ?? "all";
    } catch { return "all"; }
  });

  useEffect(() => {
    try {
      localStorage.setItem("waqt-birthday-filters", JSON.stringify({ sort, cat: catFilter }));
    } catch { /* private mode */ }
  }, [sort, catFilter]);

  const catMap = useMemo(() => {
    const m = new Map<string, BirthdayCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  useEffect(() => {
    fetch("/api/birthdays")
      .then((r) => (r.ok ? r.json() : { birthdays: [], categories: [] }))
      .then((d) => {
        setBirthdays(d.birthdays ?? []);
        setCategories(d.categories ?? []);
      })
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  // A persisted category filter can outlive its category — fall back to All.
  const effectiveCat = catFilter !== "all" && !categories.some((c) => c.id === catFilter) ? "all" : catFilter;

  const sorted = useMemo(
    () =>
      [...birthdays].sort(
        (a, b) => daysUntilBirthday(a) - daysUntilBirthday(b),
      ),
    [birthdays],
  );

  // Category first, then sort order — the two filters compose.
  const visible = useMemo(() => {
    const items = effectiveCat === "all" ? sorted : sorted.filter((b) => b.categoryId === effectiveCat);
    return sort === "latest" ? [...items].reverse() : items;
  }, [sorted, sort, effectiveCat]);

  const sortOptions = useMemo(
    () => [
      { value: "earliest", label: "Earliest" },
      { value: "latest", label: "Latest" },
    ],
    [],
  );

  const catOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...categories.map((c) => ({
        value: c.id,
        label: (
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </span>
        ),
      })),
    ],
    [categories],
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
      categoryId: b.categoryId,
    });
    setError(null);
  }

  async function createCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/birthday-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newCatColor }),
      });
      const data = await res.json().catch(() => ({}));
      if ((res.ok || res.status === 202) && (data.category || data.offline)) {
        const cat: BirthdayCategory = data.category ?? {
          id: data.tempId as string,
          userId: "",
          name,
          color: newCatColor,
          createdAt: new Date(),
        };
        setCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]));
        setForm((f) => ({ ...f, categoryId: cat.id }));
        setMakingCat(false);
        setNewCatName("");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: string) {
    try {
      const res = await fetch(`/api/birthday-categories?id=${id}`, { method: "DELETE" });
      if (res.ok || res.status === 202) {
        setCategories((prev) => prev.filter((c) => c.id !== id));
        setBirthdays((prev) => prev.map((b) => (b.categoryId === id ? { ...b, categoryId: null } : b)));
        setForm((f) => (f.categoryId === id ? { ...f, categoryId: null } : f));
      }
    } catch {
      // keep state
    } finally {
      setArmDeleteCatId(null);
    }
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
    const maxDay = form.month === 2 && year !== null
      ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
      : DAYS_IN_MONTH[form.month - 1];
    if (!Number.isInteger(day) || day < 1 || day > maxDay) {
      setError(`Day must be 1–${maxDay} for ${MONTHS[form.month - 1]}${year ? ` ${year}` : ""}.`);
      return;
    }
    if (year !== null && (year < 1900 || year > new Date().getFullYear())) {
      setError("Year must be between 1900 and this year.");
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
      categoryId: form.categoryId,
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
          categoryId: payload.categoryId,
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
  const now = new Date();
  const thisMonthCount = birthdays.filter((b) => b.birthMonth === now.getMonth() + 1).length;
  const groups: { label: string; items: Birthday[] }[] = [
    { label: "Today", items: visible.filter((b) => daysUntilBirthday(b) === 0) },
    { label: "This week", items: visible.filter((b) => { const d = daysUntilBirthday(b); return d >= 1 && d <= 7; }) },
    { label: "This month", items: visible.filter((b) => { const d = daysUntilBirthday(b); return d >= 8 && d <= 31; }) },
    { label: "Later", items: visible.filter((b) => daysUntilBirthday(b) > 31) },
  ].filter((g) => g.items.length > 0);
  const byMonth = MONTHS.map((_, i) =>
    visible
      .filter((b) => b.birthMonth === i + 1)
      .sort((a, b) => a.birthDay - b.birthDay),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
            People
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Birthdays
          </h1>
        </div>
        {birthdays.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-24 sm:w-32">
              <CustomSelect
                value={sort}
                onChange={(v) => setSort(v as "earliest" | "latest")}
                options={sortOptions}
                ariaLabel="Sort birthdays"
                compact
              />
            </div>
            {categories.length > 0 && (
              <div className="w-24 sm:w-36">
                <CustomSelect
                  value={effectiveCat}
                  onChange={setCatFilter}
                  options={catOptions}
                  ariaLabel="Filter by category"
                  compact
                />
              </div>
            )}
            <div
            className="flex rounded-lg border p-0.5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
            role="tablist"
            aria-label="View"
          >
            {(["list", "year"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3"
                style={{
                  backgroundColor: view === v ? "var(--color-paper)" : "transparent",
                  color: view === v ? "var(--color-ink)" : "var(--color-ink-muted)",
                }}
              >
                {v === "list" ? <List className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{v === "list" ? "List" : "Year"}</span>
              </button>
            ))}
          </div>
          </div>
        )}
      </div>

      {/* Stats band — editorial figures, matching the subscriptions page */}
      {birthdays.length > 0 && next && (() => {
        const d = daysUntilBirthday(next);
        const age = turningAge(next);
        return (
          <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b pb-5" style={{ borderColor: "var(--color-paper-3)" }}>
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl" style={{ color: d === 0 ? "var(--color-accent)" : "var(--color-ink)" }}>
                {d === 0 ? "Today" : `${d}d`}
              </p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                {next.name}{age !== null ? ` turns ${age}` : ""}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                {birthdayLabel(next)}
              </p>
            </div>
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl" style={{ color: "var(--color-ink)" }}>
                {birthdays.length}
              </p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                {birthdays.length === 1 ? "person" : "people"}
              </p>
            </div>
            {thisMonthCount > 0 && (
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl" style={{ color: "var(--color-ink)" }}>
                  {thisMonthCount}
                </p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                  in {MONTHS[now.getMonth()]}
                </p>
              </div>
            )}
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
            <div className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Month</span>
              <CustomSelect
                value={String(form.month)}
                onChange={(v) => setForm({ ...form, month: Number(v) })}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                ariaLabel="Birth month"
              />
            </div>
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

          {/* Category — optional grouping with its own color */}
          <div className="mt-4">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              <Tag className="h-3 w-3" /> Category — optional
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((c) => {
                const on = form.categoryId === c.id;
                return (
                  <span key={c.id} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, categoryId: on ? null : c.id })}
                      aria-pressed={on}
                      className="flex items-center gap-1.5 rounded-l-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        borderColor: on ? c.color : "var(--color-paper-3)",
                        backgroundColor: on ? `color-mix(in oklab, ${c.color} 12%, var(--color-paper))` : "var(--color-paper)",
                        color: on ? c.color : "var(--color-ink-soft)",
                        borderRightWidth: armDeleteCatId === c.id ? 0 : undefined,
                        borderRadius: armDeleteCatId === c.id ? "9999px 0 0 9999px" : 9999,
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                    {armDeleteCatId === c.id ? (
                      <button
                        type="button"
                        onClick={() => void deleteCategory(c.id)}
                        className="rounded-r-full border border-l-0 px-2 py-1.5 text-xs font-semibold"
                        style={{ borderColor: "var(--color-error)", color: "var(--color-error)", backgroundColor: "var(--color-paper)" }}
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setArmDeleteCatId(c.id)}
                        className="rounded-full px-1 py-1 transition-colors hover:bg-[var(--color-paper-3)]"
                        style={{ color: "var(--color-ink-muted)" }}
                        aria-label={`Delete category ${c.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
              {!makingCat ? (
                <button
                  type="button"
                  onClick={() => { setMakingCat(true); setArmDeleteCatId(null); }}
                  className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                >
                  <Plus className="h-3 w-3" /> New
                </button>
              ) : (
                <span className="flex flex-wrap items-center gap-2 rounded-xl border p-2" style={{ borderColor: "var(--color-paper-3)" }}>
                  <input
                    autoFocus
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createCategory(); } }}
                    placeholder="e.g. Siblings"
                    maxLength={40}
                    className="w-32 rounded-md border px-2 py-1 text-xs outline-none"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                  />
                  <span className="flex items-center gap-1">
                    {CATEGORY_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setNewCatColor(hex)}
                        aria-label={`Color ${hex}`}
                        aria-pressed={newCatColor === hex}
                        className="h-5 w-5 rounded-full transition-transform"
                        style={{
                          backgroundColor: hex,
                          outline: newCatColor === hex ? `2px solid var(--color-ink)` : "none",
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={() => void createCategory()}
                    disabled={busy || !newCatName.trim()}
                    className="rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMakingCat(false); setNewCatName(""); }}
                    className="rounded-full px-1 py-1"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label="Cancel new category"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
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

      {/* List — grouped by urgency */}
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
      ) : view === "year" ? (
        /* Year at a glance — 12 cells, birthdays pinned to their month */
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {MONTHS.map((m, i) => {
            const cell = byMonth[i];
            const isNow = i === now.getMonth();
            return (
              <div
                key={m}
                className="min-h-24 rounded-xl border p-3"
                style={{
                  borderColor: isNow ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: isNow ? "var(--color-accent-faint)" : "var(--color-paper)",
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: isNow ? "var(--color-accent)" : "var(--color-ink-muted)" }}
                >
                  {m.slice(0, 3)}
                </p>
                {cell.length === 0 ? (
                  <p className="mt-1.5 text-xs" style={{ color: "var(--color-paper-3)" }}>—</p>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {cell.map((b) => {
                      const cat = b.categoryId ? catMap.get(b.categoryId) : undefined;
                      return (
                        <button
                          key={b.id}
                          onClick={() => { setView("list"); startEdit(b); }}
                          className="flex min-w-0 items-baseline gap-1.5 text-left"
                          title={`${b.name}${cat ? ` (${cat.name})` : ""} — ${MONTHS[i]} ${b.birthDay}`}
                        >
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                            {b.birthDay}
                          </span>
                          <span className="truncate text-xs" style={{ color: cat?.color ?? "var(--color-ink)" }}>
                            {b.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            No birthdays in this category.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.label}>
              <p
                className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: g.label === "Today" ? "var(--color-accent)" : "var(--color-ink-muted)" }}
              >
                {g.label}
                <span className="h-px flex-1" style={{ backgroundColor: "var(--color-paper-3)" }} aria-hidden />
              </p>
              <div className="mt-1 flex flex-col">
                {g.items.map((b) => {
                  const d = daysUntilBirthday(b);
                  const age = turningAge(b);
                  const cat = b.categoryId ? catMap.get(b.categoryId) : undefined;
                  const reminds = b.remindDays
                    .map((r) => (r === 0 ? "day-of" : r >= 7 ? `${r / 7}w` : `${r}d`))
                    .join(" · ");
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 border-b py-3 last:border-0"
                      style={{ borderColor: "var(--color-paper-3)" }}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={
                          d === 0
                            ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
                            : cat
                              ? { backgroundColor: `color-mix(in oklab, ${cat.color} 14%, var(--color-paper))`, color: cat.color }
                              : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }
                        }
                        aria-hidden
                      >
                        {d === 0 ? <Cake className="h-4 w-4" /> : b.name.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                          {b.name}
                        </p>
                        {(cat || age !== null) && (
                          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                            {cat && <span className="font-medium" style={{ color: cat.color }}>{cat.name}</span>}
                            {cat && age !== null && " · "}
                            {age !== null && <>turns {age}</>}
                          </p>
                        )}
                        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                          {MONTHS[b.birthMonth - 1]} {b.birthDay}{b.birthYear ? `, ${b.birthYear}` : ""}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                          {zodiac(b.birthMonth, b.birthDay)}
                          <span className="hidden sm:inline"> · reminds {reminds}</span>
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

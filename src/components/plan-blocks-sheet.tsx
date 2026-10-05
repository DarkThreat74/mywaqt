"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Loader2, Pencil, Sparkles, X } from "lucide-react";
import type { Homework, StudyBlock } from "@/lib/db/schema";
import { defaultBlockIn, fmtDur, fmtMin, freeGaps, type Interval } from "@/lib/blocks/gaps";
import { formatDueBadge } from "@/lib/homework/due-format";

export interface BlockWithAssignments extends StudyBlock {
  assignments: {
    blockId: string;
    homeworkId: string;
    done: boolean;
    title: string;
    dueDate: string;
    hwStatus: string;
    estimatedMinutes?: number | null;
  }[];
}

interface Props {
  date: string;              // YYYY-MM-DD being planned
  isToday: boolean;
  isPast: boolean;
  busy: Interval[];          // events + prayer holds, minutes-from-midnight
  blocks: BlockWithAssignments[];
  onChanged: () => void;     // parent refetches blocks
  onClose: () => void;
  onPickOnCalendar?: () => void; // close sheet, let the user tap a time on the day grid
  initialGap?: Interval | null;  // open directly in compose mode for this gap
  initialBlock?: BlockWithAssignments | null;  // or directly editing this block
  dayStart?: number;           // planning-window bounds (minutes from midnight)
  dayEnd?: number;
}

const RELEASE_REASONS: { key: string; label: string }[] = [
  { key: "tired", label: "Too tired" },
  { key: "ran_out", label: "Ran out of time" },
  { key: "wasnt_free", label: "Wasn't actually free" },
  { key: "other", label: "Other" },
];

function minToTimeInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function timeInputToMin(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const v = parseInt(m[1]) * 60 + parseInt(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
}

export default function PlanBlocksSheet({ date, isToday, isPast, busy, blocks, onChanged, onClose, onPickOnCalendar, initialGap, initialBlock, dayStart, dayEnd }: Props) {
  const [hw, setHw] = useState<Homework[]>([]);
  const [unworked, setUnworked] = useState<BlockWithAssignments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Composer state — null when nothing is being drafted
  const [gapSel, setGapSel] = useState<Interval | null>(null);
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<BlockWithAssignments | null>(null);
  // "Draft for me" proposals — nothing is saved until the user confirms.
  const [draft, setDraft] = useState<{ startMin: number; endMin: number; hwIds: string[] }[] | null>(null);

  const gaps = useMemo(() => {
    const blockInts = blocks
      .filter((b) => b.status !== "released")
      .map((b) => ({ start: b.startMin, end: b.endMin }));
    return freeGaps([...busy, ...blockInts], dayStart, dayEnd);
  }, [busy, blocks, dayStart, dayEnd]);

  const plannedCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of blocks) {
      if (b.status !== "planned") continue;
      for (const a of b.assignments) {
        map.set(a.homeworkId, (map.get(a.homeworkId) ?? 0) + 1);
      }
    }
    return map;
  }, [blocks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [hwRes, unRes] = await Promise.all([
          // Unfiltered list (200 most recent by dueDate, ascending) — includes
          // overdue pending work, which is exactly what needs planning.
          fetch(`/api/homework`).catch(() => null),
          isToday ? fetch(`/api/blocks?unworked=1&date=${date}`).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (hwRes?.ok) {
          const data = await hwRes.json();
          setHw(Array.isArray(data) ? data.filter((h: Homework) => h.status === "pending") : []);
        }
        if (unRes?.ok) {
          const data = await unRes.json();
          setUnworked(data.blocks ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, isToday]);

  // Date changed while open (day nav) — drop any in-progress compose/edit so
  // it can't land on the wrong day. Runs before the initialGap effect.
  const lastDate = useRef(date);
  useEffect(() => {
    if (lastDate.current !== date) {
      lastDate.current = date;
      setGapSel(null);
      setEditingBlock(null);
      setPicked(new Set());
      setDraft(null);
      setError(null);
    }
  }, [date]);

  // Opened from a specific gap chip or block band — jump straight into
  // composing / editing it.
  useEffect(() => {
    if (initialGap) selectGap(initialGap);
    else if (initialBlock) selectBlock(initialBlock);
  }, [initialGap, initialBlock]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Lock the page behind the sheet — otherwise iOS scrolls the timeline.
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose]);

  function selectGap(g: Interval) {
    const d = defaultBlockIn(g);
    setGapSel(g);
    setEditingBlock(null);
    setDraft(null);
    setStartStr(minToTimeInput(d.start));
    setEndStr(minToTimeInput(d.end));
    setPicked(new Set());
    setError(null);
  }

  function selectBlock(b: BlockWithAssignments) {
    setEditingBlock(b);
    setGapSel(null);
    setDraft(null);
    setStartStr(minToTimeInput(b.startMin));
    setEndStr(minToTimeInput(b.endMin));
    setPicked(new Set(b.assignments.map((a) => a.homeworkId)));
    setError(null);
  }

  function togglePick(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    const start = timeInputToMin(startStr);
    const end = timeInputToMin(endStr);
    if (start === null || end === null || end - start < 15) {
      setError("Pick a start and end at least 15 minutes apart.");
      return;
    }
    setBusyAction(true);
    setError(null);
    try {
      const res = editingBlock
        ? await fetch("/api/blocks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingBlock.id, date, startMin: start, endMin: end, homeworkIds: [...picked] }),
          })
        : await fetch("/api/blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, startMin: start, endMin: end, homeworkIds: [...picked] }),
          });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 202) {
        setGapSel(null);
        setEditingBlock(null);
        setPicked(new Set());
        onChanged();
      } else {
        setError(data.error || "Could not save block");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setBusyAction(false);
    }
  }

  async function patchBlock(id: string, body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (res.ok || res.status === 202) onChanged();
    } catch {
      // keep state
    }
  }

  async function deleteBlock(id: string) {
    try {
      const res = await fetch(`/api/blocks?id=${id}`, { method: "DELETE" });
      if (res.ok || res.status === 202) {
        if (editingBlock?.id === id) setEditingBlock(null);
        onChanged();
      }
    } catch {
      // keep state
    }
  }

  /**
   * "Draft for me" — proposes blocks (earliest-deadline work into the longest
   * gaps) into a preview. Nothing is written until the user confirms; the
   * proposals render like real blocks so they can judge the plan first.
   */
  function buildDraft() {
    const unplanned = hw
      .filter((h) => !(plannedCounts.get(h.id) ?? 0))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (unplanned.length === 0 || gaps.length === 0) return;
    const sortedGaps = [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start));
    const hwQueue = [...unplanned];
    const proposals: { startMin: number; endMin: number; hwIds: string[] }[] = [];
    for (const g of sortedGaps) {
      if (hwQueue.length === 0) break;
      const d = defaultBlockIn(g);
      proposals.push({
        startMin: d.start,
        endMin: d.end,
        hwIds: hwQueue.splice(0, Math.min(2, hwQueue.length)).map((h) => h.id),
      });
    }
    setDraft(proposals.length > 0 ? proposals : null);
  }

  async function confirmDraft() {
    if (!draft) return;
    setBusyAction(true);
    try {
      for (const p of draft) {
        await fetch("/api/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, startMin: p.startMin, endMin: p.endMin, homeworkIds: p.hwIds }),
        }).catch(() => null);
      }
      setDraft(null);
      onChanged();
    } finally {
      setBusyAction(false);
    }
  }

  const composing = gapSel !== null || editingBlock !== null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Plan study blocks"
    >
      <button
        className="absolute inset-0"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }}
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border-t sm:rounded-2xl sm:border"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--color-paper-3)" }}
        >
          <div className="flex items-center gap-2">
            {composing && (
              <button
                onClick={() => { setGapSel(null); setEditingBlock(null); setPicked(new Set()); setError(null); }}
                className="rounded-md p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {composing ? (editingBlock ? "Edit block" : "New block") : `Plan ${isToday ? "today" : date}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!composing && !draft && !isPast && onPickOnCalendar && (
              <button
                onClick={onPickOnCalendar}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-85"
                style={{ backgroundColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                aria-label="Pick a time on the calendar"
              >
                <Pencil className="h-3.5 w-3.5" />
                Pick on calendar
              </button>
            )}
            {!composing && !draft && !isPast && gaps.length > 0 && hw.length > 0 && (
              <button
                onClick={buildDraft}
                disabled={busyAction}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Draft for me
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Close planner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {error && <p className="mb-3 text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
            </div>
          ) : composing ? (
            /* ── Composer: times + assignment picker ── */
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                  aria-label="Block start"
                />
                <span style={{ color: "var(--color-ink-muted)" }}>→</span>
                <input
                  type="time"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                  aria-label="Block end"
                />
              </div>

              <p className="mt-4 mb-2 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                Work on — tap to add
              </p>
              {hw.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No pending homework.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {hw.map((h) => {
                    const on = picked.has(h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => togglePick(h.id)}
                        aria-pressed={on}
                        className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors"
                        style={{
                          borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                          backgroundColor: on ? "var(--color-accent-faint)" : "transparent",
                        }}
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                          style={{
                            borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                            backgroundColor: on ? "var(--color-accent)" : "transparent",
                            color: "var(--color-paper)",
                          }}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>{h.title}</span>
                        <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                          {formatDueBadge(h.dueDate, h.dueTime).label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={save}
                  disabled={busyAction}
                  className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                >
                  {busyAction ? <Loader2 className="h-4 w-4 animate-spin" /> : editingBlock ? "Save block" : "Add block"}
                </button>
                {editingBlock && (
                  <button
                    onClick={() => void deleteBlock(editingBlock.id)}
                    className="rounded-full px-4 py-2.5 text-sm font-medium"
                    style={{ color: "var(--color-error)" }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Overview: draft preview, unworked tray, blocks, gaps, deadlines ── */
            <div className="flex flex-col gap-5">
              {/* Day summary line — the honesty meter at a glance */}
              {!loading && (
                <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  <span className="font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                    {fmtDur(gaps.reduce((s, g) => s + g.end - g.start, 0))} free
                  </span>
                  {" · "}
                  {hw.filter((h) => !(plannedCounts.get(h.id) ?? 0)).length} deadline{hw.filter((h) => !(plannedCounts.get(h.id) ?? 0)).length === 1 ? "" : "s"} need{hw.filter((h) => !(plannedCounts.get(h.id) ?? 0)).length === 1 ? "s" : ""} time
                </p>
              )}

              {/* Draft preview — "Draft for me" proposes, nothing is saved until confirmed */}
              {draft && (
                <section
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 5%, transparent)" }}
                >
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-accent)" }}>
                    <Sparkles className="h-3 w-3" /> Draft — review before saving
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {draft.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                        <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                          {fmtMin(p.startMin)}–{fmtMin(p.endMin)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>
                          {p.hwIds.map((id) => hw.find((h) => h.id === id)?.title ?? "Study").join(", ")}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                          {fmtDur(p.endMin - p.startMin)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={confirmDraft}
                      disabled={busyAction}
                      className="flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 36 }}
                    >
                      {busyAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Confirm plan
                    </button>
                    <button
                      onClick={() => setDraft(null)}
                      disabled={busyAction}
                      className="rounded-full px-4 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                      style={{ color: "var(--color-ink-muted)", minHeight: 36 }}
                    >
                      Discard
                    </button>
                  </div>
                </section>
              )}

              {unworked.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-warmth)" }}>
                    Didn&apos;t get worked
                  </p>
                  <div className="flex flex-col gap-2">
                    {unworked.map((b) => (
                      <div key={b.id} className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
                        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                          {b.assignments.map((a) => a.title).join(", ") || "Study block"}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                          was {new Date(`${b.blockDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {fmtMin(b.startMin)}–{fmtMin(b.endMin)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {/* Only offer gaps that can hold ≥15 min of the block */}
                          {gaps.filter((g) => g.end - g.start >= 15).slice(0, 3).map((g) => (
                            <button
                              key={g.start}
                              onClick={() => void patchBlock(b.id, { date, startMin: g.start, endMin: Math.max(g.start + 15, Math.min(g.start + (b.endMin - b.startMin), g.end)) })}
                              className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                            >
                              Move to {fmtMin(g.start)}
                            </button>
                          ))}
                          {RELEASE_REASONS.map((r) => (
                            <button
                              key={r.key}
                              onClick={() => void patchBlock(b.id, { status: "released", releaseReason: r.key })}
                              className="rounded-full px-2.5 py-1 text-[11px]"
                              style={{ color: "var(--color-ink-muted)" }}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {blocks.filter((b) => b.status !== "released").length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                    Planned blocks
                  </p>
                  <div className="flex flex-col gap-2">
                    {blocks.filter((b) => b.status !== "released").map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-2 rounded-xl border transition-colors hover:bg-[var(--color-paper-2)]"
                        style={{ borderColor: "var(--color-paper-3)" }}
                      >
                        <button
                          onClick={() => selectBlock(b)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                          aria-label={`Edit block ${fmtMin(b.startMin)} to ${fmtMin(b.endMin)}`}
                        >
                          <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                            {fmtMin(b.startMin)}–{fmtMin(b.endMin)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>
                            {b.assignments.map((a) => a.title).join(", ") || "Study block"}
                          </span>
                        </button>
                        {b.status === "worked" ? (
                          <span className="mr-3 shrink-0 text-[11px] font-semibold" style={{ color: "var(--color-success)" }}>worked ✓</span>
                        ) : isToday ? (
                          <button
                            onClick={() => void patchBlock(b.id, { status: "worked" })}
                            className="mr-2 shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-3)]"
                            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                          >
                            Mark worked
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!isPast && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                    Free gaps
                  </p>
                  {gaps.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No free gaps of 30+ minutes on this day.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {gaps.map((g) => (
                        <button
                          key={g.start}
                          onClick={() => selectGap(g)}
                          className="flex items-center justify-between rounded-xl border border-dashed px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                          style={{ borderColor: "var(--color-paper-3)" }}
                        >
                          <span className="text-sm font-medium tabular-nums" style={{ color: "var(--color-ink)" }}>
                            {fmtMin(g.start)} – {fmtMin(g.end)}
                          </span>
                          <span className="text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
                            {fmtDur(g.end - g.start)} free · plan →
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                  Deadlines — nearest first
                </p>
                {hw.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Nothing pending.</p>
                ) : (
                  <div className="flex flex-col">
                    {hw.map((h) => {
                      const n = plannedCounts.get(h.id) ?? 0;
                      return (
                        <div key={h.id} className="flex items-center gap-2 border-b py-2 last:border-0" style={{ borderColor: "var(--color-paper-3)" }}>
                          <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>{h.title}</span>
                          <span className="shrink-0 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                            {formatDueBadge(h.dueDate, h.dueTime).label}
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={
                              n === 0
                                ? { backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)" }
                                : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }
                            }
                          >
                            {n === 0 ? "unplanned" : `${n} block${n === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

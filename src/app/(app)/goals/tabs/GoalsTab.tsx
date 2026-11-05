"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Target, Plus, Check, Trash2, Loader2, ChevronUp, ChevronDown, Pencil, Eye, EyeOff, Tag } from "lucide-react";
import type { Goal } from "@/lib/db/schema";
import { compareGoals } from "@/lib/goals/tree";
import { relativeTarget } from "@/lib/goals/relative";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { syncGoalsToCache } from "@/lib/offline/cache-writers";
import { getDiscipline, mergeSessionHistory, type SessionEntry } from "@/lib/study/session";

// Suggested tags — each smart tag unlocks a subfield in the edit sheet:
//   test      → sessions target ("3/200 sessions" bar, plannable via Plan)
//   find-mine → hidden chip; a checkable criteria list under the goal
//   apply     → same checklist mechanism (application requirements)
//   read      → quantity target in pages (pace-line tracker)
//   save      → quantity target in money/units (pace-line tracker)
const TAG_SUGGESTIONS = ["test", "find-mine", "apply", "read", "save"];

// Functional tags that shouldn't render as chips — they describe behavior,
// not the goal.
const HIDDEN_TAGS = new Set(["find-mine", "apply"]);
const CHECKLIST_TAGS = new Set(["find-mine", "apply"]);
// Tag → quantity prompt for the pace-line tracker (progressTarget).
const QUANTITY_TAGS: Record<string, { label: string; placeholder: string }> = {
  read: { label: "How many pages in total?", placeholder: "e.g. 300" },
  save: { label: "How much do you want to save?", placeholder: "e.g. 5000" },
};

export type GoalHorizon = "week" | "month" | "year" | "all_time" | "bucket" | "rules" | "habits";

// Rules are principles — never completable, never dated, never quantified.
// All-time goals aren't "checked off" but CAN carry a target date (MCAT day,
// matriculation) — shown as a countdown, not a deadline.
// Bucket-list dreams are completable but timeless — no deadline, no pace line.
const COMPLETABLE: ReadonlySet<GoalHorizon> = new Set(["week", "month", "year", "bucket"]);
const DATED: ReadonlySet<GoalHorizon> = new Set(["week", "month", "year", "all_time"]);

const HORIZON_LABELS: Record<GoalHorizon, { title: string; sub: string; singular: string }> = {
  week:     { title: "This Week",        sub: "What you're pushing on right now",   singular: "weekly goal" },
  month:    { title: "This Month",       sub: "Milestones for the month ahead",     singular: "monthly goal" },
  year:     { title: "This Year",        sub: "The big things you're working toward", singular: "yearly goal" },
  all_time: { title: "All-time",         sub: "Life goals & fixed dates — MCAT, matriculation, milestones", singular: "life goal" },
  bucket:   { title: "Bucket list",      sub: "Dreams to chase in this lifetime — no deadline, just a list of someday", singular: "dream" },
  rules:    { title: "Rules to Live By", sub: "Principles you hold yourself to",     singular: "rule" },
  // Habits renders via HabitsTab inside the goals horizon — GoalsTab never
  // reaches this key, but the Record requires completeness.
  habits:   { title: "Habits",           sub: "Recurring commitments",              singular: "habit" },
};

// Day-granularity "now" for pace-line math — recomputed on each page load,
// which is precise enough for a progress-vs-expected indicator.
const NOW_MS = Date.now();

export default function GoalsTab({
  goals,
  setGoals,
  goalType,
}: {
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  goalType: GoalHorizon;
}) {
  const [loading, setLoading] = useState(false);
  // Edit mode — the header's big Edit button reveals reorder arrows, the
  // hide-from-today eye, the pencil, and delete on each row.
  const [editMode, setEditMode] = useState(false);
  const [addingRoot, setAddingRoot] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSessionsTarget, setEditSessionsTarget] = useState("");
  const [editProgressTarget, setEditProgressTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Session history for "N/target" on test-tagged goals — local now, server
  // merged in (cross-device).
  const [history, setHistory] = useState<SessionEntry[]>(() => getDiscipline().history);
  // goal.id → calendar event id for deadline events (createdVia "goal:<id>")
  const [calMap, setCalMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void fetch("/api/events?createdVia=goal:").then((r) => (r.ok ? r.json() : [])).then((rows: Array<{ id: string; createdVia?: string | null }>) => {
      const m = new Map<string, string>();
      for (const e of rows || []) {
        const gid = e.createdVia?.split(":")[1];
        if (gid) m.set(gid, e.id);
      }
      setCalMap(m);
    }).catch(() => {});
  }, []);
  const toggleCal = async (goal: Goal) => {
    const eid = calMap.get(goal.id);
    if (eid) {
      await fetch(`/api/events/${eid}`, { method: "DELETE" }).catch(() => {});
      setCalMap((m) => { const n = new Map(m); n.delete(goal.id); return n; });
    } else if (goal.targetDate) {
      const res = await fetch("/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Due: ${goal.title}`, startAt: `${goal.targetDate}T09:00:00`, endAt: `${goal.targetDate}T09:30:00`, createdVia: `goal:${goal.id}` }),
      }).catch(() => null);
      if (res?.ok) {
        const ev = await res.json();
        if (ev?.id) setCalMap((m) => new Map(m).set(goal.id, ev.id));
      }
    }
  };
  useEffect(() => {
    let cancelled = false;
    fetch("/api/study-history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d) && d.length) setHistory(mergeSessionHistory(d)); })
      .catch(() => null);
    return () => { cancelled = true; };
  }, []);
  // homeworkId → finished sessions count
  const sessionsByHw = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of history) {
      if (e.subjects?.some((s) => s.hw)) {
        const seen = new Set<string>();
        for (const s of e.subjects) if (s.hw) seen.add(s.hw);
        for (const hwId of seen) m.set(hwId, (m.get(hwId) ?? 0) + 1);
      }
    }
    return m;
  }, [history]);

  // Filter goals by type
  const filteredGoals = useMemo(
    () => goals.filter((g) => (g.goalType || "month") === goalType),
    [goals, goalType],
  );
  const { total, done } = useMemo(() => {
    const completable = filteredGoals.filter((g) => COMPLETABLE.has((g.goalType || "month") as GoalHorizon));
    return { total: completable.length, done: completable.filter((g) => g.status === "done").length };
  }, [filteredGoals]);

  // Sort goals by sortOrder for display
  const sortedGoals = useMemo(
    () => [...filteredGoals].sort(compareGoals),
    [filteredGoals],
  );

  // Reorder via up/down arrows — swap sortOrder with the visible neighbor.
  // More reliable on touch than HTML5 drag, which is why it replaced dnd.
  const moveGoal = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = sortedGoals.findIndex((g) => g.id === id);
      const swapIdx = idx + dir;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sortedGoals.length) return;
      const a = sortedGoals[idx];
      const b = sortedGoals[swapIdx];
      const aSort = a.sortOrder ?? 0;
      const bSort = b.sortOrder ?? 0;
      const newASort = aSort === bSort ? bSort + dir : bSort;
      const newBSort = aSort === bSort ? aSort : aSort;
      setGoals((prev) => {
        const updated = prev.map((g) =>
          g.id === a.id ? { ...g, sortOrder: newASort } : g.id === b.id ? { ...g, sortOrder: newBSort } : g,
        );
        syncGoalsToCache(updated);
        return updated;
      });
      for (const [gid, s] of [[a.id, newASort], [b.id, newBSort]] as const) {
        fetch("/api/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: gid, sortOrder: s }),
        }).catch(() => {});
      }
    },
    [sortedGoals, setGoals],
  );

  const createGoal = useCallback(
    async (title: string, parentId?: string | null, description?: string, targetDate?: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: trimmed, parentId: parentId ?? null, description: description?.trim() || undefined, goalType, targetDate: targetDate || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.goal) {
          // New goals land on top — sortOrder below the current minimum.
          const topSort = Math.min(0, ...sortedGoals.map((g) => g.sortOrder ?? 0)) - 1;
          const goal = { ...data.goal, sortOrder: topSort };
          setGoals((prev) => {
            const updated = [...prev, goal];
            syncGoalsToCache(updated);
            return updated;
          });
          fetch("/api/goals", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ id: goal.id, sortOrder: topSort }),
          }).catch(() => {});
          void invalidateApiCache("/api/goals");
        } else {
          setError(data.error || "Failed to create goal");
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [goalType, setGoals, sortedGoals],
  );

  const updateGoal = useCallback(
    async (id: string, updates: Partial<Goal>) => {
      // Save previous state for rollback on server rejection
      let prevGoals: Goal[] = [];
      setGoals((prev) => {
        prevGoals = prev;
        const updated = prev.map((g) =>
          g.id === id ? { ...g, ...updates, updatedAt: new Date() } : g,
        );
        syncGoalsToCache(updated);
        return updated;
      });
      try {
        const res = await fetch("/api/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, ...updates }),
        });
        const data = await res.json().catch(() => ({}));
        // Only overwrite with server response if it contains a full goal object.
        // When offline, the SW returns a generic 202 with no `goal` field,
        // so we keep the optimistic state as-is.
        if (res.ok && data.goal) {
          setGoals((prev) => {
            const updated = prev.map((g) => (g.id === id ? data.goal : g));
            syncGoalsToCache(updated);
            return updated;
          });
          void invalidateApiCache("/api/goals");
        } else if (!res.ok && res.status !== 202) {
          // Server rejected the change (validation error, etc.) — revert
          setGoals(prevGoals);
          syncGoalsToCache(prevGoals);
        }
      } catch {
        // Offline or network error — keep optimistic state (SW will queue)
      }
    },
    [setGoals],
  );

  const deleteGoal = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setGoals((prev) => {
          const toRemove = new Set<string>([id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const g of prev) {
              if (g.parentId && toRemove.has(g.parentId) && !toRemove.has(g.id)) {
                toRemove.add(g.id);
                changed = true;
              }
            }
          }
          const remaining = prev.filter((g) => !toRemove.has(g.id));
          syncGoalsToCache(remaining);
          return remaining;
        });
        void invalidateApiCache("/api/goals");
      }
    } catch {
      // keep state
    }
  }, [setGoals]);

  const horizon = HORIZON_LABELS[goalType] ?? HORIZON_LABELS.month;

  const isBucket = goalType === "bucket";

  return (
    <div
      className="flex flex-col gap-4"
      style={isBucket ? {
        // Dreamy cloud field — soft radial blooms in the same palette, no
        // imported art, no hard edges.
        backgroundImage: [
          "radial-gradient(ellipse 140px 90px at 12% 8%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
          "radial-gradient(ellipse 180px 110px at 82% 4%, color-mix(in oklab, var(--color-warmth) 12%, transparent), transparent 70%)",
          "radial-gradient(ellipse 160px 100px at 55% 30%, color-mix(in oklab, var(--color-paper-3) 40%, transparent), transparent 70%)",
          "radial-gradient(ellipse 200px 120px at 8% 60%, color-mix(in oklab, var(--color-paper-2) 70%, transparent), transparent 70%)",
          "radial-gradient(ellipse 170px 100px at 90% 78%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 70%)",
        ].join(", "),
        borderRadius: "1rem",
        padding: "0.75rem",
        margin: "-0.75rem",
      } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            {horizon.title}
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {horizon.sub}
            {COMPLETABLE.has(goalType) && total > 0 && ` · ${done}/${total} done`}
          </p>
        </div>
        <button
          onClick={() => { setEditMode((m) => !m); setEditingId(null); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          style={
            editMode
              ? { backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }
              : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }
          }
        >
          <Pencil className="h-3.5 w-3.5" />
          {editMode ? "Done" : "Edit"}
        </button>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

      {/* Add root goal */}
      {addingRoot ? (
        <div
          className="flex flex-col gap-3 rounded-xl border p-4"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { void createGoal(newTitle, null, newDescription, newTargetDate); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); setAddingRoot(false); }
              if (e.key === "Escape") { setAddingRoot(false); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); }
            }}
            placeholder={goalType === "rules" ? "A principle you hold yourself to..." : goalType === "bucket" ? "Something you dream of doing one day..." : `What do you want to achieve?`}
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { void createGoal(newTitle, null, newDescription, newTargetDate); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); setAddingRoot(false); }
              if (e.key === "Escape") { setAddingRoot(false); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); }
            }}
            placeholder={goalType === "rules" ? "Why this rule matters (optional)..." : "Why it matters (optional)..."}
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
          />
          {DATED.has(goalType) && (
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
                {goalType === "all_time" ? "A fixed day years out? (MCAT, matriculation — optional)" : "Target date (optional)"}
              </label>
              <input
                type="date"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { void createGoal(newTitle, null, newDescription, newTargetDate); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); setAddingRoot(false); }
                  if (e.key === "Escape") { setAddingRoot(false); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); }
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { void createGoal(newTitle, null, newDescription, newTargetDate); setNewTitle(""); setNewDescription(""); setNewTargetDate(""); setAddingRoot(false); }}
              disabled={loading || !newTitle.trim()}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </button>
            <button
              onClick={() => { setAddingRoot(false); setNewTitle(""); setNewDescription(""); }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingRoot(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          <Plus className="h-4 w-4" />
          Add {horizon.singular}
        </button>
      )}

      {/* Goal list */}
      {filteredGoals.length === 0 && !addingRoot ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Target className="h-8 w-8 mb-3" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            No {horizon.singular}s yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {sortedGoals.map((goal, i) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              horizon={goalType}
              editMode={editMode}
              isFirst={i === 0}
              isLast={i === sortedGoals.length - 1}
              onMove={moveGoal}
              editingId={editingId}
              setEditingId={setEditingId}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              editDescription={editDescription}
              setEditDescription={setEditDescription}
              editTargetDate={editTargetDate}
              setEditTargetDate={setEditTargetDate}
              editTags={editTags}
              setEditTags={setEditTags}
              editSessionsTarget={editSessionsTarget}
              setEditSessionsTarget={setEditSessionsTarget}
              editProgressTarget={editProgressTarget}
              setEditProgressTarget={setEditProgressTarget}
              sessionsDone={
                goal.homeworkId
                  ? (sessionsByHw.get(goal.homeworkId) ?? 0) +
                    // Sessions recorded before hw-tagging reached their subjects
                    // still carry the shadow homework's title in the label.
                    history.filter((e) =>
                      e.finished &&
                      !e.subjects?.some((s) => s.hw) &&
                      e.subjects?.some((s) => s.label.startsWith(`Study for: ${goal.title}`) || s.label === `Review Study for: ${goal.title}`)
                    ).length
                  : 0
              }
              onUpdate={updateGoal}
              onDelete={deleteGoal}
              calEventId={calMap.get(goal.id) ?? null}
              onToggleCal={() => void toggleCal(goal)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goal Row ───
function GoalRow({
  goal, horizon, editMode, isFirst, isLast, onMove, editingId, setEditingId,
  editTitle, setEditTitle, editDescription, setEditDescription, editTargetDate, setEditTargetDate,
  editTags, setEditTags, editSessionsTarget, setEditSessionsTarget,
  editProgressTarget, setEditProgressTarget, sessionsDone, onUpdate, onDelete, calEventId, onToggleCal,
}: {
  goal: Goal;
  horizon: GoalHorizon;
  editMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editTitle: string;
  setEditTitle: (s: string) => void;
  editDescription: string;
  setEditDescription: (s: string) => void;
  editTargetDate: string;
  setEditTargetDate: (s: string) => void;
  editTags: string[];
  setEditTags: (t: string[]) => void;
  editSessionsTarget: string;
  setEditSessionsTarget: (s: string) => void;
  editProgressTarget: string;
  setEditProgressTarget: (s: string) => void;
  sessionsDone: number;
  onUpdate: (id: string, updates: Partial<Goal>) => void;
  onDelete: (id: string) => void;
  calEventId?: string | null;
  onToggleCal?: () => void;
}) {
  const isDone = goal.status === "done";
  const isEditing = editingId === goal.id;
  // Rules and all-time goals aren't "finished" — no checkbox, no strike-through.
  const completable = COMPLETABLE.has(horizon);
  const dated = DATED.has(horizon);
  const showDone = completable && isDone;
  const isTestGoal = (goal.tags ?? []).includes("test");
  const isChecklistGoal = (goal.tags ?? []).some((t) => CHECKLIST_TAGS.has(t));
  const quantityTag = editTags.find((t) => QUANTITY_TAGS[t]);
  const [seededEditId, setSeededEditId] = useState<string | null>(null);
  const [calAsk, setCalAsk] = useState(false);
  const saveEdit = () => {
    onUpdate(goal.id, {
      title: editTitle,
      description: editDescription,
      targetDate: dated ? editTargetDate || null : goal.targetDate,
      tags: editTags,
      sessionsTarget: editTags.includes("test") && editSessionsTarget ? Number(editSessionsTarget) : null,
      progressTarget: quantityTag && editProgressTarget ? Number(editProgressTarget) : goal.progressTarget,
      checklist: isChecklistGoal || editTags.some((t) => CHECKLIST_TAGS.has(t)) ? goal.checklist : null,
    });
    setEditingId(null);
  };
  // Seed the tag/session inputs when editing starts — render-time
  // adjustment pattern (avoids setState-in-effect cascading renders)
  if (isEditing && seededEditId !== goal.id) {
    setSeededEditId(goal.id);
    setEditTags(goal.tags ?? []);
    setEditSessionsTarget(goal.sessionsTarget != null ? String(goal.sessionsTarget) : "");
    setEditProgressTarget(goal.progressTarget != null ? String(goal.progressTarget) : "");
  } else if (!isEditing && seededEditId !== null) {
    setSeededEditId(null);
  }

  return (
    <>
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-paper-2)]"
      style={{
        borderLeft: goal.color ? `3px solid ${goal.color}` : "3px solid transparent",
      }}
    >
      {/* Reorder arrows — edit mode only, touch-friendly */}
      {editMode && (
        <div className="mt-0.5 flex shrink-0 flex-col">
          <button
            onClick={() => onMove(goal.id, -1)}
            disabled={isFirst}
            className="rounded p-0.5 disabled:opacity-25"
            style={{ color: "var(--color-ink-muted)" }}
            title="Move up"
            aria-label={`Move ${goal.title} up`}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => onMove(goal.id, 1)}
            disabled={isLast}
            className="rounded p-0.5 disabled:opacity-25"
            style={{ color: "var(--color-ink-muted)" }}
            title="Move down"
            aria-label={`Move ${goal.title} down`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
      {completable ? (
        <button
          onClick={() => onUpdate(goal.id, { status: isDone ? "active" : "done", completedAt: isDone ? null : new Date() })}
          className="mt-0.5 shrink-0"
          title={isDone ? "Mark as not done" : "Mark as done"}
        >
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors"
            style={{
              borderColor: isDone ? "var(--color-accent)" : "var(--color-paper-3)",
              backgroundColor: isDone ? "var(--color-accent)" : "transparent",
            }}
          >
            {isDone && <Check className="h-3 w-3" style={{ color: "var(--color-paper)" }} />}
          </div>
        </button>
      ) : (
        <div className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-ink-muted)", opacity: 0.5 }} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {(
          <>
            <p
              className="text-sm font-medium"
              style={{
                color: showDone ? "var(--color-ink-muted)" : "var(--color-ink)",
                textDecoration: showDone ? "line-through" : "none",
              }}
            >
              {goal.title}
            </p>
            {goal.description && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-muted)" }}>{goal.description}</p>
            )}
            {goal.targetDate && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--color-warmth)" }}>
                <span>
                  {horizon === "all_time" ? "Target day" : "Target"}: {new Date(goal.targetDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                {relativeTarget(goal.targetDate) && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)" }}
                  >
                    {relativeTarget(goal.targetDate)}
                  </span>
                )}
              </p>
            )}
            {(goal.tags?.filter((t) => !HIDDEN_TAGS.has(t)).length ?? 0) > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {goal.tags!.filter((t) => !HIDDEN_TAGS.has(t)).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {/* Test goal — sessions progress ("3/200 finished") */}
            {isTestGoal && goal.sessionsTarget != null && goal.sessionsTarget > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative h-1.5 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-[width]"
                    style={{ width: `${Math.min(100, (sessionsDone / goal.sessionsTarget) * 100)}%`, backgroundColor: "var(--color-accent)" }}
                  />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {sessionsDone}/{goal.sessionsTarget} sessions
                </span>
              </div>
            )}
            {/* Checklist bullets — "find-mine"/"apply" goals keep a list of
                criteria under the title; each checks off via a PATCH. */}
            {isChecklistGoal && (
              <GoalChecklist goal={goal} editMode={editMode} onUpdate={onUpdate} />
            )}
            {/* Progress tracker with pace line — actual vs expected progress */}
            {goal.progressTarget != null && goal.progressTarget > 0 && !showDone && (() => {
              const pct = Math.min(100, (goal.progressCurrent / goal.progressTarget) * 100);
              let pacePct: number | null = null;
              let behind = false;
              if (goal.targetDate) {
                const start = new Date(goal.createdAt).getTime();
                const end = new Date(goal.targetDate + "T23:59:59").getTime();
                if (end > start) {
                  pacePct = Math.min(100, Math.max(0, ((NOW_MS - start) / (end - start)) * 100));
                  behind = pct < pacePct - 1;
                }
              }
              const barColor = behind ? "var(--color-warmth)" : "var(--color-success)";
              return (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative h-1.5 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-[width]"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                    {pacePct !== null && (
                      <div
                        className="absolute top-[-2px] h-[9px] w-[2px] rounded-full"
                        style={{ left: `${pacePct}%`, backgroundColor: "var(--color-ink)" }}
                        title="Pace — where you should be by now"
                      />
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums" style={{ color: behind ? "var(--color-warmth)" : "var(--color-ink-muted)" }}>
                    {goal.progressCurrent}/{goal.progressTarget}{behind ? " · behind" : ""}
                  </span>
                  {goal.progressCurrent > 0 && (
                    <button
                      onClick={() => onUpdate(goal.id, { progressCurrent: goal.progressCurrent - 1 })}
                      className="shrink-0 rounded border px-1.5 text-[11px] font-medium"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 22 }}
                      title="Undo one"
                    >
                      −1
                    </button>
                  )}
                  <button
                    onClick={() => onUpdate(goal.id, { progressCurrent: Math.min(goal.progressTarget!, goal.progressCurrent + 1) })}
                    className="shrink-0 rounded border px-1.5 text-[11px] font-medium"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 22 }}
                    title="Log progress"
                  >
                    +1
                  </button>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Controls: delete is always one tap; edit-mode adds the eye + pencil */}
      <div className="flex items-center gap-0.5 shrink-0">
        {editMode && (
          <>
            <button
              onClick={() => onUpdate(goal.id, { hiddenFromToday: !goal.hiddenFromToday })}
              className="rounded p-1.5 transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ color: goal.hiddenFromToday ? "var(--color-warmth)" : "var(--color-ink-muted)" }}
              title={goal.hiddenFromToday ? "Show on Today" : "Hide from Today"}
              aria-label={goal.hiddenFromToday ? `Show ${goal.title} on Today` : `Hide ${goal.title} from Today`}
            >
              {goal.hiddenFromToday ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { setEditingId(goal.id); setEditTitle(goal.title); setEditDescription(goal.description || ""); setEditTargetDate(goal.targetDate || ""); }}
              className="rounded p-1.5 transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ color: "var(--color-ink-muted)" }}
              title="Edit"
              aria-label={`Edit ${goal.title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => onDelete(goal.id)}
            className="rounded p-1.5 transition-colors hover:bg-[var(--color-paper-3)]"
            style={{ color: "var(--color-ink-muted)" }}
            title="Delete"
            aria-label={`Delete ${goal.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {goal.targetDate && onToggleCal && (
            <button
              onClick={() => setCalAsk(true)}
              className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ color: "var(--color-ink-muted)" }}
              title={calEventId ? "On the calendar" : "Add to calendar"}
              aria-label={calEventId ? `Remove ${goal.title} from calendar` : `Add ${goal.title} to calendar`}
            >
              {calEventId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Calendar-link confirm — + asks to add, ✓ asks to remove */}
    {calAsk && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setCalAsk(false)} aria-label="Cancel" />
        <div className="relative w-full max-w-xs rounded-t-2xl border-t p-4 sm:rounded-2xl sm:border"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
          <p className="text-center text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {calEventId ? "Remove from calendar?" : "Add to calendar?"}
          </p>
          <p className="mt-1 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            {calEventId ? `“${goal.title}” is scheduled on ${goal.targetDate}` : `“${goal.title}” on ${goal.targetDate}`}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setCalAsk(false)}
              className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>Cancel</button>
            <button type="button" onClick={() => { setCalAsk(false); onToggleCal?.(); }}
              className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
              style={calEventId ? { border: "1px solid var(--color-error)", color: "var(--color-error)" } : { backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
              {calEventId ? "Remove" : "Add"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit sheet — replaces inline editing. Bottom sheet on mobile,
        centered dialog on larger screens. */}
    {isEditing && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Edit ${goal.title}`}>
        <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setEditingId(null)} aria-label="Cancel" />
        <div className="relative flex max-h-[85dvh] w-full max-w-sm flex-col overflow-y-auto rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-ink-muted)" }}>
            Edit {horizon === "rules" ? "rule" : "goal"}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                {horizon === "rules" ? "Rule" : "Goal"}
              </span>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Description
              </span>
              <input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                placeholder="Optional"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </label>
            {dated && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  {horizon === "all_time" ? "Target day — e.g. MCAT, matriculation" : "Target date"}
                </span>
                <input
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
              </label>
            )}
            {horizon !== "rules" && (
              <div>
                <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  <Tag className="h-3 w-3" /> Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_SUGGESTIONS.map((tag) => {
                    const active = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setEditTags(active ? [] : [tag])}
                        className="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors"
                        style={
                          active
                            ? { borderColor: "var(--color-accent)", backgroundColor: "var(--color-accent-faint, var(--color-paper-2))", color: "var(--color-accent)" }
                            : { borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {editTags.includes("test") && (
                  <label className="mt-2 block">
                    <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                      How many study sessions do you need for this?
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={editSessionsTarget}
                      onChange={(e) => setEditSessionsTarget(e.target.value)}
                      placeholder="e.g. 200"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                    />
                    <span className="mt-1 block text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                      It becomes plannable from Plan — each finished session counts toward the target.
                    </span>
                  </label>
                )}
                {quantityTag && (
                  <label className="mt-2 block">
                    <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                      {QUANTITY_TAGS[quantityTag].label}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      value={editProgressTarget}
                      onChange={(e) => setEditProgressTarget(e.target.value)}
                      placeholder={QUANTITY_TAGS[quantityTag].placeholder}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                    />
                    <span className="mt-1 block text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                      Log progress with the +1 counter — a pace line shows if you&apos;re on track.
                    </span>
                  </label>
                )}
                {editTags.some((t) => CHECKLIST_TAGS.has(t)) && (
                  <span className="mt-2 block text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    This goal gets a checkable criteria list under it — add bullets from the goal row after saving.
                  </span>
                )}
              </div>
            )}
            <div className="mt-1 flex gap-2">
              <button
                onClick={saveEdit}
                className="flex-1 rounded-full py-3 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-full border px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── Goal checklist — criteria bullets for find-mine/apply goals ───
function GoalChecklist({
  goal, editMode, onUpdate,
}: {
  goal: Goal;
  editMode: boolean;
  onUpdate: (id: string, updates: Partial<Goal>) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const items = goal.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const setItems = (next: NonNullable<Goal["checklist"]>) =>
    onUpdate(goal.id, { checklist: next.length ? next : null });

  return (
    <div className="mt-1.5">
      {items.length > 0 && (
        <div className="mb-1 flex items-center gap-2">
          <div className="relative h-1 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-[width]"
              style={{ width: `${(done / items.length) * 100}%`, backgroundColor: "var(--color-accent)" }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {done}/{items.length}
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <button
              onClick={() => setItems(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
              style={{
                borderColor: item.done ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: item.done ? "var(--color-accent)" : "transparent",
              }}
              aria-label={item.done ? `Uncheck ${item.text}` : `Check ${item.text}`}
            >
              {item.done && <Check className="h-2.5 w-2.5" style={{ color: "var(--color-paper)" }} />}
            </button>
            <span
              className="min-w-0 flex-1 text-xs"
              style={{
                color: item.done ? "var(--color-ink-muted)" : "var(--color-ink-soft)",
                textDecoration: item.done ? "line-through" : "none",
              }}
            >
              {item.text}
            </span>
            {editMode && (
              <button
                onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                className="shrink-0 rounded px-1 text-[10px] transition-opacity hover:opacity-70"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label={`Remove ${item.text}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {/* Add-criteria row — edit mode only, and kept visually small so the
          checklist reads as a list, not a form. */}
      {editMode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = newItem.trim();
            if (!text) return;
            setItems([...items, { id: crypto.randomUUID(), text, done: false }]);
            setNewItem("");
          }}
          className="mt-1.5 flex items-center gap-1"
        >
          <Plus className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add a criteria — e.g. in-state, has research hours"
            className="min-w-0 flex-1 border-0 border-b bg-transparent py-0.5 text-xs outline-none"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
            maxLength={300}
          />
        </form>
      )}
    </div>
  );
}


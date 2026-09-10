"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Repeat, Plus, Check, Trash2, Flame, GripVertical } from "lucide-react";
import type { Habit, HabitLog } from "@/lib/db/schema";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { upsertHabitToCache, deleteHabitFromCache, toggleHabitLogInCache } from "@/lib/offline/cache-writers";

const HABIT_COLORS = [
  "#c2410c", // burnt orange
  "#0e7490", // teal
  "#b45309", // amber
  "#15803d", // forest green
  "#be185d", // rose
  "#3730a3", // indigo
  "#a16207", // mustard
  "#9f1239", // crimson
  "#1e40af", // royal blue
  "#7c2d12", // sienna
  "#166534", // pine
  "#86198f", // magenta
  "#155e75", // cyan
  "#854d0e", // bronze
  "#3f6212", // olive
  "#831843", // plum
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return days;
}

export default function HabitsTab({
  habits,
  setHabits,
  habitLogs,
  setHabitLogs,
}: {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  habitLogs: HabitLog[];
  setHabitLogs: React.Dispatch<React.SetStateAction<HabitLog[]>>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]); // 0=Sun, 1=Mon, ...
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragCooldownRef = useRef(false);

  const activeHabits = useMemo(
    () => habits
      .filter((h) => !h.archived)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [habits],
  );

  const handleReorder = useCallback(
    (draggedHabitId: string, targetHabitId: string) => {
      const ids = activeHabits.map((h) => h.id);
      const fromIdx = ids.indexOf(draggedHabitId);
      const toIdx = ids.indexOf(targetHabitId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      const newOrder = [...ids];
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, moved);

      setHabits((prev) => {
        const updated = prev.map((h) => {
          const newIdx = newOrder.indexOf(h.id);
          if (newIdx === -1) return h;
          if ((h.sortOrder || 0) === newIdx) return h;
          return { ...h, sortOrder: newIdx };
        });
        return updated;
      });

      // Persist changed sortOrders
      for (const id of newOrder) {
        const newIdx = newOrder.indexOf(id);
        const habit = activeHabits.find((h) => h.id === id);
        if (habit && (habit.sortOrder || 0) !== newIdx) {
          fetch("/api/habits", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, sortOrder: newIdx }),
          }).catch(() => {});
        }
      }
    },
    [activeHabits, setHabits],
  );
  const last7Days = useMemo(() => getLast7Days(), []);
  const today = todayStr();

  const logsByHabitAndDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const log of habitLogs) {
      map.set(`${log.habitId}_${log.date}`, true);
    }
    return map;
  }, [habitLogs]);

  const isCompletedToday = useCallback(
    (habitId: string) => logsByHabitAndDate.has(`${habitId}_${today}`),
    [logsByHabitAndDate, today],
  );

  const getStreak = useCallback(
    (habitId: string): number => {
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (logsByHabitAndDate.has(`${habitId}_${dateStr}`)) {
          streak++;
        } else if (i > 0) {
          break; // gap found
        }
      }
      return streak;
    },
    [logsByHabitAndDate],
  );

  const handleAddHabit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color, frequency, timeOfDay, reminderTime: reminderTime || null }),
      });
      if (res.ok) {
        const newHabit = await res.json();
        setHabits((prev) => [...prev, newHabit]);
        upsertHabitToCache(newHabit);
        invalidateApiCache("/api/habits");
        setName("");
        setColor(HABIT_COLORS[habits.length % HABIT_COLORS.length]);
        setTimeOfDay(null);
        setReminderTime("");
        setShowDayPicker(false);
        setSelectedDays([]);
        setShowAddForm(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add habit");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (habitId: string) => {
    const wasCompleted = isCompletedToday(habitId);
    // Optimistic update
    if (wasCompleted) {
      setHabitLogs((prev) => prev.filter((l) => !(l.habitId === habitId && l.date === today)));
    } else {
      setHabitLogs((prev) => [...prev, {
        id: `temp_${habitId}_${today}`,
        userId: "",
        habitId,
        date: today,
        count: 1,
        completedAt: new Date(),
      }]);
    }
    toggleHabitLogInCache(habitId, today, !wasCompleted);
    try {
      const res = await fetch("/api/habit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId, date: today }),
      });
      if (!res.ok) throw new Error("Server rejected the change");
      invalidateApiCache("/api/habits");
    } catch {
      // revert on failure
      if (wasCompleted) {
        setHabitLogs((prev) => [...prev, {
          id: `temp_${habitId}_${today}`, userId: "", habitId, date: today, count: 1, completedAt: new Date(),
        }]);
      } else {
        setHabitLogs((prev) => prev.filter((l) => !(l.habitId === habitId && l.date === today)));
      }
    }
  };

  const handleDelete = async (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    setHabitLogs((prev) => prev.filter((l) => l.habitId !== habitId));
    deleteHabitFromCache(habitId);
    try {
      await fetch(`/api/habits/${habitId}`, { method: "DELETE" });
      invalidateApiCache("/api/habits");
    } catch {
      // keep state
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Habits</h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {activeHabits.length} active · tap to check off today
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

      {showAddForm && (
        <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddHabit(); if (e.key === "Escape") setShowAddForm(false); }}
            placeholder="Habit name (e.g., Read Quran, Exercise, Dhikr)..."
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Color:</span>
            {HABIT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full transition-transform"
                style={{ backgroundColor: c, transform: color === c ? "scale(1.2)" : "none", border: color === c ? "2px solid var(--color-ink)" : "none" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Frequency:</span>
            {(["daily", "weekly"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFrequency(f); setShowDayPicker(false); }}
                className="rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors"
                style={{
                  backgroundColor: frequency === f && !showDayPicker ? "var(--color-ink)" : "var(--color-paper-2)",
                  color: frequency === f && !showDayPicker ? "var(--color-paper)" : "var(--color-ink-muted)",
                }}
              >
                {f}
              </button>
            ))}
            <button
              onClick={() => { setShowDayPicker(true); setFrequency("weekly"); }}
              className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: showDayPicker ? "var(--color-ink)" : "var(--color-paper-2)",
                color: showDayPicker ? "var(--color-paper)" : "var(--color-ink-muted)",
              }}
            >
              Other
            </button>
          </div>

          {/* Day-of-week picker (shown when "Other" is selected) */}
          {showDayPicker && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>On:</span>
              {["S", "M", "T", "W", "T", "F", "S"].map((dayLabel, idx) => {
                const isSelected = selectedDays.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedDays((prev) =>
                        isSelected ? prev.filter((d) => d !== idx) : [...prev, idx]
                      );
                    }}
                    className="h-8 w-8 rounded-full text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: isSelected ? "var(--color-ink)" : "var(--color-paper-2)",
                      color: isSelected ? "var(--color-paper)" : "var(--color-ink-muted)",
                    }}
                  >
                    {dayLabel}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Time of day:</span>
            <button
              onClick={() => setTimeOfDay(null)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: timeOfDay === null ? "var(--color-ink)" : "var(--color-paper-2)",
                color: timeOfDay === null ? "var(--color-paper)" : "var(--color-ink-muted)",
              }}
            >
              Anytime
            </button>
            {(["morning", "afternoon", "evening", "night"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeOfDay(t)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors"
                style={{
                  backgroundColor: timeOfDay === t ? "var(--color-ink)" : "var(--color-paper-2)",
                  color: timeOfDay === t ? "var(--color-paper)" : "var(--color-ink-muted)",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Reminder time:</span>
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="rounded-lg border px-2 py-1 text-xs outline-none"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddHabit}
              disabled={saving || !name.trim()}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              {saving ? "Adding..." : "Add habit"}
            </button>
            <button onClick={() => setShowAddForm(false)} className="rounded-lg px-3 py-1.5 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeHabits.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Repeat className="h-8 w-8 mb-3" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No habits yet. Start building a streak.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activeHabits.map((habit) => {
            const completedToday = isCompletedToday(habit.id);
            const streak = getStreak(habit.id);
            return (
              <div
                key={habit.id}
                draggable
                onDragStart={() => setDraggedId(habit.id)}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); if (draggedId && draggedId !== habit.id && !dragCooldownRef.current) { setDragOverId(habit.id); dragCooldownRef.current = true; setTimeout(() => { dragCooldownRef.current = false; }, 150); } }}
                onDrop={() => { if (draggedId && draggedId !== habit.id) handleReorder(draggedId, habit.id); setDraggedId(null); setDragOverId(null); }}
                className="flex flex-col gap-2 rounded-xl border p-3"
                style={{
                  borderColor: dragOverId === habit.id ? "var(--color-accent)" : "var(--color-paper-3)",
                  opacity: draggedId === habit.id ? 0.4 : 1,
                  borderTop: dragOverId === habit.id ? "2px solid var(--color-accent)" : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Drag handle */}
                  <div
                    className="shrink-0 cursor-grab touch-none"
                    style={{ color: "var(--color-ink-muted)", opacity: 0.4 }}
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <button
                    onClick={() => handleToggle(habit.id)}
                    className="shrink-0"
                    title={completedToday ? "Uncheck" : "Check off today"}
                  >
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all"
                      style={{
                        borderColor: completedToday ? habit.color : "var(--color-paper-3)",
                        backgroundColor: completedToday ? habit.color : "transparent",
                      }}
                    >
                      {completedToday && <Check className="h-4 w-4" style={{ color: "var(--color-paper)" }} />}
                    </div>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{habit.name}</p>
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                      <span className="capitalize">{habit.frequency}</span>
                      {streak > 0 && (
                        <span className="flex items-center gap-0.5" style={{ color: habit.color }}>
                          <Flame className="h-3 w-3" />
                          {streak} day{streak > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(habit.id)}
                    className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)]"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Last 7 days mini heatmap */}
                <div className="flex items-center gap-1 pl-10">
                  {last7Days.map((date) => {
                    const done = logsByHabitAndDate.has(`${habit.id}_${date}`);
                    const isToday = date === today;
                    return (
                      <div
                        key={date}
                        className="h-5 w-5 rounded"
                        style={{
                          backgroundColor: done ? habit.color : "var(--color-paper-2)",
                          border: isToday ? `1.5px solid ${habit.color}` : "none",
                          opacity: done ? 1 : 0.5,
                        }}
                        title={date}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

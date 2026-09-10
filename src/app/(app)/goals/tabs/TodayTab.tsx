"use client";

import { useMemo, useState, useCallback } from "react";
import { Target, BookOpen, CheckCircle2, Repeat, ChevronRight, Sunrise, Sun, Sunset, Moon, Telescope, AlertTriangle, Check, Clock, Flame } from "lucide-react";
import type { Goal, Homework, Habit, HabitLog, Class } from "@/lib/db/schema";
import { syncGoalsToCache } from "@/lib/offline/cache-writers";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { toggleHabitLogInCache } from "@/lib/offline/cache-writers";
import { formatDueBadge, urgencyColors, urgencyCardTint } from "@/lib/homework/due-format";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date | string, b: Date): boolean {
  const d = typeof a === "string" ? new Date(a + "T00:00:00") : a;
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate();
}

const TIME_OF_DAY_ORDER = ["morning", "afternoon", "evening", "night"] as const;
const TIME_OF_DAY_LABELS: Record<string, { label: string; icon: typeof Sunrise }> = {
  morning: { label: "Morning", icon: Sunrise },
  afternoon: { label: "Afternoon", icon: Sun },
  evening: { label: "Evening", icon: Sunset },
  night: { label: "Night", icon: Moon },
};

export default function TodayTab({
  goals,
  setGoals,
  homework,
  classes,
  habits,
  habitLogs,
  setHabitLogs,
  onNavigate,
}: {
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  homework: Homework[];
  classes: Class[];
  habits: Habit[];
  habitLogs: HabitLog[];
  setHabitLogs: React.Dispatch<React.SetStateAction<HabitLog[]>>;
  onNavigate: (tab: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const todayDateStr = todayStr();

  // ── Carried over: incomplete homework from yesterday or earlier (not today) ──
  const carriedOver = useMemo(
    () => homework
      .filter((h) => h.status === "pending" && h.dueDate && h.dueDate < todayDateStr)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [homework, todayDateStr],
  );

  // ── Upcoming: 5 closest pending homework (today + future), sorted by due date ──
  const upcomingHomework = useMemo(
    () => homework
      .filter((h) => h.status === "pending" && h.dueDate && h.dueDate >= todayDateStr)
      .sort((a, b) => {
        const aDate = a.dueDate + (a.dueTime || "23:59");
        const bDate = b.dueDate + (b.dueTime || "23:59");
        return aDate.localeCompare(bDate);
      }),
    [homework, todayDateStr],
  );

  const upcomingShown = upcomingHomework.slice(0, 5);
  const upcomingRemaining = upcomingHomework.length - upcomingShown.length;
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllHabits, setShowAllHabits] = useState(false);
  // Goals currently animating out (just completed)
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());

  // ── Class lookup map for homework items ──
  const classMap = useMemo(() => {
    const m = new Map<string, Class>();
    for (const c of classes) m.set(c.id, c);
    return m;
  }, [classes]);

  // ── Toggle goal completion (active <-> done) ──
  const toggleGoal = useCallback(
    async (goal: Goal) => {
      const isDone = goal.status === "done";
      const updates = { status: isDone ? "active" : "done" as const, completedAt: isDone ? null : new Date() };

      if (!isDone) {
        // Completing: trigger slide-through animation, then remove after it finishes
        setAnimatingOut((prev) => new Set(prev).add(goal.id));
        // Update goal to done immediately (shows checkmark + strikethrough during animation)
        setGoals((prev) => {
          const updated = prev.map((g) =>
            g.id === goal.id
              ? { ...g, ...updates, updatedAt: new Date() }
              : g,
          );
          syncGoalsToCache(updated);
          return updated;
        });
        // After animation completes, clear the animating state
        setTimeout(() => {
          setAnimatingOut((prev) => {
            const next = new Set(prev);
            next.delete(goal.id);
            return next;
          });
        }, 800);
      } else {
        // Uncompleting: just toggle back, no animation
        setGoals((prev) => {
          const updated = prev.map((g) =>
            g.id === goal.id
              ? { ...g, ...updates, updatedAt: new Date() }
              : g,
          );
          syncGoalsToCache(updated);
          return updated;
        });
      }

      try {
        const res = await fetch("/api/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: goal.id, ...updates }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.goal) {
          setGoals((prev) => {
            const updated = prev.map((g) => (g.id === goal.id ? data.goal : g));
            syncGoalsToCache(updated);
            return updated;
          });
          void invalidateApiCache("/api/goals");
        }
      } catch {
        // Offline: optimistic state + cache already updated, keep it
      }
    },
    [setGoals],
  );

  // ── Short-term active goals (optionally with target dates) ──
  // Include goals that are currently animating out (just completed) so the
  // strike-through + fade animation can play before they disappear.
  const shortTermGoals = useMemo(
    () => goals
      .filter((g) =>
        (g.goalType || "short_term") === "short_term" &&
        (g.status === "active" || animatingOut.has(g.id)),
      )
      .sort((a, b) => {
        // Goals with target dates first, sorted by closest date
        if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
        if (a.targetDate && !b.targetDate) return -1;
        if (!a.targetDate && b.targetDate) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [goals, animatingOut],
  );

  // ── Long-term goals (separate "On the horizon" section) ──
  const longTermGoals = useMemo(
    () => goals
      .filter((g) =>
        g.goalType === "long_term" &&
        (g.status === "active" || animatingOut.has(g.id)),
      ),
    [goals, animatingOut],
  );

  // ── Habits grouped by time of day ──
  const habitsByTimeOfDay = useMemo(() => {
    const activeHabits = habits.filter((h) => !h.archived);
    const groups: Record<string, Habit[]> = {};
    const ungrouped: Habit[] = [];

    for (const habit of activeHabits) {
      if (habit.timeOfDay && TIME_OF_DAY_ORDER.includes(habit.timeOfDay as typeof TIME_OF_DAY_ORDER[number])) {
        if (!groups[habit.timeOfDay]) groups[habit.timeOfDay] = [];
        groups[habit.timeOfDay].push(habit);
      } else {
        ungrouped.push(habit);
      }
    }
    return { groups, ungrouped };
  }, [habits]);

  const habitsCompletedToday = useMemo(() => {
    const map = new Set<string>();
    for (const log of habitLogs) {
      if (log.date === todayDateStr) map.add(log.habitId);
    }
    return map;
  }, [habitLogs, todayDateStr]);

  // ── Toggle habit completion (from Today tab) ──
  const toggleHabit = useCallback(
    async (habitId: string) => {
      const wasCompleted = habitsCompletedToday.has(habitId);
      // Optimistic update
      if (wasCompleted) {
        setHabitLogs((prev) => prev.filter((l) => !(l.habitId === habitId && l.date === todayDateStr)));
      } else {
        setHabitLogs((prev) => [...prev, {
          id: `temp_${habitId}_${todayDateStr}`,
          userId: "",
          habitId,
          date: todayDateStr,
          count: 1,
          completedAt: new Date(),
        }]);
      }
      toggleHabitLogInCache(habitId, todayDateStr, !wasCompleted);
      try {
        await fetch("/api/habit-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ habitId, date: todayDateStr }),
        });
        void invalidateApiCache("/api/habit-logs");
      } catch {
        // revert on failure
        if (wasCompleted) {
          setHabitLogs((prev) => [...prev, {
            id: `temp_${habitId}_${todayDateStr}`, userId: "", habitId, date: todayDateStr, count: 1, completedAt: new Date(),
          }]);
        } else {
          setHabitLogs((prev) => prev.filter((l) => !(l.habitId === habitId && l.date === todayDateStr)));
        }
      }
    },
    [habitsCompletedToday, setHabitLogs, todayDateStr],
  );

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const habitsDone = activeHabits.filter((h) => habitsCompletedToday.has(h.id)).length;

  const completedTodayHomework = useMemo(
    () => homework.filter((h) => h.status === "completed" && h.completedAt && isSameDay(h.completedAt, today)).length,
    [homework, today],
  );

  const totalDueToday = upcomingHomework.length + carriedOver.length;

  // Urgency breakdown for the header
  const urgencyBreakdown = useMemo(() => {
    const all = [...carriedOver, ...upcomingHomework];
    let overdue = 0, todayCount = 0, tomorrow = 0, soon = 0;
    for (const h of all) {
      const badge = formatDueBadge(h.dueDate, h.dueTime, h.status);
      if (badge.urgency === "overdue") overdue++;
      else if (badge.urgency === "today") todayCount++;
      else if (badge.urgency === "tomorrow") tomorrow++;
      else if (badge.urgency === "soon") soon++;
    }
    return { overdue, todayCount, tomorrow, soon };
  }, [carriedOver, upcomingHomework]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </h1>
        {totalDueToday === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Nothing urgent today
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {urgencyBreakdown.overdue > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: "color-mix(in oklab, var(--color-error) 14%, var(--color-paper))", color: "var(--color-error)" }}>
                <Flame className="h-3 w-3" /> {urgencyBreakdown.overdue} overdue
              </span>
            )}
            {urgencyBreakdown.todayCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: "color-mix(in oklab, var(--color-error) 10%, var(--color-paper))", color: "var(--color-error)" }}>
                <Clock className="h-3 w-3" /> {urgencyBreakdown.todayCount} due today
              </span>
            )}
            {urgencyBreakdown.tomorrow > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 12%, var(--color-paper))", color: "var(--color-warmth)" }}>
                {urgencyBreakdown.tomorrow} tomorrow
              </span>
            )}
            {urgencyBreakdown.soon > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 8%, var(--color-paper))", color: "var(--color-warmth)" }}>
                {urgencyBreakdown.soon} this week
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Unified card wrapping all sections ── */}
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex flex-col gap-5 p-4 sm:p-6">

      {/* ── Carried over from previous days ── */}
      {carriedOver.length > 0 && (
        <Section
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Carried over"
          count={carriedOver.length}
          accent="var(--color-warmth)"
          onMore={() => onNavigate("homework")}
        >
          {carriedOver.slice(0, 4).map((h) => {
            const badge = formatDueBadge(h.dueDate, h.dueTime, h.status);
            const colors = urgencyColors(badge.urgency);
            const tint = urgencyCardTint(badge.urgency);
            return (
              <div key={h.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: tint.backgroundColor || "color-mix(in oklab, var(--color-warmth) 8%, var(--color-paper))" }}>
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors.color }} />
                <span className="text-sm truncate flex-1" style={{ color: "var(--color-ink)" }}>{h.title}</span>
                <span className="text-[11px] shrink-0 px-2 py-0.5 rounded-full font-medium tabular-nums" style={{
                  backgroundColor: colors.bgColor,
                  color: colors.color,
                  fontWeight: colors.fontWeight,
                  border: `1px solid ${colors.borderColor}`,
                }}>
                  {badge.label}
                </span>
              </div>
            );
          })}
          {carriedOver.length > 4 && (
            <button onClick={() => onNavigate("homework")} className="text-xs pl-3 pt-1" style={{ color: "var(--color-ink-muted)" }}>
              +{carriedOver.length - 4} more
            </button>
          )}
        </Section>
      )}

      {/* ── Upcoming homework (5 closest due) ── */}
      <Section
        icon={<BookOpen className="h-4 w-4" />}
        title="Upcoming"
        count={upcomingHomework.length}
        onMore={() => onNavigate("homework")}
      >
        {upcomingHomework.length === 0 ? (
          <EmptyRow icon={<CheckCircle2 className="h-4 w-4" />} text="No upcoming homework" />
        ) : (
          <>
            {(showAllUpcoming ? upcomingHomework : upcomingShown).map((h) => {
              const cls = h.classId ? classMap.get(h.classId) : null;
              const badge = formatDueBadge(h.dueDate, h.dueTime, h.status);
              const colors = urgencyColors(badge.urgency);
              const tint = urgencyCardTint(badge.urgency);
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors"
                  style={{
                    borderLeft: cls ? `3px solid ${cls.color}` : tint.borderLeftColor ? `3px solid ${tint.borderLeftColor}` : undefined,
                    marginLeft: (cls || tint.borderLeftColor) ? "-3px" : undefined,
                    paddingLeft: (cls || tint.borderLeftColor) ? "12px" : undefined,
                    backgroundColor: tint.backgroundColor || "transparent",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-paper-2)"; }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = tint.backgroundColor || "transparent";
                  }}
                >
                  <span className="text-sm truncate flex-1" style={{ color: "var(--color-ink)" }}>
                    {h.title}
                    {cls && (
                      <span className="ml-1.5 text-[11px] font-normal" style={{ color: cls.color }}>
                        ({cls.name})
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] shrink-0 px-2 py-0.5 rounded-full font-medium tabular-nums" style={{
                    backgroundColor: colors.bgColor,
                    color: colors.color,
                    fontWeight: colors.fontWeight,
                    border: `1px solid ${colors.borderColor}`,
                  }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
            {!showAllUpcoming && upcomingRemaining > 0 && (
              <button
                onClick={() => setShowAllUpcoming(true)}
                className="self-start pl-3 pt-1 text-xs font-medium transition-colors hover:opacity-70"
                style={{ color: "var(--color-ink-muted)" }}
              >
                +{upcomingRemaining} more
              </button>
            )}
            {showAllUpcoming && upcomingRemaining > 0 && (
              <button
                onClick={() => setShowAllUpcoming(false)}
                className="self-start pl-3 pt-1 text-xs font-medium transition-colors hover:opacity-70"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Show less
              </button>
            )}
          </>
        )}
      </Section>

      {/* ── Goals for this week (short-term, max 3) ── */}
      <CollapsibleSection
        icon={<Target className="h-4 w-4" />}
        title="Goals for this week"
        count={shortTermGoals.length}
        onMore={() => onNavigate("short-term")}
        initialLimit={3}
        items={shortTermGoals}
        renderItem={(g) => {
          const isDone = g.status === "done";
          const isAnimating = animatingOut.has(g.id);
          const goalColor = g.color || "var(--color-ink-soft)";
          return (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[var(--color-paper-2)] transition-colors"
              style={{
                animation: isAnimating ? "goalCompleteSlide 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards" : undefined,
              }}
            >
              <button
                onClick={() => toggleGoal(g)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all"
                style={{
                  borderColor: isDone ? goalColor : "var(--color-paper-3)",
                  backgroundColor: isDone ? goalColor : "transparent",
                }}
                aria-label={isDone ? "Mark as active" : "Mark as done"}
              >
                {isDone && (
                  <Check
                    className="h-3 w-3"
                    style={{
                      color: "var(--color-paper)",
                      animation: isAnimating ? "checkmarkPop 0.3s ease-out" : undefined,
                    }}
                  />
                )}
              </button>
              <span
                className="text-sm truncate flex-1"
                style={{
                  color: isDone ? "var(--color-ink-muted)" : "var(--color-ink)",
                  textDecoration: isDone ? "line-through" : "none",
                }}
              >
                {g.title}
              </span>
              {g.targetDate && (() => {
                const badge = formatDueBadge(g.targetDate);
                const colors = urgencyColors(badge.urgency);
                return (
                  <span className="text-[11px] shrink-0 px-2 py-0.5 rounded-full font-medium tabular-nums" style={{
                    backgroundColor: colors.bgColor,
                    color: colors.color,
                    fontWeight: colors.fontWeight,
                    border: `1px solid ${colors.borderColor}`,
                  }}>
                    {badge.label}
                  </span>
                );
              })()}
            </div>
          );
        }}
        emptyIcon={<Target className="h-4 w-4" />}
        emptyText="No goals for this week"
      />

      {/* ── Habits by time of day ── */}
      <Section
        icon={<Repeat className="h-4 w-4" />}
        title="Habits"
        count={activeHabits.length}
        onMore={() => onNavigate("habits")}
      >
        {activeHabits.length === 0 ? (
          <EmptyRow icon={<Repeat className="h-4 w-4" />} text="No habits yet" />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Overall progress bar */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2">
              <div className="flex-1">
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-paper-2)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${activeHabits.length > 0 ? (habitsDone / activeHabits.length) * 100 : 0}%`,
                      backgroundColor: "var(--color-accent)",
                    }}
                  />
                </div>
              </div>
              <span className="text-xs shrink-0" style={{ color: "var(--color-ink-muted)" }}>
                {habitsDone}/{activeHabits.length} done
              </span>
            </div>

            {/* Flatten all habits for limiting when collapsed */}
            {(() => {
              const allGrouped: { habit: Habit; label: string; icon: typeof Sunrise }[] = [];
              for (const timeKey of TIME_OF_DAY_ORDER) {
                const groupHabits = habitsByTimeOfDay.groups[timeKey];
                if (!groupHabits || groupHabits.length === 0) continue;
                const { label, icon: TimeIcon } = TIME_OF_DAY_LABELS[timeKey];
                for (const habit of groupHabits) {
                  allGrouped.push({ habit, label, icon: TimeIcon });
                }
              }
              for (const habit of habitsByTimeOfDay.ungrouped) {
                allGrouped.push({ habit, label: "", icon: Sunrise });
              }

              const HABIT_LIMIT = 5;
              const visibleHabits = showAllHabits ? allGrouped : allGrouped.slice(0, HABIT_LIMIT);
              const hasMoreHabits = allGrouped.length > HABIT_LIMIT;

              // Group visible habits by their time-of-day label for display
              const grouped: { label: string; icon: typeof Sunrise; habits: Habit[] }[] = [];
              for (const vh of visibleHabits) {
                const last = grouped[grouped.length - 1];
                if (last && last.label === vh.label) {
                  last.habits.push(vh.habit);
                } else {
                  grouped.push({ label: vh.label, icon: vh.icon, habits: [vh.habit] });
                }
              }

              return (
                <>
                  {grouped.map((grp, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      {grp.label && (
                        <div className="flex items-center gap-1.5 px-3">
                          <grp.icon className="h-3 w-3" style={{ color: "var(--color-ink-muted)" }} />
                          <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>{grp.label}</span>
                        </div>
                      )}
                      {grp.habits.map((habit) => {
                        const done = habitsCompletedToday.has(habit.id);
                        return (
                          <button
                            key={habit.id}
                            onClick={() => toggleHabit(habit.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-[var(--color-paper-2)] transition-colors"
                            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                            aria-label={done ? `Uncheck ${habit.name}` : `Check ${habit.name}`}
                          >
                            <div
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all"
                              style={{
                                borderColor: done ? habit.color : "var(--color-paper-3)",
                                backgroundColor: done ? habit.color : "transparent",
                              }}
                            >
                              {done && <Check className="h-2.5 w-2.5" style={{ color: "var(--color-paper)" }} />}
                            </div>
                            <span className="text-sm truncate flex-1 text-left" style={{
                              color: done ? "var(--color-ink-muted)" : "var(--color-ink)",
                              textDecoration: done ? "line-through" : "none",
                            }}>
                              {habit.name}
                            </span>
                            {habit.reminderTime && (
                              <span className="text-xs shrink-0" style={{ color: "var(--color-ink-muted)" }}>{habit.reminderTime}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {hasMoreHabits && (
                    <button
                      onClick={() => setShowAllHabits(!showAllHabits)}
                      className="flex items-center gap-1 pl-3 pt-1 text-xs font-medium transition-colors hover:opacity-70"
                      style={{ color: "var(--color-accent)" }}
                    >
                      {showAllHabits ? "Show less" : `+${allGrouped.length - HABIT_LIMIT} more`}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </Section>

      {/* ── On the horizon (long-term goals) ── */}
      <CollapsibleSection
        icon={<Telescope className="h-4 w-4" />}
        title="Goals long-term"
        count={longTermGoals.length}
        onMore={() => onNavigate("long-term")}
        initialLimit={3}
        items={longTermGoals}
        renderItem={(g) => {
          const isDone = g.status === "done";
          const isAnimating = animatingOut.has(g.id);
          const goalColor = g.color || "var(--color-ink-muted)";
          return (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[var(--color-paper-2)] transition-colors"
              style={{
                animation: isAnimating ? "goalCompleteSlide 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards" : undefined,
              }}
            >
              <button
                onClick={() => toggleGoal(g)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all"
                style={{
                  borderColor: isDone ? goalColor : "var(--color-paper-3)",
                  backgroundColor: isDone ? goalColor : "transparent",
                }}
                aria-label={isDone ? "Mark as active" : "Mark as done"}
              >
                {isDone && (
                  <Check
                    className="h-3 w-3"
                    style={{
                      color: "var(--color-paper)",
                      animation: isAnimating ? "checkmarkPop 0.3s ease-out" : undefined,
                    }}
                  />
                )}
              </button>
              <span className="text-sm truncate flex-1" style={{
                color: isDone ? "var(--color-ink-muted)" : "var(--color-ink-soft)",
                textDecoration: isDone ? "line-through" : "none",
              }}>
                {g.title}
              </span>
              {g.targetDate && (() => {
                const badge = formatDueBadge(g.targetDate);
                const colors = urgencyColors(badge.urgency);
                return (
                  <span className="text-[11px] shrink-0 px-2 py-0.5 rounded-full font-medium tabular-nums" style={{
                    backgroundColor: colors.bgColor,
                    color: colors.color,
                    fontWeight: colors.fontWeight,
                    border: `1px solid ${colors.borderColor}`,
                  }}>
                    {badge.label}
                  </span>
                );
              })()}
            </div>
          );
        }}
        emptyIcon={<Telescope className="h-4 w-4" />}
        emptyText="No long-term goals yet"
      />

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 mt-2">
        <SummaryCard label="Completed today" value={completedTodayHomework} icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryCard label="Habits done" value={`${habitsDone}/${activeHabits.length}`} icon={<Repeat className="h-4 w-4" />} />
      </div>

        </div>
      </div>

      <style>{`
        @keyframes goalCompleteSlide {
          0% {
            opacity: 1;
            transform: translateX(0);
            background-color: transparent;
          }
          20% {
            opacity: 1;
            transform: translateX(0);
            background-color: color-mix(in oklab, var(--color-success) 12%, transparent);
          }
          60% {
            opacity: 1;
            transform: translateX(8px);
            background-color: color-mix(in oklab, var(--color-success) 8%, transparent);
          }
          100% {
            opacity: 0;
            transform: translateX(40px);
            background-color: transparent;
          }
        }
        @keyframes checkmarkPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.3);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function Section({
  icon, title, count, onMore, children, accent,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onMore: () => void;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: accent || "var(--color-ink-muted)" }}>{icon}</span>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{title}</h2>
          {count > 0 && <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{count}</span>}
        </div>
        <button onClick={onMore} className="flex items-center gap-0.5 text-xs transition-colors hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
          More <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function CollapsibleSection<T>({
  icon, title, count, onMore, items, renderItem, initialLimit, emptyIcon, emptyText, accent,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onMore: () => void;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  initialLimit: number;
  emptyIcon: React.ReactNode;
  emptyText: string;
  accent?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initialLimit);
  const hasMore = items.length > initialLimit;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: accent || "var(--color-ink-muted)" }}>{icon}</span>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{title}</h2>
          {count > 0 && <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{count}</span>}
        </div>
        <button onClick={onMore} className="flex items-center gap-0.5 text-xs transition-colors hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
          More <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {items.length === 0 ? (
          <EmptyRow icon={emptyIcon} text={emptyText} />
        ) : (
          <>
            {visible.map((item) => renderItem(item))}
            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 self-start pl-3 pt-1 text-xs transition-colors hover:opacity-70"
                style={{ color: "var(--color-ink-muted)" }}
              >
                {expanded ? "Show less" : `+${items.length - initialLimit} more`}
                <ChevronRight className="h-3 w-3" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ color: "var(--color-ink-muted)" }}>
      <span className="opacity-40">{icon}</span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-ink-muted)" }}>{icon}</span>
        <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{label}</span>
      </div>
      <span className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{value}</span>
    </div>
  );
}

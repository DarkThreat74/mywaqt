"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Target,
  BookOpen,
  Repeat,
  CheckCircle2,
} from "lucide-react";
import type { Goal, Homework, Class, Habit, HabitLog, Chore } from "@/lib/db/schema";
import { getOfflineDB } from "@/lib/offline/db";
import {
  syncGoalsToCache,
  syncHomeworkToCache,
  syncClassesToCache,
  syncHabitsToCache,
  syncHabitLogsToCache,
} from "@/lib/offline/cache-writers";
import GoalsTab, { type GoalHorizon } from "./tabs/GoalsTab";
import HomeworkTab from "./tabs/HomeworkTab";
import HabitsTab from "./tabs/HabitsTab";
import TodayTab from "./tabs/TodayTab";
import DoneTab from "./tabs/DoneTab";

export type TabId = "today" | "goals" | "homework" | "habits" | "done";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Target;
}

const TABS: TabDef[] = [
  { id: "today", label: "Today", icon: Calendar },
  { id: "goals", label: "Goals", icon: Target },
  { id: "homework", label: "Homework", icon: BookOpen },
  { id: "habits", label: "Habits", icon: Repeat },
  { id: "done", label: "Done", icon: CheckCircle2 },
];

const GOAL_HORIZONS: { key: GoalHorizon; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all_time", label: "All-time" },
  { key: "rules", label: "Rules" },
];

// Old hash/bookmark values → current tabs.
const LEGACY_TAB: Record<string, TabId> = {
  "long-term": "goals",
  "short-term": "goals",
  notes: "today",
  backlog: "today",
  chores: "habits",
};

function resolveHash(hash: string): TabId {
  if (TABS.some((t) => t.id === hash)) return hash as TabId;
  return LEGACY_TAB[hash] ?? "today";
}

export default function GoalsPageClient({
  initialGoals,
  initialHomework,
  initialClasses,
  initialHabits,
  initialHabitLogs,
  initialChores,
}: {
  initialGoals: Goal[];
  initialHomework: Homework[];
  initialClasses: Class[];
  initialHabits: Habit[];
  initialHabitLogs: HabitLog[];
  initialChores: Chore[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1);
      if (hash) return resolveHash(hash);
    }
    return "today";
  });
  const [goalHorizon, setGoalHorizon] = useState<GoalHorizon>("week");
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [homework, setHomework] = useState<Homework[]>(initialHomework);
  const [classes, setClasses] = useState<Class[]>(initialClasses);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>(initialHabitLogs);
  const [chores, setChores] = useState<Chore[]>(initialChores);
  const [mountNow] = useState(() => Date.now());
  // Ambient nudge on the Habits tab chip (chores live under Habits) — a chore
  // ≥80% through its interval, never done, or due on a scheduled weekday today.
  const choresDue = chores.some((c) => {
    if (c.weekdays && c.weekdays.length > 0) {
      const now = new Date(mountNow);
      for (let back = 0; back < 7; back++) {
        if (c.weekdays.includes((now.getDay() - back + 7) % 7)) {
          const sched = new Date(now);
          sched.setDate(now.getDate() - back);
          sched.setHours(0, 0, 0, 0);
          return !c.lastDoneAt || new Date(c.lastDoneAt).getTime() < sched.getTime();
        }
      }
      return false;
    }
    return !c.lastDoneAt ||
      (mountNow - new Date(c.lastDoneAt).getTime()) / 86400000 >= c.frequencyDays * 0.8;
  });

  // ── Update URL hash when tab changes ──
  useEffect(() => {
    if (activeTab === "today") {
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      window.history.replaceState(null, "", `${window.location.pathname}#${activeTab}`);
    }
  }, [activeTab]);

  // ── Sync tab from URL on back/forward navigation ──
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setActiveTab(resolveHash(hash));
      } else {
        setActiveTab("today");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ── Cache initial data in IndexedDB for offline use ──
  useEffect(() => {
    try {
      const db = getOfflineDB();
      if (initialGoals.length > 0) {
        db.goals.clear().then(() =>
          db.goals.bulkPut(initialGoals.map((g) => ({
            id: g.id, userId: g.userId, parentId: g.parentId, title: g.title,
            description: g.description, status: g.status, sortOrder: g.sortOrder,
            color: g.color, goalType: g.goalType, targetDate: g.targetDate,
            createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString(),
            completedAt: g.completedAt ? g.completedAt.toISOString() : null,
            _cachedAt: Date.now(),
          })))
        ).catch(() => {});
      }
      if (initialHomework.length > 0) {
        db.homework.clear().then(() =>
          db.homework.bulkPut(initialHomework.map((h) => ({
            id: h.id, title: h.title, description: h.description, classId: h.classId,
            dueDate: h.dueDate, dueTime: h.dueTime, priority: h.priority, status: h.status,
            kind: h.kind, completedAt: h.completedAt ? h.completedAt.toISOString() : null,
            _cachedAt: Date.now(),
          })))
        ).catch(() => {});
      }
      if (initialClasses.length > 0) {
        db.classes.clear().then(() =>
          db.classes.bulkPut(initialClasses.map((c) => ({
            id: c.id, name: c.name, color: c.color, archived: c.archived, sortOrder: c.sortOrder,
            _cachedAt: Date.now(),
          })))
        ).catch(() => {});
      }
      if (initialHabits.length > 0) {
        db.habits.clear().then(() =>
          db.habits.bulkPut(initialHabits.map((h) => ({
            id: h.id, name: h.name, description: h.description, frequency: h.frequency,
            timeOfDay: h.timeOfDay, reminderTime: h.reminderTime,
            color: h.color, targetCount: h.targetCount, archived: h.archived, sortOrder: h.sortOrder,
            _cachedAt: Date.now(),
          })))
        ).catch(() => {});
      }
      if (initialHabitLogs.length > 0) {
        db.habitLogs.clear().then(() =>
          db.habitLogs.bulkPut(initialHabitLogs.map((l) => ({
            id: l.id, habitId: l.habitId, date: l.date, count: l.count, _cachedAt: Date.now(),
          })))
        ).catch(() => {});
      }
    } catch {
      // non-critical
    }
  }, [initialGoals, initialHomework, initialClasses, initialHabits, initialHabitLogs]);

  const refreshAll = useCallback(async () => {
    try {
      const [goalsRes, hwRes, clsRes, habitsRes, logsRes, choresRes] = await Promise.all([
        fetch("/api/goals"), fetch("/api/homework"), fetch("/api/classes"),
        fetch("/api/habits"), fetch("/api/habit-logs"), fetch("/api/chores"),
      ]);
      if (goalsRes.ok) { const d = await goalsRes.json(); if (d.goals) { setGoals(d.goals); syncGoalsToCache(d.goals); } }
      if (hwRes.ok) { const d = await hwRes.json(); if (Array.isArray(d)) { setHomework(d); syncHomeworkToCache(d); } }
      if (clsRes.ok) { const d = await clsRes.json(); if (Array.isArray(d)) { setClasses(d); syncClassesToCache(d); } }
      if (habitsRes.ok) { const d = await habitsRes.json(); if (Array.isArray(d)) { setHabits(d); syncHabitsToCache(d); } }
      if (logsRes.ok) { const d = await logsRes.json(); if (Array.isArray(d)) { setHabitLogs(d); syncHabitLogsToCache(d); } }
      if (choresRes.ok) { const d = await choresRes.json(); if (Array.isArray(d)) setChores(d); }
    } catch {
      // offline — cached data still showing
    }
  }, []);

  // ── Listen for SW sync events to refetch all data ──
  useEffect(() => {
    function onSynced() { refreshAll(); }
    window.addEventListener("waqt:events-synced", onSynced);
    return () => window.removeEventListener("waqt:events-synced", onSynced);
  }, [refreshAll]);

  // ── Refetch on mount when online ──
  // The SW serves cached HTML first (stale-while-revalidate), which may have
  // outdated initialGoals. Fetch fresh data immediately so newly created/edited
  // goals appear without requiring a second reload.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshAll();
    }
  }, [refreshAll]);

  // ── Tab bar (scrollable on mobile) ──

  return (
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* ── Tab bar ── */}
      <div
        className="sticky top-0 z-30 border-b lg:top-0"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 95%, transparent)",
          backdropFilter: "blur(8px)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {/* Desktop: full tab bar */}
        <div className="hidden lg:flex">
          <div className="mx-auto flex w-full max-w-4xl items-center gap-1 px-4 py-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: isActive ? "var(--color-paper-2)" : "transparent",
                    color: isActive ? "var(--color-ink)" : "var(--color-ink-muted)",
                  }}
                >
                  <span className="relative">
                    <Icon className="h-4 w-4" />
                    {tab.id === "habits" && choresDue && (
                      <span
                        className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
                        style={{ backgroundColor: "var(--color-warmth)" }}
                        aria-label="Chores due"
                      />
                    )}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile: horizontal scrollable tab bar */}
        <div className="lg:hidden">
          <div className="flex items-center gap-1 overflow-x-auto px-3 py-2" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: isActive ? "var(--color-ink)" : "var(--color-paper-2)",
                    color: isActive ? "var(--color-paper)" : "var(--color-ink-muted)",
                  }}
                >
                  <span className="relative">
                    <Icon className="h-3.5 w-3.5" />
                    {tab.id === "habits" && choresDue && (
                      <span
                        className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
                        style={{ backgroundColor: "var(--color-warmth)" }}
                        aria-label="Chores due"
                      />
                    )}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {activeTab === "today" && (
          <TodayTab goals={goals} setGoals={setGoals} homework={homework} classes={classes} habits={habits} habitLogs={habitLogs} setHabitLogs={setHabitLogs} onNavigate={(t) => {
            // "goals:all_time" deep-links the Goals tab at the all-time horizon
            // (Life milestones on Today opens the milestones, not this week).
            if (t === "goals:all_time") { setGoalHorizon("all_time"); setActiveTab("goals"); }
            else if (t === "goals:year") { setGoalHorizon("year"); setActiveTab("goals"); }
            else setActiveTab(t as TabId);
          }} />
        )}
        {activeTab === "goals" && (
          <div className="flex flex-col gap-4">
            {/* Horizon chips — week / month / year / all-time / rules */}
            <div className="flex gap-1 overflow-x-auto rounded-xl border p-1" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
              {GOAL_HORIZONS.map((h) => (
                <button
                  key={h.key}
                  onClick={() => setGoalHorizon(h.key)}
                  className="min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: goalHorizon === h.key ? "var(--color-paper)" : "transparent",
                    color: goalHorizon === h.key ? "var(--color-ink)" : "var(--color-ink-muted)",
                  }}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <GoalsTab goals={goals} setGoals={setGoals} goalType={goalHorizon} />
          </div>
        )}
        {activeTab === "homework" && (
          <HomeworkTab homework={homework} classes={classes} onHomeworkChange={setHomework} />
        )}
        {activeTab === "habits" && (
          <HabitsTab habits={habits} setHabits={setHabits} habitLogs={habitLogs} setHabitLogs={setHabitLogs} chores={chores} setChores={setChores} />
        )}
        {activeTab === "done" && (
          <DoneTab goals={goals} homework={homework} setGoals={setGoals} setHomework={setHomework} />
        )}
      </div>
    </div>
  );
}

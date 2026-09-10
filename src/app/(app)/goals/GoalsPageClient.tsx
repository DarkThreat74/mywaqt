"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Target,
  Zap,
  BookOpen,
  Repeat,
  StickyNote,
  Inbox,
  CheckCircle2,
} from "lucide-react";
import type { Goal, Homework, Class, Habit, HabitLog, Note } from "@/lib/db/schema";
import { getOfflineDB } from "@/lib/offline/db";
import {
  syncGoalsToCache,
  syncHomeworkToCache,
  syncClassesToCache,
  syncHabitsToCache,
  syncHabitLogsToCache,
  syncNotesToCache,
} from "@/lib/offline/cache-writers";
import GoalsTab from "./tabs/GoalsTab";
import HomeworkTab from "./tabs/HomeworkTab";
import HabitsTab from "./tabs/HabitsTab";
import NotesTab from "./tabs/NotesTab";
import TodayTab from "./tabs/TodayTab";
import BacklogTab from "./tabs/BacklogTab";
import DoneTab from "./tabs/DoneTab";

export type TabId = "today" | "long-term" | "short-term" | "homework" | "habits" | "notes" | "backlog" | "done";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Target;
}

const TABS: TabDef[] = [
  { id: "today", label: "Today", icon: Calendar },
  { id: "long-term", label: "Long-term", icon: Target },
  { id: "short-term", label: "Short-term", icon: Zap },
  { id: "homework", label: "Homework", icon: BookOpen },
  { id: "habits", label: "Habits", icon: Repeat },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "backlog", label: "Backlog", icon: Inbox },
  { id: "done", label: "Done", icon: CheckCircle2 },
];

export default function GoalsPageClient({
  initialGoals,
  initialHomework,
  initialClasses,
  initialHabits,
  initialHabitLogs,
  initialNotes,
}: {
  initialGoals: Goal[];
  initialHomework: Homework[];
  initialClasses: Class[];
  initialHabits: Habit[];
  initialHabitLogs: HabitLog[];
  initialNotes: Note[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1) as TabId;
      if (hash && TABS.some((t) => t.id === hash)) return hash;
    }
    return "today";
  });
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [homework, setHomework] = useState<Homework[]>(initialHomework);
  const [classes, setClasses] = useState<Class[]>(initialClasses);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>(initialHabitLogs);
  const [notes, setNotes] = useState<Note[]>(initialNotes);

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
      const hash = window.location.hash.slice(1) as TabId;
      if (hash && TABS.some((t) => t.id === hash)) {
        setActiveTab(hash);
      } else if (!hash) {
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
      if (initialNotes.length > 0) {
        db.notes.clear().then(() =>
          db.notes.bulkPut(initialNotes.map((n) => ({
            id: n.id, title: n.title, content: n.content, pinned: n.pinned,
            createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString(),
            _cachedAt: Date.now(),
          })))
        ).catch(() => {});
      }
    } catch {
      // non-critical
    }
  }, [initialGoals, initialHomework, initialClasses, initialHabits, initialHabitLogs, initialNotes]);

  const refreshAll = useCallback(async () => {
    try {
      const [goalsRes, hwRes, clsRes, habitsRes, logsRes, notesRes] = await Promise.all([
        fetch("/api/goals"), fetch("/api/homework"), fetch("/api/classes"),
        fetch("/api/habits"), fetch("/api/habit-logs"), fetch("/api/notes"),
      ]);
      if (goalsRes.ok) { const d = await goalsRes.json(); if (d.goals) { setGoals(d.goals); syncGoalsToCache(d.goals); } }
      if (hwRes.ok) { const d = await hwRes.json(); if (Array.isArray(d)) { setHomework(d); syncHomeworkToCache(d); } }
      if (clsRes.ok) { const d = await clsRes.json(); if (Array.isArray(d)) { setClasses(d); syncClassesToCache(d); } }
      if (habitsRes.ok) { const d = await habitsRes.json(); if (Array.isArray(d)) { setHabits(d); syncHabitsToCache(d); } }
      if (logsRes.ok) { const d = await logsRes.json(); if (Array.isArray(d)) { setHabitLogs(d); syncHabitLogsToCache(d); } }
      if (notesRes.ok) { const d = await notesRes.json(); if (Array.isArray(d)) { setNotes(d); syncNotesToCache(d); } }
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
                  <Icon className="h-4 w-4" />
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
                  <Icon className="h-3.5 w-3.5" />
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
          <TodayTab goals={goals} setGoals={setGoals} homework={homework} classes={classes} habits={habits} habitLogs={habitLogs} setHabitLogs={setHabitLogs} onNavigate={(t) => setActiveTab(t as TabId)} />
        )}
        {activeTab === "long-term" && (
          <GoalsTab goals={goals} setGoals={setGoals} goalType="long_term" />
        )}
        {activeTab === "short-term" && (
          <GoalsTab goals={goals} setGoals={setGoals} goalType="short_term" />
        )}
        {activeTab === "homework" && (
          <HomeworkTab homework={homework} classes={classes} onHomeworkChange={setHomework} />
        )}
        {activeTab === "habits" && (
          <HabitsTab habits={habits} setHabits={setHabits} habitLogs={habitLogs} setHabitLogs={setHabitLogs} />
        )}
        {activeTab === "notes" && (
          <NotesTab notes={notes} setNotes={setNotes} />
        )}
        {activeTab === "backlog" && (
          <BacklogTab goals={goals} setGoals={setGoals} />
        )}
        {activeTab === "done" && (
          <DoneTab goals={goals} homework={homework} setGoals={setGoals} setHomework={setHomework} />
        )}
      </div>
    </div>
  );
}

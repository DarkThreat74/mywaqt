/**
 * Helpers to keep the IndexedDB offline cache in sync after mutations.
 * These are fire-and-forget — cache write failures are non-critical.
 */
import { getOfflineDB } from "./db";

interface EventLike {
  id: string;
  title: string;
  details?: string | null;
  startAt: string;
  endAt?: string | null;
  type: string;
  color?: string | null;
  recurrenceRule?: string | null;
  seriesId?: string | null;
  notify?: boolean;
  _pending?: boolean;
}

/**
 * Sync an array of events to the IndexedDB events store for a given date.
 * Replaces all events for that date key. Fire-and-forget.
 */
export function syncEventsToCache(date: string, events: EventLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.events.where("_dateKey").equals(date).delete().then(() =>
      db.events.bulkPut(
        events.map((e) => ({
          id: e.id,
          userId: "",
          title: e.title,
          details: e.details ?? null,
          startAt: e.startAt,
          endAt: e.endAt ?? null,
          type: e.type,
          color: e.color ?? null,
          recurrenceRule: e.recurrenceRule ?? null,
          seriesId: e.seriesId ?? null,
          _dateKey: date,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Add a single event to the IndexedDB cache. Fire-and-forget.
 */
export function addEventToCache(date: string, event: EventLike): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.events.put({
      id: event.id,
      userId: "",
      title: event.title,
      details: event.details ?? null,
      startAt: event.startAt,
      endAt: event.endAt ?? null,
      type: event.type,
      color: event.color ?? null,
      recurrenceRule: event.recurrenceRule ?? null,
      seriesId: event.seriesId ?? null,
      _dateKey: date,
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Update a single event in the IndexedDB cache. Fire-and-forget.
 */
export function updateEventInCache(event: EventLike): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    // Derive _dateKey from startAt
    const d = new Date(event.startAt);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    db.events.put({
      id: event.id,
      userId: "",
      title: event.title,
      details: event.details ?? null,
      startAt: event.startAt,
      endAt: event.endAt ?? null,
      type: event.type,
      color: event.color ?? null,
      recurrenceRule: event.recurrenceRule ?? null,
      seriesId: event.seriesId ?? null,
      _dateKey: dateKey,
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Delete a single event from the IndexedDB cache. Fire-and-forget.
 */
export function deleteEventFromCache(eventId: string): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.events.delete(eventId).catch(() => {});
  } catch {
    // non-critical
  }
}

interface PrayerLogLike {
  prayerName: string;
  status: string;
  wentToMasjid: boolean | null;
  id?: string;
}

/**
 * Sync prayer logs for a date to IndexedDB. Replaces all logs for that date.
 */
export function syncPrayerLogsToCache(date: string, logs: PrayerLogLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.prayerLogs.where("date").equals(date).delete().then(() =>
      db.prayerLogs.bulkPut(
        logs.map((l) => ({
          id: l.id || `${date}_${l.prayerName}`,
          userId: "",
          date,
          prayerName: l.prayerName,
          status: l.status,
          wentToMasjid: l.wentToMasjid,
          lastCheckinAt: null,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Upsert a single prayer log entry into the IndexedDB cache.
 */
export function upsertPrayerLogToCache(
  date: string,
  prayerName: string,
  status: string,
  wentToMasjid: boolean | null
): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.prayerLogs.put({
      id: `${date}_${prayerName}`,
      userId: "",
      date,
      prayerName,
      status,
      wentToMasjid,
      lastCheckinAt: new Date().toISOString(),
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Upsert a single sunnah log entry into the IndexedDB cache.
 */
export function upsertSunnahLogToCache(
  date: string,
  sunnahKey: string,
  prayed: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.sunnahLogs.put({
      id: `${date}_${sunnahKey}`,
      date,
      sunnahKey,
      prayed,
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Cache a single-record blob (analytics, friends, qadaa).
 */
export function cacheBlob(store: "analytics" | "friends" | "qadaa", data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db[store].put({ id: "current", data, _cachedAt: Date.now() }).catch(() => {});
  } catch {
    // non-critical
  }
}

interface GoalLike {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: string;
  goalType?: string;
  targetDate?: string | null;
  sortOrder: number;
  color: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  completedAt: string | Date | null;
}

/**
 * Sync the full goals list to IndexedDB. Replaces all goals.
 */
export function syncGoalsToCache(goals: GoalLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.goals.clear().then(() =>
      db.goals.bulkPut(
        goals.map((g) => ({
          id: g.id,
          userId: g.userId,
          parentId: g.parentId,
          title: g.title,
          description: g.description,
          status: g.status,
          sortOrder: g.sortOrder,
          color: g.color,
          createdAt: typeof g.createdAt === "string" ? g.createdAt : g.createdAt.toISOString(),
          updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : g.updatedAt.toISOString(),
          completedAt: g.completedAt ? (typeof g.completedAt === "string" ? g.completedAt : g.completedAt.toISOString()) : null,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Delete a single goal from the IndexedDB cache.
 */
export function deleteGoalFromCache(goalId: string): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.goals.delete(goalId).catch(() => {});
  } catch {
    // non-critical
  }
}

// ─── Homework cache writers ───────────────────────────────────────────

interface HomeworkLike {
  id: string;
  title: string;
  description: string | null;
  classId: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: string;
  status: string;
  kind: string;
  completedAt: string | Date | null;
  _pending?: boolean;
}

/**
 * Sync the full homework list to IndexedDB. Replaces all homework.
 * Also prunes completed homework older than 30 days to prevent bloat.
 */
export function syncHomeworkToCache(homework: HomeworkLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.homework.clear().then(() =>
      db.homework.bulkPut(
        homework.map((h) => ({
          id: h.id,
          title: h.title,
          description: h.description,
          classId: h.classId,
          dueDate: h.dueDate,
          dueTime: h.dueTime,
          priority: h.priority,
          status: h.status,
          kind: h.kind,
          completedAt: h.completedAt
            ? typeof h.completedAt === "string"
              ? h.completedAt
              : h.completedAt.toISOString()
            : null,
          _pending: h._pending,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
    // Prune old completed homework + old cache data (events, prayer logs, prayer times)
    import("./db").then(({ pruneOldHomeworkCache, pruneOldCache }) => Promise.all([
      pruneOldHomeworkCache(),
      pruneOldCache(),
    ])).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Add or update a single homework item in the IndexedDB cache.
 */
export function upsertHomeworkToCache(hw: HomeworkLike): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.homework.put({
      id: hw.id,
      title: hw.title,
      description: hw.description,
      classId: hw.classId,
      dueDate: hw.dueDate,
      dueTime: hw.dueTime,
      priority: hw.priority,
      status: hw.status,
      kind: hw.kind,
      completedAt: hw.completedAt
        ? typeof hw.completedAt === "string"
          ? hw.completedAt
          : hw.completedAt.toISOString()
        : null,
      _pending: hw._pending,
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Delete a single homework item from the IndexedDB cache.
 */
export function deleteHomeworkFromCache(hwId: string): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.homework.delete(hwId).catch(() => {});
  } catch {
    // non-critical
  }
}

// ─── Classes cache writers ────────────────────────────────────────────

interface ClassLike {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  sortOrder: number;
}

/**
 * Sync the full classes list to IndexedDB. Replaces all classes.
 */
export function syncClassesToCache(classes: ClassLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.classes.clear().then(() =>
      db.classes.bulkPut(
        classes.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          archived: c.archived,
          sortOrder: c.sortOrder,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Add or update a single class in the IndexedDB cache.
 */
export function upsertClassToCache(cls: ClassLike): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.classes.put({
      id: cls.id,
      name: cls.name,
      color: cls.color,
      archived: cls.archived,
      sortOrder: cls.sortOrder,
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

/**
 * Delete a single class from the IndexedDB cache.
 */
export function deleteClassFromCache(classId: string): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.classes.delete(classId).catch(() => {});
  } catch {
    // non-critical
  }
}

// ─── Habits cache writers ─────────────────────────────────────────────

interface HabitLike {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  timeOfDay?: string | null;
  reminderTime?: string | null;
  color: string;
  targetCount: number;
  archived: boolean;
  sortOrder: number;
}

export function syncHabitsToCache(habits: HabitLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.habits.clear().then(() =>
      db.habits.bulkPut(
        habits.map((h) => ({
          id: h.id,
          name: h.name,
          description: h.description,
          frequency: h.frequency,
          color: h.color,
          targetCount: h.targetCount,
          archived: h.archived,
          sortOrder: h.sortOrder,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

export function upsertHabitToCache(habit: HabitLike): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.habits.put({
      id: habit.id,
      name: habit.name,
      description: habit.description,
      frequency: habit.frequency,
      color: habit.color,
      targetCount: habit.targetCount,
      archived: habit.archived,
      sortOrder: habit.sortOrder,
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

export function deleteHabitFromCache(habitId: string): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.habits.delete(habitId).catch(() => {});
    // Also delete all habit logs for this habit
    db.habitLogs.where("habitId").equals(habitId).delete().catch(() => {});
  } catch {
    // non-critical
  }
}

// ─── Habit logs cache writers ─────────────────────────────────────────

export function syncHabitLogsToCache(logs: { id: string; habitId: string; date: string; count: number }[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.habitLogs.clear().then(() =>
      db.habitLogs.bulkPut(
        logs.map((l) => ({
          id: l.id,
          habitId: l.habitId,
          date: l.date,
          count: l.count,
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

export function toggleHabitLogInCache(habitId: string, date: string, completed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    if (completed) {
      db.habitLogs.put({
        id: `${habitId}_${date}`,
        habitId,
        date,
        count: 1,
        _cachedAt: Date.now(),
      }).catch(() => {});
    } else {
      db.habitLogs.delete(`${habitId}_${date}`).catch(() => {});
    }
  } catch {
    // non-critical
  }
}

// ─── Notes cache writers ──────────────────────────────────────────────

interface NoteLike {
  id: string;
  title: string | null;
  content: string;
  pinned: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export function syncNotesToCache(notes: NoteLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.notes.clear().then(() =>
      db.notes.bulkPut(
        notes.map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          pinned: n.pinned,
          createdAt: typeof n.createdAt === "string" ? n.createdAt : n.createdAt.toISOString(),
          updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : n.updatedAt.toISOString(),
          _cachedAt: Date.now(),
        }))
      )
    ).catch(() => {});
  } catch {
    // non-critical
  }
}

export function upsertNoteToCache(note: NoteLike): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.notes.put({
      id: note.id,
      title: note.title,
      content: note.content,
      pinned: note.pinned,
      createdAt: typeof note.createdAt === "string" ? note.createdAt : note.createdAt.toISOString(),
      updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : note.updatedAt.toISOString(),
      _cachedAt: Date.now(),
    }).catch(() => {});
  } catch {
    // non-critical
  }
}

export function deleteNoteFromCache(noteId: string): void {
  if (typeof window === "undefined") return;
  try {
    const db = getOfflineDB();
    db.notes.delete(noteId).catch(() => {});
  } catch {
    // non-critical
  }
}

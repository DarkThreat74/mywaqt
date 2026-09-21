"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Plus, Check, Trash2, X, Clock, AlertCircle, BookOpen, ChevronDown, ChevronRight, Filter, Layers, ArrowDownWideNarrow, CalendarClock, CalendarDays, Pencil } from "lucide-react";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { getOfflineDB } from "@/lib/offline/db";
import {
  syncHomeworkToCache,
  upsertHomeworkToCache,
  deleteHomeworkFromCache,
  syncClassesToCache,
  upsertClassToCache,
  deleteClassFromCache,
} from "@/lib/offline/cache-writers";
import { formatDueBadge, urgencyColors, urgencyCardTint, isTimeOverdue, daysUntilDate } from "@/lib/homework/due-format";
import { HOMEWORK_KINDS, KIND_LABELS, type HomeworkKind } from "@/lib/homework/kinds";
import { parseHomeworkTitle } from "@/lib/homework/parse";
import { parseICS } from "@/lib/homework/ics";
import { computeCushion } from "@/lib/homework/cushion";

export interface HomeworkSubtask {
  id: string;
  title: string;
  done: boolean;
  sortOrder?: number;
}

export interface HomeworkItem {
  id: string;
  title: string;
  description: string | null;
  classId: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  kind: HomeworkKind;
  plannedDate: string | null;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  estimatedMinutes: number | null;
  plannedEventId: string | null;
  subtasks: HomeworkSubtask[];
  notified3dAt?: string | null;
  notified1dAt?: string | null;
  notifiedMorningAt?: string | null;
  completedAt: Date | null;
}

interface ClassItem {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  sortOrder: number;
}

const CLASS_COLORS = [
  "#c2410c", "#0e7490", "#b45309", "#15803d",
  "#be185d", "#7c2d12", "#166534", "#3730a3",
  "#a16207", "#9f1239", "#1e40af", "#6d28d9",
  "#0f766e", "#4d7c0f", "#b91c1c", "#1d4ed8",
  "#86198f", "#92400e", "#155e75", "#3f6212",
  "#701a75", "#065f46", "#78350f", "#831843",
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--color-warmth)",
  medium: "var(--color-ink-muted)",
  low: "var(--color-accent)",
};

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

function daysUntil(dueDate: string): number {
  return daysUntilDate(dueDate);
}

function isOverdue(hw: HomeworkItem): boolean {
  return isTimeOverdue(hw.dueDate, hw.dueTime, hw.status);
}

export default function HomeworkClient({
  initialHomework,
  initialClasses,
  onHomeworkChange,
}: {
  initialHomework: HomeworkItem[];
  initialClasses: ClassItem[];
  onHomeworkChange?: (homework: HomeworkItem[]) => void;
}) {
  const [homework, setHomework] = useState<HomeworkItem[]>(initialHomework);
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [filterClassId, setFilterClassId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<"all" | "high" | "medium" | "low">("all");
  const [sortBy, setSortBy] = useState<"soonest" | "latest" | "type">("soonest");
  const [sortTypeKind, setSortTypeKind] = useState<HomeworkItem["kind"]>("homework");
  const [showCompleted, setShowCompleted] = useState(false);
  const [deleteClassConfirm, setDeleteClassConfirm] = useState<ClassItem | null>(null);
  const [editClass, setEditClass] = useState<ClassItem | null>(null);
  const [editClassName, setEditClassName] = useState("");
  const [editClassColor, setEditClassColor] = useState("");
  const [savingEditClass, setSavingEditClass] = useState(false);
  const [deleteHwConfirm, setDeleteHwConfirm] = useState<HomeworkItem | null>(null);
  const [completeConfirm, setCompleteConfirm] = useState<HomeworkItem | null>(null);
  const [showClasses, setShowClasses] = useState(false);

  // Propagate homework state changes to parent (so Today tab stays in sync).
  // Only depend on `homework` — the callback identity may change every render
  // (HomeworkTab wraps it in an inline arrow), so including it would cause an
  // infinite loop: effect fires → setHomework in parent → re-render → new callback
  // → effect fires again → freeze.
  useEffect(() => {
    if (onHomeworkChange) onHomeworkChange(homework);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homework]);

  // Add form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(tomorrowStr());
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [kind, setKind] = useState<HomeworkKind>("homework");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plan ("do date") + estimate + subtasks
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedStartTime, setPlannedStartTime] = useState("");
  const [plannedEndTime, setPlannedEndTime] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | "">("");
  const [subtasks, setSubtasks] = useState<HomeworkSubtask[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  // NL quick-add: which fields the user explicitly set (parser won't override)
  const touchedRef = useRef<Set<string>>(new Set());
  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Cushion warnings (per homework id → shortfall minutes)
  const [cushions, setCushions] = useState<Record<string, number>>({});

  // Class form state
  const [className, setClassName] = useState("");
  const [classColor, setClassColor] = useState(CLASS_COLORS[0]);
  const [savingClass, setSavingClass] = useState(false);

  const refreshHomework = useCallback(async () => {
    try {
      const res = await fetch("/api/homework");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHomework(data);
          syncHomeworkToCache(data);
        }
      }
    } catch {
      // non-critical — offline, cached data still showing
    }
  }, []);

  // ── Offline-first: load from IndexedDB on mount, then refresh from API ──
  // Skip the API fetch entirely if we already have initial data from the server
  // (GoalsPageClient passes it as props). This avoids duplicate network requests
  // on every tab switch. The SWR-style background revalidation in the service
  // worker API cache will keep the data fresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only load from IndexedDB if we don't already have server-rendered data
      if (initialHomework.length === 0 && initialClasses.length === 0) {
        try {
          const db = getOfflineDB();
          const [cachedHw, cachedClasses] = await Promise.all([
            db.homework.toArray(),
            db.classes.toArray(),
          ]);
          if (cancelled) return;
          if (cachedHw.length > 0) {
            setHomework(cachedHw.map((h) => ({
              id: h.id,
              title: h.title,
              description: h.description,
              classId: h.classId,
              dueDate: h.dueDate,
              dueTime: h.dueTime,
              priority: h.priority as HomeworkItem["priority"],
              status: h.status as HomeworkItem["status"],
              kind: h.kind as HomeworkItem["kind"],
              plannedDate: h.plannedDate ?? null,
              plannedStartTime: h.plannedStartTime ?? null,
              plannedEndTime: h.plannedEndTime ?? null,
              estimatedMinutes: h.estimatedMinutes ?? null,
              plannedEventId: h.plannedEventId ?? null,
              subtasks: h.subtasks ?? [],
              notified3dAt: h.notified3dAt ?? null,
              notified1dAt: h.notified1dAt ?? null,
              notifiedMorningAt: h.notifiedMorningAt ?? null,
              completedAt: h.completedAt ? new Date(h.completedAt) : null,
            })));
          }
          if (cachedClasses.length > 0) {
            setClasses(cachedClasses.map((c) => ({
              id: c.id,
              name: c.name,
              color: c.color,
              archived: c.archived,
              sortOrder: c.sortOrder ?? 0,
            })));
          }
        } catch {
          // IndexedDB not available — continue to API
        }
      }

      // Only fetch from API if we don't have server-rendered initial data.
      // The SW API cache (stale-while-revalidate with TTL) handles freshness.
      if (initialHomework.length === 0 && initialClasses.length === 0) {
        try {
          const [hwRes, clsRes] = await Promise.all([
            fetch("/api/homework"),
            fetch("/api/classes"),
          ]);
          if (cancelled) return;
          if (hwRes.ok) {
            const hwData = await hwRes.json();
            if (Array.isArray(hwData)) {
              setHomework(hwData);
              syncHomeworkToCache(hwData);
            }
          }
          if (clsRes.ok) {
            const clsData = await clsRes.json();
            if (Array.isArray(clsData)) {
              setClasses(clsData);
              syncClassesToCache(clsData);
            }
          }
        } catch {
          // Offline — cached data is already showing
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onSynced() {
      refreshHomework();
    }
    window.addEventListener("waqt:events-synced", onSynced);
    return () => window.removeEventListener("waqt:events-synced", onSynced);
  }, [refreshHomework]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setClassId(null);
    setDueDate(tomorrowStr());
    setDueTime("");
    setPriority("medium");
    setKind("homework");
    setPlannedDate("");
    setPlannedStartTime("");
    setPlannedEndTime("");
    setEstimatedMinutes("");
    setSubtasks([]);
    setNewSubtask("");
    touchedRef.current.clear();
    setError(null);
    setEditingId(null);
  }

  function handleEditClick(hw: HomeworkItem) {
    setEditingId(hw.id);
    setTitle(hw.title);
    setDescription(hw.description || "");
    setClassId(hw.classId);
    setDueDate(hw.dueDate);
    // dueTime comes as "HH:MM:SS" — strip seconds for the time input
    setDueTime(hw.dueTime ? hw.dueTime.slice(0, 5) : "");
    setPriority(hw.priority);
    setKind(hw.kind);
    setPlannedDate(hw.plannedDate ?? "");
    setPlannedStartTime(hw.plannedStartTime ? hw.plannedStartTime.slice(0, 5) : "");
    setPlannedEndTime(hw.plannedEndTime ? hw.plannedEndTime.slice(0, 5) : "");
    setEstimatedMinutes(hw.estimatedMinutes ?? "");
    setSubtasks(hw.subtasks ?? []);
    setNewSubtask("");
    touchedRef.current = new Set(["title"]); // don't let NL parsing overwrite an existing title's fields
    setError(null);
    setShowAddForm(true);
    // Scroll to top so the form is visible on mobile
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSaveHomework() {
    // If the parser detected anything, store the cleaned title — the matched
    // words ("friday", "urgent", the class name) live in their own fields.
    const parsed = parseHomeworkTitle(title, classes);
    const detected = parsed.kind || parsed.classId || parsed.dueDate || parsed.dueTime || parsed.priority;
    const trimmed = (detected && parsed.title.trim()) ? parsed.title.trim() : title.trim();
    if (!trimmed) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Build full instants for the planned session (sent alongside the local
      // date/time fields so the server can place the calendar event correctly)
      const plannedStartAt = plannedDate && plannedStartTime
        ? new Date(`${plannedDate}T${plannedStartTime}:00`).toISOString() : null;
      const plannedEndAt = plannedDate && plannedEndTime
        ? new Date(`${plannedDate}T${plannedEndTime}:00`).toISOString()
        : plannedStartAt ? new Date(new Date(plannedStartAt).getTime() + 60 * 60 * 1000).toISOString() : null;

      const payload = {
        title: trimmed,
        description: description.trim() || undefined,
        classId: classId || undefined,
        dueDate,
        dueTime: dueTime ? `${dueTime}:00` : undefined,
        priority,
        kind,
        plannedDate: plannedDate || null,
        plannedStartTime: plannedStartTime ? `${plannedStartTime}:00` : null,
        plannedEndTime: plannedEndTime ? `${plannedEndTime}:00` : null,
        plannedStartAt,
        plannedEndAt,
        estimatedMinutes: estimatedMinutes === "" ? null : Number(estimatedMinutes),
        ...(editingId
          ? { subtasks: subtasks.map((s) => ({ id: s.id.startsWith("tmp-") ? undefined : s.id, title: s.title, done: s.done })) }
          : { subtasks: subtasks.map((s) => s.title) }),
      };

      if (editingId) {
        // Update existing homework
        const res = await fetch(`/api/homework/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          // When offline, the SW returns a generic 202 with no homework object.
          // In that case, keep the optimistic state (the existing item with
          // the edited fields applied) rather than overwriting with a broken object.
          if (data && data.title && data.dueDate) {
            // Server returned a full homework object — use it
            setHomework((prev) =>
              prev.map((h) => (h.id === editingId ? data : h))
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
            );
            upsertHomeworkToCache(data);
          } else {
            // Offline 202 or incomplete response — apply edits optimistically
            const optimisticHw: HomeworkItem = {
              ...homework.find((h) => h.id === editingId)!,
              title: trimmed,
              description: description.trim() || null,
              classId: classId || null,
              dueDate,
              dueTime: dueTime ? `${dueTime}:00` : null,
              priority,
              kind,
              plannedDate: plannedDate || null,
              plannedStartTime: plannedStartTime ? `${plannedStartTime}:00` : null,
              plannedEndTime: plannedEndTime ? `${plannedEndTime}:00` : null,
              estimatedMinutes: estimatedMinutes === "" ? null : Number(estimatedMinutes),
              subtasks,
            };
            setHomework((prev) =>
              prev.map((h) => (h.id === editingId ? optimisticHw : h))
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
            );
            upsertHomeworkToCache(optimisticHw);
          }
          invalidateApiCache("/api/homework");
          resetForm();
          setShowAddForm(false);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to update homework");
        }
      } else {
        // Create new homework
        const res = await fetch("/api/homework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const newHw = await res.json();
          // When offline, the SW returns a synthetic object with tempId and
          // the echoed fields. This is enough to render the item in the list.
          setHomework((prev) => [...prev, newHw].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
          upsertHomeworkToCache(newHw);
          invalidateApiCache("/api/homework");
          resetForm();
          setShowAddForm(false);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to add homework");
        }
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Schooltraq-style quick add — parse the title live and fill any fields the
  // user hasn't explicitly set. The detected bits show as a hint under the
  // input; on save the cleaned title is what gets stored.
  function handleTitleChange(value: string) {
    setTitle(value);
    const parsed = parseHomeworkTitle(value, classes);
    const touched = touchedRef.current;
    if (parsed.kind && !touched.has("kind")) setKind(parsed.kind);
    if (parsed.classId && !touched.has("classId")) setClassId(parsed.classId);
    if (parsed.dueDate && !touched.has("dueDate")) setDueDate(parsed.dueDate);
    if (parsed.dueTime && !touched.has("dueTime")) setDueTime(parsed.dueTime);
    if (parsed.priority && !touched.has("priority")) setPriority(parsed.priority);
  }

  function addSubtask() {
    const t = newSubtask.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { id: `tmp-${Date.now()}-${prev.length}`, title: t, done: false }]);
    setNewSubtask("");
  }

  // Toggle a step on a saved homework — sends the full subtask list as a diff
  async function handleToggleSubtask(hw: HomeworkItem, subtaskId: string) {
    const next = (hw.subtasks ?? []).map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    const updatedHw = { ...hw, subtasks: next };
    setHomework((prev) => prev.map((h) => (h.id === hw.id ? updatedHw : h)));
    upsertHomeworkToCache(updatedHw);
    try {
      const res = await fetch(`/api/homework/${hw.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtasks: next.map((s) => ({ id: s.id, title: s.title, done: s.done })) }),
      });
      if (!res.ok && res.status !== 202) {
        setHomework((prev) => prev.map((h) => (h.id === hw.id ? hw : h)));
        upsertHomeworkToCache(hw);
        return;
      }
      invalidateApiCache("/api/homework");
    } catch {
      // offline — keep optimistic state
    }
  }

  // Import: paste one-per-line (NL-parsed) or .ics file
  async function handleImport() {
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 200);
    if (lines.length === 0) { setImportMsg("Nothing to import"); return; }
    setImporting(true);
    setImportMsg(null);
    try {
      const items = lines.map((line) => {
        const p = parseHomeworkTitle(line, classes);
        return {
          title: p.title,
          classId: p.classId,
          dueDate: p.dueDate ?? tomorrowStr(),
          dueTime: p.dueTime ? `${p.dueTime}:00` : null,
          priority: p.priority ?? "medium",
          kind: p.kind ?? "homework",
        };
      });
      const res = await fetch("/api/homework/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setImportMsg(`Imported ${data.created ?? items.length} item${data.created === 1 ? "" : "s"}`);
        setImportText("");
        refreshHomework();
        invalidateApiCache("/api/homework");
      } else {
        setImportMsg(data.error || "Import failed");
      }
    } catch {
      setImportMsg("Network error");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const entries = parseICS(text);
    if (entries.length === 0) { setImportMsg("No events found in that file"); return; }
    setImportText(entries.map((e) => `${e.title} ${e.date}${e.time ? ` at ${e.time}` : ""}`).join("\n"));
    setImportMsg(`Found ${entries.length} item${entries.length === 1 ? "" : "s"} — review then tap Import`);
  }

  async function handleToggleComplete(hw: HomeworkItem) {
    const newStatus: "pending" | "completed" = hw.status === "completed" ? "pending" : "completed";
    const updatedHw: HomeworkItem = { ...hw, status: newStatus, completedAt: newStatus === "completed" ? new Date() : null };
    // Optimistic update + cache write — keep even if offline
    setHomework((prev) => prev.map((h) => (h.id === hw.id ? updatedHw : h)));
    upsertHomeworkToCache(updatedHw);
    try {
      const payload: Record<string, unknown> = { status: newStatus };
      // Un-completing restores the planned study session — resend the
      // instants so the server recreates the calendar event it deleted.
      if (newStatus === "pending" && hw.plannedDate && hw.plannedStartTime) {
        const start = new Date(`${hw.plannedDate}T${hw.plannedStartTime.slice(0, 5)}:00`);
        if (!isNaN(start.getTime())) {
          payload.plannedStartAt = start.toISOString();
          const end = hw.plannedEndTime ? new Date(`${hw.plannedDate}T${hw.plannedEndTime.slice(0, 5)}:00`) : null;
          payload.plannedEndAt = end && !isNaN(end.getTime())
            ? end.toISOString()
            : new Date(start.getTime() + 60 * 60 * 1000).toISOString();
        }
      }
      const res = await fetch(`/api/homework/${hw.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // 202 = queued offline by the SW — keep optimistic state.
      // Other non-ok responses mean the server rejected the change — revert.
      if (!res.ok && res.status !== 202) {
        setHomework((prev) => prev.map((h) => (h.id === hw.id ? hw : h)));
        upsertHomeworkToCache(hw);
        return;
      }
      invalidateApiCache("/api/homework");
    } catch {
      // Offline: keep optimistic state + cache as-is (don't revert)
    }
  }

  // Called when user confirms completion in the modal
  function handleCompleteClick(hw: HomeworkItem) {
    if (hw.status === "completed") {
      // Already completed — just uncomplete without confirmation
      handleToggleComplete(hw);
    } else {
      setCompleteConfirm(hw);
    }
  }

  async function handleDelete(id: string) {
    setHomework((prev) => prev.filter((h) => h.id !== id));
    deleteHomeworkFromCache(id);
    try {
      const res = await fetch(`/api/homework/${id}`, { method: "DELETE" });
      // 202 = queued offline — keep it removed. Other failures — refetch.
      if (!res.ok && res.status !== 202) {
        refreshHomework();
        return;
      }
      invalidateApiCache("/api/homework");
    } catch {
      refreshHomework();
    }
  }

  // Cushion warnings — for pending homework with an estimate due within 7
  // days, compare remaining effort to free calendar time before the deadline.
  useEffect(() => {
    const today = todayStr();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    const horizonStr = horizon.toLocaleDateString("en-CA");
    const candidates = homework.filter(
      (h) => h.status === "pending" && h.estimatedMinutes && h.dueDate >= today && h.dueDate <= horizonStr,
    );
    let cancelled = false;
    (async () => {
      if (candidates.length === 0) {
        if (!cancelled) setCushions({});
        return;
      }
      let events: Array<{ startAt: Date; endAt: Date }> = [];
      try {
        const res = await fetch(`/api/events?from=${today}&to=${horizonStr}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            events = data.map((e) => ({ startAt: new Date(e.startAt), endAt: new Date(e.endAt) }))
              .filter((e) => !isNaN(e.startAt.getTime()) && !isNaN(e.endAt.getTime()));
          }
        }
      } catch {
        // offline — no cushion data, that's fine
      }
      // Prayer windows are busy time too — add each prayer as a ~45-min block
      // so the cushion doesn't promise time that's spoken for.
      try {
        const db = getOfflineDB();
        for (let d = new Date(`${today}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toLocaleDateString("en-CA");
          if (dateStr > horizonStr) break;
          const pt = await db.prayerTimes.get(dateStr);
          if (!pt) continue;
          for (const t of [pt.fajr, pt.dhuhr, pt.asr, pt.maghrib, pt.isha]) {
            if (!t) continue;
            const start = new Date(`${dateStr}T${t.slice(0, 5)}:00`);
            if (!isNaN(start.getTime())) {
              events.push({ startAt: start, endAt: new Date(start.getTime() + 45 * 60000) });
            }
          }
        }
      } catch {
        // IndexedDB unavailable — cushion just skips prayer blocks
      }
      if (cancelled) return;
      const next: Record<string, number> = {};
      const now = new Date();
      for (const hw of candidates) {
        // Minutes of future study sessions already booked for this hw
        let plannedMin = 0;
        if (hw.plannedDate && hw.plannedDate >= today && hw.plannedStartTime) {
          const start = hw.plannedStartTime.slice(0, 5);
          const end = hw.plannedEndTime?.slice(0, 5) ?? null;
          plannedMin = end
            ? (Number(end.slice(0, 2)) * 60 + Number(end.slice(3))) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)))
            : 60;
          if (plannedMin < 0) plannedMin = 0;
        }
        const shortfall = computeCushion({
          estimatedMinutes: hw.estimatedMinutes,
          plannedMinutes: plannedMin,
          now,
          dueDate: hw.dueDate,
          dueTime: hw.dueTime,
          busy: events,
        });
        if (shortfall) next[hw.id] = shortfall;
      }
      setCushions(next);
    })();
    return () => { cancelled = true; };
  }, [homework]);

  function handleDeleteClick(hw: HomeworkItem) {
    setDeleteHwConfirm(hw);
  }

  async function handleAddClass() {
    const trimmed = className.trim();
    if (!trimmed) return;
    setSavingClass(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color: classColor }),
      });
      if (res.ok) {
        const newClass = await res.json();
        setClasses((prev) => [...prev, newClass]);
        upsertClassToCache(newClass);
        setClassName("");
        setClassColor(CLASS_COLORS[classes.length % CLASS_COLORS.length]);
        setShowAddClass(false);
      }
    } catch {
      // non-critical
    } finally {
      setSavingClass(false);
    }
  }

  function openEditClass(cls: ClassItem) {
    setEditClass(cls);
    setEditClassName(cls.name);
    setEditClassColor(cls.color);
  }

  async function handleSaveEditClass() {
    if (!editClass) return;
    const trimmed = editClassName.trim();
    if (!trimmed) return;
    const updated = { ...editClass, name: trimmed, color: editClassColor };
    setSavingEditClass(true);
    setClasses((prev) => prev.map((c) => (c.id === editClass.id ? updated : c)));
    upsertClassToCache(updated);
    setEditClass(null);
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editClass.id, name: trimmed, color: editClassColor }),
      });
      if (res.ok) {
        invalidateApiCache("/api/classes");
      } else if (res.status !== 202) {
        const refetch = await fetch("/api/classes");
        if (refetch.ok) {
          const data = await refetch.json();
          if (Array.isArray(data)) {
            setClasses(data);
            syncClassesToCache(data);
          }
        }
      }
    } catch {
      // offline — queued by SW outbox
    } finally {
      setSavingEditClass(false);
    }
  }

  async function handleDeleteClass(cls: ClassItem) {
    setClasses((prev) => prev.filter((c) => c.id !== cls.id));
    // Unassign homework from deleted class
    setHomework((prev) => prev.map((h) => (h.classId === cls.id ? { ...h, classId: null } : h)));
    deleteClassFromCache(cls.id);
    if (filterClassId === cls.id) setFilterClassId(null);
    setDeleteClassConfirm(null);
    const refetchClasses = async () => {
      try {
        const res = await fetch("/api/classes");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setClasses(data);
            syncClassesToCache(data);
          }
        }
      } catch { /* offline */ }
    };
    try {
      const res = await fetch(`/api/classes?id=${cls.id}`, { method: "DELETE" });
      // 202 = queued offline — keep removal. Other failures — refetch.
      if (!res.ok && res.status !== 202) {
        await refetchClasses();
        return;
      }
      invalidateApiCache("/api/classes");
    } catch {
      await refetchClasses();
    }
  }

  // ── Filtering logic ──
  const filtered = useMemo(() => {
    return homework.filter((h) => {
      if (filterClassId && h.classId !== filterClassId) return false;
      if (filterPriority !== "all" && h.priority !== filterPriority) return false;
      // When sorting by type, filter to only the selected kind
      if (sortBy === "type" && h.kind !== sortTypeKind) return false;
      return true;
    });
  }, [homework, filterClassId, filterPriority, sortBy, sortTypeKind]);

  const pending = filtered.filter((h) => h.status === "pending");
  const completed = filtered.filter((h) => h.status === "completed");

  // Sort pending based on selected sort mode
  const sortedPending = [...pending].sort((a, b) => {
    switch (sortBy) {
      case "soonest": {
        // Soonest due first, then by due time
        const dateCmp = a.dueDate.localeCompare(b.dueDate);
        if (dateCmp !== 0) return dateCmp;
        return (a.dueTime || "23:59").localeCompare(b.dueTime || "23:59");
      }
      case "latest": {
        // Latest due date first (furthest away)
        const dateCmp = b.dueDate.localeCompare(a.dueDate);
        if (dateCmp !== 0) return dateCmp;
        return (b.dueTime || "00:00").localeCompare(a.dueTime || "00:00");
      }
      case "type": {
        // Items matching the selected kind go to the top, then by due date
        const aMatch = a.kind === sortTypeKind ? 0 : 1;
        const bMatch = b.kind === sortTypeKind ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return a.dueDate.localeCompare(b.dueDate);
      }
    }
  });

  const overdue = sortedPending.filter(isOverdue);
  const today = sortedPending.filter((h) => daysUntil(h.dueDate) === 0 && !isOverdue(h));
  const tomorrow = sortedPending.filter((h) => daysUntil(h.dueDate) === 1);
  const thisWeek = sortedPending.filter((h) => {
    const d = daysUntil(h.dueDate);
    return d >= 2 && d <= 6;
  });
  const later = sortedPending.filter((h) => daysUntil(h.dueDate) >= 7);

  // For "latest" mode: group thisWeek + later items by exact date, sorted latest-first
  const dateGroupedItems = (() => {
    const groups = new Map<string, HomeworkItem[]>();
    for (const h of [...thisWeek, ...later]) {
      if (!groups.has(h.dueDate)) groups.set(h.dueDate, []);
      groups.get(h.dueDate)!.push(h);
    }
    // Sort dates latest-first (reverse chronological)
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  // Format a date string (YYYY-MM-DD) as a readable label
  function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function getClassInfo(id: string | null): ClassItem | null {
    if (!id) return null;
    return classes.find((c) => c.id === id) || null;
  }

  // Count pending homework per class
  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of homework) {
      if (h.status === "pending" && h.classId) {
        counts.set(h.classId, (counts.get(h.classId) || 0) + 1);
      }
    }
    return counts;
  }, [homework]);

  const activeClasses = classes.filter((c) => !c.archived);

  function renderHomeworkCard(hw: HomeworkItem) {
    const cls = getClassInfo(hw.classId);
    const badge = formatDueBadge(hw.dueDate, hw.dueTime, hw.status);
    const colors = urgencyColors(badge.urgency);
    const tint = urgencyCardTint(badge.urgency);
    return (
      <div
        key={hw.id}
        className="flex items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-[var(--color-paper-2)]"
        style={{
          borderColor: cls ? `color-mix(in oklab, ${cls.color} 20%, var(--color-paper-3))` : "var(--color-paper-3)",
          backgroundColor: tint.backgroundColor,
          borderLeft: cls ? `3px solid ${cls.color}` : tint.borderLeftColor ? `3px solid ${tint.borderLeftColor}` : undefined,
        }}
      >
        {/* Checkbox */}
        <button
          onClick={() => handleCompleteClick(hw)}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
          style={{
            borderColor: hw.status === "completed" ? "var(--color-success)" : "var(--color-paper-3)",
            backgroundColor: hw.status === "completed" ? "var(--color-success)" : "transparent",
          }}
          aria-label={hw.status === "completed" ? "Mark as pending" : "Mark as complete"}
        >
          {hw.status === "completed" && <Check className="h-3.5 w-3.5" style={{ color: "var(--color-paper)" }} />}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-sm font-medium leading-snug"
              style={{
                color: hw.status === "completed" ? "var(--color-ink-muted)" : "var(--color-ink)",
                textDecoration: hw.status === "completed" ? "line-through" : "none",
              }}
            >
              {hw.title}
            </h3>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => handleEditClick(hw)}
                className="rounded-lg p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label="Edit homework"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDeleteClick(hw)}
                className="rounded-lg p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label="Delete homework"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {cls && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `color-mix(in oklab, ${cls.color} 12%, var(--color-paper))`,
                  color: cls.color,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cls.color }} />
                {cls.name}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
              style={{
                backgroundColor: colors.bgColor,
                color: colors.color,
                fontWeight: colors.fontWeight,
                border: `1px solid ${colors.borderColor}`,
              }}
            >
              <Clock className="h-2.5 w-2.5" />
              {badge.label}
            </span>
            {hw.kind !== "homework" && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
              >
                {KIND_LABELS[hw.kind]}
              </span>
            )}
            {hw.priority === "high" && hw.status === "pending" && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 10%, transparent)", color: "var(--color-warmth)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[hw.priority] }} />
                High
              </span>
            )}
            {hw.plannedDate && hw.status === "pending" && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)", color: "var(--color-accent)" }}
              >
                <CalendarClock className="h-2.5 w-2.5" />
                Planned {new Date(`${hw.plannedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {hw.plannedStartTime ? ` ${hw.plannedStartTime.slice(0, 5)}` : ""}
              </span>
            )}
            {hw.estimatedMinutes != null && hw.status === "pending" && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
              >
                ~{hw.estimatedMinutes < 60 ? `${hw.estimatedMinutes}m` : `${(hw.estimatedMinutes / 60).toFixed(hw.estimatedMinutes % 60 ? 1 : 0)}h`}
              </span>
            )}
            {(hw.subtasks?.length ?? 0) > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
              >
                {hw.subtasks.filter((s) => s.done).length}/{hw.subtasks.length} steps
              </span>
            )}
          </div>

          {/* Cushion warning — not enough free time before the deadline */}
          {cushions[hw.id] && hw.status === "pending" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--color-warmth)" }}>
              <AlertCircle className="h-3 w-3 shrink-0" />
              Needs ~{Math.round(hw.estimatedMinutes! / 60 * 10) / 10}h — only ~{Math.max(0, Math.round((hw.estimatedMinutes! - cushions[hw.id]) / 60 * 10) / 10)}h free before it&rsquo;s due
            </p>
          )}

          {/* Subtask checklist */}
          {(hw.subtasks?.length ?? 0) > 0 && hw.status === "pending" && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {hw.subtasks.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleToggleSubtask(hw, s.id)}
                  className="flex items-center gap-2 text-left"
                >
                  <span
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                    style={{
                      borderColor: s.done ? "var(--color-success)" : "var(--color-paper-3)",
                      backgroundColor: s.done ? "var(--color-success)" : "var(--color-paper)",
                    }}
                  >
                    {s.done && <Check className="h-2.5 w-2.5" style={{ color: "var(--color-paper)" }} />}
                  </span>
                  <span
                    className="truncate text-xs"
                    style={{ color: s.done ? "var(--color-ink-muted)" : "var(--color-ink)", textDecoration: s.done ? "line-through" : "none" }}
                  >
                    {s.title}
                  </span>
                </button>
              ))}
            </div>
          )}

          {hw.description && (
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              {hw.description}
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderSection(label: string, items: HomeworkItem[], alwaysShow = false) {
    if (items.length === 0 && !alwaysShow) return null;
    return (
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            {label}
          </h2>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
          >
            {items.length}
          </span>
        </div>
        <div className="space-y-2">
          {items.map(renderHomeworkCard)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Homework
        </h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowImport(true); setImportMsg(null); }}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 40 }}
          >
            Import
          </button>
          <button
            onClick={() => { resetForm(); setShowAddForm(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* ── Classes (collapsible dropdown so homework is the main focus) ── */}
      <div className="mb-4">
        <button
          onClick={() => setShowClasses(!showClasses)}
          className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
        >
          <span className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5" style={{ color: "var(--color-ink-muted)" }} />
            Classes
            {activeClasses.length > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
              >
                {activeClasses.length}
              </span>
            )}
            {filterClassId && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `color-mix(in oklab, ${getClassInfo(filterClassId)?.color || "var(--color-accent)"} 12%, var(--color-paper))`,
                  color: getClassInfo(filterClassId)?.color || "var(--color-accent)",
                }}
              >
                Filtered: {getClassInfo(filterClassId)?.name || ""}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setShowAddClass(!showAddClass); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setShowAddClass(!showAddClass); } }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ color: "var(--color-ink-muted)" }}
            >
              <Plus className="h-3 w-3" />
              Add
            </span>
            {showClasses
              ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--color-ink-muted)" }} />
              : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--color-ink-muted)" }} />}
          </span>
        </button>

        {/* Classes list — compact rows with always-visible delete */}
        {showClasses && (
          <div className="mt-2 flex flex-col gap-1">
            {activeClasses.length === 0 && !showAddClass && (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                No classes yet. Tap &ldquo;Add&rdquo; to create one.
              </p>
            )}
            {activeClasses.map((cls) => {
              const count = classCounts.get(cls.id) || 0;
              const isActive = filterClassId === cls.id;
              return (
                <div
                  key={cls.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-all"
                  style={{
                    borderColor: isActive ? cls.color : "var(--color-paper-3)",
                    backgroundColor: isActive ? `color-mix(in oklab, ${cls.color} 8%, var(--color-paper))` : "var(--color-paper)",
                  }}
                >
                  <button
                    onClick={() => setFilterClassId(isActive ? null : cls.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cls.color }} />
                    <span className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                      {cls.name}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                      {count} pending
                    </span>
                  </button>
                  {/* Always-visible edit + delete buttons — compact, works on mobile */}
                  <button
                    onClick={() => openEditClass(cls)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-3)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label={`Edit ${cls.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteClassConfirm(cls)}
                    className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-3)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label={`Delete ${cls.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add class form */}
      {showAddClass && (
        <div
          className="mb-4 rounded-xl border p-4"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>New Class</h3>
            <button onClick={() => setShowAddClass(false)} style={{ color: "var(--color-ink-muted)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. AP Biology, Calculus II..."
              maxLength={100}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 44 }}
            />
            <div className="flex flex-wrap gap-2">
              {CLASS_COLORS.map((color) => {
                const usedBy = classes.filter((c) => c.color === color).map((c) => c.name);
                const inUse = usedBy.length > 0;
                return (
                  <button
                    key={color}
                    onClick={() => setClassColor(color)}
                    className="relative flex h-8 w-8 items-center justify-center rounded-full transition-transform"
                    style={{
                      backgroundColor: color,
                      outline: classColor === color ? `2px solid ${color}` : "none",
                      outlineOffset: "2px",
                      opacity: inUse && classColor !== color ? 0.55 : 1,
                    }}
                    aria-label={inUse ? `Color in use by ${usedBy.join(", ")}` : `Select color ${color}`}
                    title={inUse ? `In use: ${usedBy.join(", ")}` : undefined}
                  >
                    {inUse && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: "var(--color-paper)" }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleAddClass}
              disabled={savingClass || !className.trim()}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              {savingClass ? "Adding..." : "Add class"}
            </button>
          </div>
        </div>
      )}

      {/* ── Filter & sort bar ── */}
      {(pending.length > 0 || completed.length > 0) && (
        <div className="mb-4 flex flex-col gap-2.5">
          {/* Priority filter row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              <Filter className="h-3 w-3" />
              Priority
            </span>
            <div className="flex items-center gap-1 rounded-full p-0.5" style={{ backgroundColor: "var(--color-paper-2)" }}>
              {(["all", "high", "medium", "low"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: filterPriority === p
                      ? p === "all" ? "var(--color-ink)" : `color-mix(in oklab, ${PRIORITY_COLORS[p]} 15%, var(--color-paper))`
                      : "transparent",
                    color: filterPriority === p
                      ? p === "all" ? "var(--color-paper)" : PRIORITY_COLORS[p]
                      : "var(--color-ink-muted)",
                  }}
                >
                  {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Sort row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              <ArrowDownWideNarrow className="h-3 w-3" />
              Sort
            </span>
            <div className="flex items-center gap-1 rounded-full p-0.5" style={{ backgroundColor: "var(--color-paper-2)" }}>
              {([
                { key: "soonest" as const, label: "Soonest", icon: CalendarClock },
                { key: "latest" as const, label: "Latest", icon: CalendarDays },
                { key: "type" as const, label: "Type", icon: Layers },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: sortBy === key ? "var(--color-ink)" : "transparent",
                    color: sortBy === key ? "var(--color-paper)" : "var(--color-ink-muted)",
                  }}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
            {filterClassId && (
              <button
                onClick={() => setFilterClassId(null)}
                className="ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
              >
                <X className="h-3 w-3" />
                Clear class
              </button>
            )}
          </div>

          {/* Type sub-selector — only shown when Sort = Type */}
          {sortBy === "type" && (
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Type:
              </span>
              <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {HOMEWORK_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setSortTypeKind(k)}
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: sortTypeKind === k ? "var(--color-ink)" : "transparent",
                      color: sortTypeKind === k ? "var(--color-paper)" : "var(--color-ink-muted)",
                    }}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add homework form */}
      {showAddForm && (
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {editingId ? "Edit Homework" : "New Homework"}
            </h3>
            <button onClick={() => { setShowAddForm(false); resetForm(); }} style={{ color: "var(--color-ink-muted)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder='e.g. "Kinematics test in physics friday urgent"'
              maxLength={300}
              autoFocus
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 44 }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveHomework(); } }}
            />
            {!editingId && title.trim() && (() => {
              const p = parseHomeworkTitle(title, classes);
              const detected = [
                p.kind && KIND_LABELS[p.kind],
                p.className,
                p.dueDate,
                p.dueTime,
                p.priority && p.priority !== "medium" ? `${p.priority} priority` : null,
              ].filter(Boolean);
              return detected.length > 0 ? (
                <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  Detected: {detected.join(" · ")}
                </p>
              ) : null;
            })()}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes (optional)"
              maxLength={2000}
              rows={2}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] resize-none"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
            />

            {/* Class selector */}
            {classes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => { touchedRef.current.add("classId"); setClassId(null); }}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: classId === null ? "var(--color-ink)" : "var(--color-paper)",
                    color: classId === null ? "var(--color-paper)" : "var(--color-ink-muted)",
                    border: "1px solid var(--color-paper-3)",
                  }}
                >
                  No class
                </button>
                {classes.filter((c) => !c.archived).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { touchedRef.current.add("classId"); setClassId(c.id === classId ? null : c.id); }}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: classId === c.id ? c.color : "var(--color-paper)",
                      color: classId === c.id ? "var(--color-paper)" : "var(--color-ink-muted)",
                      border: "1px solid var(--color-paper-3)",
                    }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Quick date chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Today", value: todayStr() },
                { label: "Tomorrow", value: tomorrowStr() },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { touchedRef.current.add("dueDate"); setDueDate(opt.value); }}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: dueDate === opt.value ? "var(--color-accent)" : "var(--color-paper)",
                    color: dueDate === opt.value ? "var(--color-paper)" : "var(--color-ink-muted)",
                    border: "1px solid var(--color-paper-3)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { touchedRef.current.add("dueDate"); setDueDate(e.target.value); }}
                className="rounded-full border px-3 py-1 text-xs font-medium outline-none focus:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
            </div>

            {/* Due time (optional) */}
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={dueTime}
                onChange={(e) => { touchedRef.current.add("dueTime"); setDueTime(e.target.value); }}
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              />
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Due time (optional)</span>
            </div>

            {/* Kind + Priority — custom styled selectors */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Type:</span>
                {Object.entries(KIND_LABELS).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { touchedRef.current.add("kind"); setKind(k as typeof kind); }}
                    className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: kind === k ? "var(--color-ink)" : "var(--color-paper-2)",
                      color: kind === k ? "var(--color-paper)" : "var(--color-ink-muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Priority:</span>
                {(["low", "medium", "high"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { touchedRef.current.add("priority"); setPriority(p); }}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: priority === p ? "color-mix(in oklab, " + PRIORITY_COLORS[p] + " 15%, var(--color-paper))" : "var(--color-paper-2)",
                      color: priority === p ? PRIORITY_COLORS[p] : "var(--color-ink-muted)",
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PRIORITY_COLORS[p] }}
                    />
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan a work session ("do date") + time estimate */}
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
                Plan when to work on it (optional)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                />
                {plannedDate && (
                  <>
                    <input
                      type="time"
                      value={plannedStartTime}
                      onChange={(e) => setPlannedStartTime(e.target.value)}
                      className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                      aria-label="Session start"
                    />
                    <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>to</span>
                    <input
                      type="time"
                      value={plannedEndTime}
                      onChange={(e) => setPlannedEndTime(e.target.value)}
                      className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                      aria-label="Session end"
                    />
                    <button
                      type="button"
                      onClick={() => { setPlannedDate(""); setPlannedStartTime(""); setPlannedEndTime(""); }}
                      className="text-xs"
                      style={{ color: "var(--color-ink-muted)" }}
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Time needed:</span>
                <select
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value === "" ? "" : Number(e.target.value))}
                  className="rounded-lg border px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                >
                  <option value="">No estimate</option>
                  {[15, 30, 45, 60, 90, 120, 180, 240, 360, 480].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h`}</option>
                  ))}
                </select>
                {typeof estimatedMinutes === "number" && (
                  <span className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    Used to warn you if there isn&rsquo;t enough free time before the deadline
                  </span>
                )}
              </div>
            </div>

            {/* Subtasks / steps */}
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
                Steps (optional)
              </p>
              {subtasks.length > 0 && (
                <div className="mb-2 flex flex-col gap-1">
                  {subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                        style={{
                          borderColor: s.done ? "var(--color-success)" : "var(--color-paper-3)",
                          backgroundColor: s.done ? "var(--color-success)" : "var(--color-paper)",
                        }}
                        aria-label={s.done ? `Uncheck ${s.title}` : `Check ${s.title}`}
                      >
                        {s.done && <Check className="h-3 w-3" style={{ color: "var(--color-paper)" }} />}
                      </button>
                      <span
                        className="flex-1 truncate text-xs"
                        style={{ color: "var(--color-ink)", textDecoration: s.done ? "line-through" : "none" }}
                      >
                        {s.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubtasks((prev) => prev.filter((x) => x.id !== s.id))}
                        style={{ color: "var(--color-ink-muted)" }}
                        aria-label={`Remove ${s.title}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                  placeholder="Add a step, e.g. outline, draft, revise"
                  maxLength={200}
                  className="flex-1 rounded-lg border px-3 py-2 text-xs outline-none focus:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 40 }}
                />
                <button
                  type="button"
                  onClick={addSubtask}
                  disabled={!newSubtask.trim()}
                  className="rounded-lg border px-3 text-xs font-medium disabled:opacity-50"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 40 }}
                >
                  Add
                </button>
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-error)" }}>
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}

            <button
              onClick={handleSaveHomework}
              disabled={saving || !title.trim()}
              className="rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              {saving ? (editingId ? "Saving..." : "Adding...") : (editingId ? "Save changes" : "Add homework")}
            </button>
          </div>
        </div>
      )}

      {/* Homework list */}
      {pending.length === 0 && completed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="mb-3 h-10 w-10" style={{ color: "var(--color-ink-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-ink-muted)" }}>
            {filterClassId || filterPriority !== "all" || sortBy === "type"
              ? "No homework matches your filters."
              : "No homework yet. Tap \u201CAdd\u201D to create your first assignment."}
          </p>
        </div>
      ) : (
        <>
          {sortBy === "type" ? (
            // Type sort: flat list, no date grouping
            sortedPending.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                    {KIND_LABELS[sortTypeKind]}
                  </h2>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                  >
                    {sortedPending.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {sortedPending.map(renderHomeworkCard)}
                </div>
              </div>
            )
          ) : sortBy === "latest" ? (
            // Latest sort: reverse section order (Later → dates → Tomorrow → Today → Overdue)
            <>
              {dateGroupedItems.map(([dateStr, items]) => (
                <div key={dateStr} className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                      {formatDateLabel(dateStr)}
                    </h2>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                    >
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map(renderHomeworkCard)}
                  </div>
                </div>
              ))}
              {renderSection("Tomorrow", tomorrow)}
              {renderSection("Today", today)}
              {renderSection("Overdue", overdue)}
            </>
          ) : (
            // Soonest sort: normal order (Overdue → Today → Tomorrow → This Week → Later)
            <>
              {renderSection("Overdue", overdue)}
              {renderSection("Today", today)}
              {renderSection("Tomorrow", tomorrow)}
              {renderSection("This Week", thisWeek)}
              {renderSection("Later", later)}
            </>
          )}

          {/* Completed section — collapsed by default */}
          {completed.length > 0 && (
            <div className="mb-5">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="mb-2 flex items-center gap-2"
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                  style={{ color: "var(--color-ink-muted)" }}
                />
                <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  Completed
                </h2>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                >
                  {completed.length}
                </span>
              </button>
              {showCompleted && (
                <div className="space-y-2">
                  {completed.map(renderHomeworkCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Delete class confirmation modal ── */}
      {deleteClassConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => setDeleteClassConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: deleteClassConfirm.color }} />
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                Delete &ldquo;{deleteClassConfirm.name}&rdquo;?
              </h3>
            </div>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              The class will be removed. Homework assigned to this class will remain but lose their class label. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteClassConfirm(null)}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteClass(deleteClassConfirm)}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)", minHeight: 44 }}
              >
                Delete class
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => setShowImport(false)}
        >
          <div
            role="dialog"
            aria-label="Import homework"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Import assignments</h3>
              <button onClick={() => setShowImport(false)} style={{ color: "var(--color-ink-muted)" }} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Paste your syllabus — one assignment per line. Dates, classes, and types are detected automatically.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Chapter 5 reading in biology friday\nEssay draft in english next tuesday\nLab report march 20"}
              rows={6}
              className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] resize-none"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
            />
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>or</span>
              <label
                className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
              >
                Upload .ics file
                <input
                  type="file"
                  accept=".ics,text/calendar"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
                />
              </label>
              <span className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>from Canvas, Moodle, Classroom</span>
            </div>
            {importMsg && (
              <p className="mb-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>{importMsg}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowImport(false)}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 44 }}
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit class modal ── */}
      {editClass && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => setEditClass(null)}
        >
          <div
            role="dialog"
            aria-label={`Edit ${editClass.name}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                Edit class
              </h3>
              <button onClick={() => setEditClass(null)} style={{ color: "var(--color-ink-muted)" }} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={editClassName}
                onChange={(e) => setEditClassName(e.target.value)}
                placeholder="Class name"
                maxLength={100}
                autoFocus
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 44 }}
              />
              <div className="flex flex-wrap gap-2">
                {CLASS_COLORS.map((color) => {
                  const usedBy = classes.filter((c) => c.id !== editClass.id && c.color === color).map((c) => c.name);
                  const inUse = usedBy.length > 0;
                  return (
                    <button
                      key={color}
                      onClick={() => setEditClassColor(color)}
                      className="relative flex h-8 w-8 items-center justify-center rounded-full transition-transform"
                      style={{
                        backgroundColor: color,
                        outline: editClassColor === color ? `2px solid ${color}` : "none",
                        outlineOffset: 2,
                        opacity: inUse && editClassColor !== color ? 0.45 : 1,
                      }}
                      title={inUse ? `In use: ${usedBy.join(", ")}` : undefined}
                      aria-label={inUse ? `${color} (in use by ${usedBy.join(", ")})` : color}
                    >
                      {editClassColor === color && <Check className="h-4 w-4" style={{ color: "var(--color-paper)" }} />}
                      {inUse && editClassColor !== color && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-paper)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditClass(null)}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEditClass}
                  disabled={savingEditClass || !editClassName.trim()}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 44 }}
                >
                  {savingEditClass ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete homework confirmation modal ── */}
      {deleteHwConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => setDeleteHwConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              Delete homework?
            </h3>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              &ldquo;{deleteHwConfirm.title}&rdquo; will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteHwConfirm(null)}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { handleDelete(deleteHwConfirm.id); setDeleteHwConfirm(null); }}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)", minHeight: 44 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete homework confirmation modal ── */}
      {completeConfirm && (() => {
        const cls = getClassInfo(completeConfirm.classId);
        const badge = formatDueBadge(completeConfirm.dueDate, completeConfirm.dueTime, completeConfirm.status);
        const colors = urgencyColors(badge.urgency);
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
            onClick={() => setCompleteConfirm(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Mark homework as done"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border p-5"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>
                  {completeConfirm.title}
                </h3>
                <button
                  onClick={() => setCompleteConfirm(null)}
                  className="min-h-11 min-w-11 -m-2 rounded-lg p-2 transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-muted)" }}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {cls && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${cls.color} 12%, var(--color-paper))`,
                      color: cls.color,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cls.color }} />
                    {cls.name}
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                  style={{
                    backgroundColor: colors.bgColor,
                    color: colors.color,
                    fontWeight: colors.fontWeight,
                    border: `1px solid ${colors.borderColor}`,
                  }}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {badge.label}
                </span>
                {completeConfirm.kind !== "homework" && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                  >
                    {KIND_LABELS[completeConfirm.kind]}
                  </span>
                )}
              </div>

              <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                Mark it done? It moves to Done — you can undo it anytime.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setCompleteConfirm(null)}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                >
                  Not yet
                </button>
                <button
                  onClick={() => { handleToggleComplete(completeConfirm); setCompleteConfirm(null); }}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-success)", color: "var(--color-paper)", minHeight: 44 }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

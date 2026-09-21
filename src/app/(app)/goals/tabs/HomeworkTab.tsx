"use client";

import { useCallback } from "react";
import HomeworkClient, { type HomeworkItem } from "../../homework/HomeworkClient";
import type { Homework, Class } from "@/lib/db/schema";

// Thin wrapper that adapts the DB types to the HomeworkClient's expected prop types.
// HomeworkClient manages its own internal state and mutations, but propagates
// changes back to the parent via onHomeworkChange so the Today tab stays in sync.
export default function HomeworkTab({
  homework,
  classes,
  onHomeworkChange,
}: {
  homework: Homework[];
  classes: Class[];
  onHomeworkChange?: (homework: Homework[]) => void;
}) {
  // Stable callback — prevents infinite loop with HomeworkClient's effect.
  // The inline arrow was creating a new function identity on every render,
  // which triggered the effect → setHomework → re-render → new callback → loop.
  const handleHomeworkChange = useCallback((updated: HomeworkItem[]) => {
    if (!onHomeworkChange) return;
    onHomeworkChange(
      updated.map((h) => ({
        id: h.id,
        userId: "", // not used by TodayTab display logic
        title: h.title,
        description: h.description,
        classId: h.classId,
        dueDate: h.dueDate,
        dueTime: h.dueTime,
        priority: h.priority,
        status: h.status,
        kind: h.kind,
        plannedDate: h.plannedDate,
        plannedStartTime: h.plannedStartTime,
        plannedEndTime: h.plannedEndTime,
        estimatedMinutes: h.estimatedMinutes,
        plannedEventId: h.plannedEventId,
        notified3dAt: h.notified3dAt ? new Date(h.notified3dAt) : null,
        notified1dAt: h.notified1dAt ? new Date(h.notified1dAt) : null,
        notifiedMorningAt: h.notifiedMorningAt ? new Date(h.notifiedMorningAt) : null,
        completedAt: h.completedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  }, [onHomeworkChange]);

  return (
    <HomeworkClient
      initialHomework={homework.map((h) => ({
        id: h.id,
        title: h.title,
        description: h.description,
        classId: h.classId,
        dueDate: h.dueDate,
        dueTime: h.dueTime,
        priority: h.priority,
        status: h.status,
        kind: h.kind,
        plannedDate: h.plannedDate,
        plannedStartTime: h.plannedStartTime,
        plannedEndTime: h.plannedEndTime,
        estimatedMinutes: h.estimatedMinutes,
        plannedEventId: h.plannedEventId,
        subtasks: (h as { subtasks?: HomeworkItem["subtasks"] }).subtasks ?? [],
        notified3dAt: h.notified3dAt ? h.notified3dAt.toISOString() : null,
        notified1dAt: h.notified1dAt ? h.notified1dAt.toISOString() : null,
        notifiedMorningAt: h.notifiedMorningAt ? h.notifiedMorningAt.toISOString() : null,
        completedAt: h.completedAt,
      }))}
      initialClasses={classes.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        archived: c.archived,
        sortOrder: c.sortOrder,
      }))}
      onHomeworkChange={handleHomeworkChange}
    />
  );
}

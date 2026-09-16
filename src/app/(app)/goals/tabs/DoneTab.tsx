"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, BookOpen, RotateCcw, Trash2 } from "lucide-react";
import type { Goal, Homework } from "@/lib/db/schema";

type Filter = "all" | "goals" | "homework";

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DoneTab({
  goals,
  setGoals,
  homework,
  setHomework,
}: {
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  homework: Homework[];
  setHomework: React.Dispatch<React.SetStateAction<Homework[]>>;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const doneGoals = useMemo(
    () => goals
      .filter((g) => g.status === "done")
      .sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime()),
    [goals],
  );

  const doneHomework = useMemo(
    () => homework
      .filter((h) => h.status === "completed")
      .sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime()),
    [homework],
  );

  const restoreGoal = async (id: string) => {
    const original = goals.find((g) => g.id === id);
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, status: "active" as const, completedAt: null, updatedAt: new Date() } : g)));
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "active", completedAt: null }),
      });
      // 202 = queued offline — keep. Other failures — revert.
      if (!res.ok && res.status !== 202 && original) {
        setGoals((prev) => prev.map((g) => (g.id === id ? original : g)));
      }
    } catch {
      // offline — keep state
    }
  };

  const deleteGoal = async (id: string) => {
    const original = goals.find((g) => g.id === id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
    try {
      const res = await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 202 && original) {
        setGoals((prev) => [...prev, original]);
      }
    } catch {
      // offline — keep state
    }
  };

  const restoreHomework = async (id: string) => {
    const original = homework.find((h) => h.id === id);
    setHomework((prev) => prev.map((h) => (h.id === id ? { ...h, status: "pending" as const, completedAt: null } : h)));
    try {
      const res = await fetch(`/api/homework/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
      if (!res.ok && res.status !== 202 && original) {
        setHomework((prev) => prev.map((h) => (h.id === id ? original : h)));
      }
    } catch {
      // offline — keep state
    }
  };

  const showGoals = filter === "all" || filter === "goals";
  const showHomework = filter === "all" || filter === "homework";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Done</h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {doneGoals.length + doneHomework.length} completed
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ backgroundColor: "var(--color-paper-2)" }}>
          {(["all", "goals", "homework"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors"
              style={{
                backgroundColor: filter === f ? "var(--color-paper)" : "transparent",
                color: filter === f ? "var(--color-ink)" : "var(--color-ink-muted)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {doneGoals.length === 0 && doneHomework.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-8 w-8 mb-3" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Nothing completed yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {showGoals && doneGoals.length > 0 && (
            <div className="flex flex-col gap-1">
              {showHomework && <p className="text-xs font-semibold uppercase tracking-wider px-3 mt-2" style={{ color: "var(--color-ink-muted)" }}>Goals</p>}
              {doneGoals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-paper-2)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: "var(--color-ink-muted)", textDecoration: "line-through" }}>{goal.title}</p>
                    <p className="text-xs" style={{ color: "var(--color-ink-muted)", opacity: 0.7 }}>{timeAgo(goal.completedAt || goal.updatedAt)}</p>
                  </div>
                  <button onClick={() => restoreGoal(goal.id)} className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} title="Restore">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteGoal(goal.id)} className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showHomework && doneHomework.length > 0 && (
            <div className="flex flex-col gap-1">
              {showGoals && <p className="text-xs font-semibold uppercase tracking-wider px-3 mt-2" style={{ color: "var(--color-ink-muted)" }}>Homework</p>}
              {doneHomework.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-paper-2)]">
                  <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: "var(--color-ink-muted)", textDecoration: "line-through" }}>{h.title}</p>
                    <p className="text-xs" style={{ color: "var(--color-ink-muted)", opacity: 0.7 }}>{timeAgo(h.completedAt || h.updatedAt)}</p>
                  </div>
                  <button onClick={() => restoreHomework(h.id)} className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} title="Restore">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Inbox, ArrowRight } from "lucide-react";
import type { Goal } from "@/lib/db/schema";

export default function BacklogTab({
  goals,
  setGoals,
}: {
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
}) {
  const backlogGoals = useMemo(
    () => goals
      .filter((g) => g.status === "backlog")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [goals],
  );

  const moveToActive = async (id: string) => {
    const original = goals.find((g) => g.id === id);
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, status: "active" as const, updatedAt: new Date() } : g)));
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "active" }),
      });
      // 202 = queued offline — keep. Other failures — revert.
      if (!res.ok && res.status !== 202 && original) {
        setGoals((prev) => prev.map((g) => (g.id === id ? original : g)));
      }
    } catch {
      // offline — keep state
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Backlog</h1>
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          {backlogGoals.length} parked · move to active when ready
        </p>
      </div>

      {backlogGoals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-8 w-8 mb-3" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Backlog is empty.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {backlogGoals.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderLeft: goal.color ? `3px solid ${goal.color}` : "3px solid transparent" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{goal.title}</p>
                {goal.description && (
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--color-ink-muted)" }}>{goal.description}</p>
                )}
              </div>
              <button
                onClick={() => moveToActive(goal.id)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-3)]"
                style={{ color: "var(--color-ink-muted)" }}
                title="Move to active"
              >
                Activate <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

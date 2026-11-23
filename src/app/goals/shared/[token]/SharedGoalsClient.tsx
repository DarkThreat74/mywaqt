"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Target,
  Check,
  ChevronRight,
  ChevronDown,
  List,
  GitBranch,
  Loader2,
  AlignLeft,
  X,
} from "lucide-react";
import type { Goal } from "@/lib/db/schema";
import { buildGoalTree, countCompleted, type GoalNode } from "@/lib/goals/tree";

type View = "list" | "tree";

// Goal types that can actually be marked done — mirrors COMPLETABLE in
// GoalsTab. Rules/all-time are principles and milestones, not checkboxes.
const COMPLETABLE_TYPES = new Set(["week", "month", "year", "bucket"]);

export default function SharedGoalsClient({ token }: { token: string }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [ownerName, setOwnerName] = useState("Someone");
  const [view, setView] = useState<View>("list");
  const [loading, setLoading] = useState(true);
  // "gone" = link revoked/never existed (404). "error" = anything else —
  // a network or server failure must not masquerade as a revoked link.
  const [failKind, setFailKind] = useState<"gone" | "error" | null>(null);

  useEffect(() => {
    fetch(`/api/goals/shared?token=${token}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.goals) {
          setGoals(data.goals);
          setOwnerName(data.ownerName || "Someone");
        } else {
          setFailKind(r.status === 404 || r.status === 410 ? "gone" : "error");
        }
      })
      .catch(() => setFailKind("error"))
      .finally(() => setLoading(false));
  }, [token]);

  const tree = buildGoalTree(goals);
  // Only completable goals count toward the tally — rules and all-time
  // milestones are never "done", so counting them makes progress look broken.
  const completableTree = useMemo(
    () => tree.filter((n) => COMPLETABLE_TYPES.has(n.goalType ?? "month")),
    [tree],
  );
  const { total, done } = countCompleted(completableTree);

  if (loading) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
      </div>
    );
  }

  if (failKind) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <div
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-error) 10%, transparent)",
          }}
        >
          <Target className="h-7 w-7" style={{ color: "var(--color-error)" }} />
        </div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          {failKind === "gone" ? "This share link is no longer active" : "Couldn\u2019t load these goals"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          {failKind === "gone"
            ? "It was revoked or never existed — ask for a fresh link."
            : "Check your connection and try again."}
        </p>
        {failKind === "error" && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh overflow-x-clip"
      style={{ backgroundColor: "var(--color-paper-2)" }}
    >
      <header
        className="border-b"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ backgroundColor: "var(--color-ink)" }}
            >
              <Target className="h-4 w-4" style={{ color: "var(--color-paper)" }} />
            </div>
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold"
                style={{ color: "var(--color-ink)" }}
              >
                {ownerName}&apos;s goals
              </p>
              <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                {total > 0 ? `${done}/${total} completed` : "Waqt"}
              </p>
            </div>
          </div>
          <div
            className="flex shrink-0 rounded-lg border"
            style={{ borderColor: "var(--color-paper-3)" }}
          >
            <button
              onClick={() => setView("list")}
              className="flex items-center gap-1.5 rounded-l-lg px-2.5 py-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: view === "list" ? "var(--color-ink)" : "transparent",
                color: view === "list" ? "var(--color-paper)" : "var(--color-ink-muted)",
              }}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setView("tree")}
              className="flex items-center gap-1.5 rounded-r-lg px-2.5 py-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: view === "tree" ? "var(--color-ink)" : "transparent",
                color: view === "tree" ? "var(--color-paper)" : "var(--color-ink-muted)",
              }}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tree</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
              }}
            >
              <Target className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
              No goals yet
            </h2>
            <p className="mt-1 max-w-xs text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {ownerName} hasn&apos;t created any goals yet.
            </p>
          </div>
        ) : view === "list" ? (
          <SharedListView tree={tree} />
        ) : (
          <SharedTreeView tree={tree} />
        )}
      </div>

      <footer
        className="border-t px-5 py-6 text-center sm:px-6"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Shared via <span className="font-medium" style={{ color: "var(--color-ink-soft)" }}>Waqt</span> — prayer-centered life tracking
        </p>
      </footer>
    </div>
  );
}

function SharedListView({ tree }: { tree: GoalNode[] }) {
  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <SharedListRow key={node.id} node={node} />
      ))}
    </div>
  );
}

function SharedListRow({ node }: { node: GoalNode }) {
  const [expanded, setExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const isDone = node.status === "done";
  const hasChildren = node.children.length > 0;
  const hasDescription = !!node.description;
  const indent = Math.min(node.depth, 4) * 16;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg py-2 pr-2"
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded p-0.5"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <div className="w-5 shrink-0" />
        )}
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
          style={{
            borderColor: isDone ? "var(--color-success)" : "var(--color-paper-3)",
            backgroundColor: isDone ? "var(--color-success)" : "transparent",
          }}
        >
          {isDone && <Check className="h-3.5 w-3.5" style={{ color: "var(--color-paper)" }} />}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="block truncate text-sm"
            style={{
              color: isDone ? "var(--color-ink-muted)" : "var(--color-ink)",
              textDecoration: isDone ? "line-through" : "none",
            }}
          >
            {node.title}
          </span>
          {hasDescription && !showDetails && (
            <button
              onClick={() => setShowDetails(true)}
              className="mt-0.5 flex items-center gap-1 text-[11px]"
              style={{ color: "var(--color-ink-muted)" }}
            >
              <AlignLeft className="h-3 w-3" />
              Details
            </button>
          )}
        </div>
      </div>
      {hasDescription && showDetails && (
        <div
          className="flex items-start gap-2 py-1 pr-2 text-xs"
          style={{ paddingLeft: `${indent + 8 + 28 + 24}px` }}
        >
          <AlignLeft
            className="mt-0.5 h-3 w-3 shrink-0"
            style={{ color: "var(--color-ink-muted)" }}
          />
          <p
            className="min-w-0 flex-1 whitespace-pre-wrap break-words"
            style={{ color: "var(--color-ink-soft)" }}
          >
            {node.description}
          </p>
          <button
            onClick={() => setShowDetails(false)}
            className="shrink-0 rounded p-0.5"
            style={{ color: "var(--color-ink-muted)" }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <SharedListRow key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function SharedTreeView({ tree }: { tree: GoalNode[] }) {
  return (
    <div className="overflow-x-auto pb-4">
      <div
        className="inline-flex min-w-full flex-col gap-6"
        style={{ minWidth: "max-content" }}
      >
        {tree.map((node) => (
          <SharedTreeBranch key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

function SharedTreeBranch({ node }: { node: GoalNode }) {
  const [expanded, setExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const isDone = node.status === "done";
  const hasChildren = node.children.length > 0;
  const hasDescription = !!node.description;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-xl border px-3 py-2.5"
        style={{
          borderColor: isDone ? "var(--color-success)" : "var(--color-paper-3)",
          backgroundColor: "var(--color-paper)",
          minWidth: 180,
          maxWidth: 280,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
            style={{
              borderColor: isDone ? "var(--color-success)" : "var(--color-paper-3)",
              backgroundColor: isDone ? "var(--color-success)" : "transparent",
            }}
          >
            {isDone && <Check className="h-3.5 w-3.5" style={{ color: "var(--color-paper)" }} />}
          </div>
          <div className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-medium"
              style={{
                color: isDone ? "var(--color-ink-muted)" : "var(--color-ink)",
                textDecoration: isDone ? "line-through" : "none",
              }}
            >
              {node.title}
            </span>
            {hasDescription && !showDetails && (
              <button
                onClick={() => setShowDetails(true)}
                className="mt-0.5 flex items-center gap-1 text-[11px]"
                style={{ color: "var(--color-ink-muted)" }}
              >
                <AlignLeft className="h-3 w-3" />
                Details
              </button>
            )}
          </div>
          {hasChildren && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 rounded p-0.5"
              style={{ color: "var(--color-ink-muted)" }}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {hasDescription && showDetails && (
          <div
            className="mt-2 flex items-start gap-2 border-t pt-2 text-xs"
            style={{ borderColor: "var(--color-paper-3)" }}
          >
            <AlignLeft
              className="mt-0.5 h-3 w-3 shrink-0"
              style={{ color: "var(--color-ink-muted)" }}
            />
            <p
              className="min-w-0 flex-1 whitespace-pre-wrap break-words"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {node.description}
            </p>
            <button
              onClick={() => setShowDetails(false)}
              className="shrink-0 rounded p-0.5"
              style={{ color: "var(--color-ink-muted)" }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="relative" style={{ paddingLeft: 24 }}>
          <div
            className="absolute left-2 top-0 bottom-0 w-px"
            style={{ backgroundColor: "var(--color-paper-3)" }}
          />
          <div className="space-y-4">
            {node.children.map((child) => (
              <div key={child.id} className="relative">
                <div
                  className="absolute left-[-12px] top-5 h-px w-3"
                  style={{ backgroundColor: "var(--color-paper-3)" }}
                />
                <SharedTreeBranch node={child} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

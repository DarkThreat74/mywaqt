import type { Goal } from "@/lib/db/schema";

export interface GoalNode extends Goal {
  children: GoalNode[];
  depth: number;
}

/**
 * Canonical goal ordering: manual sortOrder wins; ties fall back to
 * target date (dated goals first, soonest first), then creation order.
 * Used by the Goals tabs and the Today tab so ordering is consistent.
 */
export function compareGoals(a: Goal, b: Goal): number {
  return (
    (a.sortOrder || 0) - (b.sortOrder || 0) ||
    (a.targetDate ? 0 : 1) - (b.targetDate ? 0 : 1) ||
    (a.targetDate || "").localeCompare(b.targetDate || "") ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Build a tree from a flat array of goals.
 * Root goals have parentId = null.
 */
export function buildGoalTree(goals: Goal[]): GoalNode[] {
  const map = new Map<string, GoalNode>();
  const roots: GoalNode[] = [];

  // First pass: create nodes
  for (const goal of goals) {
    map.set(goal.id, { ...goal, children: [], depth: 0 });
  }

  // Second pass: link children to parents
  for (const goal of goals) {
    const node = map.get(goal.id)!;
    if (goal.parentId && map.has(goal.parentId)) {
      const parent = map.get(goal.parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Third pass: assign depth
  function assignDepth(nodes: GoalNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      assignDepth(node.children, depth + 1);
    }
  }
  assignDepth(roots, 0);

  return roots;
}

/**
 * Count total descendants of a goal node.
 */
export function countDescendants(node: GoalNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

/**
 * Count completed goals in a tree (excludes archived goals).
 */
export function countCompleted(nodes: GoalNode[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  function walk(node: GoalNode) {
    if (node.status === "archived") return;
    total++;
    if (node.status === "done") done++;
    node.children.forEach(walk);
  }
  nodes.forEach(walk);
  return { total, done };
}

/**
 * Unified due-date formatting with urgency levels.
 *
 * Used by both the Today tab and the Homework tab so labels are consistent
 * across the entire app.
 *
 * Urgency tiers (color + weight):
 *   overdue   — red, bold      "2d OVERDUE" / "OVERDUE · 9:30a"
 *   today     — orange, bold   "TODAY · 9:30a" / "TODAY"
 *   tomorrow  — amber, medium  "Tomorrow · 9:30a" / "Tomorrow"
 *   soon      — yellow         "Wed · 9:30a"          (2-3 days)
 *   this_week — neutral        "Fri · 9:30a"          (4-6 days)
 *   later     — muted          "Sep 15 · 9:30a"       (7+ days)
 *
 * Time format is compact: "9:30a", "12p", "3:45p" — no spaces, lowercase a/p.
 * This keeps pill widths uniform regardless of the time value.
 */

export type UrgencyLevel = "overdue" | "today" | "tomorrow" | "soon" | "this_week" | "later" | "completed";

export interface DueBadge {
  label: string;
  urgency: UrgencyLevel;
  days: number;
}

function compactTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  const period = h < 12 ? "a" : "p";
  // 12:00 → "12p", 9:30 → "9:30a", 3:00 → "3p"
  if (m === 0) return `${hour}${period}`;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function dayNameAbbr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function dateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Compute days until due date (negative = overdue).
 * Uses local midnight-to-midnight comparison.
 */
export function daysUntilDate(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/**
 * Check if a homework item with a due time is overdue (time has passed today).
 */
export function isTimeOverdue(dueDate: string, dueTime: string | null, status?: string): boolean {
  if (status === "completed") return false;
  return deadlinePassed(dueDate, dueTime);
}

/**
 * Whether the deadline itself has passed — regardless of completion status.
 * Completed items stay visible (struck through) until their deadline passes.
 */
export function deadlinePassed(dueDate: string, dueTime: string | null): boolean {
  const days = daysUntilDate(dueDate);
  if (days < 0) return true;
  if (days === 0 && dueTime) {
    const [h, m] = dueTime.split(":").map(Number);
    const now = new Date();
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  }
  return false;
}

/**
 * Format a due date + optional time into a compact urgency badge.
 */
export function formatDueBadge(
  dueDate: string,
  dueTime: string | null = null,
  status?: string,
): DueBadge {
  if (status === "completed") {
    return { label: "Done", urgency: "completed", days: 0 };
  }

  const days = daysUntilDate(dueDate);
  const timeStr = dueTime ? compactTime(dueTime) : null;

  // Overdue
  if (days < 0) {
    const absDays = Math.abs(days);
    if (timeStr) {
      return { label: `${absDays}d OVERDUE · ${timeStr}`, urgency: "overdue", days };
    }
    return { label: `${absDays}d OVERDUE`, urgency: "overdue", days };
  }

  // Today
  if (days === 0) {
    if (timeStr) {
      return { label: `TODAY · ${timeStr}`, urgency: "today", days };
    }
    return { label: "TODAY", urgency: "today", days };
  }

  // Tomorrow
  if (days === 1) {
    if (timeStr) {
      return { label: `Tomorrow · ${timeStr}`, urgency: "tomorrow", days };
    }
    return { label: "Tomorrow", urgency: "tomorrow", days };
  }

  // This week — use day name (Wed, Thu, etc.)
  if (days <= 3) {
    const dayAbbr = dayNameAbbr(dueDate);
    if (timeStr) {
      return { label: `${dayAbbr} · ${timeStr}`, urgency: "soon", days };
    }
    return { label: dayAbbr, urgency: "soon", days };
  }

  if (days <= 6) {
    const dayAbbr = dayNameAbbr(dueDate);
    if (timeStr) {
      return { label: `${dayAbbr} · ${timeStr}`, urgency: "this_week", days };
    }
    return { label: dayAbbr, urgency: "this_week", days };
  }

  // Later — use date
  const dateLabel = dateShort(dueDate);
  if (timeStr) {
    return { label: `${dateLabel} · ${timeStr}`, urgency: "later", days };
  }
  return { label: dateLabel, urgency: "later", days };
}

/**
 * Get urgency-based styling for a badge.
 * Returns CSS custom property values for color and background.
 */
export function urgencyColors(urgency: UrgencyLevel): {
  color: string;
  bgColor: string;
  borderColor: string;
  fontWeight: number;
} {
  switch (urgency) {
    case "overdue":
      return {
        color: "var(--color-error)",
        bgColor: "color-mix(in oklab, var(--color-error) 22%, var(--color-paper))",
        borderColor: "var(--color-error)",
        fontWeight: 700,
      };
    case "today":
      return {
        color: "var(--color-error)",
        bgColor: "color-mix(in oklab, var(--color-error) 16%, var(--color-paper))",
        borderColor: "color-mix(in oklab, var(--color-error) 40%, var(--color-paper-3))",
        fontWeight: 700,
      };
    case "tomorrow":
      return {
        color: "var(--color-warmth)",
        bgColor: "color-mix(in oklab, var(--color-warmth) 18%, var(--color-paper))",
        borderColor: "color-mix(in oklab, var(--color-warmth) 40%, var(--color-paper-3))",
        fontWeight: 600,
      };
    case "soon":
      return {
        color: "var(--color-ink-soft)",
        bgColor: "var(--color-paper-2)",
        borderColor: "var(--color-paper-3)",
        fontWeight: 500,
      };
    case "this_week":
      return {
        color: "var(--color-ink-soft)",
        bgColor: "var(--color-paper-2)",
        borderColor: "var(--color-paper-3)",
        fontWeight: 500,
      };
    case "completed":
      return {
        color: "var(--color-success)",
        bgColor: "color-mix(in oklab, var(--color-success) 14%, var(--color-paper))",
        borderColor: "color-mix(in oklab, var(--color-success) 30%, var(--color-paper-3))",
        fontWeight: 500,
      };
    case "later":
    default:
      return {
        color: "var(--color-ink-muted)",
        bgColor: "var(--color-paper-2)",
        borderColor: "var(--color-paper-3)",
        fontWeight: 500,
      };
  }
}

/**
 * Get card-level urgency styling (background tint + left border).
 */
export function urgencyCardTint(urgency: UrgencyLevel): {
  backgroundColor: string;
  borderLeftColor: string | null;
} {
  switch (urgency) {
    case "overdue":
      return {
        backgroundColor: "color-mix(in oklab, var(--color-error) 5%, transparent)",
        borderLeftColor: "var(--color-error)",
      };
    case "today":
      return {
        backgroundColor: "color-mix(in oklab, var(--color-error) 3%, transparent)",
        borderLeftColor: "var(--color-error)",
      };
    case "tomorrow":
      return {
        backgroundColor: "color-mix(in oklab, var(--color-warmth) 4%, transparent)",
        borderLeftColor: "var(--color-warmth)",
      };
    case "soon":
      return {
        backgroundColor: "transparent",
        borderLeftColor: null,
      };
    default:
      return {
        backgroundColor: "transparent",
        borderLeftColor: null,
      };
  }
}

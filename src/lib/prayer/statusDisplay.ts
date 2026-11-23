/**
 * Shared display treatment for prayer_log statuses (CRAFT D1 / B6).
 *
 * An auto-resolved `assumed_prayed` is never rendered as a confirmed prayer,
 * and a window-ended unmarked prayer is "Unmarked" — never "Missed".
 * Consumers render each visual distinctly:
 *   confirmed → solid check + success color
 *   assumed   → hollow/dashed check + muted "Assumed" label
 *   excused   → named excused treatment, AT-readable
 *   unmarked  → quiet "Unmarked" label, no shame color
 *   pending   → normal interactive styling
 */
export type PrayerStatusVisual =
  | "confirmed"
  | "assumed"
  | "excused"
  | "unmarked"
  | "pending";

export function prayerStatusVisual(
  status: string | null | undefined,
  haydDay = false,
): PrayerStatusVisual {
  if (status === "prayed") return "confirmed";
  if (status === "assumed_prayed") return "assumed";
  // During hayd every prayer is excused — takes precedence over unmarked.
  if (status === "excused" || haydDay) return "excused";
  if (status === "missed" || status === "unmarked") return "unmarked";
  return "pending";
}

/** Obligation met for the N/5 count — prayed, assumed, or excused (hayd counts full). */
export function statusMeetsObligation(
  status: string | null | undefined,
  haydDay = false,
): boolean {
  const v = prayerStatusVisual(status, haydDay);
  return v === "confirmed" || v === "assumed" || v === "excused";
}

/** Spoken/visible state name — null when there is nothing worth labeling. */
export function prayerStatusLabel(visual: PrayerStatusVisual): string | null {
  switch (visual) {
    case "assumed":
      return "Assumed";
    case "excused":
      return "Excused";
    case "unmarked":
      return "Unmarked";
    default:
      return null;
  }
}

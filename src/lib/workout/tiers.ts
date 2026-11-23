// Exercise tier badge colors — one source, backed by --color-tier-* tokens in
// globals.css. Unknown tiers (including a stray "F" in older data before it
// existed) must never map to undefined — use the F token.
export const TIER_COLORS: Record<string, string> = {
  S: "var(--color-tier-s)",
  A: "var(--color-tier-a)",
  B: "var(--color-tier-b)",
  C: "var(--color-tier-c)",
  D: "var(--color-tier-d)",
  F: "var(--color-tier-f)",
  M: "var(--color-tier-m)",
  V: "var(--color-tier-v)",
};

export const tierColor = (tier: string | null | undefined): string =>
  (tier && TIER_COLORS[tier]) || "var(--color-ink-muted)";

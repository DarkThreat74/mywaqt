// The ladder: per-axis stage, trend vs recent history, and the nearest
// attainable rung. Masters' bands anchor the top of the scale — for now the
// bands are constants to be replaced by measured master fingerprints once
// the clip pipeline (P5) processes licensed reciter audio.

export const STAGES: { min: number; name: string }[] = [
  { min: 0, name: "Ṭālib" },
  { min: 160, name: "Muntasil" },
  { min: 320, name: "Mutamakkin" },
  { min: 480, name: "Mujawwid" },
  { min: 640, name: "Mubdiʿ" },
  { min: 800, name: "Muqrin-adjacent" },
];

// Axes run 0–100 in the report; stage thresholds map the /1000 bands.
const AXIS_STAGES = STAGES.map((s) => ({ min: s.min / 10, name: s.name }));

export function axisStage(value: number): string {
  let name = AXIS_STAGES[0].name;
  for (const s of AXIS_STAGES) if (value >= s.min) name = s.name;
  return name;
}

/** Points to the next stage threshold; 0 when already at the top band. */
export function pointsToNextStage(value: number): number {
  for (const s of AXIS_STAGES) if (value < s.min) return s.min - value;
  return 0;
}

export interface LadderRow {
  key: string;
  value: number;     // this session
  best: number;      // personal best across history
  delta: number | null; // vs previous session, null on first take
  stage: string;
  toNext: number;
}

export function ladderRows(
  axes: { key: string; value: number }[],
  history: { axes: Record<string, number> }[],
): LadderRow[] {
  return axes.map((a) => {
    const prev = history.map((h) => h.axes[a.key]).filter((v): v is number => v != null);
    return {
      key: a.key,
      value: a.value,
      best: Math.max(a.value, ...prev),
      delta: prev.length ? a.value - prev[0] : null,
      stage: axisStage(a.value),
      toNext: pointsToNextStage(a.value),
    };
  });
}

/** The next rungs, ranked by attainability — smallest gap first, nonzero only. */
export function nextRungs(rows: LadderRow[], n = 3): LadderRow[] {
  return rows.filter((r) => r.toNext > 0).sort((a, b) => a.toNext - b.toNext).slice(0, n);
}

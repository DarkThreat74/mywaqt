/**
 * Overlap layout for time-grid calendars — shared by the day view and the
 * public shared-calendar view.
 *
 * Events are split into connected overlap clusters (a chain A-B-C shares one
 * column budget), then lanes are greedy-assigned by start time. Interval
 * graphs color greedily at exactly the max concurrency, so colIndex is always
 * < colCount — boxes never collide horizontally.
 *
 * `start`/`end` are minutes-from-midnight in the displayed timezone; add 1440
 * to `end` for events spanning midnight before calling.
 */
export function layoutOverlap(
  items: Array<{ id: string; start: number; end: number }>,
): Map<string, { colIndex: number; colCount: number }> {
  const layout = new Map<string, { colIndex: number; colCount: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  let i = 0;
  while (i < sorted.length) {
    // Grow the cluster: anything starting before the running end joins it.
    let j = i;
    let clusterEnd = sorted[i].end;
    while (j + 1 < sorted.length && sorted[j + 1].start < clusterEnd) {
      j++;
      clusterEnd = Math.max(clusterEnd, sorted[j].end);
    }
    const laneEnds: number[] = [];
    for (let k = i; k <= j; k++) {
      const ev = sorted[k];
      let lane = laneEnds.findIndex((t) => t <= ev.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = ev.end;
      layout.set(ev.id, { colIndex: lane, colCount: 0 });
    }
    for (let k = i; k <= j; k++) {
      layout.get(sorted[k].id)!.colCount = laneEnds.length;
    }
    i = j + 1;
  }
  return layout;
}

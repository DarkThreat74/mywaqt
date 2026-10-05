"use client";

/**
 * Vox study-session store — a tiny module-level store (no context needed)
 * subscribed via useSyncExternalStore. Persisted to localStorage so a running
 * session survives navigation, tab switches, and reloads — the floating bubble
 * is mounted once in the app layout and reads from here.
 */

export interface StudySegment {
  kind: "study" | "break";
  minutes: number;
  label: string; // what to work on / "Break"
}

export interface SessionPlanInput {
  minutes: number; // usable minutes (remaining in the block, capped)
  assignments: { title: string; estimatedMinutes?: number | null }[];
}

export type SessionState =
  | { status: "idle" }
  | { status: "planning" }
  | { status: "planned"; segments: StudySegment[]; titles: string[]; blockId?: string }
  | { status: "running"; segments: StudySegment[]; titles: string[]; startedAt: number; overlayOpen: boolean; blockId?: string };

const KEY = "waqt-study-session";

let state: SessionState = { status: "idle" };
const listeners = new Set<() => void>();

function emit() {
  if (state.status === "running" || state.status === "planned") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* non-critical */ }
  } else {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  listeners.forEach((l) => l());
}

export function subscribeSession(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession(): SessionState {
  return state;
}

/** Rehydrate a running/planned session on app load. */
export function hydrateSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SessionState;
    if (parsed.status === "running" && Array.isArray(parsed.segments) && typeof parsed.startedAt === "number") {
      state = { ...parsed, overlayOpen: false };
      emit();
    } else if (parsed.status === "planned" && Array.isArray(parsed.segments)) {
      state = parsed;
      emit();
    }
  } catch {
    // corrupt cache — ignore
  }
}

/** Ask Vox for a plan; lands in 'planned' (preview) state. */
export async function planSession(input: SessionPlanInput, blockId?: string) {
  state = { status: "planning" };
  emit();
  try {
    const res = await fetch("/api/study-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => null);
    const segments = Array.isArray(data?.segments) ? (data.segments as StudySegment[]) : null;
    if (res.ok && segments && segments.length > 0) {
      state = {
        status: "planned",
        segments: segments.filter((s) => (s.kind === "study" || s.kind === "break") && s.minutes > 0),
        titles: input.assignments.map((a) => a.title),
        blockId,
      };
    } else {
      state = { status: "idle" };
    }
  } catch {
    state = { status: "idle" };
  }
  emit();
}

export function confirmSession() {
  if (state.status !== "planned") return;
  state = {
    status: "running",
    segments: state.segments,
    titles: state.titles,
    startedAt: Date.now(),
    overlayOpen: true,
    blockId: state.blockId,
  };
  emit();
}

export function discardPlan() {
  state = { status: "idle" };
  emit();
}

export function endSession() {
  state = { status: "idle" };
  emit();
}

export function setOverlayOpen(open: boolean) {
  if (state.status === "running") {
    state = { ...state, overlayOpen: open };
    emit();
  }
}

/** Elapsed seconds since the session started — call inside a ticking component. */
export function sessionElapsed(now: number): number {
  return state.status === "running" ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0;
}

export interface SegmentProgress {
  index: number;
  segment: StudySegment;
  remainingSec: number;   // seconds left in current segment
  done: boolean;          // all segments complete
}

export function segmentAt(segments: StudySegment[], elapsedSec: number): SegmentProgress {
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const segSec = segments[i].minutes * 60;
    if (elapsedSec < acc + segSec) {
      return { index: i, segment: segments[i], remainingSec: Math.ceil(acc + segSec - elapsedSec), done: false };
    }
    acc += segSec;
  }
  return { index: segments.length - 1, segment: segments[segments.length - 1], remainingSec: 0, done: true };
}

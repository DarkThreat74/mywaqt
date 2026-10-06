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
  /** Set on prayer breaks — the overlay renders the salah messaging and the
   *  "I prayed" check-in instead of the normal break UI. */
  prayer?: string;
}

export interface SessionPlanInput {
  minutes: number; // usable minutes (remaining in the block, capped)
  /** Full scheduled length — when minutes < this, the session started late. */
  originalMinutes?: number;
  assignments: { title: string; estimatedMinutes?: number | null }[];
  method?: StudyMethod;
  /** User manually arranged the assignment order — keep it instead of
   *  sorting hardest-first. */
  ordered?: boolean;
}

export type StudyMethod = "auto" | "pomodoro" | "sprint" | "deep" | "ultradian" | "interleave" | "flowtime";

export type SessionState =
  | { status: "idle" }
  | { status: "intake"; minutes: number; originalMinutes?: number; assignments: { title: string; estimatedMinutes: number | null }[]; blockId?: string }
  | { status: "planning" }
  | { status: "planned"; segments: StudySegment[]; titles: string[]; blockId?: string;
      /** What was asked for — kept so the preview can re-plan or go back to
       *  intake with the same inputs. */
      planInput: SessionPlanInput }
  | { status: "running"; segments: StudySegment[]; titles: string[]; startedAt: number; overlayOpen: boolean; blockId?: string;
      /** Wall-clock pause support — elapsed time excludes paused periods. */
      pausedAt: number | null; pausedMs: number };

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
      state = { ...parsed, overlayOpen: false, pausedAt: parsed.pausedAt ?? null, pausedMs: parsed.pausedMs ?? 0 };
      emit();
    } else if (parsed.status === "planned" && Array.isArray(parsed.segments)) {
      state = parsed;
      emit();
    }
  } catch {
    // corrupt cache — ignore
  }
}

/** Open the intake step — confirm each assignment's time + pick a method. */
export function beginIntake(input: Omit<SessionPlanInput, "method">, blockId?: string) {
  state = {
    status: "intake",
    minutes: input.minutes,
    originalMinutes: input.originalMinutes,
    assignments: input.assignments.map((a) => ({
      title: a.title,
      estimatedMinutes: a.estimatedMinutes ?? null,
    })),
    blockId,
  };
  emit();
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
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => null);
    // The user may have cancelled while the request was in flight — don't
    // resurrect a plan they already walked away from.
    if (state.status !== "planning") return;
    const segments = Array.isArray(data?.segments) ? (data.segments as StudySegment[]) : null;
    if (res.ok && segments && segments.length > 0) {
      state = {
        status: "planned",
        segments: segments.filter((s) => (s.kind === "study" || s.kind === "break") && s.minutes > 0),
        titles: input.assignments.map((a) => a.title),
        blockId,
        planInput: input,
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
  // Ask for notification permission at the natural moment — segment transitions
  // push an OS notification while the app is minimized/in a background tab.
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch { /* non-critical */ }
  state = {
    status: "running",
    segments: state.segments,
    titles: state.titles,
    startedAt: Date.now(),
    overlayOpen: true,
    pausedAt: null,
    pausedMs: 0,
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

/** True elapsed seconds excluding paused time — the only clock math callers
 *  should use, so a paused timer never ticks forward. */
function runningElapsedSec(): number {
  if (state.status !== "running") return 0;
  const pauseMs = state.pausedMs + (state.pausedAt ? Date.now() - state.pausedAt : 0);
  return Math.max(0, Math.floor((Date.now() - state.startedAt - pauseMs) / 1000));
}

/** Freeze the session — the timer stops but the plan stays put. */
export function pauseSession() {
  if (state.status !== "running" || state.pausedAt) return;
  state = { ...state, pausedAt: Date.now() };
  emit();
}

export function resumeSession() {
  if (state.status !== "running" || !state.pausedAt) return;
  state = { ...state, pausedMs: state.pausedMs + (Date.now() - state.pausedAt), pausedAt: null };
  emit();
}

/** "I only have 10/15/20 minutes" — a single-segment sprint that skips
 *  planning entirely. Labelled by the first assignment when present. */
export function startSprint(minutes: number, label = "Focus sprint", blockId?: string) {
  state = {
    status: "running",
    segments: [{ kind: "study", minutes, label }],
    titles: [label],
    startedAt: Date.now(),
    overlayOpen: true,
    pausedAt: null,
    pausedMs: 0,
    blockId,
  };
  emit();
}

// ─── Focus discipline record — the consequence layer ───
// A completed session grows the streak; ending early (not finished) or
// abandoning resets it. Persisted locally, surfaced in the intake sheet.
export interface SessionEntry { date: string; minutes: number; finished: boolean; label: string; reason?: string }
export interface Discipline { streak: number; completed: number; abandoned: number; history: SessionEntry[] }

const DISC_KEY = "waqt-vox-discipline";

export function getDiscipline(): Discipline {
  try {
    const d = JSON.parse(localStorage.getItem(DISC_KEY) ?? "null");
    if (d && typeof d.streak === "number") return { history: [], ...d };
  } catch { /* fresh */ }
  return { streak: 0, completed: 0, abandoned: 0, history: [] };
}

/** Record the outcome. finished=true grows the streak; false breaks it.
 *  `entry` logs the session into the local history (newest first, cap 60). */
export function recordOutcome(finished: boolean, entry?: Omit<SessionEntry, "finished">): Discipline {
  const d = getDiscipline();
  const history = entry
    ? [{ ...entry, finished }, ...d.history].slice(0, 60)
    : d.history;
  const next = finished
    ? { streak: d.streak + 1, completed: d.completed + 1, abandoned: d.abandoned, history }
    : { streak: 0, completed: d.completed, abandoned: d.abandoned + 1, history };
  try { localStorage.setItem(DISC_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function runningBlockId(): string | undefined {
  return state.status === "running" ? state.blockId : undefined;
}

/** "Not finished yet" — append a short study segment and keep running.
 *  If the plan had already run out, the clock rewinds so the new segment
 *  gets its full length starting now. */
export function extendSession(minutes = 5, label = "Finish up") {
  if (state.status !== "running") return;
  const segments = [...state.segments, { kind: "study" as const, minutes, label }];
  const priorSec = segments.slice(0, -1).reduce((s, x) => s + x.minutes * 60, 0);
  const elapsedSec = Math.min(runningElapsedSec(), priorSec);
  state = { ...state, segments, startedAt: Date.now() - elapsedSec * 1000, pausedAt: null, pausedMs: 0 };
  emit();
}

export function setOverlayOpen(open: boolean) {
  if (state.status === "running") {
    state = { ...state, overlayOpen: open };
    emit();
  }
}

/** "I need a quick break" — pauses the current study segment exactly where it
 *  is, inserts a short break, and re-queues the remaining work right after.
 *  Vigilance research: brief diversions restore focus better than pushing through. */
export function takeBreakNow(minutes = 5) {
  insertBreakNow(minutes, "Quick break");
}

/** Split the current position and insert a break. Shared by manual breaks and
 *  the forced prayer break (which is allowed even while paused — the window
 *  doesn't wait). If the current segment is already a break it is *converted*
 *  in place: label + prayer flag change and it is topped up to `minutes`. */
function insertBreakNow(minutes: number, label: string, prayer?: string) {
  if (state.status !== "running") return;
  const elapsedSec = runningElapsedSec();
  const p = segmentAt(state.segments, elapsedSec);
  if (p.done) return;

  const segs = [...state.segments];
  const usedMin = (p.segment.minutes * 60 - p.remainingSec) / 60;

  if (p.segment.kind === "break") {
    // Convert the running break into a prayer break, topped up to `minutes`
    // of fresh time. Elapsed math is preserved — the window doesn't wait.
    segs[p.index] = { ...p.segment, minutes: usedMin + minutes, label, prayer: prayer ?? p.segment.prayer };
    state = { ...state, segments: segs };
    if (state.pausedAt) resumeSession();
    else emit();
    return;
  }

  const leftMin = p.segment.minutes - usedMin;
  const next: StudySegment[] = segs.slice(0, p.index);
  if (usedMin > 0.1) next.push({ ...p.segment, minutes: usedMin });
  next.push({ kind: "break", minutes, label, prayer });
  if (leftMin > 0.1) next.push({ ...p.segment, minutes: leftMin });
  state = { ...state, segments: [...next, ...segs.slice(p.index + 1)] };
  if (state.pausedAt) resumeSession();
  else emit();
}

/** Forced break when a prayer window is about to close — fires from the
 *  overlay's tick when the salah is unmarked and <15 min remain. */
export function prayerBreakNow(prayerName: string, minutes = 10) {
  insertBreakNow(minutes, `Pray ${prayerName} — window closing`, prayerName);
}

/** Queue a prayer break right after the current segment — used when <30 min
 *  remain and the plan has no break before the window ends. */
export function insertPrayerBreakAfterCurrent(prayerName: string, minutes = 10) {
  if (state.status !== "running") return;
  const elapsedSec = runningElapsedSec();
  const p = segmentAt(state.segments, elapsedSec);
  if (p.done) return;
  const segs = [...state.segments];
  segs.splice(p.index + 1, 0, {
    kind: "break", minutes,
    label: `Pray ${prayerName} — window closing`, prayer: prayerName,
  });
  state = { ...state, segments: segs };
  emit();
}

/** "Done resting" — end the current break early; the next segment starts
 *  right now. Shrinks the break to the time already used so the shared
 *  elapsed-clock math just works. */
export function endBreakEarly() {
  if (state.status !== "running" || state.pausedAt) return;
  const elapsedSec = runningElapsedSec();
  const p = segmentAt(state.segments, elapsedSec);
  if (p.done || p.segment.kind !== "break") return;
  const usedMin = (p.segment.minutes * 60 - p.remainingSec) / 60;
  const segs = [...state.segments];
  segs[p.index] = { ...p.segment, minutes: usedMin };
  state = { ...state, segments: segs };
  emit();
}

/** "I've lost interest" — jump straight to the next STUDY segment (skipping
 *  any queued break — switching means you want to work, not rest) and park
 *  the leftover minutes right after it so the skipped work comes back
 *  promptly instead of getting buried at the end of the plan. */
export function switchFocus() {
  if (state.status !== "running" || state.pausedAt) return;
  const elapsedSec = runningElapsedSec();
  const p = segmentAt(state.segments, elapsedSec);
  if (p.done || p.segment.kind !== "study") return;

  const segs = [...state.segments];
  const usedMin = (p.segment.minutes * 60 - p.remainingSec) / 60;
  const leftMin = p.segment.minutes - usedMin;
  const next: StudySegment[] = segs.slice(0, p.index);
  if (usedMin > 0.1) next.push({ ...p.segment, minutes: usedMin });

  const rest = segs.slice(p.index + 1);
  const nextStudyIdx = rest.findIndex((s) => s.kind === "study");
  // Pull the next study segment forward so the switch lands on work.
  const after = nextStudyIdx === -1 ? rest : [rest[nextStudyIdx], ...rest.filter((_, i) => i !== nextStudyIdx)];
  if (leftMin > 0.5) {
    // Re-queue the abandoned remainder after the LAST remaining study block,
    // not right after the next one — parking it at position 1 made switches
    // ping-pong between two items while the rest never surfaced. Stripping
    // prior "(finish)" tags stops the label accumulating on repeat switches.
    const label = p.segment.label.replace(/( \(finish\))+$/, "");
    const lastStudy = after.reduce((last, s, i) => (s.kind === "study" ? i : last), -1);
    after.splice(lastStudy + 1, 0, { ...p.segment, minutes: leftMin, label: `${label} (finish)` });
  }
  next.push(...after);
  state = { ...state, segments: next };
  emit();
}

/** Elapsed seconds since the session started — call inside a ticking component. */
export function sessionElapsed(now: number): number {
  if (state.status !== "running") return 0;
  const pauseMs = state.pausedMs + (state.pausedAt ? now - state.pausedAt : 0);
  return Math.max(0, Math.floor((now - state.startedAt - pauseMs) / 1000));
}

export interface SegmentProgress {
  index: number;
  segment: StudySegment;
  remainingSec: number;   // seconds left in current segment
  done: boolean;          // all segments complete
}

export function segmentAt(segments: StudySegment[], elapsedSec: number): SegmentProgress {
  if (segments.length === 0) {
    return { index: 0, segment: { kind: "break", minutes: 0, label: "" }, remainingSec: 0, done: true };
  }
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

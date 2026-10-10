"use client";

/**
 * Vox study-session UI — mounted once in the (app) layout so the session
 * survives navigation. States:
 *  planning → loading overlay ("Vox is planning…")
 *  planned  → plan preview with Confirm / Discard
 *  running  → full overlay OR floating bubble (persists app-wide)
 *
 * Breaks end with a beep + countdown so the transition back to work is
 * impossible to miss.
 */

import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { BookOpen, Check, CheckCheck, ChevronDown, ChevronUp, Coffee, ListMusic, Minus, Pause, Play, Plus, RefreshCw, Shuffle, Square, Volume2, VolumeX, X, Zap } from "lucide-react";
import VoxIcon from "@/components/vox-icon";
import { useSoundscape, SOUNDSCAPES } from "@/components/soundscape-context";
import { useAudioPlayer } from "@/components/audio-player-context";
import { SoundscapePanel } from "@/components/soundscape-indicator";
import type { PlayerTrack } from "@/components/advanced-audio-player";
import Refocus from "@/app/(app)/study/Refocus";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { wallClockToUtc, dateStrInTimezone } from "@/lib/timezone";
import {
  getSession, subscribeSession, hydrateSession, confirmSession,
  discardPlan, endSession, extendSession, setOverlayOpen, segmentAt,
  planSession, takeBreakNow, switchFocus, switchFocusTo, getDiscipline, recordOutcome, todayFocusMinutes,
  beginIntake, bumpPage,
  runningBlockId, pauseSession, resumeSession, startSprint, sessionElapsed, finishAssignment,
  endBreakEarly, prayerBreakNow, insertPrayerBreakAfterCurrent,
  type StudyMethod, type SessionState,
} from "@/lib/study/session";

let audioCtx: AudioContext | null = null;
// Stable server snapshot — a fresh object per call can loop hydration errors.
const IDLE_SNAPSHOT = { status: "idle" } as ReturnType<typeof getSession>;
// Soft chime rather than a raw beep — fast attack, exponential decay, and a
// quiet octave-up partial so it reads as a struck bell, not an alarm.
function beep(freq = 880, dur = 0.12, vol = 0.12) {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    // iOS keeps the context suspended until a resume — and refuses a resume
    // issued outside a user gesture, so retry on the next tap/keypress too.
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
      const retry = () => { void audioCtx?.resume().catch(() => {}); };
      window.addEventListener("pointerdown", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
    }
    const t = audioCtx.currentTime;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o = audioCtx.createOscillator();
    o.frequency.value = freq;
    o.type = "sine";
    const partial = audioCtx.createOscillator();
    partial.frequency.value = freq * 2;
    partial.type = "sine";
    const pg = audioCtx.createGain();
    pg.gain.value = 0.22;
    o.connect(g);
    partial.connect(pg);
    pg.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    partial.start(t);
    o.stop(t + dur);
    partial.stop(t + dur);
  } catch { /* audio unavailable — silent */ }
}

// Vox coach voice — strict, warm, short. Rotates per segment.
const COACH_STUDY = [
  "Eyes on the page. No phone.",
  "You chose this block — honor it.",
  "One task. Full effort.",
  "Bismillah. Deep breath, begin.",
  "Muscles for the mind — reps count.",
];
const COACH_BREAK = [
  "Stand up. Water. No scrolling.",
  "Real rest — away from the screen.",
  "Breathe. The work is still there.",
];

const PRAYER_LABEL: Record<string, string> = {
  fajr: "Fajr", dhuhr: "Zuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// "75m" reads badly past an hour — "1h 15m" is glanceable.
function fmtDur(min: number) {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type RunState = Extract<SessionState, { status: "running" }>;

interface RecapRow { kind: "study" | "break"; label: string; startMs: number; endMs: number; min: number }

/** Recap math shared by finish() and the silent-exit watcher — walks the plan
 *  against the elapsed clock so focus counts only study time actually used,
 *  and stamps each segment's wall-clock window for the timeline. */
function buildRecap(run: RunState, label: string, finished: boolean, streak: number) {
  const now = Date.now();
  const pausedMs = run.pausedMs + (run.pausedAt ? now - run.pausedAt : 0);
  const elapsed = Math.max(0, (now - run.startedAt - pausedMs) / 1000);
  let acc = 0, focusSec = 0, breaks = 0, segsDone = 0;
  const rows: RecapRow[] = [];
  for (const s of run.segments) {
    const segSec = s.minutes * 60;
    const used = Math.max(0, Math.min(segSec, elapsed - acc));
    if (used >= segSec - 1) segsDone++;
    if (s.kind === "study") focusSec += used;
    else if (used > 0) breaks++;
    // ponytail: segment timestamps assume no mid-run pause gaps — pausedMs is
    // one aggregate, so post-pause start times drift early. Close enough for a
    // recap; upgrade path is recording pause intervals on the run state.
    if (used > 0.5) rows.push({ kind: s.kind, label: s.label, startMs: run.startedAt + acc * 1000, endMs: run.startedAt + (acc + used) * 1000, min: used / 60 });
    acc += segSec;
  }
  const totalMin = elapsed / 60;
  const focusMin = focusSec / 60;
  return {
    label, finished,
    focusMin: Math.round(focusMin), totalMin: Math.round(totalMin),
    pausedMin: Math.round(pausedMs / 60000),
    awayMin: Math.round(totalMin - focusMin + pausedMs / 60000),
    rows, breaks, segsDone, segsTotal: run.segments.length, streak,
  };
}

/** Aggregate study-segment minutes by label — "time per subject" stats.
 *  `hw` maps intake titles to homeworkIds so stats can roll up to the class
 *  and the planner can see per-assignment totals. Labels that gained a
 *  " (finish)" suffix (or were renamed by Vox) fall back to the label key. */
function subjectMins(recap: { rows: { kind: string; label: string; min: number }[] }, hw?: Record<string, string>) {
  const m = new Map<string, { label: string; min: number; hw?: string }>();
  for (const r of recap.rows) {
    if (r.kind !== "study") continue;
    const clean = r.label.replace(/( \(finish\))+$/, "");
    let hwId = hw?.[r.label] ?? hw?.[clean];
    let label = clean;
    if (!hwId && hw) {
      // Derived labels — "Title — page N", "Title — keep going", "Review Title" —
      // never equal the assignment title, so exact lookup misses them.
      const title = Object.keys(hw).find((t) => clean === `Review ${t}` || clean.startsWith(`${t} —`) || clean.startsWith(`Read ${t} —`));
      if (title) { hwId = hw[title]; label = title; }
    }
    const k = hwId ?? r.label;
    const cur = m.get(k) ?? { label, min: 0, hw: hwId };
    cur.min += r.min;
    m.set(k, cur);
  }
  return [...m.values()].map((s) => ({ ...s, min: Math.round(s.min) })).filter((s) => s.min > 0);
}

/** The session's homework-linked assignments (checklist rows) and which of
 *  them actually got focus minutes (the default checks). */
function sessionHwList(run: RunState, recap: { rows: RecapRow[] }) {
  const seen = new Set<string>();
  const hwList = Object.entries(run.hw ?? {}).flatMap(([title, id]) =>
    seen.has(id) ? [] : (seen.add(id), [{ id, title }]));
  const workedIds = new Set(
    subjectMins(recap, run.hw).flatMap((s) => (s.hw ? [s.hw] : [])),
  );
  return { hwList, workedIds };
}

/** Write the checklist to the block's assignment links — checked ids become
 *  `done` (the "studied" tag), unchecked flip back, so unchecking here cancels
 *  the tag exactly like the user asked. */
function saveStudiedPicks(blockId: string, hwList: { id: string }[], picks: Set<string>) {
  void fetch("/api/blocks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: blockId,
      doneIds: hwList.filter((h) => picks.has(h.id)).map((h) => h.id),
      undoneIds: hwList.filter((h) => !picks.has(h.id)).map((h) => h.id),
    }),
  }).catch(() => { /* cosmetic — the tag catches up next load */ });
}

export default function StudySession() {
  const state = useSyncExternalStore(subscribeSession, getSession, () => IDLE_SNAPSHOT);
  const [now, setNow] = useState(() => Date.now());
  const lastSegRef = useRef(-1);
  const lastBeepRef = useRef(-1);
  const doneChimedRef = useRef(false);
  // End-session check — "did you finish?" before the session is discarded.
  const [askFinish, setAskFinish] = useState(false);
  // Two-step: "ask" (did you finish?) → "more" (how much longer / end anyway).
  const [finishStep, setFinishStep] = useState<"ask" | "more">("ask");
  // Auto-prompt the finish check once per session when the plan runs out —
  // keyed by startedAt so each new session asks again.
  const [donePromptedAt, setDonePromptedAt] = useState(0);
  // Drift detection — tab hiding mid-study-segment is the strongest signal a
  // web app can see. On return after 20s+, Vox calls it out.
  const hiddenAtRef = useRef<number | null>(null);
  const [driftNudge, setDriftNudge] = useState(false);
  const driftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Halfway attention check on long study segments — shown once per segment
  // per session (keyed by startedAt+index so the next session asks again).
  const [checkinDismissed, setCheckinDismissed] = useState("");
  // "What pulled you away" — captured into history on unfinished ends.
  const [endReason, setEndReason] = useState<string | null>(null);
  // Soundscape picker inside the running overlay — pick focus audio without
  // leaving the session.
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [talksOpen, setTalksOpen] = useState(false);
  // "Switch it up" chooser — opens a bottom sheet of remaining study
  // segments; picking one jumps straight to it via switchFocusTo.
  const [switchOpen, setSwitchOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null | undefined>(undefined);
  const [talksData, setTalksData] = useState<{ folders: { id: string; name: string }[]; tracks: PlayerTrack[] } | null>(null);

  // ── Salah awareness ──
  // The open prayer window whose salah is still unmarked — banner + break
  // escalation all key off this. Refreshes every 60s while running.
  const [salah, setSalah] = useState<{ name: string; date: string; startsAt: number; endsAt: number } | null>(null);
  // Guards so each escalation fires once per prayer window.
  const prayerFiredRef = useRef<string | null>(null);   // <15 min forced break
  const prayerQueuedRef = useRef<string | null>(null);  // <30 min inserted break
  // "I prayed — go back to studying" → confirm popup → prayer_log write.
  // Holds the prayer name being confirmed (null = closed).
  const [confirmPrayer, setConfirmPrayer] = useState<string | null>(null);
  // Pressed "No" on the confirm — escalate the break message.
  const [lied, setLied] = useState(false);
  // Prayers confirmed via the dialog this mount — a periodic refetch must not
  // resurrect the banner while a queued/slow check-in write lands.
  const markedPrayersRef = useRef(new Set<string>());
  // Salah decision prompt — hushed-until timestamp. The `now` tick re-shows
  // the sheet once it expires: 15 min after "pray in next break", 5 after a
  // bare dismiss. Under 30 min left the defer option is gone entirely.
  const [salahHushedUntil, setSalahHushedUntil] = useState(0);
  const soundscape = useSoundscape();
  const talksPlayer = useAudioPlayer();

  // Lazy-load the talks library only when the in-session talks popover opens.
  useEffect(() => {
    if (!talksOpen || talksData) return;
    let cancelled = false;
    fetch("/api/talks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const nameOf = (id: string | null) => d.folders.find((f: { id: string; name: string }) => f.id === id)?.name ?? null;
        setTalksData({
          folders: d.folders,
          tracks: (d.talks as { id: string; title: string; speaker: string | null; description: string | null; streamUrl: string | null; externalUrl: string | null; fileSize: number | null; duration: number | null; folderId: string | null }[])
            .filter((t) => t.streamUrl)
            .map((t) => ({ ...t, folderName: nameOf(t.folderId), folderImageUrl: null })),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [talksOpen, talksData]);

  // ── Load the open, unmarked prayer window while a session runs ──
  // Times come from the IndexedDB month cache (instant, offline-safe) with
  // /api/prayer-times as fallback; prayed/excused comes from the prayer log.
  useEffect(() => {
    // Stale `salah` while idle is harmless — the banner only renders while a
    // session is running, and a fresh session re-loads immediately.
    if (state.status !== "running") return;
    let cancelled = false;
    // Prayer times are FROZEN for the session — re-resolving them every 60s
    // lets the IndexedDB cache and the live API hand us divergent times
    // (different madhab syncs, stale rows), which made `salah` oscillate
    // between two prayers (Asr → Dhuhr → Asr) mid-window. The 60s reload
    // only needs fresh LOG statuses; times only change when the date rolls.
    let frozenTimes: { dateStr: string; times: Record<string, string> } | null = null;
    let lastLogs: { prayerName: string; status: string }[] = [];
    async function load() {
      try {
        // Everything runs in the user's stored prayer timezone — the rest of
        // the app (dashboard, check-in lib, scheduler) does the same. Using
        // device-local time here fired the banner for the wrong prayer when
        // the two zones disagreed (travel, manual settings).
        const tz = getCachedPrayerSettings()?.timezone
          ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const nowInst = new Date();
        const dateStr = dateStrInTimezone(nowInst, tz);
        const [y, mo, dd] = dateStr.split("-").map(Number);
        let times = frozenTimes?.dateStr === dateStr ? frozenTimes.times : null;
        if (!times) {
          try {
            const { getOfflineDB } = await import("@/lib/offline/db");
            const cached = await getOfflineDB().prayerTimes.get(dateStr);
            if (cached?.fajr) times = cached as unknown as Record<string, string>;
          } catch { /* fall through to API */ }
          if (!times) {
            const r = await fetch(`/api/prayer-times?date=${dateStr}`);
            if (r.ok) times = await r.json();
          }
        }
        if (!times || cancelled) return;
        frozenTimes = { dateStr, times };

        // no-store: the SW can serve a cached prayer-log response from before
        // the user marked the prayer — resurrecting a prompt for a done salah.
        const logsRes = await fetch(`/api/prayer-log?date=${dateStr}`, { cache: "no-store" }).catch(() => null);
        // A failed fetch reuses the last good logs — an empty array would
        // resurrect prompts for prayers already marked.
        const logs: { prayerName: string; status: string }[] = logsRes?.ok
          ? (lastLogs = await logsRes.json())
          : lastLogs;

        // Window ends at the next prayer (Fajr ends at sunrise — shuruk).
        const order: [string, string][] = [
          ["fajr", "sunrise"], ["dhuhr", "asr"], ["asr", "maghrib"], ["maghrib", "isha"], ["isha", "fajr"],
        ];
        // Wall-clock "HH:MM" in the prayer timezone → UTC instant.
        const toTs = (hhmm: string | undefined, dayOffset = 0) => {
          if (!hhmm) return NaN;
          const [h, m] = hhmm.split(":").map(Number);
          // Date.UTC normalizes day overflow, so d + 1 rolls month/year safely.
          return wallClockToUtc(y, mo, dd + dayOffset, h, m, 0, tz).getTime();
        };
        const nowMs = Date.now();
        let found: { name: string; startsAt: number; endsAt: number } | null = null;
        for (const [p, endKey] of order) {
          const s = toTs(times[p]);
          const e = endKey === "fajr" ? toTs(times.fajr, 1) : toTs(times[endKey]);
          if (Number.isNaN(s) || Number.isNaN(e)) continue;
          if (nowMs >= s && nowMs < e) { found = { name: p, startsAt: s, endsAt: e }; break; }
        }
        if (!found) { setSalah(null); return; }
        if (markedPrayersRef.current.has(found.name)) { setSalah(null); return; }
        const entry = logs.find((l) => l.prayerName === found!.name);
        // assumed_prayed counts too — a cron-resolved prayer is settled, not
        // something to nag about mid-session.
        if (entry && (entry.status === "prayed" || entry.status === "assumed_prayed" || entry.status === "excused")) { setSalah(null); return; }
        setSalah({ ...found, date: dateStr });
      } catch { /* salah banner is best-effort — never break the session */ }
    }
    void load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [state.status]);
  // Recap bookkeeping — `finish()` builds the summary explicitly; the watcher
  // below catches silent exits (start-new, discard, restart) so cancelling a
  // live session still lands on a recap instead of vanishing.
  const finishHandledRef = useRef(false);
  const lastRunRef = useRef<RunState | null>(null);

  // Post-session recap — populated by finish(), survives endSession() going
  // idle. Cleared when a new session starts running.
  const [summary, setSummary] = useState<{
    label: string; finished: boolean; focusMin: number; totalMin: number;
    pausedMin: number; awayMin: number;
    rows: { kind: "study" | "break"; label: string; startMs: number; endMs: number; min: number }[];
    breaks: number; segsDone: number; segsTotal: number; streak: number;
    /** Assignments linked to homework + the block they ran under — powers the
     *  "which did you finish?" checklist on the recap. */
    hwList?: { id: string; title: string }[];
    blockId?: string;
  } | null>(null);
  // Checklist state — starts with whatever actually got focus minutes; every
  // toggle PATCHes the block's done links so the "studied" tag is exactly
  // what the user checks here.
  const [studiedPicks, setStudiedPicks] = useState<Set<string>>(new Set());

  // Silent-exit watcher — a running session that ends without finish()
  // (start-new, discard, restart) still gets a recap + abandonment record.
  useEffect(() => {
    if (state.status === "running") { lastRunRef.current = state; finishHandledRef.current = false; return; }
    const run = lastRunRef.current;
    lastRunRef.current = null;
    if (!run) return;
    if (finishHandledRef.current) { finishHandledRef.current = false; return; }
    const label = run.segments.find((s) => s.kind === "study")?.label ?? "Focus session";
    const recap = buildRecap(run, label, false, 0);
    const { hwList, workedIds } = sessionHwList(run, recap);
    setStudiedPicks(workedIds);
    const disc = recordOutcome(false, {
      date: localDateStr(),
      // pausedMs alone misses a live pause — include the open pausedAt span
      // so an abandoned-while-paused session doesn't over-count elapsed time.
      minutes: Math.max(1, Math.round(
        (Date.now() - run.startedAt - run.pausedMs - (run.pausedAt ? Date.now() - run.pausedAt : 0)) / 60000,
      )),
      label,
      reason: "ended without finishing",
      method: run.method,
      breaks: recap.breaks,
      focusMin: recap.focusMin,
      switches: run.switches ?? 0,
      subjects: subjectMins(recap, run.hw),
      blockId: run.blockId,
    });
    setSummary({ ...recap, streak: disc.streak, hwList, blockId: run.blockId });
    // A session that actually got focus minutes counts as working the block
    // even without a clean finish — otherwise it wrongly shows as untouched.
    if (run.blockId && hwList.length > 0) saveStudiedPicks(run.blockId, hwList, workedIds);
    if (run.blockId && recap.focusMin > 0) {
      void fetch("/api/blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: run.blockId, status: "worked" }),
      }).catch(() => { /* cosmetic */ });
    }
  }, [state]);

  useEffect(() => { hydrateSession(); }, []);

  // A new session supersedes any lingering recap (adjust-during-render reset,
  // same pattern the finish prompt uses below).
  if ((state.status === "running" || state.status === "intake" || state.status === "planned") && summary) {
    setSummary(null);
  }

  // Keep the screen awake while a session is actively running — a paused
  // session is meant to let you step away, so the lock releases there too.
  const paused = state.status === "running" && state.pausedAt !== null;
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (state.status !== "running" || paused) return;
    let active = true;
    const acquire = async () => {
      try {
        const s = await (navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        }).wakeLock?.request("screen") ?? null;
        // The request can resolve after cleanup ran — releasing immediately
        // instead of storing avoids leaking a lock the page can never drop.
        if (!active) { void s?.release().catch(() => {}); return; }
        wakeRef.current = s;
      } catch { /* low battery / unsupported browser */ }
    };
    void acquire();
    const onVis = () => {
      if (active && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVis);
      void wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [state.status, paused]);

  // 1s tick while a session is live
  useEffect(() => {
    if (state.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.status]);

  // Segment transitions + break-end countdown beeps
  const progress = state.status === "running"
    ? segmentAt(state.segments, sessionElapsed(now))
    : null;
  useEffect(() => {
    if (!progress || state.status !== "running") return;
    // Session complete — index doesn't change when the last segment ends,
    // so it needs its own edge-trigger or the finish is silent.
    if (progress.done && !doneChimedRef.current) {
      doneChimedRef.current = true;
      beep(1040, 0.15);
      setTimeout(() => beep(1320, 0.2), 170);
      return;
    }
    if (!progress.done) doneChimedRef.current = false;
    if (progress.index !== lastSegRef.current) {
      lastSegRef.current = progress.index;
      lastBeepRef.current = -1;
      setLied(false);
      // Two-tone chime on every transition; higher pitch back into study.
      beep(progress.segment.kind === "study" ? 1040 : 660, 0.15);
      setTimeout(() => beep(progress.segment.kind === "study" ? 1320 : 880, 0.15), 160);
      // OS notification when the app is in the background / another window —
      // the web can't tick while fully closed, so this covers minimize/tab-away.
      if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const title = progress.segment.kind === "break" ? "Break — books down" : "Back to studying";
        const body = `${fmtDur(progress.segment.minutes)} · ${progress.segment.label}`;
        navigator.serviceWorker?.ready
          .then((r) => r.showNotification(title, { body, tag: "waqt-study", data: { url: "/calendar/day" } }))
          .catch(() => { try { new Notification(title, { body, tag: "waqt-study" }); } catch { /* ignore */ } });
      }
      return;
    }
    // Final 10 seconds of EVERY segment — a chime each second that swells as
    // the boundary approaches, with a distinct higher last chime before the
    // two-tone transition fires. A paused clock stays on one second and the
    // dedupe key keeps it from repeating.
    if (!progress.done && progress.remainingSec <= 10 && progress.remainingSec > 0) {
      if (lastBeepRef.current !== progress.remainingSec) {
        lastBeepRef.current = progress.remainingSec;
        if (progress.remainingSec === 1) {
          // Distinct final cue — brighter, longer, slightly louder.
          beep(1175, 0.22, 0.2);
        } else {
          const vol = 0.04 + (10 - progress.remainingSec) * 0.016;
          beep(784, 0.1, vol);
        }
      }
    }
  }, [progress, state.status]);

  // Page-over cue — one soft low tick the moment a page's budget expires
  // without a tap, plus a swelling chime per second across the page's last
  // five (same shape as the segment countdown). Both keyed by
  // segment+pages-done so each page gets its own round, and re-arms if a
  // back-page pull lifts the clock positive again.
  const pageOverRef = useRef<string | null>(null);
  const pageTickRef = useRef<string | null>(null);
  useEffect(() => {
    if (!progress || progress.done || state.status !== "running" || paused) return;
    const s = progress.segment;
    if (!s.pages || !s.minPerPage) { pageOverRef.current = null; pageTickRef.current = null; return; }
    const elapsedInSeg = s.minutes * 60 - progress.remainingSec;
    const done = state.pageDone?.[progress.index] ?? 0;
    const mark = state.pageMark?.[progress.index] ?? 0;
    const left = progress.remainingSec / Math.max(1, s.pages - done) - Math.max(0, elapsedInSeg - mark);
    const key = `${state.startedAt}:${progress.index}:${done}`;
    if (left > 0 && left <= 5) {
      const tk = `${key}:${Math.ceil(left)}`;
      if (pageTickRef.current !== tk) {
        pageTickRef.current = tk;
        // Brighter than the boundary beeps, swelling toward zero.
        beep(988, 0.07, 0.05 + (5 - Math.ceil(left)) * 0.014);
      }
    }
    if (left < 0) {
      if (pageOverRef.current !== key) {
        pageOverRef.current = key;
        beep(587, 0.12, 0.1);
      }
    } else if (pageOverRef.current === key) {
      pageOverRef.current = null;
    }
  }, [progress, state.status, paused, state]);

  // Page keys — → / Space turns the page, ← goes back one. Only while the
  // overlay shows a paged segment; never while typing in a field.
  useEffect(() => {
    if (state.status !== "running" || !state.overlayOpen || paused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const seg = segmentAt(state.segments, sessionElapsed(Date.now())).segment;
      if (!seg.pages) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); bumpPage(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); bumpPage(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status, state, paused]);

  // ── Salah escalation ──
  // 15 min after the window OPENS, still unmarked → a 10-min prayer break is
  // queued right after the current segment (early prayer beats late panic).
  // Last resort stays: <15 min left → convert the session to a prayer break
  // right now (even mid-study, even paused).
  useEffect(() => {
    if (!salah || state.status !== "running" || !progress) return;
    const remainMin = (salah.endsAt - now) / 60000;
    if (remainMin <= 0) return; // window closed — next 60s refresh clears it

    if (remainMin <= 15 && prayerFiredRef.current !== salah.name) {
      prayerFiredRef.current = salah.name;
      prayerBreakNow(salah.name, 10);
      return;
    }
    // Consume the queue flag once the prayer break is actually running — if
    // it elapses unmarked, the auto-queue must be allowed to re-fire.
    if (progress.segment.prayer === salah.name) prayerQueuedRef.current = null;
    const graceMs = salah.startsAt + 15 * 60 * 1000;
    // Hush-gated: a deferral ("one more block") or dismissal must actually
    // hold the auto-queue off — otherwise the break re-inserts on the next
    // tick and the user can never push it back while the window still has
    // room. The ≤15-min forced break above remains the hard floor.
    if (now >= graceMs && prayerQueuedRef.current !== salah.name && now >= salahHushedUntil) {
      // Already queued? A break flagged with this prayer counts as covered.
      const covered =
        state.segments.slice(progress.index).some((s) => s.prayer === salah.name) ||
        (progress.segment.kind === "break" && progress.remainingSec / 60 <= remainMin);
      if (!covered) {
        prayerQueuedRef.current = salah.name;
        insertPrayerBreakAfterCurrent(salah.name, 10);
      }
    }
  }, [salah, now, state, progress, salahHushedUntil]);

  // ── Salah decision prompt ──
  // Opens the moment a prayer window arrives mid-session, and again whenever
  // a hush expires while the salah is still unmarked.
  const salahPrompt = !!salah && state.status === "running" && !confirmPrayer && now >= salahHushedUntil;

  // "Pray in next break" — queue a prayer break after the current segment and
  // hush the prompt ~15 min. The escalation effect above still owns the
  // last-resort forced break, so deferral can never outrun the window.
  const deferSalah = () => {
    if (!salah) return;
    prayerQueuedRef.current = salah.name;
    insertPrayerBreakAfterCurrent(salah.name, 10);
    setSalahHushedUntil(Date.now() + 15 * 60 * 1000);
  };
  // Dismissing without choosing = short hush, not a 15-min snooze.
  const hushSalah = () => setSalahHushedUntil(Date.now() + 5 * 60 * 1000);
  // Deferred while ON the prayer break — the queue flag was already consumed
  // inserting this break, so reset it, hush 15 min, and go back to work. The
  // hush-gated effect re-queues a break once the hush expires; the ≤15-min
  // forced break is still the floor if the window nearly closes.
  const deferPrayerBreak = () => {
    if (!salah) return;
    prayerQueuedRef.current = null;
    setSalahHushedUntil(Date.now() + 15 * 60 * 1000);
    endBreakEarly();
  };

  // Drift watcher — armed only while a study segment is live and unpaused.
  // Hiding the tab mid-segment is the strongest drift signal the web can see.
  useEffect(() => {
    if (state.status !== "running") return;
    const onVis = () => {
      if (document.hidden) {
        const p = segmentAt(state.segments, sessionElapsed(Date.now()));
        if (!p.done && p.segment.kind === "study" && !state.pausedAt) {
          hiddenAtRef.current = Date.now();
        }
      } else if (hiddenAtRef.current) {
        const awayMs = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (awayMs > 20_000) {
          setDriftNudge(true);
          beep(520, 0.12);
          if (driftTimerRef.current) clearTimeout(driftTimerRef.current);
          driftTimerRef.current = setTimeout(() => setDriftNudge(false), 10_000);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state]);

  // Timer's up → the checkoff is mandatory (adjust-during-render reset pattern).
  if (state.status === "running" && progress?.done && donePromptedAt !== state.startedAt) {
    setDonePromptedAt(state.startedAt);
    setAskFinish(true); setFinishStep("ask");
  }

  /** Close the session and record the outcome — finishing grows the focus
   *  streak and auto-marks the source block worked; quitting breaks it. */
  const finish = (finished: boolean, reason?: string | null) => {
    // Double-tap guard — recordOutcome writes streak + history; a second call
    // in the same burst would double-count before React re-renders.
    if (state.status !== "running" || finishHandledRef.current) return;
    finishHandledRef.current = true;
    setAskFinish(false);
    setEndReason(null);
    const label = state.status === "running"
      ? state.segments.find((s) => s.kind === "study")?.label ?? "Focus session"
      : "Focus session";
    // Local date, not UTC — an evening session in a negative-offset timezone
    // must log to today, not tomorrow.
    // Recap numbers — walk the plan against the elapsed clock so focus time
    // counts only study segments and only up to where the session ended.
    const recap = state.status === "running" ? buildRecap(state, label, finished, 0) : null;
    const { hwList, workedIds } = state.status === "running" && recap
      ? sessionHwList(state, recap)
      : { hwList: [] as { id: string; title: string }[], workedIds: new Set<string>() };
    setStudiedPicks(workedIds);
    const nextDiscipline = recordOutcome(finished, {
      date: localDateStr(),
      minutes: Math.max(1, Math.round(sessionElapsed(Date.now()) / 60)),
      label,
      reason: reason ?? undefined,
      // Habits telemetry for the stats section.
      method: state.status === "running" ? state.method : undefined,
      breaks: recap?.breaks,
      focusMin: recap?.focusMin,
      switches: state.status === "running" ? state.switches ?? 0 : undefined,
      subjects: recap ? subjectMins(recap, state.status === "running" ? state.hw : undefined) : undefined,
      blockId: state.status === "running" ? state.blockId : undefined,
    });
    if (recap) setSummary({ ...recap, streak: nextDiscipline.streak, hwList, blockId: runningBlockId() });
    const bid = runningBlockId();
    // Worked = real focus happened, not just a clean finish — an early end
    // with real minutes still counts toward the block. Which assignments
    // count as "studied" is the checklist's call, pre-checked to what got
    // focus minutes.
    if (bid && hwList.length > 0) saveStudiedPicks(bid, hwList, workedIds);
    if (bid && (recap?.focusMin ?? 0) > 0) {
      void fetch("/api/blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bid, status: "worked" }),
      }).catch(() => { /* cosmetic — block stays unmarked */ });
    }
    endSession();
  };

  // Session recap — survives endSession() → idle; dismiss to fully close.
  if (state.status === "idle") {
    if (!summary) return null;
    return (
      <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Session recap">
        <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setSummary(null)} aria-label="Close recap" />
        <div className="relative max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
            <VoxIcon size={14} /> Session recap
          </p>
          <p className="mt-3 text-center text-4xl font-bold tabular-nums tracking-tight" style={{ color: summary.finished ? "var(--color-accent)" : "var(--color-warmth)" }}>
            {fmtDur(summary.focusMin)}<span className="text-base font-semibold" style={{ color: "var(--color-ink-muted)" }}> locked in</span>
          </p>
          <p className="mt-1 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {summary.label} · {summary.finished ? "finished" : "ended early"}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { v: fmtDur(summary.awayMin), l: "breaks + away", warn: summary.awayMin > summary.focusMin },
              { v: `${summary.segsDone}/${summary.segsTotal}`, l: "segments" },
              { v: fmtDur(summary.totalMin), l: "elapsed" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border px-2 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <p className="text-sm font-bold tabular-nums" style={{ color: s.warn ? "var(--color-warmth)" : "var(--color-ink)" }}>{s.v}</p>
                <p className="text-[10px] font-medium" style={{ color: "var(--color-ink-muted)" }}>{s.l}</p>
              </div>
            ))}
          </div>
          {summary.rows.length > 0 && (
            <div className="mt-4 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                Timeline
              </p>
              <div className="flex flex-col">
                {summary.rows.map((r, i) => (
                  <div key={i} className="flex items-baseline gap-2 py-1 text-xs" style={{ color: r.kind === "break" ? "var(--color-ink-muted)" : "var(--color-ink)" }}>
                    <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {fmtTime(r.startMs)}–{fmtTime(r.endMs)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.kind === "break" ? "☾ " : ""}{r.label}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums" style={{ color: r.kind === "break" ? "var(--color-success)" : "var(--color-ink-soft)" }}>
                      {fmtDur(Math.round(r.min))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Which did you finish? — the checkmarks ARE the "studied" tag.
              Toggle writes the block's done links; unchecking cancels it. */}
          {summary.hwList && summary.hwList.length > 0 && (
            <div className="mt-4 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                Which did you finish studying?
              </p>
              <div className="flex flex-col">
                {summary.hwList.map((h) => {
                  const on = studiedPicks.has(h.id);
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        const next = new Set(studiedPicks);
                        if (next.has(h.id)) next.delete(h.id); else next.add(h.id);
                        setStudiedPicks(next);
                        if (summary.blockId) saveStudiedPicks(summary.blockId, summary.hwList!, next);
                      }}
                      aria-pressed={on}
                      className="flex items-center gap-2.5 py-2 text-left"
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
                        style={{
                          borderColor: on ? "var(--color-success)" : "var(--color-paper-3)",
                          backgroundColor: on ? "var(--color-success)" : "var(--color-paper)",
                        }}
                      >
                        {on && <Check className="h-3.5 w-3.5" style={{ color: "var(--color-paper)" }} />}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        style={{ color: on ? "var(--color-ink)" : "var(--color-ink-soft)" }}
                      >
                        {h.title}
                      </span>
                      {on && (
                        <span className="shrink-0 text-[10px] font-semibold" style={{ color: "var(--color-success)" }}>
                          studied
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {summary.streak > 0 && (
            <p className="mt-3 text-center text-[11px] font-semibold" style={{ color: "var(--color-warmth)" }}>
              Focus streak: {summary.streak} session{summary.streak === 1 ? "" : "s"}
            </p>
          )}
          <button
            onClick={() => setSummary(null)}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
          >
            <Check className="h-4 w-4" /> Done
          </button>
        </div>
      </div>
    );
  }

  // ── Intake — confirm each assignment's time + pick a method ──
  if (state.status === "intake") {
    return <IntakeSheet />;
  }

  // ── Vox thinking ──
  if (state.status === "planning") {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }}>
        <ThinkingCard />
        <button
          onClick={endSession}
          className="rounded-full px-4 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-paper)", minHeight: 40 }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Plan preview — nothing starts until Confirm ──
  if (state.status === "planned") {
    const total = state.segments.reduce((s, x) => s + x.minutes, 0);
    return (
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Study session plan">
        <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }} onClick={discardPlan} aria-label="Discard plan" />
        <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border-t sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <VoxIcon size={16} />
                Vox&apos;s plan · {fmtDur(total)}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                Hardest work first while you&apos;re fresh — I&apos;ve paced the rest.
              </p>
            </div>
            <button onClick={discardPlan} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Discard plan">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <ol className="flex flex-col gap-1.5">
              {state.segments.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: "var(--color-paper-3)",
                    backgroundColor: s.kind === "break" ? "transparent" : "var(--color-paper-2)",
                    borderStyle: s.kind === "break" ? "dashed" : "solid",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.kind === "break" ? "var(--color-success)" : "var(--color-accent)" }}
                    aria-hidden
                  />
                  <span className="w-9 shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: s.kind === "break" ? "var(--color-success)" : "var(--color-accent)" }}>
                    {fmtDur(Math.round(s.minutes))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: s.kind === "break" ? "var(--color-ink-muted)" : "var(--color-ink)" }}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  // A session that starts counts the block as worked — the
                  // per-assignment "studied" checks happen at session end.
                  if (state.blockId) {
                    void fetch("/api/blocks", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: state.blockId, status: "worked" }),
                    }).catch(() => { /* cosmetic — planner badge only */ });
                  }
                  confirmSession();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
              >
                <Play className="h-4 w-4" /> Start
              </button>
              <button
                onClick={() => void planSession(state.planInput, state.blockId)}
                className="flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                aria-label="Re-analyze and plan again"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Re-plan
              </button>
            </div>
            <div className="mt-2 flex justify-center gap-4">
              <button
                onClick={() => beginIntake({
                  minutes: state.planInput.minutes,
                  originalMinutes: state.planInput.originalMinutes,
                  assignments: state.planInput.assignments.map((a) => ({ title: a.title, estimatedMinutes: a.estimatedMinutes ?? null, homeworkId: a.homeworkId })),
                }, state.blockId)}
                className="text-[11px] font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Adjust order &amp; times
              </button>
              <button
                onClick={discardPlan}
                className="text-[11px] font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Running ──
  if (!progress) return null;
  const seg = progress.segment;
  const isBreak = seg.kind === "break";
  const segAccent = isBreak ? "var(--color-success)" : "var(--color-accent)";
  // A break counts as a prayer break when the segment carries the flag, or
  // when a pending salah window is under 30 min and the break simply arrives
  // in time — either way the messaging escalates.
  const prayerName = isBreak
    ? (seg.prayer ?? (salah && salah.endsAt - now <= 30 * 60 * 1000 ? salah.name : null))
    : null;
  const salahLeftMin = salah ? Math.max(0, Math.ceil((salah.endsAt - now) / 60000)) : null;

  // Finish check — mandatory checkoff when the timer ends, streak-costed
  // when quitting early. Shown from both the bubble and the full overlay.
  const discipline = getDiscipline();
  const finishDialog = askFinish ? (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="End session">
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => { setAskFinish(false); setFinishStep("ask"); setEndReason(null); }} aria-label="Back" />
      <div className="relative w-full max-w-sm rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        {finishStep === "ask" ? (
          <>
            <p className="text-center text-base font-semibold" style={{ color: "var(--color-ink)" }}>
              {progress.done ? "Time&apos;s up — did you finish?" : "Ending early — did you finish?"}
            </p>
            {discipline.streak > 0 && (
              <p className="mt-1.5 text-center text-[11px] font-medium" style={{ color: "var(--color-warmth)" }}>
                Finishing keeps your {discipline.streak}-session focus streak — quitting breaks it.
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => finish(true)}
                className="flex items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
              >
                <Check className="h-4 w-4" /> Yes, I finished
              </button>
              <button
                onClick={() => setFinishStep("more")}
                className="flex items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48 }}
              >
                No, I didn&apos;t
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-base font-semibold" style={{ color: "var(--color-ink)" }}>
              Ok — work a bit more, then we stop.
            </p>
            <p className="mt-1 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Pick how much longer — a fresh timer starts for just that.
            </p>
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {[5, 10, 15, 20].map((m) => (
                <button
                  key={m}
                  onClick={() => { setAskFinish(false); setFinishStep("ask"); setDonePromptedAt(0); extendSession(m); }}
                  className="rounded-full border py-2.5 text-sm font-semibold tabular-nums transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)", minHeight: 44 }}
                >
                  +{m}m
                </button>
              ))}
            </div>
            {!progress.done && (
              <button
                onClick={() => { setAskFinish(false); setFinishStep("ask"); pauseSession(); setOverlayOpen(false); }}
                className="mt-3 w-full rounded-full border py-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 40 }}
              >
                Pause for later — keep my streak
              </button>
            )}
            <div className="mt-3 flex justify-center gap-1.5" role="group" aria-label="What pulled you away?">
              {["Phone", "Tired", "Bored", "Life"].map((r) => (
                <button
                  key={r}
                  onClick={() => setEndReason(endReason === r ? null : r)}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
                  style={{
                    borderColor: endReason === r ? "var(--color-warmth)" : "var(--color-paper-3)",
                    color: endReason === r ? "var(--color-warmth)" : "var(--color-ink-muted)",
                    backgroundColor: endReason === r ? "color-mix(in oklab, var(--color-warmth) 10%, transparent)" : "transparent",
                    minHeight: 28,
                  }}
                  aria-pressed={endReason === r}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={() => finish(false, endReason)}
              className="mt-3 w-full text-center text-[11px] font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--color-ink-muted)" }}
            >
              End anyway — I didn&apos;t finish
            </button>
            <button
              onClick={() => setFinishStep("ask")}
              className="mt-1 w-full text-center text-[11px] transition-opacity hover:opacity-70"
              style={{ color: "var(--color-ink-muted)" }}
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  ) : null;

  // "I prayed — go back to studying" confirmation. Yes = real check-in write
  // then resume; No = stay on the prayer break with the escalation line.
  const markPrayedAndResume = async () => {
    const name = confirmPrayer;
    setConfirmPrayer(null);
    if (!name) return;
    try {
      const d = new Date();
      const dateStr = salah?.date ?? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const res = await fetch("/api/prayer-log/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, prayerName: name, status: "prayed" }),
      });
      // Only treat it as prayed once the write is confirmed — 200 online or
      // the SW's 202 offline-queue receipt. A failed write keeps the banner.
      if (res.ok || res.status === 202) markedPrayersRef.current.add(name);
      else return;
    } catch { /* check-in is best-effort — the prayer page can still mark it */ }
    setSalah(null);
    setLied(false);
    endBreakEarly();
  };
  const prayerDialog = confirmPrayer ? (
    <div className="fixed inset-0 z-[97] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Mark ${PRAYER_LABEL[confirmPrayer] ?? confirmPrayer} as prayed`}>
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setConfirmPrayer(null)} aria-label="Back" />
      <div className="relative w-full max-w-sm rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <p className="text-center text-base font-semibold" style={{ color: "var(--color-ink)" }}>
          Mark {PRAYER_LABEL[confirmPrayer] ?? confirmPrayer} as prayed?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => void markPrayedAndResume()}
            className="flex items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
          >
            <Check className="h-4 w-4" /> Yes
          </button>
          <button
            onClick={() => { setConfirmPrayer(null); setLied(true); }}
            className="flex items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48 }}
          >
            No
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Salah decision sheet — fires when a prayer window opens mid-session.
  // "Pray in next break" vanishes once under 30 min remain: late in the
  // window the only honest choices are "I prayed" or "pray now".
  const salahDialog = salah && salahPrompt ? (
    <div className="fixed inset-0 z-[97] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${PRAYER_LABEL[salah.name] ?? salah.name} time`}>
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={hushSalah} aria-label="Back" />
      <div className="relative w-full max-w-sm rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-warmth)" }}>
          Prayer time
        </p>
        <p className="mt-1.5 text-center text-base font-semibold" style={{ color: "var(--color-ink)" }}>
          {PRAYER_LABEL[salah.name] ?? salah.name} is here{salahLeftMin !== null ? ` — ends in ${fmtDur(salahLeftMin)}` : ""}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => { setLied(false); setConfirmPrayer(salah.name); }}
            className="flex items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
          >
            <Check className="h-4 w-4" /> I prayed
          </button>
          {salahLeftMin !== null && salahLeftMin > 30 ? (
            <button
              onClick={deferSalah}
              className="flex items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48 }}
            >
              Pray in next break
            </button>
          ) : (
            <button
              onClick={() => { setSalahHushedUntil(Date.now() + 15 * 60 * 1000); prayerBreakNow(salah.name, 10); }}
              className="flex items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-medium transition-colors"
              style={{ borderColor: "color-mix(in oklab, var(--color-warmth) 45%, transparent)", backgroundColor: "color-mix(in oklab, var(--color-warmth) 8%, transparent)", color: "var(--color-warmth)", minHeight: 48 }}
            >
              Pray now — window&apos;s closing
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // "Switch it up" sheet — every remaining study segment as a tap target.
  // Rows carry their absolute index into state.segments so switchFocusTo can
  // pull exactly that block forward.
  const upcomingStudy = state.segments
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.kind === "study" && i > progress.index);
  const switchSheet = switchOpen && upcomingStudy.length > 0 ? (
    <div className="fixed inset-0 z-[96] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Switch to another assignment">
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setSwitchOpen(false)} aria-label="Back" />
      <div className="relative w-full max-w-sm rounded-t-2xl border-t sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <div className="px-5 pt-4 pb-2">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--color-ink-muted)" }}>
            Switch it up
          </p>
          <p className="mt-1 text-center text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            Jump to — the rest of this block comes back later
          </p>
        </div>
        <div className="max-h-[50dvh] overflow-y-auto px-3 pb-4">
          {upcomingStudy.map(({ s, i }) => (
            <button
              key={`${i}-${s.label}`}
              onClick={() => { setSwitchOpen(false); switchFocusTo(i); }}
              className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", minHeight: 48 }}
            >
              <span className="min-w-0 truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                {s.label}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                {fmtDur(Math.round(s.minutes))}
              </span>
            </button>
          ))}
          <button
            onClick={() => { setSwitchOpen(false); switchFocus(); }}
            className="mt-1.5 w-full rounded-xl px-4 py-3 text-center text-[12px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-accent)", minHeight: 44 }}
          >
            Surprise me — Vox picks
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // While the overlay is closed the unified FloatingDock carries the session
  // pill — the finish and prayer dialogs still need to render here.
  if (!state.overlayOpen) {
    return <>{finishDialog}{prayerDialog}{salahDialog}</>;
  }

  // Full overlay
  const elapsedInSeg = seg.minutes * 60 - progress.remainingSec;
  const pct = seg.minutes > 0 ? Math.min(100, (elapsedInSeg / (seg.minutes * 60)) * 100) : 100;
  const next = state.segments[progress.index + 1];
  const todayMin = todayFocusMinutes();
  // Final 10s — ring and clock shift to warmth so a transition is felt
  // before it lands (pairs with the countdown chimes).
  const winding = !progress.done && !paused && progress.remainingSec <= 10 && progress.remainingSec > 0;
  // Attention check — vigilance drops around the 60% mark of a long block.
  // Brief+rare resets beat long breaks, so the offer is a 90-second reset.
  const checkinKey = `${state.startedAt}:${progress.index}`;
  const showCheckin =
    !isBreak && !paused && !progress.done &&
    seg.minutes >= 20 && elapsedInSeg >= seg.minutes * 60 * 0.6 &&
    checkinDismissed !== checkinKey;

  // Textbook page tracker — the chunk is one timeslot whose BIG clock is the
  // per-page countdown (the proximate deadline; intermediate deadlines beat
  // distant ones). "Next page" taps are the ground truth: the per-page budget
  // is (chunk time left ÷ pages left), so finishing early banks time and
  // falling behind tightens every remaining page — pressure that adapts.
  const paged = !progress.done && !!seg.pages && !!seg.minPerPage && !isBreak;
  const totalPages = state.segments.reduce((m, s) => Math.max(m, (s.pageStart ?? 0) + (s.pages ?? 0) - 1), 0);
  const pagesDone = paged ? (state.pageDone?.[progress.index] ?? 0) : 0;
  const pagesLeft = paged ? Math.max(1, seg.pages! - pagesDone) : 1;
  const pageMark = paged ? (state.pageMark?.[progress.index] ?? 0) : 0;
  const pageElapsed = paged ? Math.max(0, elapsedInSeg - pageMark) : 0;
  const pageBudget = paged ? progress.remainingSec / pagesLeft : 0;
  const pageLeft = pageBudget - pageElapsed;
  const globalPage = paged ? (seg.pageStart ?? 1) + pagesDone : 0;
  // Pace verdict in seconds, not whole pages — the old integer drift both
  // lagged a full page behind reality and punished deliberate back-taps.
  // Instead: does the slot time left still cover the pages left at the
  // PLANNED pace, crediting the share of the current page already spent?
  //   banked > 0 → ahead (banked seconds you can spend slowing down)
  //   banked < 0 → behind (the deficit the adaptive budget is absorbing)
  const nominalSec = paged ? seg.minPerPage! * 60 : 0;
  const effLeft = paged ? Math.max(0, pagesLeft - Math.min(1, pageElapsed / Math.max(1, pageBudget))) : 0;
  const bankedSec = paged ? progress.remainingSec - effLeft * nominalSec : 0;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} role="dialog" aria-modal="true" aria-label="Study session">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-xl lg:max-w-none lg:px-14">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
            <VoxIcon size={14} /> Vox
          </p>
          <button
            onClick={() => setOverlayOpen(false)}
            className="rounded-md px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 40 }}
          >
            Minimize
          </button>
        </div>

        {/* Salah banner — the open prayer window still waiting on you */}
        {salah && salahLeftMin !== null && !salahPrompt && (
          <button
            onClick={() => { setLied(false); setConfirmPrayer(salah.name); }}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--color-paper-2)]"
            style={{
              borderColor: salahLeftMin <= 30 ? "color-mix(in oklab, var(--color-warmth) 45%, transparent)" : "var(--color-paper-3)",
              backgroundColor: salahLeftMin <= 30 ? "color-mix(in oklab, var(--color-warmth) 8%, transparent)" : "transparent",
              color: salahLeftMin <= 30 ? "var(--color-warmth)" : "var(--color-ink-muted)",
            }}
            role="status"
            aria-live="polite"
          >
            {PRAYER_LABEL[salah.name] ?? salah.name} ends in {fmtDur(salahLeftMin)} — prayed? Tap to mark
          </button>
        )}

        {/* Current segment — the clock sits inside a progress ring. On
            desktop the hero splits: ring left, session text right, so the
            layout fills the screen instead of a mobile column in the middle. */}
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto text-center lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:overflow-visible lg:text-left">
          <div className="mt-auto flex flex-col items-center lg:mt-0 lg:items-end">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em] lg:self-center"
              style={{ color: segAccent }}
              aria-live="polite"
            >
              {progress.done ? "Session complete" : paused ? "Paused" : prayerName ? "Prayer break" : isBreak ? "Break — stretch, breathe" : "Stay with it"}
            </p>

            <div className="relative mt-2 flex items-center justify-center lg:mt-4 lg:scale-110" aria-hidden>
              {/* Page-turn flash — "on to page N" pops above the ring each
                  tap-through so a page change is FELT, not just read. Keyed
                  remount replays the animation every turn. */}
              {paged && pagesDone > 0 && (
                <p
                  key={`${progress.index}:${globalPage}`}
                  className="waqt-page-turn absolute -top-1 left-1/2 z-10 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 14%, var(--color-paper))", color: "var(--color-accent)" }}
                >
                  on to page {globalPage}
                </p>
              )}
              <svg width="224" height="224" viewBox="0 0 224 224" className="-rotate-90 w-[min(66vw,240px)] h-[min(66vw,240px)]">
                <circle cx="112" cy="112" r="102" fill="none" stroke="var(--color-paper-3)" strokeWidth="5" />
                {paged && (
                  <>
                    {/* Inner quiet arc — the slot's total clock, demoted to a
                        thin track inside the page ring (the "small bubble"). */}
                    <circle cx="112" cy="112" r="86" fill="none" stroke="var(--color-paper-3)" strokeWidth="3" opacity={0.5} />
                    <circle
                      cx="112" cy="112" r="86" fill="none"
                      stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" opacity={0.45}
                      strokeDasharray={2 * Math.PI * 86}
                      strokeDashoffset={2 * Math.PI * 86 * (1 - pct / 100)}
                      style={{ transition: "stroke-dashoffset 1s linear" }}
                    />
                  </>
                )}
                <circle
                  cx="112" cy="112" r="102" fill="none"
                  stroke={paused ? "var(--color-ink-muted)" : paged ? (pageLeft < 0 || pageLeft <= 8 ? "var(--color-warmth)" : segAccent) : winding ? "var(--color-warmth)" : segAccent}
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 102}
                  strokeDashoffset={2 * Math.PI * 102 * (1 - (paged ? Math.min(100, (pageElapsed / Math.max(1, pageBudget)) * 100) : pct) / 100)}
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease", opacity: paused ? 0.4 : 1 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {paged ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: pageLeft < 0 ? "var(--color-warmth)" : "var(--color-ink-muted)" }}>
                      page {globalPage} of {totalPages}
                    </p>
                    <p
                      className="text-5xl font-bold tabular-nums tracking-tight sm:text-6xl"
                      style={{ color: paused ? "var(--color-ink-muted)" : pageLeft < 0 ? "var(--color-warmth)" : "var(--color-ink)", transition: "color 0.4s ease" }}
                    >
                      {pageLeft >= 0 ? fmtClock(Math.floor(pageLeft)) : `+${fmtClock(Math.ceil(-pageLeft))}`}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {pageLeft < 0 ? "over pace" : "this page"} · {fmtClock(progress.remainingSec)} in slot
                    </p>
                  </>
                ) : (
                  <>
                    <p
                      className="text-5xl font-bold tabular-nums tracking-tight sm:text-6xl"
                      style={{ color: paused ? "var(--color-ink-muted)" : winding ? "var(--color-warmth)" : isBreak ? "var(--color-success)" : "var(--color-ink)", transition: "color 0.4s ease" }}
                    >
                      {fmtClock(progress.remainingSec)}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
                      {progress.done ? "done" : `${fmtDur(Math.round(seg.minutes))} ${isBreak ? "break" : "block"}`}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-auto mt-3 flex flex-col items-center pb-2 text-center lg:mb-0 lg:mt-0 lg:items-start lg:text-left">
            {prayerName ? (
              <p className="max-w-[18rem] text-base font-bold uppercase tracking-wide lg:max-w-none lg:text-lg" style={{ color: "var(--color-warmth)" }} role="alert">
                {lied
                  ? "Why did you lie? Go pray right now — that's more important."
                  : `Get up and pray ${PRAYER_LABEL[prayerName] ?? prayerName} salah now`}
              </p>
            ) : (
              <p className="max-w-[16rem] truncate text-sm font-medium lg:max-w-md lg:text-xl" style={{ color: "var(--color-ink-soft)" }}>
                {progress.done ? "Nice work — go rest." : paused ? "Take the moment you need. I'll hold your place." : seg.label}
              </p>
            )}
            {/* Page pace line + controls — the tracker is honest both ways:
                finishing early banks time (next page's budget grows), running
                late tightens every remaining page. Green when you're winning,
                warm only when you're actually behind. */}
            {paged && !paused && (
              <>
                <p className="sr-only" aria-live="polite">on to page {globalPage} of {totalPages}</p>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-medium tabular-nums lg:justify-start" aria-live="polite"
                  style={{ color: pageLeft < 0 || bankedSec < -15 ? "var(--color-warmth)" : bankedSec > 45 ? "var(--color-success)" : "var(--color-ink-muted)" }}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden
                    style={{ backgroundColor: pageLeft < 0 || bankedSec < -15 ? "var(--color-warmth)" : bankedSec > 45 ? "var(--color-success)" : "var(--color-ink-muted)" }} />
                  {pageLeft < 0
                    ? `${fmtClock(Math.ceil(-pageLeft))} over — the slot clock is still running`
                    : bankedSec < -15
                      ? `${fmtClock(Math.ceil(-bankedSec))} behind — ~${fmtClock(Math.ceil(pageBudget))} a page from here`
                      : bankedSec > 45 && !(pagesLeft === 1 && effLeft < 1)
                        ? `${fmtClock(Math.floor(bankedSec))} banked — you can breathe`
                        : "on pace — keep turning"}
                </p>
                <div className="mt-2.5 flex items-center justify-center gap-1 lg:justify-start">
                  <button
                    onClick={() => { bumpPage(-1); beep(880, 0.06, 0.07); navigator.vibrate?.(6); }}
                    disabled={pagesDone === 0}
                    className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-30"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label="Go back a page"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => { bumpPage(1); beep(1319, 0.07, 0.09); navigator.vibrate?.(8); }}
                    className="rounded-full px-4 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 40 }}
                    aria-label={pagesDone === seg.pages! - 1 ? "Finished reading — close this block early" : `Done with page ${globalPage} — next page`}
                  >
                    {pagesDone === seg.pages! - 1 ? "Done reading →" : `Next page →`}
                  </button>
                </div>
                {/* Whole-reading progress — a hairline, not a widget: each
                    page turned visibly moves the book forward. */}
                <div className="mx-auto mt-2 h-0.5 w-full max-w-[16rem] overflow-hidden rounded-full lg:mx-0 lg:max-w-md" style={{ backgroundColor: "var(--color-paper-3)" }} aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ((seg.pageStart! - 1 + pagesDone) / Math.max(1, totalPages)) * 100)}%`,
                      backgroundColor: "var(--color-accent)",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </>
            )}
            {isBreak && progress.remainingSec <= 5 && progress.remainingSec > 0 && (
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-success)" }} aria-live="assertive">
                Back to it in {progress.remainingSec}…
              </p>
            )}
            {/* Drift call-out — fired when you left the tab mid-segment */}
            {driftNudge && !progress.done && (
              <p className="mt-2 text-xs font-semibold" style={{ color: "var(--color-warmth)" }} role="status">
                You drifted. Eyes back on the page.
              </p>
            )}

            {/* Vox's coaching line — strict trainer voice, rotates per segment */}
            {!progress.done && !paused && (
              <p className="mt-3 hidden text-[11px] font-medium italic lg:block" style={{ color: "var(--color-ink-muted)" }}>
                {(isBreak ? COACH_BREAK : COACH_STUDY)[progress.index % (isBreak ? COACH_BREAK : COACH_STUDY).length]}
              </p>
            )}

            {/* Today's banked focus — the running total that makes finishing
                another block feel like growth, not just elapsed time. */}
            {todayMin > 0 && (
              <p className="mt-2 hidden text-[11px] font-medium lg:block" style={{ color: "var(--color-ink-muted)" }}>
                Today: {fmtDur(Math.round(todayMin))} focused
              </p>
            )}

            <div className="mt-5 hidden items-center justify-center gap-1 lg:flex lg:justify-start" aria-hidden>
              {state.segments.map((s, i) => (
                <span
                  key={i}
                  className="h-1 rounded-full transition-all"
                  style={{
                    width: i === progress.index ? 22 : Math.max(6, Math.min(14, s.minutes / 4)),
                    backgroundColor:
                      i < progress.index
                        ? "var(--color-ink-muted)"
                        : i === progress.index
                          ? s.kind === "break" ? "var(--color-success)" : "var(--color-accent)"
                          : "var(--color-paper-3)",
                    opacity: i < progress.index ? 0.45 : i === progress.index ? 1 : 0.7,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Up next */}
        {next && !progress.done && (
          <p className="mb-3 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Next: {fmtDur(Math.round(next.minutes))} {next.kind === "break" ? "break" : next.label}
          </p>
        )}

        {/* Attention check-in — one tap resets or confirms focus */}
        {showCheckin && (
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Still locked in?
            </span>
            <button
              onClick={() => { takeBreakNow(1.5); setCheckinDismissed(checkinKey); }}
              className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", minHeight: 32 }}
            >
              Reset · 90s
            </button>
            <button
              onClick={() => setCheckinDismissed(checkinKey)}
              className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 32 }}
            >
              Locked in
            </button>
          </div>
        )}

        {/* Break state — an obvious way back into the work, not just waiting
            for the countdown. Prayer breaks get their own action: resuming
            goes through the "did you pray" confirmation first. */}
        {!progress.done && isBreak && !paused && (
          <div className="mb-3 flex justify-center">
            {prayerName ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => { setLied(false); setConfirmPrayer(prayerName); }}
                  className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-warmth)", color: "var(--color-paper)", minHeight: 44 }}
                >
                  I prayed — go back to studying
                </button>
                {/* Deferral stays available while the window has room — same
                    30-min floor the decision sheet uses. */}
                {salahLeftMin !== null && salahLeftMin > 30 && (
                  <button
                    onClick={deferPrayerBreak}
                    className="flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                  >
                    Not yet — one more block
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={endBreakEarly}
                className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-success)", color: "var(--color-paper)", minHeight: 44 }}
              >
                <Play className="h-4 w-4" /> Back to studying
              </button>
            )}
          </div>
        )}

        {/* In-session rescue actions — break or switch without ending */}
        {!progress.done && !isBreak && !paused && (
          <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5 px-1">
            <button
              onClick={finishAssignment}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 34 }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Done — next
            </button>
            <button
              onClick={() => takeBreakNow(5)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 34 }}
            >
              <Coffee className="h-3.5 w-3.5" /> Break · 5m
            </button>
            <Refocus compact />
            {state.segments.some((s, i) => i > progress.index && s.kind === "study") && (
              <button
                onClick={() => setSwitchOpen(true)}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 34 }}
                aria-haspopup="dialog"
              >
                <Shuffle className="h-3.5 w-3.5" /> Switch it up
              </button>
            )}
          </div>
        )}

        {/* Audio pills — popover panels anchored above the pill row, same
            pattern as the floating dock */}
        {!progress.done && (
          <div className="relative mb-3 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSoundsOpen((v) => !v); setTalksOpen(false); }}
                className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: soundsOpen ? "var(--color-accent)" : "var(--color-paper-3)", color: soundscape.active ? "var(--color-accent)" : "var(--color-ink-muted)", minHeight: 32 }}
                aria-expanded={soundsOpen}
                aria-label="Choose a focus sound"
              >
                {soundscape.active ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {soundscape.active ? SOUNDSCAPES.find((s) => s.id === soundscape.active)?.label ?? "Sound" : "Sounds"}
                {soundscape.paused ? " · paused" : ""}
              </button>
              {/* Talks — a loaded track opens the half-screen sheet (renders
                  above this overlay); nothing loaded opens the in-overlay
                  browser so you can start a talk mid-session. */}
              <button
                onClick={() => {
                  if (talksPlayer.currentTrack) talksPlayer.setView("sheet");
                  else { setTalksOpen((v) => !v); setSoundsOpen(false); }
                }}
                className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: talksOpen ? "var(--color-accent)" : "var(--color-paper-3)", color: talksPlayer.currentTrack ? "var(--color-accent)" : "var(--color-ink-muted)", minHeight: 32 }}
                aria-label={talksPlayer.currentTrack ? `Open talks player — ${talksPlayer.currentTrack.title}` : "Browse talks"}
                aria-expanded={!talksPlayer.currentTrack ? talksOpen : undefined}
              >
                <ListMusic className="h-3.5 w-3.5" />
                {talksPlayer.currentTrack ? talksPlayer.currentTrack.title.slice(0, 18) + (talksPlayer.currentTrack.title.length > 18 ? "…" : "") : "Talks"}
              </button>
            </div>

            {soundsOpen && (
              <div
                className="absolute bottom-full left-1/2 mb-2 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border p-3 shadow-lg backdrop-blur-md"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 96%, transparent)" }}
              >
                <SoundscapePanel onCollapse={() => setSoundsOpen(false)} />
              </div>
            )}

            {talksOpen && !talksPlayer.currentTrack && (
              <div
                className="absolute bottom-full left-1/2 mb-2 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border p-3 shadow-lg backdrop-blur-md"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 96%, transparent)" }}
                role="dialog"
                aria-label="Browse talks"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: "var(--color-ink)" }}>Play a talk</p>
                  <button
                    onClick={() => setTalksOpen(false)}
                    className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)", minHeight: 28, minWidth: 28 }}
                    aria-label="Close talks browser"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {!talksData ? (
                  <p className="py-4 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
                ) : (
                  <div className="max-h-64 space-y-0.5 overflow-y-auto">
                    {(() => {
                      const groups = [
                        ...talksData.folders.map((f) => ({ id: f.id as string | null, name: f.name, tracks: talksData.tracks.filter((t) => t.folderId === f.id) })),
                        { id: null, name: "More talks", tracks: talksData.tracks.filter((t) => t.folderId === null) },
                      ].filter((g) => g.tracks.length > 0);
                      if (groups.length === 0) return <p className="py-3 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>No talks yet.</p>;
                      return groups.map((g) => {
                        const open = openFolder === g.id;
                        return (
                          <div key={g.id ?? "uncategorized"}>
                            <button
                              onClick={() => setOpenFolder(open ? undefined : g.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                              aria-expanded={open}
                            >
                              <ListMusic className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-warmth)" }} />
                              <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: "var(--color-ink)" }}>{g.name}</span>
                              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{g.tracks.length}</span>
                              {open ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "var(--color-ink-muted)" }} /> : <ChevronUp className="h-3 w-3 shrink-0 rotate-90" style={{ color: "var(--color-ink-muted)" }} />}
                            </button>
                            {open && (
                              <div className="ml-6 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: "var(--color-paper-3)" }}>
                                {g.tracks.map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => { talksPlayer.play(t, g.tracks); setTalksOpen(false); }}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                                  >
                                    <Play className="h-3 w-3 shrink-0" style={{ color: "var(--color-accent)" }} />
                                    <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--color-ink)" }}>{t.title}</span>
                                    <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{t.duration ? fmtDur(Math.round(t.duration / 60)) : ""}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer — pause/resume beside end-session */}
        <div className="flex gap-2 lg:mx-auto lg:w-full lg:max-w-md">
          {progress.done ? (
            <button
              onClick={() => { setAskFinish(true); setFinishStep("ask"); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
            >
              <Check className="h-4 w-4" /> Done
            </button>
          ) : (
            <>
              <button
                onClick={paused ? resumeSession : pauseSession}
                className="flex items-center justify-center gap-1.5 rounded-full border px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48, minWidth: 96 }}
                aria-label={paused ? "Resume session" : "Pause session"}
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={() => { setAskFinish(true); setFinishStep("ask"); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48 }}
              >
                <Square className="h-4 w-4" /> End session
              </button>
            </>
          )}
        </div>
      </div>

      {finishDialog}
      {prayerDialog}
      {salahDialog}
      {switchSheet}
    </div>
  );
}

/** Pre-session intake — confirm how long each assignment needs and pick a
 *  method before Vox segments the block. */
function IntakeSheet() {
  const state = useSyncExternalStore(subscribeSession, getSession, () => IDLE_SNAPSHOT);
  const assignments = state.status === "intake" ? state.assignments : null;
  // Reseed the editable estimates whenever a new intake's list arrives —
  // adjusting state during render is the sanctioned reset pattern.
  const [prev, setPrev] = useState(assignments);
  const [ests, setEsts] = useState<(number | null)[]>(() => assignments?.map((a) => a.estimatedMinutes) ?? []);
  const [method, setMethod] = useState<StudyMethod>("auto");
  // Per-assignment paged reading — keyed by assignment index. A reading and
  // an exam can share one block; only the paced row gets page-tracked segments.
  const [pacing, setPacing] = useState<Record<number, { pages: number; minPerPage: number }>>({});
  // Manual order — touched when the user moves a row; sent as `ordered` so
  // Vox respects their arrangement instead of sorting hardest-first.
  const [order, setOrder] = useState<number[] | null>(null);
  if (assignments !== prev) {
    setPrev(assignments);
    setEsts(assignments?.map((a) => a.estimatedMinutes) ?? []);
    // A new intake must not inherit the last session's method/pacing —
    // "textbook + 20 pages" leaking into an unrelated session is confusing.
    setMethod("auto");
    setPacing({});
    setOrder(null);
  }

  if (state.status !== "intake") return null;

  const discipline = getDiscipline();
  const startedLate = !!state.originalMinutes && state.minutes < state.originalMinutes;

  // Display order — manual arrangement wins over the original list order.
  const idx = order ?? state.assignments.map((_, i) => i);

  const bump = (i: number, delta: number) => {
    setEsts((prev) => prev.map((v, j) => j === i ? Math.min(180, Math.max(5, (v ?? 20) + delta)) : v));
  };

  const move = (pos: number, dir: -1 | 1) => {
    const arr = [...idx];
    const j = pos + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[pos], arr[j]] = [arr[j], arr[pos]];
    setOrder(arr);
  };

  // Evidence-based, genuinely different rhythms — not four flavors of the
  // same timer.
  const METHODS: { id: StudyMethod; label: string; hint: string; best: string }[] = [
    { id: "auto",       label: "Vox decides",  hint: "mixed pacing",   best: "balanced mix of work" },
    { id: "pomodoro",   label: "Pomodoro",     hint: "25·5, +15 every 3rd", best: "starting is the hard part" },
    { id: "sprint",     label: "Sprints",      hint: "12·3 rapid fire", best: "drilling, flashcards, review" },
    { id: "deep",       label: "Deep work",    hint: "50·10 long stretches", best: "heavy reading & problem sets" },
    { id: "ultradian",  label: "Ultradian",    hint: "90·20 single blocks", best: "one big piece of work" },
    { id: "interleave", label: "Interleaved",  hint: "rotate ~20 min",  best: "several subjects at once" },
    { id: "flowtime",   label: "Flowtime",     hint: "work till you fade", best: "when you're already in flow" },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Set up study session">
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }} onClick={endSession} aria-label="Cancel" />
      <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border-t sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              <VoxIcon size={16} />
              Vox
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              {startedLate
                ? `Running late — ${fmtDur(state.minutes)} of ${fmtDur(state.originalMinutes ?? state.minutes)} left. I'll make it count.`
                : `I'll fit your work into ${fmtDur(state.minutes)} — help me get it right.`}
            </p>
            {discipline.streak > 0 && (
              <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--color-warmth)" }}>
                Focus streak: {discipline.streak} session{discipline.streak === 1 ? "" : "s"} — let&apos;s keep it alive.
              </p>
            )}
          </div>
          <button onClick={endSession} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>How long does each need?</p>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
            Hardest runs first — use the arrows to reorder, or leave the time at — to skip it.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {idx.map((i, pos) => {
              const a = state.assignments[i];
              const pace = pacing[i];
              return (
                <li key={i} className="flex flex-col gap-1 rounded-lg border px-3 py-2" style={{ borderColor: pace ? "var(--color-accent)" : "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <button onClick={() => move(pos, -1)} disabled={pos === 0} className="flex h-4 w-5 items-center justify-center rounded transition-colors hover:bg-[var(--color-paper-3)] disabled:opacity-30" style={{ color: "var(--color-ink-muted)" }} aria-label={`Move ${a.title} up`}>
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => move(pos, 1)} disabled={pos === idx.length - 1} className="flex h-4 w-5 items-center justify-center rounded transition-colors hover:bg-[var(--color-paper-3)] disabled:opacity-30" style={{ color: "var(--color-ink-muted)" }} aria-label={`Move ${a.title} down`}>
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>{a.title}</span>
                    <button
                      onClick={() => setPacing((p) => {
                        const next = { ...p };
                        if (next[i]) delete next[i];
                        else next[i] = { pages: 20, minPerPage: 3 };
                        return next;
                      })}
                      aria-pressed={!!pace}
                      title={pace ? "Remove page pacing" : "Pace it by pages — reading/textbook"}
                      aria-label={pace ? `Remove page pacing from ${a.title}` : `Pace ${a.title} by pages`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]"
                      style={{ color: pace ? "var(--color-accent)" : "var(--color-ink-muted)", backgroundColor: pace ? "color-mix(in oklab, var(--color-accent) 12%, transparent)" : "transparent" }}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </button>
                    {!pace && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => bump(i, -5)} className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label={`Less time for ${a.title}`}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-10 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                          {ests[i] ? fmtDur(ests[i]) : "—"}
                        </span>
                        <button onClick={() => bump(i, 5)} className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label={`More time for ${a.title}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {pace && (() => {
                    const need = pace.pages * pace.minPerPage;
                    const fitPages = Math.floor(state.minutes / pace.minPerPage);
                    const over = need > state.minutes;
                    const set = (patch: Partial<typeof pace>) => setPacing((p) => ({ ...p, [i]: { ...p[i], ...patch } }));
                    return (
                      <div className="flex flex-col gap-1.5 border-t pt-1.5" style={{ borderColor: "var(--color-paper-3)" }}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>Pages</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => set({ pages: Math.max(1, pace.pages - 5) })} className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Fewer pages">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-9 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>{pace.pages}</span>
                            <button onClick={() => set({ pages: Math.min(400, pace.pages + 5) })} className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label="More pages">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>Min/page</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => set({ minPerPage: Math.max(1, pace.minPerPage - 1) })} className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Faster pace">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-9 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>{pace.minPerPage}m</span>
                            <button onClick={() => set({ minPerPage: Math.min(10, pace.minPerPage + 1) })} className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Slower pace">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] leading-snug" style={{ color: over ? "var(--color-warmth)" : "var(--color-ink-muted)" }}>
                          ≈ {fmtDur(need)} of reading
                          {over
                            ? ` — ${fmtDur(need - state.minutes)} over this ${fmtDur(state.minutes)} block.${fitPages >= 1 ? ` ${fitPages} page${fitPages === 1 ? "" : "s"} fit at this pace —` : ""}`
                            : " — fits; leftover time becomes review."}
                          {over && fitPages >= 1 && (
                            <button onClick={() => set({ pages: fitPages })} className="ml-1 font-semibold underline underline-offset-2" style={{ color: "var(--color-warmth)" }}>
                              use {fitPages}
                            </button>
                          )}
                        </p>
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ul>

          {/* Sprint — skip planning, one focused burst. Research: 10–20 min
              sessions beat long blocks on attention + completion. */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>Short on time? Sprint instead</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[10, 15, 20].map((m) => (
              <button
                key={m}
                onClick={() => {
                  if (state.blockId) {
                    void fetch("/api/blocks", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: state.blockId, status: "worked" }),
                    }).catch(() => { /* cosmetic — planner badge only */ });
                  }
                  const a = state.assignments[idx[0]];
                  startSprint(
                    m,
                    a?.title ?? "Focus sprint",
                    state.blockId,
                    // Attach the homeworkId so sprint minutes count toward the
                    // "studied" badge and per-exam history, not just the label.
                    a?.homeworkId ? { [a.title]: a.homeworkId } : undefined,
                  );
                }}
                className="flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold tabular-nums transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)", minHeight: 44 }}
              >
                <Zap className="h-3.5 w-3.5" /> {m}m
              </button>
            ))}
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>Study method</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className="rounded-lg border px-3 py-2 text-left transition-colors"
                style={{
                  borderColor: method === m.id ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: method === m.id ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "transparent",
                  minHeight: 44,
                }}
                aria-pressed={method === m.id}
              >
                <span className="block text-sm font-medium" style={{ color: method === m.id ? "var(--color-accent)" : "var(--color-ink)" }}>{m.label}</span>
                <span className="block text-[11px] font-medium" style={{ color: method === m.id ? "var(--color-accent)" : "var(--color-ink-muted)" }}>{m.hint}</span>
                <span className="block text-[10px] leading-snug" style={{ color: "var(--color-ink-muted)" }}>{m.best}</span>
              </button>
            ))}
          </div>

        </div>

        <div className="border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" style={{ borderColor: "var(--color-paper-3)" }}>
          <button
            onClick={() => void planSession(
              {
                minutes: state.minutes,
                originalMinutes: state.originalMinutes,
                method,
                ordered: order !== null,
                // No time set and no pages → the user didn't commit to it —
                // skip it in the plan rather than inventing a chunk for it.
                // homeworkId rides along so the server can enrich with
                // per-assignment history and the recap can attach minutes to
                // the real homework row.
                assignments: idx
                  .map((i) => ({ title: state.assignments[i].title, estimatedMinutes: pacing[i] ? pacing[i].pages * pacing[i].minPerPage : ests[i], homeworkId: state.assignments[i].homeworkId, pagePace: pacing[i] }))
                  .filter((a) => a.estimatedMinutes !== null || a.pagePace),
              },
              state.blockId,
            )}
            className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
          >
            <VoxIcon size={16} /> Plan my session
          </button>
        </div>
      </div>
    </div>
  );
}

/** Vox "thinking" card — cycling first-person phrases + pulsing dots while
 *  the plan is being generated. */
function ThinkingCard() {
  const PHRASES = [
    "Reading your assignments…",
    "Putting the hardest work first…",
    "Placing your breaks…",
    "Balancing the clock…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PHRASES.length), 1600);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex w-64 flex-col items-center gap-3 rounded-2xl border px-5 py-6 text-center" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
      <div className="animate-pulse">
        <VoxIcon size={24} withBadge />
      </div>
      <p key={i} className="min-h-[1.25rem] text-sm font-medium" style={{ color: "var(--color-ink)", animation: "voxFade .4s ease" }}>
        {PHRASES[i]}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--color-accent)", animation: `voxDot 1.2s ease-in-out ${d * 0.18}s infinite` }}
          />
        ))}
      </div>
      <style>{`
        @keyframes voxDot { 0%,100% { opacity:.25; transform:translateY(0) } 50% { opacity:1; transform:translateY(-3px) } }
        @keyframes voxFade { from { opacity:0; transform:translateY(3px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}

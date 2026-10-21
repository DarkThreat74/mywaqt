/**
 * Recite Plan — goal engine for the Quran Listener.
 *
 * Pure local, offline-first: plan + coverage live in localStorage under qt:*.
 * Coverage is a global Set<"s:a"> of ayahs the tracker actually heard —
 * union-mergeable for sync, and shared across whatever daily span a day maps
 * to (sequential + flexible-pool combined).
 */
import type { AyahPages } from "./mushaf";

export interface Loc { s: number; a: number }
export type Unit = "juz" | "page" | "ayah";
export type MissedPolicy = "roll" | "recompute" | "debt";

export interface Plan {
  enabled: boolean;
  kind: "khatma" | "daily";
  amount: number;
  unit: Unit;
  deadline?: string;         // ISO — khatma only: daily load auto-sizes
  start: Loc;
  missedPolicy: MissedPolicy;
  reminders: "off" | "daily" | "streak";
  /** First uncovered global ordinal — the sequential cursor. */
  cursor: Loc;
}

/** Medina juz boundaries — fixed human-verified constants (juz n starts here). */
export const JUZ_START: Loc[] = [
  { s: 1, a: 1 }, { s: 2, a: 142 }, { s: 2, a: 253 }, { s: 3, a: 93 },
  { s: 4, a: 24 }, { s: 4, a: 148 }, { s: 5, a: 82 }, { s: 6, a: 111 },
  { s: 7, a: 88 }, { s: 8, a: 41 }, { s: 9, a: 93 }, { s: 11, a: 6 },
  { s: 12, a: 53 }, { s: 15, a: 1 }, { s: 17, a: 1 }, { s: 18, a: 75 },
  { s: 21, a: 1 }, { s: 23, a: 1 }, { s: 25, a: 21 }, { s: 27, a: 56 },
  { s: 29, a: 46 }, { s: 33, a: 31 }, { s: 36, a: 28 }, { s: 39, a: 32 },
  { s: 41, a: 47 }, { s: 46, a: 1 }, { s: 51, a: 31 }, { s: 58, a: 1 },
  { s: 67, a: 1 }, { s: 78, a: 1 },
];
export const QURAN_END: Loc = { s: 114, a: 6 };

const PLAN_KEY = "qt:plan";
const COV_KEY = "qt:coverage";
const DAYS_KEY = "qt:plan-days";
const GRACE_KEY = "qt:grace-credits";
const KHATMAS_KEY = "qt:khatmas";

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};

/* ── Global ayah ordering (built from the precached ayah→page index) ── */
export interface AyahIndex {
  ord: Map<string, number>;
  list: Loc[];
}
export function buildIndex(ap: AyahPages): AyahIndex {
  const list: Loc[] = [];
  for (const s of Object.keys(ap))
    for (const a of Object.keys(ap[s])) list.push({ s: Number(s), a: Number(a) });
  list.sort((x, y) => x.s - y.s || x.a - y.a);
  const ord = new Map<string, number>();
  list.forEach((l, i) => ord.set(`${l.s}:${l.a}`, i));
  return { ord, list };
}
export const keyOf = (l: Loc) => `${l.s}:${l.a}`;
export function distOf(ix: AyahIndex, from: Loc, to: Loc): number | null {
  const f = ix.ord.get(keyOf(from)), t = ix.ord.get(keyOf(to));
  return f == null || t == null ? null : t - f;
}

/* ── Plan + coverage persistence ── */
export function loadPlan(): Plan | null {
  const raw = ls.get(PLAN_KEY);
  if (!raw) return null;
  try { const p = JSON.parse(raw) as Plan; return p.enabled ? p : null; } catch { return null; }
}
export function savePlan(p: Plan | null) {
  if (!p) return void ls.set(PLAN_KEY, "");
  ls.set(PLAN_KEY, JSON.stringify(p));
}
export function loadCoverage(): Set<string> {
  try { return new Set(JSON.parse(ls.get(COV_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
// Debounced persistence — an O(coverage) JSON.stringify + sync localStorage
// write per covered ayah became a visible stall on long sessions.
let covFlushTimer: ReturnType<typeof setTimeout> | null = null;
export function markCovered(cov: Set<string>, l: Loc) {
  if (cov.has(keyOf(l))) return;
  cov.add(keyOf(l));
  if (covFlushTimer) return;
  covFlushTimer = setTimeout(() => {
    covFlushTimer = null;
    ls.set(COV_KEY, JSON.stringify([...cov]));
  }, 4000);
}
/** Flush any pending coverage write (call on session stop/unmount). */
export function flushCoverage(cov: Set<string>) {
  if (!covFlushTimer) return;
  clearTimeout(covFlushTimer);
  covFlushTimer = null;
  ls.set(COV_KEY, JSON.stringify([...cov]));
}

/* ── Span resolution ── */
/** Ayahs on a mushaf page, from the index. */
export function ayahsOnPage(ix: AyahIndex, ap: AyahPages, page: number): Loc[] {
  const out: Loc[] = [];
  for (const s of Object.keys(ap))
    for (const [a, pg] of Object.entries(ap[s]))
      if (pg === page) out.push({ s: Number(s), a: Number(a) });
  return out.sort((x, y) => x.s - y.s || x.a - y.a);
}

/** The span assigned to a day: `amount` units starting at `from`. */
export function resolveSpan(ix: AyahIndex, ap: AyahPages, plan: Plan, from: Loc): Loc[] {
  if (plan.unit === "juz") {
    // Locate which juz `from` falls in, then take `amount` consecutive juz.
    const fromOrd = ix.ord.get(keyOf(from)) ?? 0;
    let j = 0;
    for (; j < JUZ_START.length; j++)
      if ((ix.ord.get(keyOf(JUZ_START[j])) ?? Infinity) > fromOrd) break;
    const first = Math.max(0, j - 1);
    const last = Math.min(JUZ_START.length - 1, first + plan.amount - 1);
    const start = JUZ_START[first];
    const endOrd = last + 1 <= JUZ_START.length - 1
      ? (ix.ord.get(keyOf(JUZ_START[last + 1])) ?? ix.list.length) - 1
      : ix.list.length - 1;
    return ix.list.slice(ix.ord.get(keyOf(start)) ?? 0, endOrd + 1);
  }
  if (plan.unit === "page") {
    const startPage = ap[String(from.s)]?.[String(from.a)] ?? 1;
    const span: Loc[] = [];
    for (let p = startPage; p < startPage + plan.amount && p <= 604; p++)
      span.push(...ayahsOnPage(ix, ap, p));
    return span;
  }
  const i = ix.ord.get(keyOf(from)) ?? 0;
  return ix.list.slice(i, i + plan.amount);
}

/** Today's span: sequential from the cursor (roll-forward is automatic —
 * the cursor only advances past covered ayahs). */
export function todaySpan(ix: AyahIndex, ap: AyahPages, plan: Plan, cov: Set<string>): Loc[] {
  const from = plan.missedPolicy === "recompute"
    ? firstUncovered(ix, plan.start, cov)
    : plan.cursor;
  if (plan.kind === "khatma" && plan.deadline) {
    const days = Math.max(1, Math.ceil((new Date(plan.deadline).getTime() - Date.now()) / 86400000));
    // Remaining = uncovered ayahs from `from` onward. Subtracting covered-
    // since-plan-start from a cursor that already skips them double-counts
    // and can push `per` to 0 (empty span on a live plan).
    const rest: Loc[] = [];
    for (let j = ix.ord.get(keyOf(from)) ?? 0; j < ix.list.length; j++)
      if (!cov.has(keyOf(ix.list[j]))) rest.push(ix.list[j]);
    return rest.slice(0, Math.ceil(rest.length / days));
  }
  return resolveSpan(ix, ap, plan, from);
}
function firstUncovered(ix: AyahIndex, start: Loc, cov: Set<string>): Loc {
  const i = ix.ord.get(keyOf(start)) ?? 0;
  for (let j = i; j < ix.list.length; j++) if (!cov.has(keyOf(ix.list[j]))) return ix.list[j];
  return ix.list[ix.list.length - 1];
}
/* ── Day stamping, streak, grace ── */
interface DayRec { from: Loc; to: Loc; total: number; done: boolean }
function days(): Record<string, DayRec> {
  try { return JSON.parse(ls.get(DAYS_KEY) ?? "{}"); } catch { return {}; }
}
export function stampDay(date: string, span: Loc[], done: boolean) {
  const d = days();
  d[date] = { from: span[0], to: span[span.length - 1], total: span.length, done };
  ls.set(DAYS_KEY, JSON.stringify(d));
}
export function coveredInSpan(span: Loc[], cov: Set<string>): number {
  let n = 0;
  for (const l of span) if (cov.has(keyOf(l))) n++;
  return n;
}
/** Local-midnight day key — "sv-SE" formats YYYY-MM-DD in the local zone. */
export const todayKey = () => new Date().toLocaleDateString("sv-SE");
export function isDayDone(date: string): boolean { return days()[date]?.done === true; }

/** Consecutive fully-done days ending today/yesterday. */
export function streak(): number {
  const d = days();
  let n = 0;
  const t = new Date();
  for (;;) {
    const k = t.toLocaleDateString("sv-SE");
    const rec = d[k];
    if (rec?.done) { n++; t.setDate(t.getDate() - 1); continue; }
    if (k === todayKey() && !rec?.done) { t.setDate(t.getDate() - 1); continue; } // today in progress
    // A completed khatma's grace credit absorbs one missed day. Stamping the
    // day makes it idempotent — streak() is read on every render.
    if (spendGrace()) {
      d[k] = { from: { s: 0, a: 0 }, to: { s: 0, a: 0 }, total: 0, done: true };
      ls.set(DAYS_KEY, JSON.stringify(d));
      n++; t.setDate(t.getDate() - 1); continue;
    }
    break;
  }
  return n;
}
export function graceCredits(): number { return Number(ls.get(GRACE_KEY)) || 0; }
export function khatmas(): number { return Number(ls.get(KHATMAS_KEY)) || 0; }
const KHATMA_FLAG_KEY = "qt:khatma-flagged";
/** Fire once per full-coverage pass — without the flag, every later
 *  checkDay would mint another credit forever. Starting a NEW khatma must
 *  clear coverage AND this flag (shortcut: not wired in UI yet). */
export function maybeKhatma(covSize: number, total: number) {
  if (covSize < total || ls.get(KHATMA_FLAG_KEY)) return;
  ls.set(KHATMA_FLAG_KEY, "1");
  ls.set(KHATMAS_KEY, String(khatmas() + 1));
  ls.set(GRACE_KEY, String(graceCredits() + 1));
}
export function spendGrace(): boolean {
  const g = graceCredits();
  if (g <= 0) return false;
  ls.set(GRACE_KEY, String(g - 1));
  return true;
}

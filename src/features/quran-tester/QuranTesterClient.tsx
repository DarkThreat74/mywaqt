"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, BookOpenCheck, Check, Download, Eye, EyeOff, FolderOpen, HardDriveDownload, Home, ListChecks, Loader2, Mic, MicOff, Pause, Play, Settings, Square, Trash2, User2, X } from "lucide-react";
import { ENGINE_ASSETS, downloadEngine, engineInstalled, wipeQuranTesterData } from "./engine";
import { loadAyahPages, loadBasmalaFont, loadPage, loadPageFont, loadSurahMeta, warmMushaf, type AyahPages, type MushafPage, type SurahMetaEntry } from "./mushaf";
import { removeMistakeAt, saveMistake, syncMistakes, type Mistake } from "./mistakes";
import {
  buildIndex, coveredInSpan, distOf, JUZ_START, keyOf, loadCoverage, loadPlan, markCovered,
  savePlan, stampDay, isDayDone, maybeKhatma, todayKey, todaySpan,
  type AyahIndex, type Loc, type Plan,
} from "./plan";
import { pauseQt, qtOrb, qtPost, qtState, resumeQt, startQt, stopQt, subscribeQt, teardownQt, warmQt } from "./session";

/**
 * Quran Tester — recite anywhere in the Quran; the app follows you on a real
 * 15-line mushaf and flags mistakes for confirmation. Fully on-device: the
 * recognition engine downloads once (~85MB) and audio never leaves the phone.
 *
 * Self-contained under src/features/quran-tester/ — extractable later.
 */

type ListenState = "idle" | "warming" | "listening" | "paused";
const PAGE_COUNT = 604;

// Timestamps live at module scope so render-tree purity checks stay happy —
// event handlers call this, not Date.now() inline.
function nowMs() { return Date.now(); }

let qtDingCtx: AudioContext | null = null;
function ding(freq = 760, vol = 0.08, dur = 0.35) {
  try {
    qtDingCtx ??= new AudioContext();
    const t = qtDingCtx.currentTime;
    const o = qtDingCtx.createOscillator();
    const g = qtDingCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(qtDingCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch {}
}
/** Three bells together — the "you moved" signature. */
function ding3() {
  ding(980, 0.14, 0.22);
  setTimeout(() => ding(980, 0.14, 0.22), 160);
  setTimeout(() => ding(980, 0.14, 0.22), 320);
}

/** Standard Madani mushaf juz → start page (604-page edition). */
const JUZ_PAGES = [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];

type SurahMeta = SurahMetaEntry;

export default function QuranTesterClient() {
  const [ayahPages, setAyahPages] = useState<AyahPages | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<Map<number, MushafPage>>(new Map());
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const [fonts, setFonts] = useState<Set<number>>(new Set());
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"mushaf" | "listener">(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("qt:view-mode") === "listener" ? "listener" : "mushaf"),
  );
  const [setupOpen, setSetupOpen] = useState(false);

  const [listen, setListen] = useState<ListenState>(() => qtState());
  const [status, setStatus] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ surah: number; ayah: number } | null>(null);
  const [wordIdx, setWordIdx] = useState<number | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [storageInfo, setStorageInfo] = useState(false);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [bsmlReady, setBsmlReady] = useState(false);
  const [micHelp, setMicHelp] = useState(false);
  const [level, setLevel] = useState(0);

  // Mistake layer: engine-raised suspects render yellow; only a confirmed
  // suspect turns red and persists. Nothing else about recitation is stored.
  const [suspects, setSuspects] = useState<Map<string, string>>(new Map());
  const [confirmed, setConfirmed] = useState<Map<string, Mistake>>(new Map());
  // Diversion marks — every ayah a jump landed on stays yellow for the
  // whole tab session (sessionStorage survives in-app navigation, dies
  // with the tab). Confirming the spot as a mistake upgrades it to red.
  const [pin, setPin] = useState<{ s: number; a: number; w: number } | null>(null); // last-good WORD, blue underline
  const [diversions, setDiversions] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("qt:diversions") ?? "[]")); }
    catch { return new Set(); }
  });
  const [pending, setPending] = useState<{ s: number; a: number; w: number; kind: string } | null>(null);
  const lastIssueKeyRef = useRef<string | null>(null); // suspect raised by the live correction
  // While an issue sits in the engine's `retrying` phase the main tracker
  // is frozen — if you keep reciting forward instead of re-reading, ALL
  // detection dies silently. The defer timer releases it back to tracking
  // after a grace window; the flag + banner stay either way.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-session tallies for the end-of-session stats sheet.
  const sessionStartRef = useRef(0);
  const sessionFlagsRef = useRef<Set<string>>(new Set());
  const sessionConfirmRef = useRef<Set<string>>(new Set()); // mistakes confirmed/marked this session
  const sessionTouchedRef = useRef<Set<string>>(new Set()); // ayahs ≥30% heard this session
  const [statsSheet, setStatsSheet] = useState<{ ayahs: number; seconds: number; flags: number } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pleased, setPleased] = useState(false); // listener's soft smile after a corrected re-read

  // Memorize mode: words hide until recited past or peeked. Peeks are logged
  // so weak spots are reviewable — same idea as Tarteel's Verse Peeking.
  const [memorize, setMemorize] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"surah" | "juz">("surah");
  const [surahMeta, setSurahMeta] = useState<SurahMeta[] | null>(null);

  // ── Recite Plan ──
  const [plan, setPlan] = useState<Plan | null>(() => loadPlan());
  const [planOpen, setPlanOpen] = useState(false);
  const [jump, setJump] = useState<{ to: Loc; expected: Loc; at: number; silent?: boolean } | null>(null);
  // Anchor policy: "follow" drifts with you; "hold" pins where you left off
  // until you return or accept the new spot. Persisted — works with no goal.
  const [anchorMode, setAnchorMode] = useState<"follow" | "hold">(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("qt:anchor-mode") === "follow" ? "follow" : "hold"),
  );
  const anchorModeRef = useRef(anchorMode);
  const [dayDone, setDayDone] = useState(false);
  const ixRef = useRef<AyahIndex | null>(null);
  const covRef = useRef<Set<string>>(new Set());
  const spanRef = useRef<Loc[]>([]);
  // Render-safe mirrors — the render path may never touch a ref.
  const [covSnap, setCovSnap] = useState<Set<string>>(new Set());
  const [spanSnap, setSpanSnap] = useState<Loc[]>([]);
  const [spanText, setSpanText] = useState("");
  const anchorRef = useRef<Loc | null>(null);
  // Look-alike pairs ("s:a" → Set<"s:a">) — when the tracker lands on a
  // known mutashabih of the anchor, the move gets flagged as suspect, not
  // silently accepted: confusable verses are the #1 false-jump source.
  const mutaRef = useRef<Map<string, Set<string>> | null>(null);
  const heardRef = useRef<{ loc: Loc | null; max: number; total: number }>({ loc: null, max: 0, total: 0 });
  const sessionCovRef = useRef<Set<string>>(new Set());
  const jumpChimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jumpRef = useRef<{ to: Loc; expected: Loc; at: number; silent?: boolean } | null>(null);
  const preambleGraceRef = useRef(0); // 'lost' timestamp — basmala/isti'adhah window
  const candTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // unstable-lock dwell
  const locLiveRef = useRef<{ s: number; a: number } | null>(null);
  const [lockFx, setLockFx] = useState<{ s: number; a: number; n: number } | null>(null); // first-lock wave
  const lockFxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planRef = useRef(plan);
  const suspectsRef = useRef(suspects);
  const pinRef = useRef(pin);

  // Swipe — dragX tracks the finger; turn animates a committed page turn
  // (-1 = turn to next page/left, +1 = back/right). CSS transition does the
  // motion; transitionend commits the page change.
  const [dragX, setDragX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [turn, setTurn] = useState<0 | 1 | -1>(0);
  const turnTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const dragRef = useRef<{ x0: number; active: boolean }>({ x0: 0, active: false });

  const pageRef = useRef(page);
  const handlerRef = useRef<(ev: Record<string, unknown>) => void>(() => {});
  const ayahPagesRef = useRef(ayahPages);

  useEffect(() => {
    pageRef.current = page;
    ayahPagesRef.current = ayahPages;
    planRef.current = plan;
    suspectsRef.current = suspects;
    pinRef.current = pin;
    anchorModeRef.current = anchorMode;
    try {
      localStorage.setItem("qt:anchor-mode", anchorMode);
      localStorage.setItem("qt:view-mode", viewMode);
    } catch {}
  });

  /** Expected = the surah the engine actually locked onto. setExpected
   *  constrains searches to its passage, so it must NEVER be sent before
   *  locate — reciting away from the visible page made the engine transcribe
   *  forever without ever locking. Posted after lock (and on cross-surah
   *  jumps) so ayah-order + skipped-ayah detection still work; relocate
   *  searches stay Quran-wide regardless. */
  const expectedSurahRef = useRef(0);
  function expectSurah(s: number) {
    // `setExpected` cages EVERY search — locate, post-lost re-search, AND
    // relocate. With a window set the engine literally cannot follow you
    // into another surah: switching passages mid-session decoded nothing.
    // Both modes leave the window null so Quran-wide relocation works; the
    // client's own classifier is what decides whether a move flags. The ref
    // just tracks the last-seen surah so redundant posts don't spam.
    if (s === expectedSurahRef.current) return;
    expectedSurahRef.current = s;
    qtPost({ type: "expect", passage: null });
  }

  const spanDayRef = useRef("");
  /** Recompute today's span from plan + coverage (roll-forward cursor).
   *  A session crossing local midnight gets the NEW day's span. */
  function refreshSpan() {
    spanDayRef.current = todayKey();
    const p = planRef.current, ix = ixRef.current, ap = ayahPagesRef.current;
    spanRef.current = p && ix && ap ? todaySpan(ix, ap, p, covRef.current) : [];
    setSpanSnap(spanRef.current);
    // The chip's "Juz 3–4"/"2:255–2:260" label, computed here because it
    // needs the refs — render never touches them.
    const span = spanRef.current;
    if (!span.length) { setSpanText(""); return; }
    const last = span[span.length - 1];
    if (p?.unit === "juz" && ix) {
      const jAt = (l: Loc) => {
        const o = ix.ord.get(keyOf(l)) ?? 0;
        let j = 0;
        for (let i = 0; i < JUZ_START.length; i++)
          if ((ix.ord.get(keyOf(JUZ_START[i])) ?? Infinity) <= o) j = i;
        return j + 1;
      };
      const j1 = jAt(span[0]), j2 = jAt(last);
      setSpanText(j1 === j2 ? `Juz ${j1}` : `Juz ${j1}–${j2}`);
    } else {
      setSpanText(`${span[0].s}:${span[0].a}–${last.s}:${last.a}`);
    }
  }

  useEffect(() => {
    covRef.current = loadCoverage();
    setCovSnap(covRef.current);
    loadAyahPages().then((ap) => { setAyahPages(ap); ixRef.current = buildIndex(ap); refreshSpan(); }).catch(() => {});
    loadBasmalaFont().then(() => setBsmlReady(true)).catch(() => {});
    loadSurahMeta().then(setSurahMeta).catch(() => {});
    // Look-alike index (shared with the Mutashabihat game) — one small JSON,
    // best-effort: tracking works without it, just less skeptically.
    fetch("/data/mutashabihat.json").then((r) => (r.ok ? r.json() : [])).then((fams: { instances?: { s: number; a: number }[] }[]) => {
      const m = new Map<string, Set<string>>();
      for (const f of Array.isArray(fams) ? fams : []) {
        const keys = (f.instances ?? []).map((i) => `${i.s}:${i.a}`);
        for (const k of keys) {
          const s = m.get(k) ?? new Set<string>();
          for (const o of keys) if (o !== k) s.add(o);
          m.set(k, s);
        }
      }
      mutaRef.current = m;
    }).catch(() => {});
    engineInstalled()
      .then((ok) => {
        setInstalled(ok);
        // Load the 66MB model during page idle — pressing record is then
        // near-instant instead of a multi-second warmup. Also keep the
        // background mushaf warm flowing (resumable watermark) so every
        // page + font becomes offline-ready over time.
        if (ok) { warmQt(); warmMushaf(); }
      })
      .catch(() => setInstalled(false));
    syncMistakes() // local first, then merges the server copy
      .then((ms) => setConfirmed(new Map(ms.map((m) => [`${m.surah}:${m.ayah}:${m.word}`, m]))))
      .catch(() => {});
    // Subscribe to the global session — navigating away keeps it alive;
    // this page just re-attaches to whatever state it's in.
    const unsub = subscribeQt((ev) => handlerRef.current(ev));
    // Connectivity — everything here is offline-first, but queued mistake
    // syncs and the mushaf background warm resume the moment we're back.
    const onUp = () => { setOnline(true); warmMushaf(); void syncMistakes().then((ms) => setConfirmed(new Map(ms.map((m) => [`${m.surah}:${m.ayah}:${m.word}`, m])))).catch(() => {}); };
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      unsub();
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      for (const t of [jumpChimeRef.current, retryTimerRef.current, candTimerRef.current, lockFxTimer.current, turnTimer.current])
        if (t) clearTimeout(t as ReturnType<typeof setTimeout>);
      jumpChimeRef.current = retryTimerRef.current = candTimerRef.current = lockFxTimer.current = turnTimer.current = null;
    };
  }, []);

  // Fetch page + font, keep a ±1 window warm
  useEffect(() => {
    const want = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= PAGE_COUNT);
    for (const p of want) {
      if (!pages.has(p)) {
        loadPage(p)
          .then((d) => {
            setPages((prev) => new Map(prev).set(p, d));
            setFailedPages((prev) => { const n = new Set(prev); n.delete(p); return n; });
          })
          .catch(() => setFailedPages((prev) => new Set(prev).add(p)));
      }
      if (!fonts.has(p)) {
        loadPageFont(p)
          .then(() => setFonts((prev) => new Set(prev).add(p)))
          .catch(() => {});
      }
    }
  }, [page, pages, fonts]);


  // Re-resolve today's span whenever plan/coverage context shifts.
  useEffect(() => { refreshSpan(); }, [plan, ayahPages]);

  // The jump toast stays until you act on it — Continue here, Go to pin,
  // or X. Auto-dismissal was the "popup appears then disappears" report:
  // the flag vanished while the hold stayed armed, so tracking looked
  // dead with no visible reason. It only leaves with a real resolution.

  // Keep the current ayah on screen while listening — reciting down a page
  // on mobile shouldn't leave the highlight scrolled out of view.
  useEffect(() => {
    if (!loc || listen === "idle") return;
    const sel = `[data-loc="${loc.surah}:${loc.ayah}:1"]`;
    document.querySelector(sel)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => document.querySelector(sel)?.scrollIntoView({ block: "center" }), 350); // retry after a page swap renders
    return () => clearTimeout(t);
  }, [loc, listen]);


  const spanOrd = (l: Loc) => ixRef.current?.ord.get(keyOf(l)) ?? -1;
  function inSpan(l: Loc, pad = 2): boolean {
    const span = spanRef.current;
    if (!span.length) return false;
    const o = spanOrd(l);
    return o >= spanOrd(span[0]) - pad && o <= spanOrd(span[span.length - 1]) + pad;
  }

  /** Jump classifier — the reason routine relocations used to "ting" at
   *  random. Only a landing OUTSIDE the expected track alerts. */
  function classifyJump(loc: Loc) {
    const ix = ixRef.current;
    if (!ix) return;
    // 'Audhu/Basmala between ayahs aren't text — the tracker goes `lost`
    // and can emit a phantom relocation while it recovers. Freeze the
    // classifier briefly after each `lost` so a preamble never counts as
    // a jump, a gap, or a mistake — and never move the anchor: a relocate
    // landing here must NOT silently re-anchor (that path ate every ding).
    const anchor = anchorRef.current;
    // 'Audhu/Basmala between ayahs aren't text — the tracker goes `lost`
    // and can emit a phantom relocation while it recovers. Freeze only
    // NEARBY candidates during the grace window — a landing far from the
    // anchor is a real move, preamble or not, and must still classify.
    if (Date.now() - preambleGraceRef.current < 2500 && anchor) {
      const d = distOf(ix, anchor, loc);
      if (d != null && Math.abs(d) <= 3) return;
    }
    if (!anchor) { anchorRef.current = loc; ding(760); return; } // first locate — the chime
    // Still off-track? Re-anchor only happens on resolution — in "hold"
    // mode the expected point stays pinned where you left off.
    const j = jumpRef.current;
    if (j) {
      const back = distOf(ix, j.expected, loc);
      if (back != null && Math.abs(back) <= 3) { dismissJump(); anchorRef.current = loc; return; }
      // Follow does NOT auto-accept — the toast stays until you resolve it
      // (Continue here / Go to pin / X) or recite back near the expected
      // spot above. Auto-dismiss at 2.5s is what kept eating the popup.
      if (anchorModeRef.current === "hold") {
        // One deviation = ONE flag. While a hold jump is open the tracker
        // will keep re-relocating as you recite elsewhere — each event gets
        // swallowed and the tracker snapped back to the pin. No re-dings,
        // no popup spam. Resolution: recite back near the pin (above), tap
        // "Continue here", or dismiss.
        const drift = distOf(ix, j.to, loc);
        if (drift != null && Math.abs(drift) <= 3) j.to = loc;
        const pin = resumeWord(j.expected);
        qtPost({ type: "reanchor", s: pin.s, a: pin.a, w: pin.w });
        return;
      }
      const drift = distOf(ix, j.to, loc);
      if (drift == null || Math.abs(drift) <= 3) {
        j.to = loc;
        if (!j.silent) setJump({ ...j }); // hold: toast tracks where you are
        return;
      }
      // Moved AGAIN to somewhere new — a fresh jump, always re-alerts even
      // if the last one was X'd or auto-dismissed.
      jumpRef.current = { to: loc, expected: j.expected, at: Date.now() };
      setJump(jumpRef.current);
      markDiversion(loc);
      ding3();
      qtPost({ type: "correction-act", action: "continue" }); // release a stale issue — else detection freezes
      return;
    }
    const d = distOf(ix, anchor, loc);
    if (d == null) return;
    // Went BACK — re-reading from anywhere earlier is fine, always silent.
    if (d < 0) { anchorRef.current = loc; return; }
    if (d <= 3) { anchorRef.current = loc; return; } // routine advance
    // Forward inside the 3-page window (prev→current→next): not a jump —
    // you SKIPPED ayahs. Mark the gap yellow, pin your last-good spot.
    const pa = pageOf(anchor), pl = pageOf(loc);
    if (pa >= 0 && pl >= 0 && pl - pa <= 2) {
      markSkippedBetween(anchor, loc);
      setPin(pinWord(anchor)); // the last word you read good — blue underline
      anchorRef.current = loc;
      setStatus(`Skipped ahead — the missed ayahs are marked yellow`);
      return;
    }
    // Outside the buffer — a real jump. Except: if the landing is a known
    // mutashabih (look-alike) of the anchor, the engine was likely lured
    // there by shared wording — flag it yellow so you can confirm it was a
    // slip, on top of the usual jump question.
    const muta = mutaRef.current;
    if (muta?.get(keyOf(anchor))?.has(keyOf(loc))) {
      const k = `${keyOf(loc)}:0`;
      if (!suspectsRef.current.has(k)) {
        const next = new Map(suspectsRef.current);
        next.set(k, "similar_verse");
        suspectsRef.current = next;
        setSuspects(next);
        sessionFlagsRef.current.add(k);
      }
    }
    // "follow" lets the anchor drift; "hold" pins it at `anchor` AND pulls
    // the tracker back — in hold there is no relocation, only a flagged
    // move. The cursor stays on the pin until "Continue here".
    if (anchorModeRef.current === "follow") anchorRef.current = loc;
    else qtPost({ type: "reanchor", s: anchor.s, a: anchor.a, w: resumeWord(anchor).w });
    jumpRef.current = { to: loc, expected: anchor, at: Date.now() };
    setJump(jumpRef.current);
    setPin(pinWord(anchor)); // last word read correctly, underlined blue
    markDiversion(loc);
    ding3(); // ding-ding-ding — you moved
    void ayahSnippet(anchor.s, anchor.a).then((t) => qtOrb("alert", t));
    qtPost({ type: "correction-act", action: "continue" }); // release a stale issue — else detection freezes
  }
  /** Engine-space resume point for reanchor/track — 0-based word index,
   *  the word just before the last one heard good. */
  function resumeWord(l: Loc): { s: number; a: number; w: number } {
    const h = heardRef.current;
    const same = h.loc && h.loc.s === l.s && h.loc.a === l.a;
    return { s: l.s, a: l.a, w: same ? Math.max(0, h.max - 2) : 0 };
  }
  /** Display-space pin — 1-based wiN of the last word heard good. */
  function pinWord(l: Loc): { s: number; a: number; w: number } {
    const h = heardRef.current;
    const same = h.loc && h.loc.s === l.s && h.loc.a === l.a;
    return { s: l.s, a: l.a, w: same && h.max >= 1 ? h.max : 1 };
  }
  function pageOf(l: Loc): number {
    return ayahPagesRef.current?.[l.s]?.[l.a] ?? -1;
  }
  /** Every ayah strictly between `from` and `to` gets a yellow skipped
   *  suspect — tappable/confirmable like engine-raised flags. */
  function markSkippedBetween(from: Loc, to: Loc) {
    const ix = ixRef.current;
    if (!ix) return;
    const o0 = ix.ord.get(keyOf(from)) ?? -1;
    const o1 = ix.ord.get(keyOf(to)) ?? -1;
    if (o0 < 0 || o1 <= o0 + 1) return;
    const next = new Map(suspectsRef.current);
    let added = 0;
    for (const [k, ord] of ix.ord) {
      if (ord > o0 && ord < o1) {
        const key = `${k}:0`;
        if (!next.has(key)) { next.set(key, "possible_skipped_ayah"); sessionFlagsRef.current.add(key); added++; }
      }
    }
    if (!added) return;
    suspectsRef.current = next;
    setSuspects(next);
  }
  function markDiversion(l: Loc) {
    setDiversions((prev) => {
      const k = keyOf(l);
      if (prev.has(k)) return prev;
      const n = new Set(prev).add(k);
      try { sessionStorage.setItem("qt:diversions", JSON.stringify([...n])); } catch {}
      return n;
    });
  }
  function dismissJump() {
    jumpRef.current = null;
    setJump(null);
    setPin(null);
    qtOrb("ok", locLiveRef.current ? `${surahName(locLiveRef.current.s)} ${locLiveRef.current.s}:${locLiveRef.current.a}` : undefined);
    if (jumpChimeRef.current) { clearInterval(jumpChimeRef.current); jumpChimeRef.current = null; }
  }
  /** Close the toast but KEEP the pin — the bookmark and auto-resolve still
   *  work; a fresh jump re-alerts. */
  function silenceJump() {
    if (jumpRef.current) jumpRef.current.silent = true;
    setJump(null);
    if (jumpChimeRef.current) { clearInterval(jumpChimeRef.current); jumpChimeRef.current = null; }
  }

  /** Heard enough: ≥60% of the ayah's words (word_index is the furthest
   *  1-based position reached; total_words comes with every event). */
  function heardEnough(l: Loc | null, max: number, total: number): boolean {
    if (!l || total <= 0) return false;
    return max >= Math.max(1, Math.ceil(0.6 * total));
  }

  function noteHeard(s: number, a: number, word: number, total: number) {
    const h = heardRef.current;
    if (h.loc && (h.loc.s !== s || h.loc.a !== a)) {
      if (heardEnough(h.loc, h.max, h.total)) coverLoc(h.loc);
      h.loc = { s, a };
      h.max = 0;
      h.total = 0;
    } else if (!h.loc) h.loc = { s, a };
    h.max = Math.max(h.max, word);
    h.total = Math.max(h.total, total);
    // Touched = ≥30% of the ayah heard — counts toward "how much you read"
    // even when it didn't reach the 60% covered bar.
    if (h.loc && h.total > 0 && h.max >= Math.ceil(0.3 * h.total)) sessionTouchedRef.current.add(keyOf(h.loc));
  }
  function coverLoc(l: Loc) {
    sessionCovRef.current.add(keyOf(l));
    markCovered(covRef.current, l);
    setCovSnap(new Set(covRef.current));
    if (planRef.current?.missedPolicy === "recompute") refreshSpan();
    checkDay();
  }
  function checkDay() {
    if (spanDayRef.current && spanDayRef.current !== todayKey()) {
      refreshSpan();
      if (!isDayDone(todayKey())) setDayDone(false);
    }
    const p = planRef.current, span = spanRef.current;
    if (!p || !span.length || isDayDone(todayKey())) return; // fresh read — no stale closure
    const unresolved = [...suspectsRef.current.keys()].some((k) => {
      const [s, a] = k.split(":").map(Number);
      return inSpan({ s, a }, 0);
    });
    if (unresolved) return;
    if (coveredInSpan(span, covRef.current) >= span.length) {
      stampDay(todayKey(), span, true);
      setDayDone(true);
      // Advance the sequential cursor past the finished span.
      const ix = ixRef.current;
      if (ix) {
        const last = ix.ord.get(keyOf(span[span.length - 1])) ?? 0;
        const next = ix.list[last + 1];
        if (next) { const np = { ...p, cursor: next }; savePlan(np); setPlan(np); }
      }
      // Full khatma → grace credit (once per completed Quran).
      if (ix) maybeKhatma(covRef.current.size, ix.list.length);
      ding(660); setTimeout(() => ding(880), 180);
      setStatus("Today's portion complete ✓");
      refreshSpan();
    }
  }

  function ayahPage(s: number, a: number): number | null {
    return ayahPagesRef.current?.[String(s)]?.[String(a)] ?? null;
  }

  function goToAyah(s: number, a: number) {
    const p = ayahPage(s, a);
    if (p) setPage(p);
  }

  /** Arabic text of an ayah for the notification orb — the first words plus
   *  "…" for long ayahs, with the s:a ref appended. loadPage is cache-first,
   *  so this stays offline once the page's been seen (and the warm covers all). */
  async function ayahSnippet(s: number, a: number): Promise<string> {
    const fallback = `${surahName(s)} ${s}:${a}`;
    const p = ayahPagesRef.current?.[s]?.[a];
    if (!p) return fallback;
    try {
      const data = await loadPage(p);
      const words = (data?.lines ?? [])
        .flatMap((l) => l.words ?? [])
        .filter((w) => w.location.startsWith(`${s}:${a}:`))
        .map((w) => w.word);
      if (!words.length) return fallback;
      return `${words.slice(0, 8).join(" ")}${words.length > 8 ? "…" : ""}  ﴾${s}:${a}﴿`;
    } catch {
      return fallback;
    }
  }

  function surahName(s: number) {
    const m = surahMeta?.find((x) => x.s === s);
    return m ? `${m.name} · ${m.en ?? s}` : `سورة ${s}`;
  }


  async function install() {
    setDlError(null);
    setDl({ done: 0, total: ENGINE_ASSETS.reduce((s, a) => s + a.bytes, 0) });
    try {
      await downloadEngine((done, total) => setDl({ done, total }));
      setInstalled(true);
      setSetupOpen(false);
      warmQt();
      warmMushaf();
    } catch {
      setDlError("Download failed — check your connection and try again.");
    } finally {
      setDl(null);
    }
  }

  async function remove() {
    try {
      await teardownQt(); // stop mic + kill worker — releases the loaded model
      await wipeQuranTesterData(); // engine bucket + mushaf + fonts + QT idb/localStorage
      const gone = !(await engineInstalled());
      setInstalled(!gone);
      if (!gone) setMicError("Engine could not be fully removed — clear site data in browser settings.");
    } catch {
      setMicError("Remove failed — clear site data in browser settings.");
    }
  }

  async function startRecite() {
    setMicError(null);
    setMicDenied(false);
    setLoc(null);
    setWordIdx(null);
    locLiveRef.current = null;
    if (candTimerRef.current) { clearTimeout(candTimerRef.current); candTimerRef.current = null; }
    heardRef.current = { loc: null, max: 0, total: 0 };
    sessionCovRef.current = new Set();
    sessionFlagsRef.current = new Set();
    sessionConfirmRef.current = new Set();
    sessionTouchedRef.current = new Set();
    sessionStartRef.current = Date.now();
    setStatsSheet(null);
    // Flags belong to a session — last take's unresolved suspects must not
    // leak into this one's verify sheet while the counter restarts at 0.
    suspectsRef.current = new Map();
    setSuspects(new Map());
    setPending(null);
    lastIssueKeyRef.current = null;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    jumpRef.current = null;
    setJump(null);
    setPin(null);
    setDiversions(new Set());
    try { sessionStorage.removeItem("qt:diversions"); } catch {}
    anchorRef.current = null;
    setDayDone(isDayDone(todayKey()));
    refreshSpan();
    try {
      await startQt();
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "Failed to start the engine.");
    }
  }

  /** End-of-session stats — ayahs read, time spent, flags caught. Pops the
   *  stats sheet only when something was actually heard this session. */
  function maybeShowStats() {
    // Ayahs read = covered (≥60%) ∪ touched (≥30%) — a session where the
    // tracker struggled still reports what it heard instead of nothing.
    const ayahs = new Set([...sessionCovRef.current, ...sessionTouchedRef.current]).size;
    const flags = suspectsRef.current.size + sessionConfirmRef.current.size;
    const seconds = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000));
    // Only skip when the session genuinely never ran (instant stop).
    if (!sessionStartRef.current || (!ayahs && !flags && seconds < 5)) return;
    setStatsSheet({
      ayahs,
      seconds,
      // "Flags caught" = open suspects + mistakes confirmed this session —
      // dismissed/corrected flags don't count toward what was actually wrong.
      flags,
    });
  }

  async function stopRecite() {
    // Flush the last heard ayah before tearing down.
    const h = heardRef.current;
    if (h.loc && heardEnough(h.loc, h.max, h.total)) coverLoc(h.loc);
    heardRef.current = { loc: null, max: 0, total: 0 };
    dismissJump();
    const n = sessionCovRef.current.size;
    if (n > 0) setStatus(`Session saved — ${n} ayah${n === 1 ? "" : "s"} covered${isDayDone(todayKey()) ? " · today ✓" : ""}`);
    await stopQt();
    setWordIdx(null);
    maybeShowStats();
  }

  function onEngineEvent(ev: Record<string, unknown>) {
    if (ev.type === "ui-listen") {
      setListen(ev.state as ListenState);
      if (ev.state === "idle") {
        setLevel(0);
        // Session ended outside stopRecite (error, cross-tab) — still bank
        // the last heard ayah and kill any jump chime.
        const h = heardRef.current;
        if (h.loc && heardEnough(h.loc, h.max, h.total)) coverLoc(h.loc);
        heardRef.current = { loc: null, max: 0, total: 0 };
        dismissJump();
        setPending(null);
        lastIssueKeyRef.current = null;
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        // Session ended outside stopRecite — surface the same stats sheet.
        maybeShowStats();
      }
    } else if (ev.type === "ui-status") {
      setStatus(String(ev.message));
    } else if (ev.type === "ready") {
      // warmQt() also emits ready while idle — only flip to listening when
      // a mic session actually started (module state says warming/listening).
      if (qtState() === "idle") return;
      setListen("listening");
      setStatus("Finding your place — keep reciting");
      expectedSurahRef.current = 0;
      qtPost({ type: "expect", passage: null }); // free locate — recite from anywhere
    } else if (ev.type === "ui-mic-denied") {
      setMicDenied(true);
      setMicError(String(ev.message));
    } else if (ev.type === "ui-level") {
      setLevel(ev.value as number);
    } else if (ev.type === "ui-error") {
      setMicError(String(ev.message));
    } else if (ev.type === "audio-gap") {
      // Worker dropped a burst of audio to stay real-time — tracking already
      // resumed from the live edge; just say so instead of silently drifting.
      setStatus(`Audio gap — skipped ${Math.round((ev.seconds as number) * 1000)} ms to keep up`);
    } else if (ev.type === "lost") {
      preambleGraceRef.current = Date.now();
      if (candTimerRef.current) { clearTimeout(candTimerRef.current); candTimerRef.current = null; }
      setStatus("Lost you — keep going, or tap the page to re-anchor");
    } else if (ev.type === "verse_match" || ev.type === "relocated" || ev.type === "verse_candidate") {
      const c = (ev.candidates as { surah: number; ayah: number }[] | undefined)?.[0] ?? ev;
      const s = c.surah as number, a = c.ayah as number;
      if (typeof s !== "number" || typeof a !== "number") return;
      // Hold mode with an open jump: the tracker keeps wandering while you
      // recite elsewhere — don't let the page chase it. The pin stays put
      // until the jump resolves.
      if (anchorModeRef.current === "hold" && jumpRef.current) {
        locLiveRef.current = { s, a };
        if (ev.type !== "verse_candidate") classifyJump({ s, a });
        return;
      }
      // First lock (or a re-lock after `lost`) gets the wave — the ayah
      // flashes word-by-word and the location chip drops in.
      if (!locLiveRef.current) {
        setLockFx({ s, a, n: Date.now() });
        if (lockFxTimer.current) clearTimeout(lockFxTimer.current);
        lockFxTimer.current = setTimeout(() => setLockFx(null), 1900);
      }
      locLiveRef.current = { s, a };
      setLoc({ surah: s, ayah: a });
      setStatus(`Found you — ${String(ev.surah_name ?? "")} ${s}:${a}`);
      goToAyah(s, a);
      if (ev.type === "verse_candidate") {
        // Unstable discovery lock — a single weak search hit can teleport
        // the tracker to a false hit (the phantom Surah-Qaf jumps). Let the
        // display follow it, but only treat it as a real move if the lock
        // is still standing ~1.2s later; a confirmed match, a newer
        // candidate, or `lost` cancels it.
        if (candTimerRef.current) clearTimeout(candTimerRef.current);
        candTimerRef.current = setTimeout(() => {
          candTimerRef.current = null;
          const live = locLiveRef.current;
          if (live && live.s === s && Math.abs(live.a - a) <= 2) {
            expectSurah(s);
            classifyJump({ s, a });
          }
        }, 1200);
      } else {
        if (candTimerRef.current) { clearTimeout(candTimerRef.current); candTimerRef.current = null; }
        expectSurah(s); // anchor ayah-order checks to wherever you actually are
        classifyJump({ s, a }); // sounds only on first locate / off-track jumps
      }
    } else if (ev.type === "debug" || ev.type === "raw_transcript") {
      // While validating: surface what the engine decoded so a silent
      // session is visible instead of just spinning.
      const t = String(ev.text ?? ev.event ?? ev.message ?? "");
      if (t) setStatus(t.slice(0, 80));
    } else if (ev.type === "word_progress") {
      const s = ev.surah as number, a = ev.ayah as number;
      locLiveRef.current = { s, a };
      // Hold mode with an open jump: the engine keeps decoding wherever you
      // wandered to, but the tracker must NOT chase it — the pin marks the
      // held spot until you resolve. Hearing words back near the pin IS the
      // resolution: dismiss and hand control back to the normal path.
      const j = jumpRef.current;
      if (anchorModeRef.current === "hold" && j) {
        const back = ixRef.current ? distOf(ixRef.current, j.expected, { s, a }) : null;
        if (back != null && Math.abs(back) <= 3) {
          dismissJump();
          anchorRef.current = { s, a };
        } else {
          noteHeard(s, a, ev.word_index as number, ev.total_words as number);
          return;
        }
      }
      setLoc({ surah: s, ayah: a });
      expectSurah(s); // smooth crossings into the next surah never fire relocate
      // Engine word_index is 0-BASED; the mushaf location ("s:a:w") is
      // 1-BASED. Normalize at the boundary — before this, the highlight lagged
      // one word and flags landed on the word before the real mistake.
      const wDisp = (ev.word_index as number) + 1;
      setWordIdx(wDisp);
      noteHeard(s, a, wDisp, ev.total_words as number);
      // Resumed from the blue-underlined word — the resume marker's job is
      // done, clear it.
      if (pinRef.current && pinRef.current.s === s && pinRef.current.a === a) setPin(null);
      const p = ayahPage(s, a);
      if (p && p !== pageRef.current) setPage(p);
    } else if (ev.type === "correction" || ev.type === "correction_note") {
      const e = ev as { state?: { phase?: string; outcome?: string | null; issue?: { surah: number; ayah: number; word: number; kind: string } }; issue?: { surah: number; ayah: number; word: number; kind: string } };
      // A clean re-read resolved the flagged word — clear its yellow. Match
      // the outcome's own issue: lastIssueKeyRef can point at a DIFFERENT
      // flag raised after the one that was actually corrected.
      if (e.state?.outcome === "corrected") {
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        const iss = e.state?.issue;
        const k = iss && typeof iss.surah === "number"
          ? `${iss.surah}:${iss.ayah}:${iss.kind === "possible_skipped_ayah" || iss.kind === "unclear_ayah" ? 0 : iss.word + 1}`
          : lastIssueKeyRef.current;
        if (k) {
          suspectsRef.current.delete(k);
          setSuspects((prev) => { const n = new Map(prev); n.delete(k); return n; });
          lastIssueKeyRef.current = null;
          qtOrb("ok", locLiveRef.current ? `${surahName(locLiveRef.current.s)} ${locLiveRef.current.s}:${locLiveRef.current.a}` : undefined);
          checkDay();
        }
        setPending(null);
        setStatus("Corrected — nice");
        setPleased(true);
        setTimeout(() => setPleased(false), 3200);
        return;
      }
      const i = e.state?.issue ?? e.issue;
      if (i && typeof i.surah === "number") {
        const ayahLevel = i.kind === "possible_skipped_ayah" || i.kind === "unclear_ayah";
        // +1: engine word is 0-based, display/DB space is 1-based.
        const skey = `${i.surah}:${i.ayah}:${ayahLevel ? 0 : i.word + 1}`;
        // Settle noise: finishing a surah can raise skipped/unclear on an
        // ayah you JUST read. If it's covered, release the controller and
        // move on — retrying here is what paused every surah ending.
        if (covRef.current.has(`${i.surah}:${i.ayah}`)) {
          qtPost({ type: "correction-act", action: "continue" });
          return;
        }
        // The engine re-emits the same issue — only tone on a NEW suspect.
        if (!suspectsRef.current.has(skey)) {
          suspectsRef.current.set(skey, i.kind); // inline — checkDay can't wait for render
          ding(330, 0.06, 0.25); // low soft tone — a new suspect, not a chime
          void ayahSnippet(i.surah, i.ayah).then((t) => qtOrb("alert", t));
          setSuspects((prev) => new Map(prev).set(skey, i.kind));
        }
        sessionFlagsRef.current.add(skey);
        if (ev.type === "correction") {
          lastIssueKeyRef.current = skey;
          if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
          if (ayahLevel) {
            // Ayah-level flags can't be re-read word-for-word — release the
            // controller but still open the banner for confirm/dismiss.
            qtPost({ type: "correction-act", action: "continue" });
          } else {
            // Pause-for-retry: a clean re-read auto-clears; an un-acted
            // issue freezes all further detection — while `retrying`, the
            // whole tracker is paused. Give the re-read ~8s; if the flag is
            // still open, defer it back to tracking so detection resumes.
            qtPost({ type: "correction-act", action: "retry" });
            const key = skey;
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              if (suspectsRef.current.has(key))
                qtPost({ type: "correction-act", action: "review_later" });
            }, 8000);
          }
          setPending({ s: i.surah, a: i.ayah, w: ayahLevel ? 0 : (i.word ?? -1) + 1, kind: i.kind });
        }
      }
    }
  }

  // Point the subscription's stable callback at the latest handler — kept
  // textually after onEngineEvent so the binding is already declared.
  useEffect(() => { handlerRef.current = onEngineEvent; });

  /** Adjacent words in one ayah are ONE mistake — group "s:a:w" entries
   *  into contiguous runs so two neighbouring marks show as a single row,
   *  not two separate mistakes. Kinds stay separate (a peek never merges
   *  into a flagged mistake). */
  function groupRuns<T extends { s: number; a: number; w: number; kind: string }>(items: T[]) {
    const byKey = new Map<string, T[]>();
    for (const it of items) {
      const k = `${it.s}:${it.a}:${it.kind}`;
      const arr = byKey.get(k) ?? [];
      arr.push(it);
      byKey.set(k, arr);
    }
    const runs: { s: number; a: number; kind: string; items: T[] }[] = [];
    for (const list of byKey.values()) {
      list.sort((x, y) => x.w - y.w);
      let run: T[] = [];
      for (const it of list) {
        if (run.length && it.w !== run[run.length - 1].w + 1 && !(it.w === 0 || run[0].w === 0)) {
          runs.push({ s: run[0].s, a: run[0].a, kind: run[0].kind, items: run });
          run = [];
        }
        run.push(it);
      }
      if (run.length) runs.push({ s: run[0].s, a: run[0].a, kind: run[0].kind, items: run });
    }
    return runs.sort((x, y) => x.s - y.s || x.a - y.a || x.items[0].w - y.items[0].w);
  }

  /** "word 4" / "words 3–5" / "whole ayah" for a run. */
  function runLabel(items: { w: number }[]) {
    const ws = items.map((i) => i.w);
    if (ws.includes(0)) return "whole ayah";
    return ws.length > 1 ? `words ${ws[0]}–${ws[ws.length - 1]}` : `word ${ws[0]}`;
  }

  const issueLabel = (kind: string) =>
    ({
      possible_omission: "possible missed word",
      possible_substitution: "possible wrong word",
      possible_vowel: "possible vowel slip",
      possible_repetition: "possible repetition",
      possible_skipped_ayah: "skipped ayah",
      similar_verse: "look-alike verse",
      unclear_ayah: "unclear ayah",
      manual: "marked mistake",
      diversion: "jumped here",
    })[kind] ?? "possible mistake";

  function onWordTap(s: number, a: number, w: number) {
    const key = `${s}:${a}:${w}`;
    const kind = suspects.get(key);
    if (kind) { setPending({ s, a, w, kind }); return; }
    // A diversion-marked ayah (jumped here this session) can be confirmed
    // into a real red mistake on tap — keep the tapped word, not w:0, or the
    // whole ayah goes red instead of the word you meant.
    if (diversions.has(`${s}:${a}`)) setPending({ s, a, w, kind: "diversion" });
  }

  /** Confirm/dismiss for BOTH the live banner and the verify sheet — same
   *  action on an explicit spot instead of whatever `pending` points at. */
  async function confirmSpot(spot: { s: number; a: number; w: number; kind: string }) {
    const m: Omit<Mistake, "id"> = { surah: spot.s, ayah: spot.a, word: spot.w, kind: spot.kind, confirmedAt: nowMs() };
    await saveMistake(m).catch(() => {});
    const key = `${m.surah}:${m.ayah}:${m.word}`;
    sessionConfirmRef.current.add(key);
    setConfirmed((prev) => new Map(prev).set(key, { ...m }));
    suspectsRef.current.delete(key);
    setSuspects((prev) => { const n = new Map(prev); n.delete(key); return n; });
    if (pending && pending.s === spot.s && pending.a === spot.a && (pending.w === spot.w || pending.w === 0 || spot.w === 0)) {
      qtPost({ type: "correction-act", action: "continue" });
      setPending(null);
    }
    checkDay();
  }

  async function dismissSpot(spot: { s: number; a: number; w: number }) {
    const key = `${spot.s}:${spot.a}:${spot.w}`;
    suspectsRef.current.delete(key);
    setSuspects((prev) => { const n = new Map(prev); n.delete(key); return n; });
    if (pending && pending.s === spot.s && pending.a === spot.a && (pending.w === spot.w || pending.w === 0 || spot.w === 0)) {
      qtPost({ type: "correction-act", action: "dismiss" });
      setPending(null);
    }
    checkDay();
  }

  const confirmMistake = () => pending && void confirmSpot(pending);
  const dismissMistake = () => pending && void dismissSpot(pending);

  /** Double-tap a word = mark it a confirmed mistake (red). Double-tap a
   *  confirmed word again = unmark. Consecutive marked words read as one
   *  joined highlight — a word-gap in between is a separate mistake. */
  async function markManual(s: number, a: number, w: number) {
    const key = `${s}:${a}:${w}`;
    const existing = confirmed.get(key);
    if (existing) { void deleteMistake(existing); return; }
    const kind = suspects.get(key);
    if (kind) { void confirmSpot({ s, a, w, kind }); return; }
    const m: Omit<Mistake, "id"> = { surah: s, ayah: a, word: w, kind: "manual", confirmedAt: nowMs() };
    await saveMistake(m).catch(() => {});
    sessionConfirmRef.current.add(key);
    setConfirmed((prev) => new Map(prev).set(key, { ...m }));
    sessionFlagsRef.current.add(key);
    checkDay();
  }

  // ── Page swipe (mushaf turns right→left: swipe left = next page) ──
  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { x0: e.clientX, active: true };
    setSnapping(false);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragRef.current.active) setDragX(e.clientX - dragRef.current.x0);
  }
  function onPointerUp() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const dx = dragX;
    setDragX(0);
    if (dx < -60 && page < PAGE_COUNT) commitTurn(-1);
    else if (dx > 60 && page > 1) commitTurn(1);
    else setSnapping(true); // snap back to centre
  }

  function commitTurn(dir: 1 | -1) {
    setTurn(dir);
    // transitionend isn't guaranteed (hidden tab, interrupted render) —
    // commit on a timeout too so a turn can never stick mid-flight.
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => {
      setPage((p) => Math.min(PAGE_COUNT, Math.max(1, p - dir)));
      setTurn(0);
      setSnapping(false);
    }, 380);
  }

  function onStripTransitionEnd() {
    if (turn !== 0) {
      if (turnTimer.current) clearTimeout(turnTimer.current);
      setPage((p) => Math.min(PAGE_COUNT, Math.max(1, p - turn)));
      setTurn(0);
    }
    setSnapping(false);
  }

  const listening = listen !== "idle";

  const hintCountRef = useRef<{ ayah: string; n: number }>({ ayah: "", n: 0 });

  function peek() {
    // Escalating hint, per ayah: 1st press shows the next word, 2nd the next
    // two, 3rd the next three, 4th the rest of the ayah. Revealed words are
    // logged as peeks — weak spots worth reviewing later.
    if (!loc) return;
    const data = pages.get(pageRef.current);
    if (!data) return;
    const ayahKey = `${loc.surah}:${loc.ayah}`;
    if (hintCountRef.current.ayah !== ayahKey) hintCountRef.current = { ayah: ayahKey, n: 0 };
    const n = ++hintCountRef.current.n;
    const want = n >= 4 ? Infinity : n;
    const batch: number[] = [];
    for (const line of data.lines) {
      for (const w of line.words ?? []) {
        const [s, a, wiN] = w.location.split(":").map(Number);
        if (s !== loc.surah || a !== loc.ayah) continue;
        const key = `${s}:${a}:${wiN}`;
        const heard = wordIdx !== null && wiN <= wordIdx;
        if (!heard && !revealed.has(key) && batch.length < want) batch.push(wiN);
      }
    }
    if (!batch.length) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      for (const wiN of batch) next.add(`${loc.surah}:${loc.ayah}:${wiN}`);
      return next;
    });
    for (const wiN of batch)
      void saveMistake({ surah: loc.surah, ayah: loc.ayah, word: wiN, kind: "peek", confirmedAt: nowMs() }).catch(() => {});
  }

  async function deleteMistake(m: Mistake) {
    // Always delete by position — rows confirmed this session carry no id,
    // so an id-only delete would clear the map and resurrect on reload.
    await removeMistakeAt(m.surah, m.ayah, m.word).catch(() => {});
    const key = `${m.surah}:${m.ayah}:${m.word}`;
    setConfirmed((prev) => { const n = new Map(prev); n.delete(key); return n; });
  }

  // Marked words sit in a `gap-x-1` row — every box-shadow underline stops
  // at the word's edge and the line reads as broken. Stretch each marked
  // box 4px into the following gap so consecutive marks join continuously.
  const bridge = { paddingRight: 4, marginRight: -4 } as const;

  function wordMark(s: number, a: number, w: number) {
    // First-lock wave — staggered flash across the ayah that just resolved.
    if (lockFx && lockFx.s === s && lockFx.a === a)
      return { animation: "qt-word-lock 1.5s cubic-bezier(.22,1,.36,1) both", animationDelay: `${Math.min(w, 14) * 55}ms` } as const;
    const key = `${s}:${a}:${w}`;
    const ayahFlag = `${s}:${a}:0`;
    if (confirmed.has(key) || confirmed.has(ayahFlag))
      return { ...bridge, backgroundColor: "color-mix(in oklab, #b34a3a 22%, transparent)", boxShadow: "inset 0 -2px 0 #b34a3a" } as const;
    if (suspects.has(key) || suspects.has(ayahFlag))
      return { ...bridge, backgroundColor: "color-mix(in oklab, #c9a227 25%, transparent)", boxShadow: "inset 0 -2px 0 #c9a227" } as const;
    if (jump && jump.to.s === s && jump.to.a === a)
      return { ...bridge, backgroundColor: "color-mix(in oklab, #d9762b 25%, transparent)", boxShadow: "inset 0 -2px 0 #d9762b" } as const;
    if (diversions.has(`${s}:${a}`))
      return { ...bridge, backgroundColor: "color-mix(in oklab, #c9a227 20%, transparent)" } as const; // jumped here this session
    if (jump && jump.expected.s === s && jump.expected.a === a)
      return { ...bridge, boxShadow: "inset 0 -3px 0 var(--color-accent)" } as const; // the pinned bookmark
    if (pin && pin.s === s && pin.a === a && w === pin.w)
      return { ...bridge, boxShadow: "inset 0 -3px 0 #3b82f6" } as const; // last word read right — blue underline
    if (loc && loc.surah === s && loc.ayah === a) {
      if (wordIdx === w)
        return { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" } as const;
      if (wordIdx !== null && w < wordIdx)
        return { color: "var(--color-accent)" } as const;
    }
    return undefined;
  }

  function renderPage(p: number, interactive: boolean) {
    const data = pages.get(p);
    const fontReady = fonts.has(p);
    if (!data) {
      // Adjacent strip slots render blank paper until loaded — a "Loading"
      // label mid-swipe is exactly the flicker that broke the page-turn feel.
      if (!interactive) return <div className="h-full" />;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          {failedPages.has(p) ? (
            <>
              <p className="text-xs" style={{ color: "#b34a3a" }}>Page failed to load.</p>
              <button
                onClick={() => {
                  setFailedPages((prev) => { const n = new Set(prev); n.delete(p); return n; });
                  setPages((prev) => { const n = new Map(prev); n.delete(p); return n; });
                }}
                className="rounded-full border px-4 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
              >
                Retry
              </button>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading page…</p>
          )}
        </div>
      );
    }
    // Sparse pages (Fatiha is 8 lines) and lines that end a surah are
    // centered in the real Madani mushaf — never stretched edge-to-edge.
    const sparse = data.lines.length < 15;
    return (
      <div className="flex h-full flex-col px-3 py-3 sm:px-5 lg:px-9 lg:py-5" dir="rtl">
        {data.lines.map((line, li) => {
          const nextType = data.lines[li + 1]?.type;
          const endOfSurah = nextType === "surah-header" || nextType === "basmala";
          if (line.type === "surah-header") {
            return (
              <div
                key={li}
                className="flex flex-1 items-center justify-center rounded-full border"
                style={{ borderColor: "var(--color-accent-faint)", backgroundColor: "var(--color-paper-2)" }}
              >
                <p className="text-base font-bold" style={{ color: "var(--color-accent)", fontFamily: "var(--font-arabic, serif)" }}>
                  {line.text}
                </p>
              </div>
            );
          }
          if (line.type === "basmala") {
            const bsml = (line as { qpcV2?: string }).qpcV2;
            return (
              <p
                key={li}
                className="flex flex-1 items-center justify-center text-center text-xl leading-none"
                style={{
                  color: "var(--color-ink)",
                  // The ﭑﭒﭓ glyph codepoints only exist in QPC2BSML — page
                  // fonts don't contain them (rendered "Alif Ba Ba" before).
                  fontFamily: bsmlReady && bsml ? "QPC2BSML" : "var(--font-arabic, serif)",
                }}
              >
                {bsmlReady && bsml ? bsml : "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"}
              </p>
            );
          }
          const centered = sparse || endOfSurah;
          return (
            <div key={li} className={`flex flex-1 flex-nowrap items-center overflow-hidden ${centered ? "justify-center" : "justify-between"} gap-x-1 lg:gap-x-3`}>
              {(line.words ?? []).map((w, wi) => {
                const [s, a, wiN] = w.location.split(":").map(Number);
                const key = `${s}:${a}:${wiN}`;
                const isSuspect = suspects.has(key) || suspects.has(`${s}:${a}:0`);
                const isConfirmed = confirmed.has(key) || confirmed.has(`${s}:${a}:0`);
                const heard = loc && loc.surah === s && loc.ayah === a && wordIdx !== null && wiN <= wordIdx;
                // Cumulative reveal: an ayah once covered stays visible on
                // every page you scroll back to — only unrecited words hide.
                const coveredAyah = covSnap.has(`${s}:${a}`);
                const hidden = memorize && !coveredAyah && !heard && !revealed.has(key);
                return (
                  <span
                    key={wi}
                    data-loc={w.location}
                    // Double-tap marks the word a confirmed mistake (red);
                    // preventDefault kills the browser's select-the-word
                    // gesture — the "Google search" bar that popped up.
                    onDoubleClick={(e) => { e.preventDefault(); void markManual(s, a, wiN); }}
                    onClick={isSuspect || isConfirmed || diversions.has(`${s}:${a}`) ? () => onWordTap(s, a, wiN) : undefined}
                    onContextMenu={(e) => e.preventDefault()}
                    // shrink-0: a shrunken word box lets the glyph overflow
                    // onto its neighbour — that's the text-on-end-marker
                    // overlap. Lines must fit honestly instead.
                    className={`shrink-0 select-none rounded px-px transition-colors duration-150${isSuspect || isConfirmed ? " cursor-pointer" : ""}`}
                    style={{
                      ...(fontReady && w.qpcV2 ? { fontFamily: `QPC2-p${p}` } : { fontFamily: "var(--font-arabic, serif)" }),
                      // Scale by whichever axis is tighter — vw alone left
                      // the text tiny inside short/wide desktop viewports.
                      fontSize: "clamp(0.9rem, min(3.9vw, 6dvh), 2rem)",
                      lineHeight: 1,
                      color: hidden ? "transparent" : "var(--color-ink)",
                      ...(hidden
                        ? { backgroundColor: "color-mix(in oklab, var(--color-ink) 10%, transparent)" }
                        : wordMark(s, a, wiN)),
                    }}
                  >
                    {fontReady && w.qpcV2 ? w.qpcV2 : w.word}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    // Full-bleed under the bottom nav — the mushaf fills the whole screen
    // top to bottom (mobile nav is translucent over it).
    <div
      className="flex flex-col lg:h-dvh"
      style={{
        backgroundColor: "var(--color-paper)",
        height: "calc(100dvh - 49px - env(safe-area-inset-top))",
      }}
    >
      {/* Toolbar — icon-only, one row, no title */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 pt-2 sm:px-6">
        <Link
          href="/calendar/day"
          className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 34, minWidth: 34 }}
          aria-label="Home"
        >
          <Home className="h-4.5 w-4.5" />
        </Link>
        {/* View mode — the mushaf book that follows you, or the listener
            figure that watches. Top-level so it never hides in settings. */}
        <div
          className="flex items-center rounded-full border p-0.5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          role="tablist" aria-label="View mode"
        >
          {([["mushaf", BookOpen, "Mushaf"], ["listener", User2, "Listener"]] as const).map(([m, Ic, label]) => (
            <button
              key={m}
              role="tab" aria-selected={viewMode === m} aria-label={`${label} view`}
              onClick={() => setViewMode(m)}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                minHeight: 26, minWidth: 30,
                backgroundColor: viewMode === m ? "var(--color-paper)" : "transparent",
                color: viewMode === m ? "var(--color-ink)" : "var(--color-ink-muted)",
                boxShadow: viewMode === m ? "0 1px 3px color-mix(in oklab, var(--color-ink) 18%, transparent)" : "none",
              }}
            >
              <Ic className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        {installed === false && (
          <button
            onClick={() => setSetupOpen(true)}
            className="relative flex items-center justify-center rounded-full font-bold transition-transform active:scale-95"
            style={{
              minHeight: 32, minWidth: 32,
              backgroundColor: "color-mix(in oklab, #c9a227 18%, transparent)",
              color: "#c9a227",
              border: "1.5px solid color-mix(in oklab, #c9a227 45%, transparent)",
              fontSize: 14,
            }}
            aria-label="Engine not downloaded — open setup"
          >
            !
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#c9a227" }} />
          </button>
        )}
        {/* Jump bar removed — the surah/juz picker (rightmost chip) covers
            navigation without the text box compressing the mushaf. */}
        <div className="flex-1" />
        <button
          onClick={() => setReviewOpen(true)}
          className="relative flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 34, minWidth: 34 }}
          aria-label="Review mistakes"
        >
          <ListChecks className="h-4.5 w-4.5" />
          {confirmed.size > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
              style={{ backgroundColor: "#b34a3a", color: "var(--color-paper)" }}
            >
              {confirmed.size}
            </span>
          )}
        </button>
        {!online && (
          <span
            className="flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
            title="Offline — recitation works fully; mistakes sync when you're back"
          >
            Offline
          </span>
        )}
        <button
          onClick={() => setPlanOpen(true)}
          className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 34, minWidth: 34 }}
          aria-label="Settings"
        >
          <Settings className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={() => {
            setPickerOpen(true);
            if (!surahMeta)
              loadSurahMeta().then(setSurahMeta).catch(() => {});
          }}
          className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
          aria-label="Open surah and juz picker"
        >
          {page} / {PAGE_COUNT}
        </button>
      </div>

      {/* Goal progress chip — only while a plan is active */}
      {plan && spanSnap.length > 0 && (
        <div className="mx-auto mt-1.5 flex w-full max-w-3xl items-center gap-2 px-3 sm:px-6">
          <button
            onClick={() => setPlanOpen(true)}
            className="ml-auto flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
            aria-label="Goal settings"
          >
            <span className="shrink-0">{dayDone ? "✓ Today" : "Today"}</span>
            {!dayDone && (
              <span className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--color-ink-muted)" }}>
                <span className="truncate text-[9px] tabular-nums">
                  {spanText} {Math.round((coveredInSpan(spanSnap, covSnap) / spanSnap.length) * 100)}%
                </span>
                <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <span
                    className="block h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.round((coveredInSpan(spanSnap, covSnap) / spanSnap.length) * 100)}%`,
                      backgroundColor: "var(--color-accent)",
                    }}
                  />
                </span>
              </span>
            )}
          </button>
        </div>
      )}

      {/* Jump toast — full-width off-track alert; stays until you act.
          In hold mode X hides it but the pin survives (the bookmark). */}
      {jump && (
        <div className="fixed inset-x-3 top-16 z-40">
          <div
            className="w-full rounded-2xl border p-3 shadow-lg"
            style={{ borderColor: "color-mix(in oklab, #d9762b 50%, transparent)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.18s ease-out" }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: "#d9762b" }}>
                  You moved to {surahName(jump.to.s)} {jump.to.s}:{jump.to.a}
                </p>
                <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  {anchorMode === "hold" ? "Pinned at " : "Expected "}
                  {surahName(jump.expected.s)} {jump.expected.s}:{jump.expected.a}
                  {anchorMode === "hold" ? " — underlined on the page" : ""}
                </p>
              </div>
              <button onClick={silenceJump} className="shrink-0 p-1" aria-label="Dismiss jump alert">
                <X className="h-3.5 w-3.5" style={{ color: "var(--color-ink-muted)" }} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                onClick={() => { anchorRef.current = jump.to; qtPost({ type: "reanchor", s: jump.to.s, a: jump.to.a, w: 0 }); dismissJump(); }}
                className="flex-1 rounded-full px-2 py-1.5 text-xs font-bold"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
                title="Accept the new location as your expected track"
              >
                Continue here
              </button>
              <button
                onClick={() => { goToAyah(jump.expected.s, jump.expected.a); silenceJump(); }}
                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                title="Take me back to the pinned ayah"
              >
                Go to pin
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-3 sm:px-6">
        {/* Engine not installed — the page still browses; recite needs setup */}
        {installed === false && (
          <button
            onClick={() => setSetupOpen(true)}
            className="mt-2 flex w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-left transition-colors"
            style={{ borderColor: "color-mix(in oklab, #c9a227 35%, transparent)", backgroundColor: "color-mix(in oklab, #c9a227 8%, transparent)" }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
                Recitation engine not downloaded
              </span>
              <span className="block text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                Tap to set up — ~72MB, once, fully offline after.
              </span>
            </span>
          </button>
        )}

        {/* Live status */}
        {listening && (
          <div
            className="mt-2 flex items-center gap-2.5 rounded-full border px-3.5 py-1.5"
            style={{ borderColor: "var(--color-accent-faint)", backgroundColor: "var(--color-paper-2)" }}
          >
            <span className="flex h-3.5 items-end gap-[2px]">
              {[0.35, 0.6, 1, 0.8, 0.5, 0.9, 0.4].map((f, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full transition-[height] duration-100"
                  style={{
                    height: `${Math.max(15, level * f * 100)}%`,
                    backgroundColor: level > 0.03 ? "var(--color-accent)" : "var(--color-ink-muted)",
                  }}
                />
              ))}
            </span>
            <p className="truncate text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
              {status ?? "Listening…"}
            </p>
            {loc && (
              <p
                key={lockFx?.n ?? "loc"}
                className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums"
                style={{
                  color: "var(--color-ink-muted)",
                  fontFamily: "var(--font-arabic, serif)",
                  ...(lockFx ? { animation: "qt-lock-in 0.55s cubic-bezier(.22,1,.36,1) both" } : {}),
                }}
              >
                {(() => {
                  const meta = surahMeta?.find((m) => m.s === loc.surah);
                  return `${meta?.name ?? `سورة ${loc.surah}`}${meta?.en ? ` · ${meta.en}` : ""}`;
                })()}
                <span className="font-sans"> · p. {page}</span>
              </p>
            )}
          </div>
        )}
        {/* Engine errors surface via the global toast — inline text here
            pushed the mushaf layout. */}

        {/* Mushaf page — swipe. On desktop it becomes a centered portrait
            card at the real mushaf page ratio, with an inner double frame.
            In listener mode the whole card swaps for the watching figure. */}
        {viewMode === "listener" ? (
          <ListenerView
            loc={loc}
            wordIdx={wordIdx}
            level={level}
            alert={!!pending || (!!jump && !jump.silent)}
            pleased={pleased}
            pages={pages}
            ayahPages={ayahPages}
            suspects={suspects}
            pin={pin}
            surahName={surahName}
            listening={listen === "listening"}
          />
        ) : (
        <div
          className="qt-mushaf relative mt-2 min-h-0 flex-1 touch-manipulation select-none overflow-hidden rounded-lg border"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper-2)",
            boxShadow: "inset 0 0 0 6px var(--color-paper-2), inset 0 0 0 7px var(--color-paper-3), inset 0 0 0 12px var(--color-paper-2)",
            WebkitTouchCallout: "none",
          } as React.CSSProperties}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <div
            className="relative h-full w-full"
            onTransitionEnd={onStripTransitionEnd}
            style={{
              transform: turn !== 0 ? `translateX(${turn * 100}%)` : `translateX(${dragX}px)`,
              transition: turn !== 0 || snapping ? "transform 0.32s cubic-bezier(0.3, 0.9, 0.35, 1)" : "none",
              willChange: "transform",
            }}
          >
            {/* prev page waits off the left edge — swiping right pulls it in */}
            {page > 1 && (
              <div className="absolute inset-0" style={{ transform: "translateX(-100%)" }}>
                {renderPage(page - 1, false)}
              </div>
            )}
            <div className="absolute inset-0">{renderPage(page, true)}</div>
            {/* next page waits off the right edge — a left swipe drags it in,
                so the page sliding in is always the page commitTurn lands on */}
            {page < PAGE_COUNT && (
              <div className="absolute inset-0" style={{ transform: "translateX(100%)" }}>
                {renderPage(page + 1, false)}
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Mistake confirm bar */}
      {planOpen && (
        <PlanSheet
          plan={plan}
          loc={loc}
          anchorMode={anchorMode}
          onAnchorMode={(m) => {
            setAnchorMode(m);
            // Hold needs a visible pin the moment it's chosen — "doesn't
            // label it" was this: the bookmark only appeared after a jump.
            // Switching to hold pins where you ARE right now.
            if (m === "hold" && loc) {
              anchorRef.current = { s: loc.surah, a: loc.ayah };
              setPin(pinWord(anchorRef.current));
              setStatus(`Holding at ${surahName(loc.surah)} ${loc.surah}:${loc.ayah} — the blue underline is your pin`);
            } else if (m === "follow") {
              setPin(null);
            }
          }}
          onClose={() => setPlanOpen(false)}
          onSave={(p) => { savePlan(p); setPlan(p); setPlanOpen(false); setDayDone(isDayDone(todayKey())); }}
        />
      )}

      {pending && (
        <div
          className="qt-confirm-bar fixed inset-x-0 z-40 flex justify-center px-4"
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-4 shadow-lg"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.18s ease-out" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {issueLabel(pending.kind)} — {pending.s}:{pending.a}, word {pending.w}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Re-read the ayah cleanly and this clears itself. Only confirmed mistakes are saved.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void confirmMistake()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "#b34a3a", color: "var(--color-paper)" }}
              >
                <Check className="h-4 w-4" /> Confirm
              </button>
              <button
                onClick={() => void dismissMistake()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
              >
                <X className="h-4 w-4" /> Not a mistake
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End-of-session stats — what you read, how long, flags caught.
          "Review flags" opens the verify sheet underneath it. */}
      {statsSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
          onClick={() => setStatsSheet(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border p-6 sm:rounded-3xl"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Session
            </p>
            <div className="mt-3 flex items-baseline gap-8">
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums" style={{ color: "var(--color-ink)" }}>
                  {statsSheet.ayahs}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  ayah{statsSheet.ayahs === 1 ? "" : "s"} read
                </p>
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums" style={{ color: "var(--color-ink)" }}>
                  {statsSheet.seconds >= 60 ? `${Math.floor(statsSheet.seconds / 60)}m ${statsSheet.seconds % 60}s` : `${statsSheet.seconds}s`}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  reciting
                </p>
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums" style={{ color: statsSheet.flags ? "#c9a227" : "var(--color-ink)" }}>
                  {statsSheet.flags}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  flag{statsSheet.flags === 1 ? "" : "s"} caught
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              {statsSheet.flags > 0 ? (
                <button
                  onClick={() => { setStatsSheet(null); setVerifyOpen(true); }}
                  className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                >
                  Review flags
                </button>
              ) : null}
              <button
                onClick={() => setStatsSheet(null)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80 ${statsSheet.flags ? "border" : "flex-1"}`}
                style={statsSheet.flags ? { borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" } : { backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify sheet — every open flag this session, grouped into single
          mistakes where marked words sit adjacent. Confirm = red, dismiss
          = gone; either way the flag resolves. */}
      {verifyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
          onClick={() => setVerifyOpen(false)}
        >
          <div
            className="max-h-[70dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--color-ink)" }}>Verify flags</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Adjacent flagged words show as one mistake. Confirm what was really wrong — the rest dismisses.
            </p>
            {suspects.size === 0 ? (
              <p className="mt-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
                All clear — nothing left to verify.
              </p>
            ) : (
              <div className="mt-3">
                {groupRuns([...suspects.entries()].map(([key, kind]) => {
                  const [s, a, w] = key.split(":").map(Number);
                  return { s, a, w, kind };
                })).map((run) => {
                  const { s, a } = run;
                  return (
                    <div
                      key={`${s}:${a}:${run.items[0].w}-${run.items[run.items.length - 1].w}:${run.kind}`}
                      className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                      style={{ borderColor: "var(--color-paper-3)" }}
                    >
                      <button
                        onClick={() => { goToAyah(s, a); setVerifyOpen(false); }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                          {surahName(s)} {s}:{a} · {runLabel(run.items)}
                        </p>
                        <p className="text-[11px]" style={{ color: "#c9a227" }}>{issueLabel(run.kind)}</p>
                      </button>
                      <button
                        onClick={() => { for (const it of run.items) void confirmSpot({ s: it.s, a: it.a, w: it.w, kind: it.kind }); }}
                        className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-opacity hover:opacity-80"
                        style={{ backgroundColor: "#b34a3a", color: "var(--color-paper)" }}
                        aria-label={`Confirm mistake at ${s}:${a} ${runLabel(run.items)}`}
                      >
                        <Check className="h-3 w-3" /> Confirm
                      </button>
                      <button
                        onClick={() => { for (const it of run.items) void dismissSpot({ s: it.s, a: it.a, w: it.w }); }}
                        className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                        style={{ color: "var(--color-ink-muted)" }}
                        aria-label={`Dismiss flag at ${s}:${a} ${runLabel(run.items)}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {suspects.size > 0 && (
              <button
                onClick={() => { for (const [key, kind] of [...suspects.entries()]) { const [s, a, w] = key.split(":").map(Number); void confirmSpot({ s, a, w, kind }); } }}
                className="mt-4 w-full rounded-full border px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ borderColor: "#b34a3a", color: "#b34a3a" }}
              >
                Confirm all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Engine setup modal */}
      {setupOpen && installed === false && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => !dl && setSetupOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border p-6"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
                One-time setup
              </p>
              {!dl && (
                <button
                  onClick={() => setSetupOpen(false)}
                  className="rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-muted)" }}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-lg font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
              Download the recitation engine
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              ~72MB, downloaded once. Your voice is processed entirely on this
              device — audio never leaves your phone, works fully offline.
            </p>
            {dl ? (
              <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${pct(dl)}%`, backgroundColor: "var(--color-accent)" }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {(dl.done / 1e6).toFixed(1)} / {(dl.total / 1e6).toFixed(0)} MB — {pct(dl)}%
                </p>
              </div>
            ) : (
              <button
                onClick={() => void install()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                <Download className="h-4 w-4" /> Download engine
              </button>
            )}
            {dlError && (
              <p className="mt-3 text-xs font-medium" style={{ color: "#b34a3a" }}>{dlError}</p>
            )}
            <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Automatic recitation feedback can be wrong — it never replaces a
              qualified teacher. Confirmed mistakes only are saved, and only on
              this device.
            </p>
          </div>
        </div>
      )}

      {/* Surah / Juz picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="flex max-h-[70dvh] w-full max-w-lg flex-col rounded-t-3xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            {/* Surah / Juz toggle */}
            <div
              className="mx-auto flex rounded-full border p-1"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
            >
              {(["surah", "juz"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPickerMode(m)}
                  className="rounded-full px-6 py-1.5 text-xs font-bold capitalize transition-colors"
                  style={
                    pickerMode === m
                      ? { backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }
                      : { color: "var(--color-ink-muted)" }
                  }
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {pickerMode === "surah" ? (
                surahMeta ? (
                  surahMeta.map((s) => (
                    <button
                      key={s.s}
                      onClick={() => { setPage(s.page); setPickerOpen(false); }}
                      className="flex w-full items-center gap-3 border-b px-2 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[var(--color-paper-2)]"
                      style={{ borderColor: "var(--color-paper-3)" }}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
                        style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                      >
                        {s.s}
                      </span>
                      <span className="flex-1 text-base font-semibold" style={{ color: "var(--color-ink)", fontFamily: "var(--font-arabic, serif)" }}>
                        {s.name}
                      </span>
                      {s.en && <span className="shrink-0 text-[11px]" style={{ color: "var(--color-ink-soft)" }}>{s.en}</span>}
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>p. {s.page}</span>
                    </button>
                  ))
                ) : (
                  <p className="py-8 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
                )
              ) : (
                <div className="grid grid-cols-5 gap-2 pb-2 pt-1">
                  {JUZ_PAGES.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => { setPage(p); setPickerOpen(false); }}
                      className="rounded-2xl border py-3 text-center transition-colors hover:bg-[var(--color-paper-2)]"
                      style={{ borderColor: "var(--color-paper-3)" }}
                    >
                      <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{i + 1}</span>
                      <span className="block text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>p. {p}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mic help modal */}
      {micHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
          onClick={() => setMicHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border p-6"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: "color-mix(in oklab, #b34a3a 12%, transparent)", color: "#b34a3a" }}
              >
                <MicOff className="h-5 w-5" />
              </div>
              <button
                onClick={() => setMicHelp(false)}
                className="rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)" }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-lg font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {micError ?? "Microphone access is blocked"}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Quran Tester only listens while you recite — audio never leaves
              this device. To allow it:
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              <li>Tap the lock/site icon in your browser&rsquo;s address bar.</li>
              <li>Set <strong>Microphone</strong> to <strong>Allow</strong>.</li>
              <li>Come back and try again.</li>
            </ol>
            <button
              onClick={() => { setMicHelp(false); void startRecite(); }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              <Mic className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      )}

      {/* Mistake review sheet */}
      {reviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
          onClick={() => setReviewOpen(false)}
        >
          <div
            className="max-h-[70dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.2s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--color-ink)" }}>Review</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Confirmed mistakes and peeked words — your weak spots.
            </p>
            {confirmed.size === 0 ? (
              <p className="mt-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
                Nothing yet. Recite — mistakes you confirm land here.
              </p>
            ) : (
              <div className="mt-3">
                {groupRuns([...confirmed.values()].map((m) => ({ s: m.surah, a: m.ayah, w: m.word, kind: m.kind, m }))).map((run) => (
                  <div
                    key={`${run.s}:${run.a}:${run.items[0].w}-${run.items[run.items.length - 1].w}:${run.kind}`}
                    className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                    style={{ borderColor: "var(--color-paper-3)" }}
                  >
                    <button
                      onClick={() => { goToAyah(run.s, run.a); setReviewOpen(false); }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {surahName(run.s)} {run.s}:{run.a} · {runLabel(run.items)}
                      </p>
                      <p className="text-[11px]" style={{ color: run.kind === "peek" ? "var(--color-accent)" : "#b34a3a" }}>
                        {run.kind === "peek" ? "peeked" : issueLabel(run.kind)}
                      </p>
                    </button>
                    <button
                      onClick={() => { for (const it of run.items) void deleteMistake(it.m); }}
                      className="rounded-full p-2 transition-colors hover:bg-[var(--color-paper-2)]"
                      style={{ color: "var(--color-ink-muted)" }}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {installed && (
              <div className="mt-4 rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
                <div className="flex items-center gap-2">
                  <HardDriveDownload className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                  <p className="flex-1 text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
                    Recitation engine · {Math.round(ENGINE_ASSETS.reduce((s, a) => s + a.bytes, 0) / 1e6)}MB
                  </p>
                  <button
                    onClick={() => {
                      setStorageInfo((v) => !v);
                      navigator.storage?.estimate?.().then((e) => setStorageBytes(e.usage ?? null)).catch(() => {});
                    }}
                    className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)" }}
                    aria-label="Where is the engine stored?"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { setReviewOpen(false); void remove(); }}
                    className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "#b34a3a" }}
                    aria-label="Remove recitation engine"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {storageInfo && (
                  <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--color-ink-muted)" }}>
                    Lives in this browser&apos;s site data — Cache Storage bucket
                    <span className="font-mono"> quran-tester-engine-v1</span>
                    {storageBytes !== null && <> — this app is currently using ~{Math.round(storageBytes / 1e6)}MB of device storage</>}.
                    It&apos;s not a filesystem folder — mobile browsers isolate site
                    storage, which is also why your storage settings don&apos;t
                    itemize it. The trash button wipes it fully (mic off,
                    worker killed, bucket + local copies deleted).
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recite controls — mic bottom-left, small; pause + hide-words in a
          right-side cluster so nothing sits near the mic while reciting. */}
      {installed && (
        <div className="qt-recite-bar">
          <div className="qt-side">
            {listening && (
              <button
                onClick={() => setMemorize((m) => !m)}
                className="flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-transform active:scale-90"
                style={
                  memorize
                    ? { borderColor: "var(--color-accent)", backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
                    : { borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-muted)" }
                }
                aria-label={memorize ? "Show words" : "Hide words until recited"}
              >
                {memorize ? <EyeOff className="h-4 w-4" /> : <BookOpenCheck className="h-4 w-4" />}
              </button>
            )}
            {listening && memorize && (
              <button
                onClick={peek}
                disabled={!loc}
                className="flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-transform active:scale-90 disabled:opacity-40"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-soft)" }}
                aria-label="Hint — reveal the next word(s)"
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            {(listen === "listening" || listen === "paused") && (
              <button
                onClick={() => (listen === "paused" ? void resumeQt() : void pauseQt())}
                className="flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-transform active:scale-90"
                style={{
                  borderColor: listen === "paused" ? "#c9a227" : "var(--color-paper-3)",
                  backgroundColor: "var(--color-paper)",
                  color: listen === "paused" ? "#c9a227" : "var(--color-ink-soft)",
                }}
                aria-label={listen === "paused" ? "Resume reciting" : "Pause reciting"}
              >
                {listen === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
            )}
          </div>
          <button
            onClick={() => (listening ? void stopRecite() : micDenied ? setMicHelp(true) : void startRecite())}
            className="qt-mic-fab relative flex items-center justify-center rounded-full transition-transform active:scale-90"
            style={{
              backgroundColor: listen === "listening" ? "var(--color-accent)" : listen === "paused" ? "#c9a227" : micDenied ? "#b34a3a" : "var(--color-ink)",
              color: "var(--color-paper)",
              boxShadow: "0 6px 20px color-mix(in oklab, var(--color-ink) 28%, transparent)",
              border: "2.5px solid var(--color-paper)",
            }}
            aria-label={listening ? "Stop reciting" : "Start reciting"}
          >
            {listen === "warming" && (
              <span className="absolute -inset-1 animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--color-ink)", animationDuration: "1.1s" }} />
            )}
            {listen === "listening" && (
              <span className="absolute -inset-1 animate-ping rounded-full opacity-30" style={{ backgroundColor: "var(--color-accent)", animationDuration: "1.8s" }} />
            )}
            {listen === "listening" ? (
              <Square className="h-4.5 w-4.5" fill="currentColor" />
            ) : listen === "warming" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : micDenied ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function pct(dl: { done: number; total: number }) {
  return Math.round((dl.done / dl.total) * 100);
}

/* ── Goal settings sheet ── */
function PlanSheet({
  plan, loc, anchorMode, onAnchorMode, onClose, onSave,
}: {
  plan: Plan | null;
  loc: { surah: number; ayah: number } | null;
  anchorMode: "follow" | "hold";
  onAnchorMode: (m: "follow" | "hold") => void;
  onClose: () => void;
  onSave: (p: Plan | null) => void;
}) {
  const [kind, setKind] = useState<Plan["kind"]>(plan?.kind ?? "daily");
  const [amount, setAmount] = useState(plan?.amount ?? 2);
  const [unit, setUnit] = useState<Plan["unit"]>(plan?.unit ?? "juz");
  const [deadline, setDeadline] = useState(plan?.deadline ?? "");
  const [missedPolicy, setMissedPolicy] = useState<Plan["missedPolicy"]>(plan?.missedPolicy ?? "roll");
  const [reminders, setReminders] = useState<Plan["reminders"]>(plan?.reminders ?? "off");
  const [startSA, setStartSA] = useState(`${plan?.start.s ?? 1}:${plan?.start.a ?? 1}`);
  const [goalOn, setGoalOn] = useState(plan != null);
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);

  const row = "flex items-center justify-between gap-3 py-2";
  const label = "text-xs font-semibold";
  const input = "rounded-lg border px-2.5 py-1.5 text-sm outline-none";

  function save() {
    if (!goalOn) return onSave(null); // goal toggled off — just settings
    const m = startSA.match(/^(\d{1,3}):(\d{1,3})$/);
    if (!m) return;
    const start = { s: Math.min(114, +m[1]), a: Math.max(1, +m[2]) };
    // A moved start resets the cursor — otherwise the plan silently resumes
    // from the old position.
    const cursor = plan && plan.start.s === start.s && plan.start.a === start.a ? plan.cursor : start;
    onSave({
      enabled: true,
      kind,
      amount: Math.max(1, Math.min(30, amount)),
      unit,
      deadline: kind === "khatma" && deadline ? deadline : undefined,
      start,
      cursor,
      missedPolicy,
      reminders,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-3xl border p-5 sm:rounded-3xl"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.18s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>Settings</p>
          <button onClick={onClose} className="p-1" aria-label="Close settings">
            <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          </button>
        </div>

        {/* Mushaf layout — 15-line Madani is the only edition built so far;
            13/16 show a disclaimer instead of pretending to switch. */}
        <div className={row}>
          <span className={label} style={{ color: "var(--color-ink)" }}>Mushaf</span>
          <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--color-paper-3)" }}>
            {(["15-line", "13-line", "16-line"] as const).map((l) => (
              <button
                key={l}
                onClick={() => l === "15-line" ? setLayoutMsg(null) : setLayoutMsg(`The ${l} mushaf isn't built yet — only the 15-line Madani is available right now.`)}
                className="rounded-full px-3 py-1 text-[10px] font-semibold"
                style={l === "15-line" ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" } : { color: "var(--color-ink-muted)" }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {layoutMsg && (
          <p className="-mt-1 pb-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{layoutMsg}</p>
        )}

        <div className={row}>
          <span className={label} style={{ color: "var(--color-ink)" }}>Tracking</span>
          <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--color-paper-3)" }} role="radiogroup" aria-label="Tracking mode">
            {(["hold", "follow"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onAnchorMode(m)}
                role="radio" aria-checked={anchorMode === m}
                className="rounded-full px-3 py-1 text-[10px] font-semibold transition-colors"
                style={anchorMode === m ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" } : { color: "var(--color-ink-muted)" }}
              >
                {m === "hold" ? "Hold to passage" : "Follow me"}
              </button>
            ))}
          </div>
        </div>
        <p className="-mt-1 pb-1 text-[10px] leading-snug" style={{ color: "var(--color-ink-muted)" }}>
          {anchorMode === "hold"
            ? "If you switch passages, the app keeps your place pinned and alerts you until you recite back or tap “Continue here” — strict testing, no silent wandering."
            : "The app follows wherever you recite. Switching passages chimes once, then that spot becomes your new track."}
        </p>

        <div className={row}>
          <span className={label} style={{ color: "var(--color-ink)" }}>Set a goal</span>
          <button
            onClick={() => setGoalOn((g) => !g)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
            style={{ backgroundColor: goalOn ? "var(--color-accent)" : "var(--color-paper-3)" }}
            aria-label="Toggle recitation goal"
            aria-pressed={goalOn}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
              style={{ left: goalOn ? "18px" : "2px" }}
            />
          </button>
        </div>

        {goalOn && (<>
          <div className={row}>
            <span className={label} style={{ color: "var(--color-ink)" }}>Plan type</span>
            <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--color-paper-3)" }}>
              {(["daily", "khatma"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold capitalize"
                  style={kind === k ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" } : { color: "var(--color-ink-muted)" }}
                >
                  {k === "daily" ? "Daily amount" : "Khatma"}
                </button>
              ))}
            </div>
          </div>

          {kind === "daily" ? (
            <div className={row}>
              <span className={label} style={{ color: "var(--color-ink)" }}>Amount per day</span>
              <span className="flex items-center gap-2">
                <input
                  type="number" min={1} max={30} value={amount}
                  onChange={(e) => setAmount(+e.target.value)}
                  className={input + " w-16 text-center"}
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "var(--color-paper-2)" }}
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Plan["unit"])}
                  className={input}
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "var(--color-paper-2)" }}
                >
                  <option value="juz">juz</option>
                  <option value="page">pages</option>
                  <option value="ayah">ayahs</option>
                </select>
              </span>
            </div>
          ) : (
            <div className={row}>
              <span className={label} style={{ color: "var(--color-ink)" }}>Finish by</span>
              <input
                type="date" value={deadline} min={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => setDeadline(e.target.value)}
                className={input}
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "var(--color-paper-2)" }}
              />
            </div>
          )}

          <div className={row}>
            <span className={label} style={{ color: "var(--color-ink)" }}>Start at</span>
            <span className="flex items-center gap-2">
              <input
                value={startSA}
                onChange={(e) => setStartSA(e.target.value)}
                placeholder="2:142"
                className={input + " w-20 text-center"}
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "var(--color-paper-2)" }}
              />
              {loc && (
                <button
                  onClick={() => setStartSA(`${loc.surah}:${loc.ayah}`)}
                  className="rounded-full border px-2 py-1 text-[10px] font-semibold"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)" }}
                >
                  Use current
                </button>
              )}
            </span>
          </div>

          <div className={row}>
            <span className={label} style={{ color: "var(--color-ink)" }}>Missed days</span>
            <select
              value={missedPolicy}
              onChange={(e) => setMissedPolicy(e.target.value as Plan["missedPolicy"])}
              className={input}
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "var(--color-paper-2)" }}
            >
              <option value="roll">Roll forward</option>
              <option value="recompute">Recompute deadline</option>
              <option value="debt">Debt list</option>
            </select>
          </div>

          <div className={row}>
            <span className={label} style={{ color: "var(--color-ink)" }}>Reminders</span>
            <select
              value={reminders}
              onChange={(e) => setReminders(e.target.value as Plan["reminders"])}
              className={input}
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", backgroundColor: "var(--color-paper-2)" }}
            >
              <option value="off">Off</option>
              <option value="daily">Daily push</option>
              <option value="streak">Streak guard</option>
            </select>
          </div>

          <p className="text-[10px] pt-1" style={{ color: "var(--color-ink-muted)" }}>
            The listener tracks the assigned portion; extra recitation still counts toward your khatma.
          </p>
        </>)}

        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            disabled={goalOn && kind === "khatma" && !deadline}
            className="ml-auto rounded-full px-5 py-2 text-xs font-bold disabled:opacity-40"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Listener mode ────────────────────────────────────────────────────────
// The alternative surface: someone visibly listening. A figure that idles
// with a slow sway while it hears you, flushes red the moment a flag pops,
// and beneath it the ayah before/now/after — the current one stays centered
// and auto-scrolls as you move through the text.
function ListenerView({
  loc, wordIdx, level, alert, pleased, pages, ayahPages, suspects, pin, surahName, listening,
}: {
  loc: { surah: number; ayah: number } | null;
  wordIdx: number | null;
  level: number;
  alert: boolean;
  pleased: boolean;
  pages: Map<number, MushafPage>;
  ayahPages: AyahPages | null;
  suspects: Map<string, string>;
  pin: { s: number; a: number; w: number } | null;
  surahName: (s: number) => string;
  listening: boolean;
}) {
  const curRef = useRef<HTMLDivElement | null>(null);

  // Keep the current ayah centered — same follow behavior as the mushaf.
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [loc?.surah, loc?.ayah]);

  // Words for one ayah, pulled out of the already-loaded mushaf pages.
  // Returns null while the page hasn't been fetched yet.
  function wordsOf(s: number, a: number) {
    const p = ayahPages?.[s]?.[a];
    if (!p) return null;
    const pg = pages.get(p);
    if (!pg) return null;
    return pg.lines
      .flatMap((l) => l.words ?? [])
      .filter((w) => w.location.startsWith(`${s}:${a}:`));
  }

  const neighbors: { s: number; a: number; role: "prev" | "now" | "next" }[] = [];
  if (loc) {
    const ap = ayahPages?.[loc.surah];
    const nums = ap ? Object.keys(ap).map(Number).sort((x, y) => x - y) : [];
    const i = nums.indexOf(loc.ayah);
    if (i > 0) neighbors.push({ s: loc.surah, a: nums[i - 1], role: "prev" });
    neighbors.push({ s: loc.surah, a: loc.ayah, role: "now" });
    if (i >= 0 && i < nums.length - 1) neighbors.push({ s: loc.surah, a: nums[i + 1], role: "next" });
  }

  const aura = alert ? "#b34a3a" : "var(--color-accent)";

  return (
    <div
      className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
      style={{
        borderColor: "var(--color-paper-3)",
        backgroundColor: "var(--color-paper-2)",
        boxShadow: "inset 0 0 0 6px var(--color-paper-2), inset 0 0 0 7px var(--color-paper-3), inset 0 0 0 12px var(--color-paper-2)",
      }}
    >
      {/* The listener — a face that breathes while it hears you and burns
          red on a flag. Aura stays tight so it never covers the ayah. */}
      <div className="relative mx-auto mt-6 flex h-20 w-20 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: `color-mix(in oklab, ${aura} ${alert ? 30 : 10 + Math.round(level * 14)}%, transparent)`,
            transform: `scale(${listening ? 1.03 + level * 0.11 : 1})`,
            transition: "transform 0.25s ease-out, background-color 0.3s",
            animation: alert ? "qt-listener-pulse 0.7s ease-in-out infinite alternate" : undefined,
          }}
        />
        <span
          className="relative flex h-16 w-16 items-center justify-center rounded-full border"
          style={{
            borderColor: `color-mix(in oklab, ${aura} 45%, transparent)`,
            backgroundColor: "var(--color-paper)",
            animation: listening ? "qt-listener-sway 3.2s ease-in-out infinite" : "none",
            transition: "border-color 0.3s",
          }}
        >
          {/* brows — angled inward on a flag (angry), arched soft when pleased */}
          <span className="absolute top-[19px] flex w-[30px] justify-between">
            <span
              className="block h-[2px] w-2.5 rounded-full"
              style={{
                backgroundColor: alert ? "#b34a3a" : "var(--color-ink-muted)",
                transform: alert ? "rotate(16deg)" : pleased ? "rotate(-8deg) translateY(-1px)" : "none",
                opacity: alert || pleased ? 1 : 0.55,
                transition: "transform 0.2s, background-color 0.3s, opacity 0.3s",
              }}
            />
            <span
              className="block h-[2px] w-2.5 rounded-full"
              style={{
                backgroundColor: alert ? "#b34a3a" : "var(--color-ink-muted)",
                transform: alert ? "rotate(-16deg)" : pleased ? "rotate(8deg) translateY(-1px)" : "none",
                opacity: alert || pleased ? 1 : 0.55,
                transition: "transform 0.2s, background-color 0.3s, opacity 0.3s",
              }}
            />
          </span>
          {/* eyes — blink on a slow cycle; narrow on a flag; sleepy when off */}
          <span className="flex gap-3.5">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="block h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: alert ? "#b34a3a" : "var(--color-ink)",
                  transform: alert ? "scaleY(0.45)" : !listening ? "scaleY(0.5)" : "none",
                  animation: listening && !alert ? "qt-listener-blink 4.6s ease-in-out infinite" : "none",
                  animationDelay: `${i * 0.04}s`,
                  transition: "transform 0.2s, background-color 0.3s",
                }}
              />
            ))}
          </span>
          {/* mouth — opens with mic level, flat when flagged, a soft smile
              for a beat after a corrected re-read, a thin line at rest */}
          {pleased ? (
            <span
              className="absolute bottom-4 block h-2.5 w-3.5 rounded-b-full border-b-2"
              style={{ borderColor: "var(--color-accent)", transition: "border-color 0.3s" }}
            />
          ) : (
            <span
              className="absolute bottom-4 block rounded-full"
              style={{
                width: 12,
                height: alert ? 1.5 : Math.max(1.5, level * 9),
                backgroundColor: alert ? "#b34a3a" : "var(--color-ink-muted)",
                transition: "height 0.15s ease-out, background-color 0.3s",
              }}
            />
          )}
        </span>
      </div>

      <p className="mt-2 shrink-0 text-center text-[10px] font-semibold" style={{ color: alert ? "#b34a3a" : pleased ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
        {!listening ? "The listener is off — start the mic" : alert ? "Something flagged — check the notice" : pleased ? "Nice — corrected" : loc ? `Listening — ${surahName(loc.surah)} ${loc.surah}:${loc.ayah}` : "Listening — recite anything"}
      </p>

      {/* Ayah strip — prev dimmed, current centered + marked, next dimmed.
          Words keep their verdict colors so slips are visible live. */}
      <div dir="rtl" className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth: "none" }}>
        {!loc && (
          <p className="pt-10 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Start reciting — the āyah you&rsquo;re on shows here.
          </p>
        )}
        {neighbors.map((n) => {
          const words = wordsOf(n.s, n.a);
          const isNow = n.role === "now";
          return (
            <div
              key={`${n.s}:${n.a}`}
              ref={isNow ? curRef : undefined}
              className="mx-auto max-w-md text-center"
              style={{
                padding: isNow ? "18px 12px" : "10px 12px",
                margin: isNow ? "6px 0" : "0",
                borderRadius: 14,
                backgroundColor: isNow ? "color-mix(in oklab, var(--color-accent) 7%, transparent)" : "transparent",
                opacity: isNow ? 1 : 0.38,
                fontFamily: "var(--font-arabic)",
                fontSize: isNow ? "clamp(1.15rem, 4.6vw, 1.7rem)" : "clamp(0.9rem, 3.4vw, 1.15rem)",
                lineHeight: 2.1,
                color: "var(--color-ink)",
                transition: "opacity 0.3s",
              }}
            >
              {words
                ? words.map((w) => {
                    const wi = parseInt(w.location.split(":")[2] ?? "0", 10);
                    const flagged = suspects.get(`${n.s}:${n.a}:${wi}`);
                    const isWord = isNow && wordIdx === wi;
                    const pinned = pin && pin.s === n.s && pin.a === n.a && pin.w === wi;
                    return (
                      <span
                        key={w.location}
                        style={{
                          color: flagged === "possible_omission" || flagged === "possible_substitution" ? "#b34a3a"
                            : flagged ? "#c9a227"
                            : undefined,
                          backgroundColor: isWord ? "color-mix(in oklab, var(--color-accent) 22%, transparent)" : undefined,
                          borderRadius: isWord ? 6 : undefined,
                          textDecoration: pinned ? "underline" : undefined,
                          textDecorationColor: pinned ? "var(--color-accent)" : undefined,
                          textUnderlineOffset: pinned ? 6 : undefined,
                        }}
                      >
                        {w.word}{" "}
                      </span>
                    );
                  })
                : <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-sans)", color: "var(--color-ink-muted)" }}>{n.s}:{n.a}</span>}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes qt-listener-sway {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(1.5px) rotate(1.4deg); }
          75% { transform: translateX(-1.5px) rotate(-1.4deg); }
        }
        @keyframes qt-listener-pulse {
          from { transform: scale(1.02); opacity: 0.7; }
          to { transform: scale(1.14); opacity: 1; }
        }
        @keyframes qt-listener-blink {
          0%, 46%, 50%, 100% { transform: scaleY(1); }
          48% { transform: scaleY(0.08); }
        }
      `}</style>
    </div>
  );
}

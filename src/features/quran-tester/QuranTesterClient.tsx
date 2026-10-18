"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Check, Download, Eye, EyeOff, FolderOpen, HardDriveDownload, ListChecks, Loader2, Mic, MicOff, Pause, Play, Search, Square, Trash2, X } from "lucide-react";
import { ENGINE_ASSETS, downloadEngine, engineInstalled, wipeQuranTesterData } from "./engine";
import { loadAyahPages, loadBasmalaFont, loadPage, loadPageFont, type AyahPages, type MushafPage } from "./mushaf";
import { removeMistake, saveMistake, syncMistakes, type Mistake } from "./mistakes";
import { pauseQt, qtPost, qtState, resumeQt, startQt, stopQt, subscribeQt, teardownQt } from "./session";

/**
 * Quran Tester — recite anywhere in the Quran; the app follows you on a real
 * 15-line mushaf and flags mistakes for confirmation. Fully on-device: the
 * recognition engine downloads once (~85MB) and audio never leaves the phone.
 *
 * Self-contained under src/features/quran-tester/ — extractable later.
 */

type ListenState = "idle" | "warming" | "listening" | "paused";
const PAGE_COUNT = 604;

let qtDingCtx: AudioContext | null = null;
function ding(freq = 760) {
  try {
    qtDingCtx ??= new AudioContext();
    const t = qtDingCtx.currentTime;
    const o = qtDingCtx.createOscillator();
    const g = qtDingCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(qtDingCtx.destination);
    o.start(t);
    o.stop(t + 0.4);
  } catch {}
}

/** Standard Madani mushaf juz → start page (604-page edition). */
const JUZ_PAGES = [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];

interface SurahMeta { s: number; name: string; page: number }

export default function QuranTesterClient() {
  const [ayahPages, setAyahPages] = useState<AyahPages | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<Map<number, MushafPage>>(new Map());
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const [fonts, setFonts] = useState<Set<number>>(new Set());
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
  const [pending, setPending] = useState<{ s: number; a: number; w: number; kind: string } | null>(null);

  // Memorize mode: words hide until recited past or peeked. Peeks are logged
  // so weak spots are reviewable — same idea as Tarteel's Verse Peeking.
  const [memorize, setMemorize] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"surah" | "juz">("surah");
  const [surahMeta, setSurahMeta] = useState<SurahMeta[] | null>(null);

  // Swipe — dragX tracks the finger; turn animates a committed page turn
  // (-1 = turn to next page/left, +1 = back/right). CSS transition does the
  // motion; transitionend commits the page change.
  const [dragX, setDragX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [turn, setTurn] = useState<0 | 1 | -1>(0);
  const turnTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const dragRef = useRef<{ x0: number; active: boolean }>({ x0: 0, active: false });

  const pageRef = useRef(page);
  pageRef.current = page;
  const handlerRef = useRef(onEngineEvent);
  handlerRef.current = onEngineEvent;
  const ayahPagesRef = useRef(ayahPages);
  ayahPagesRef.current = ayahPages;

  useEffect(() => {
    loadAyahPages().then(setAyahPages).catch(() => {});
    loadBasmalaFont().then(() => setBsmlReady(true)).catch(() => {});
    fetch("/data/surah-meta.json").then((r) => r.json()).then(setSurahMeta).catch(() => {});
    engineInstalled().then(setInstalled).catch(() => setInstalled(false));
    syncMistakes() // local first, then merges the server copy
      .then((ms) => setConfirmed(new Map(ms.map((m) => [`${m.surah}:${m.ayah}:${m.word}`, m]))))
      .catch(() => {});
    // Subscribe to the global session — navigating away keeps it alive;
    // this page just re-attaches to whatever state it's in.
    return subscribeQt((ev) => handlerRef.current(ev));
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

  // Keep the engine anchored to what's on screen while listening.
  useEffect(() => {
    if (listen !== "idle") expectForPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages, listen]);

  /** Anchor the engine to the ayah range on screen — it locks in seconds
   *  instead of searching all 6,236 ayahs. */
  function expectForPage(p: number) {
    const data = pages.get(p);
    if (!data) return;
    const bySurah = new Map<number, { min: number; max: number; words: number }>();
    for (const line of data.lines) {
      for (const w of line.words ?? []) {
        const [s, a] = w.location.split(":").map(Number);
        const e = bySurah.get(s) ?? { min: a, max: a, words: 0 };
        e.min = Math.min(e.min, a); e.max = Math.max(e.max, a); e.words++;
        bySurah.set(s, e);
      }
    }
    let best: { s: number; min: number; max: number } | null = null;
    for (const [s, e] of bySurah) if (!best || e.words > bySurah.get(best.s)!.words) best = { s, min: e.min, max: e.max };
    if (best) qtPost({ type: "expect", passage: { surah: best.s, ayah: best.min, ayahEnd: best.max } });
  }

  function ayahPage(s: number, a: number): number | null {
    return ayahPagesRef.current?.[String(s)]?.[String(a)] ?? null;
  }

  function goToAyah(s: number, a: number) {
    const p = ayahPage(s, a);
    if (p) setPage(p);
  }

  function onSearch(v: string) {
    setSearch(v);
    const m = v.trim().match(/^(\d{1,3})(?::(\d{1,3}))?$/); // "2" or "2:255" → jump
    if (m) {
      const s = Math.min(114, Math.max(1, parseInt(m[1], 10)));
      goToAyah(s, m[2] ? parseInt(m[2], 10) : 1);
    }
  }

  async function install() {
    setDlError(null);
    setDl({ done: 0, total: ENGINE_ASSETS.reduce((s, a) => s + a.bytes, 0) });
    try {
      await downloadEngine((done, total) => setDl({ done, total }));
      setInstalled(true);
      setSetupOpen(false);
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
    try {
      await startQt();
    } catch (err) {
      setMicError(err instanceof Error ? err.message : "Failed to start the engine.");
    }
  }

  async function stopRecite() {
    await stopQt();
    setStatus(null);
    setWordIdx(null);
  }

  function onEngineEvent(ev: Record<string, unknown>) {
    if (ev.type === "ui-listen") {
      setListen(ev.state as ListenState);
      if (ev.state === "idle") setLevel(0);
    } else if (ev.type === "ui-status") {
      setStatus(String(ev.message));
    } else if (ev.type === "ready") {
      setListen("listening");
      expectForPage(pageRef.current);
    } else if (ev.type === "ui-mic-denied") {
      setMicDenied(true);
      setMicError(String(ev.message));
    } else if (ev.type === "ui-level") {
      setLevel(ev.value as number);
    } else if (ev.type === "ui-error") {
      setMicError(String(ev.message));
    } else if (ev.type === "verse_match") {
      const s = ev.surah as number, a = ev.ayah as number;
      setLoc({ surah: s, ayah: a });
      setStatus(`Found you — ${String(ev.surah_name ?? "")} ${s}:${a}`);
      ding(760); // audible locate ping, even with the screen off-path
      goToAyah(s, a);
    } else if (ev.type === "debug" || ev.type === "raw_transcript") {
      // While validating: surface what the engine decoded so a silent
      // session is visible instead of just spinning.
      const t = String(ev.text ?? ev.event ?? ev.message ?? "");
      if (t) setStatus(t.slice(0, 80));
    } else if (ev.type === "word_progress") {
      const s = ev.surah as number, a = ev.ayah as number;
      setLoc({ surah: s, ayah: a });
      setWordIdx(ev.word_index as number);
      const p = ayahPage(s, a);
      if (p && p !== pageRef.current) setPage(p);
    } else if (ev.type === "correction" || ev.type === "correction_note") {
      const e = ev as { state?: { issue?: { surah: number; ayah: number; word: number; kind: string } }; issue?: { surah: number; ayah: number; word: number; kind: string } };
      const i = e.state?.issue ?? e.issue;
      if (i && typeof i.surah === "number") {
        const ayahLevel = i.kind === "possible_skipped_ayah" || i.kind === "unclear_ayah";
        setSuspects((prev) => {
          const next = new Map(prev);
          next.set(`${i.surah}:${i.ayah}:${ayahLevel ? 0 : i.word}`, i.kind);
          return next;
        });
      }
    }
  }

  const issueLabel = (kind: string) =>
    ({
      possible_omission: "possible missed word",
      possible_substitution: "possible wrong word",
      possible_vowel: "possible vowel slip",
      possible_repetition: "possible repetition",
      possible_skipped_ayah: "possible skipped ayah",
      unclear_ayah: "unclear ayah",
    })[kind] ?? "possible mistake";

  function onWordTap(s: number, a: number, w: number) {
    const key = `${s}:${a}:${w}`;
    const kind = suspects.get(key);
    if (kind) setPending({ s, a, w, kind });
  }

  async function confirmMistake() {
    if (!pending) return;
    const m: Omit<Mistake, "id"> = { surah: pending.s, ayah: pending.a, word: pending.w, kind: pending.kind, confirmedAt: Date.now() };
    await saveMistake(m).catch(() => {});
    const key = `${m.surah}:${m.ayah}:${m.word}`;
    setConfirmed((prev) => new Map(prev).set(key, { ...m }));
    setSuspects((prev) => { const n = new Map(prev); n.delete(key); return n; });
    qtPost({ type: "correction-act", action: "continue" });
    setPending(null);
  }

  async function dismissMistake() {
    if (!pending) return;
    const key = `${pending.s}:${pending.a}:${pending.w}`;
    setSuspects((prev) => { const n = new Map(prev); n.delete(key); return n; });
    qtPost({ type: "correction-act", action: "dismiss" });
    setPending(null);
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

  function peek() {
    // Reveal the next hidden word in the tracked ayah and log the peek —
    // peeked words are weak spots worth reviewing later.
    if (!loc) return;
    const data = pages.get(pageRef.current);
    if (!data) return;
    for (const line of data.lines) {
      for (const w of line.words ?? []) {
        const [s, a, wiN] = w.location.split(":").map(Number);
        if (s !== loc.surah || a !== loc.ayah) continue;
        const key = `${s}:${a}:${wiN}`;
        const heard = wordIdx !== null && wiN <= wordIdx;
        if (!heard && !revealed.has(key)) {
          setRevealed((prev) => new Set(prev).add(key));
          void saveMistake({ surah: s, ayah: a, word: wiN, kind: "peek", confirmedAt: Date.now() }).catch(() => {});
          return;
        }
      }
    }
  }

  async function deleteMistake(m: Mistake) {
    if (m.id) await removeMistake(m.id).catch(() => {});
    const key = `${m.surah}:${m.ayah}:${m.word}`;
    setConfirmed((prev) => { const n = new Map(prev); n.delete(key); return n; });
  }

  function wordMark(s: number, a: number, w: number) {
    const key = `${s}:${a}:${w}`;
    const ayahFlag = `${s}:${a}:0`;
    if (confirmed.has(key) || confirmed.has(ayahFlag))
      return { backgroundColor: "color-mix(in oklab, #b34a3a 22%, transparent)", boxShadow: "inset 0 -2px 0 #b34a3a" } as const;
    if (suspects.has(key) || suspects.has(ayahFlag))
      return { backgroundColor: "color-mix(in oklab, #c9a227 25%, transparent)", boxShadow: "inset 0 -2px 0 #c9a227" } as const;
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
                const hidden = memorize && !heard && !revealed.has(key);
                return (
                  <span
                    key={wi}
                    data-loc={w.location}
                    onClick={isSuspect || isConfirmed ? () => onWordTap(s, a, wiN) : undefined}
                    className={`rounded px-0.5 transition-colors duration-150${isSuspect || isConfirmed ? " cursor-pointer" : ""}`}
                    style={{
                      ...(fontReady && w.qpcV2 ? { fontFamily: `QPC2-p${p}` } : { fontFamily: "var(--font-arabic, serif)" }),
                      // Scale by whichever axis is tighter — vw alone left
                      // the text tiny inside short/wide desktop viewports.
                      fontSize: "clamp(0.95rem, min(4.2vw, 6.5dvh), 2.1rem)",
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
          aria-label="Back"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
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
        <div
          className="flex flex-1 items-center gap-2 rounded-full border px-3 py-1.5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Jump — 2:255"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-muted)]"
            style={{ color: "var(--color-ink)" }}
          />
        </div>
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
        <button
          onClick={() => {
            setPickerOpen(true);
            if (!surahMeta)
              fetch("/data/surah-meta.json").then((r) => r.json()).then(setSurahMeta).catch(() => {});
          }}
          className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
          aria-label="Open surah and juz picker"
        >
          {page} / {PAGE_COUNT}
        </button>
      </div>

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
              <p className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-arabic, serif)" }}>
                {surahMeta?.find((m) => m.s === loc.surah)?.name ?? `سورة ${loc.surah}`}
                <span className="font-sans"> · p. {page}</span>
              </p>
            )}
          </div>
        )}
        {/* Engine errors surface via the global toast — inline text here
            pushed the mushaf layout. */}

        {/* Mushaf page — swipe. On desktop it becomes a centered portrait
            card at the real mushaf page ratio, with an inner double frame. */}
        <div
          className="qt-mushaf relative mt-2 min-h-0 flex-1 touch-pan-y select-none overflow-hidden rounded-lg border"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper-2)",
            boxShadow: "inset 0 0 0 6px var(--color-paper-2), inset 0 0 0 7px var(--color-paper-3), inset 0 0 0 12px var(--color-paper-2)",
          }}
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
            {/* prev page (right side in RTL reading) */}
            {page > 1 && (
              <div className="absolute inset-0" style={{ transform: "translateX(100%)" }}>
                {renderPage(page - 1, false)}
              </div>
            )}
            <div className="absolute inset-0">{renderPage(page, true)}</div>
            {/* next page (left side — mushaf turns left) */}
            {page < PAGE_COUNT && (
              <div className="absolute inset-0" style={{ transform: "translateX(-100%)" }}>
                {renderPage(page + 1, false)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mistake confirm bar */}
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
              Only confirmed mistakes are saved.
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
                {[...confirmed.values()].map((m) => (
                  <div
                    key={`${m.surah}:${m.ayah}:${m.word}`}
                    className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                    style={{ borderColor: "var(--color-paper-3)" }}
                  >
                    <button
                      onClick={() => { goToAyah(m.surah, m.ayah); setReviewOpen(false); }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {m.surah}:{m.ayah} · word {m.word}
                      </p>
                      <p className="text-[11px]" style={{ color: m.kind === "peek" ? "var(--color-accent)" : "#b34a3a" }}>
                        {m.kind === "peek" ? "peeked" : issueLabel(m.kind)}
                      </p>
                    </button>
                    <button
                      onClick={() => void deleteMistake(m)}
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
                aria-label="Peek at the next word"
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

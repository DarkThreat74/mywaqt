"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, Mic, Search, Square, X } from "lucide-react";
import { ENGINE_ASSETS, downloadEngine, engineInstalled, uninstallEngine } from "./engine";
import { loadAyahPages, loadPage, loadPageFont, type AyahPages, type MushafPage } from "./mushaf";
import { listMistakes, saveMistake, type Mistake } from "./mistakes";

/**
 * Quran Tester — recite anywhere in the Quran; the app follows you on a real
 * 15-line mushaf and flags mistakes for confirmation. Fully on-device: the
 * recognition engine downloads once (~85MB) and audio never leaves the phone.
 *
 * Self-contained under src/features/quran-tester/ — extractable later.
 */

type ListenState = "idle" | "warming" | "listening";
const PAGE_COUNT = 604;

/** Inline AudioWorklet: posts mono Float32 frames to its port. */
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) { const c = ch.slice(0); this.port.postMessage(c, [c.buffer]); }
    return true;
  }
}
registerProcessor("qt-capture", Capture);
`;

export default function QuranTesterClient() {
  const [ayahPages, setAyahPages] = useState<AyahPages | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<Map<number, MushafPage>>(new Map());
  const [fonts, setFonts] = useState<Set<number>>(new Set());
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [listen, setListen] = useState<ListenState>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ surah: number; ayah: number } | null>(null);
  const [wordIdx, setWordIdx] = useState<number | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Mistake layer: engine-raised suspects render yellow; only a confirmed
  // suspect turns red and persists. Nothing else about recitation is stored.
  const [suspects, setSuspects] = useState<Map<string, string>>(new Map());
  const [confirmed, setConfirmed] = useState<Map<string, Mistake>>(new Map());
  const [pending, setPending] = useState<{ s: number; a: number; w: number; kind: string } | null>(null);

  // Swipe
  const [dragX, setDragX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const dragRef = useRef<{ x0: number; active: boolean }>({ x0: 0, active: false });

  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const ayahPagesRef = useRef(ayahPages);
  ayahPagesRef.current = ayahPages;

  useEffect(() => {
    loadAyahPages().then(setAyahPages).catch(() => {});
    engineInstalled().then(setInstalled).catch(() => setInstalled(false));
    listMistakes()
      .then((ms) => setConfirmed(new Map(ms.map((m) => [`${m.surah}:${m.ayah}:${m.word}`, m]))))
      .catch(() => {});
    return () => { void stopRecite(); };
  }, []);

  // Fetch page + font, keep a ±1 window warm
  useEffect(() => {
    const want = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= PAGE_COUNT);
    for (const p of want) {
      if (!pages.has(p)) {
        loadPage(p)
          .then((d) => setPages((prev) => new Map(prev).set(p, d)))
          .catch(() => {});
      }
      if (!fonts.has(p)) {
        loadPageFont(p)
          .then(() => setFonts((prev) => new Set(prev).add(p)))
          .catch(() => {});
      }
    }
  }, [page, pages, fonts]);

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
    } catch {
      setDlError("Download failed — check your connection and try again.");
    } finally {
      setDl(null);
    }
  }

  async function remove() {
    await stopRecite();
    await uninstallEngine();
    setInstalled(false);
  }

  async function startRecite() {
    setMicError(null);
    setLoc(null);
    setWordIdx(null);

    if (!workerRef.current) {
      const w = new Worker(new URL("./recite.worker.ts", import.meta.url));
      w.onmessage = (e) => onEngineEvent(e.data);
      w.onerror = (e) => {
        setMicError("Engine failed to start.");
        setListen("idle");
        e.preventDefault();
      };
      workerRef.current = w;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setMicError("Microphone access was denied.");
      return;
    }

    const ctx = new AudioContext();
    const workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "qt-capture");
    let buf = new Float32Array(0);
    node.port.onmessage = (e) => {
      const chunk: Float32Array = e.data;
      const merged = new Float32Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      buf = merged;
      if (buf.length >= ctx.sampleRate / 4) {
        workerRef.current?.postMessage({ type: "audio", samples: buf }, [buf.buffer]);
        buf = new Float32Array(0);
      }
    };
    src.connect(node);
    node.connect(ctx.destination);
    audioRef.current = { ctx, stream };

    setListen("warming");
    setStatus("Warming up the engine…");
    workerRef.current.postMessage({ type: "init", sampleRate: ctx.sampleRate });
  }

  async function stopRecite() {
    workerRef.current?.postMessage({ type: "stop" });
    const a = audioRef.current;
    if (a) {
      a.stream.getTracks().forEach((t) => t.stop());
      void a.ctx.close();
      audioRef.current = null;
    }
    setListen("idle");
    setStatus(null);
    setWordIdx(null);
  }

  function onEngineEvent(ev: Record<string, unknown>) {
    if (ev.type === "ready") {
      setListen("listening");
      setStatus("Listening — recite anywhere in the Quran");
    } else if (ev.type === "loading_status") {
      setStatus(String(ev.message ?? "Loading…"));
    } else if (ev.type === "verse_match") {
      const s = ev.surah as number, a = ev.ayah as number;
      setLoc({ surah: s, ayah: a });
      setStatus(`Found you — ${String(ev.surah_name ?? "")} ${s}:${a}`);
      goToAyah(s, a);
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
        setSuspects((prev) => {
          const next = new Map(prev);
          next.set(`${i.surah}:${i.ayah}:${i.word}`, i.kind);
          return next;
        });
      }
    } else if (ev.type === "error") {
      setMicError(String(ev.message ?? "Engine error"));
      void stopRecite();
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
    workerRef.current?.postMessage({ type: "correction-act", action: "continue" });
    setPending(null);
  }

  async function dismissMistake() {
    if (!pending) return;
    const key = `${pending.s}:${pending.a}:${pending.w}`;
    setSuspects((prev) => { const n = new Map(prev); n.delete(key); return n; });
    workerRef.current?.postMessage({ type: "correction-act", action: "dismiss" });
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
    setSnapping(true);
    setDragX(0);
    if (dx < -60) setPage((p) => Math.min(PAGE_COUNT, p + 1));
    else if (dx > 60) setPage((p) => Math.max(1, p - 1));
  }

  const listening = listen !== "idle";

  function wordMark(s: number, a: number, w: number) {
    const key = `${s}:${a}:${w}`;
    if (confirmed.has(key))
      return { backgroundColor: "color-mix(in oklab, #b34a3a 22%, transparent)", boxShadow: "inset 0 -2px 0 #b34a3a" } as const;
    if (suspects.has(key))
      return { backgroundColor: "color-mix(in oklab, #c9a227 25%, transparent)", boxShadow: "inset 0 -2px 0 #c9a227" } as const;
    if (loc && loc.surah === s && loc.ayah === a) {
      if (wordIdx === w)
        return { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" } as const;
      if (wordIdx !== null && w < wordIdx)
        return { color: "var(--color-accent)" } as const;
    }
    return undefined;
  }

  function renderPage(p: number) {
    const data = pages.get(p);
    const fontReady = fonts.has(p);
    if (!data) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading page…</p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col justify-between px-5 py-4" dir="rtl">
        {data.lines.map((line, li) => {
          if (line.type === "surah-header") {
            return (
              <div
                key={li}
                className="flex items-center justify-center rounded-full border py-0.5"
                style={{ borderColor: "var(--color-accent-faint)", backgroundColor: "var(--color-paper-2)" }}
              >
                <p className="text-base font-bold" style={{ color: "var(--color-accent)", fontFamily: "var(--font-arabic, serif)" }}>
                  {line.text}
                </p>
              </div>
            );
          }
          if (line.type === "basmala") {
            return (
              <p
                key={li}
                className="text-center text-xl leading-none"
                style={{ color: "var(--color-ink)", fontFamily: fontReady ? `QPC2-p${p}` : "var(--font-arabic, serif)" }}
              >
                {fontReady && (line as { qpcV2?: string }).qpcV2 ? (line as { qpcV2?: string }).qpcV2 : "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"}
              </p>
            );
          }
          const centered = line.centered ?? line.is_centered;
          return (
            <div key={li} className={`flex flex-wrap items-baseline ${centered ? "justify-center" : "justify-between"} gap-x-1.5`}>
              {(line.words ?? []).map((w, wi) => {
                const [s, a, wiN] = w.location.split(":").map(Number);
                const key = `${s}:${a}:${wiN}`;
                const isSuspect = suspects.has(key);
                const isConfirmed = confirmed.has(key);
                return (
                  <span
                    key={wi}
                    data-loc={w.location}
                    onClick={isSuspect || isConfirmed ? () => onWordTap(s, a, wiN) : undefined}
                    className={`rounded px-0.5 transition-colors duration-150${isSuspect || isConfirmed ? " cursor-pointer" : ""}`}
                    style={{
                      ...(fontReady && w.qpcV2 ? { fontFamily: `QPC2-p${p}` } : { fontFamily: "var(--font-arabic, serif)" }),
                      fontSize: "1.35rem",
                      lineHeight: 1.9,
                      color: "var(--color-ink)",
                      ...wordMark(s, a, wiN),
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
    <div className="flex h-dvh flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="z-20 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 82%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/calendar/day"
            className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <h1 className="flex-1 text-xl font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Quran Tester
          </h1>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {page} / {PAGE_COUNT}
          </span>
          {installed && !listening && (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
            >
              <Mic className="h-3 w-3" /> Ready
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 sm:px-6">
        {/* Engine install card */}
        {installed === false && (
          <div
            className="mt-4 rounded-3xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              One-time setup
            </p>
            <p className="mt-1 text-base font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
              Download the recitation engine
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              ~85MB, downloaded once. Your voice is processed entirely on this
              device — audio never leaves your phone, works fully offline.
            </p>
            {dl ? (
              <div className="mt-4">
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
                className="mt-4 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
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
        )}

        {installed && !listening && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Swipe pages · tap the mic and recite anywhere
            </p>
            <button
              onClick={() => void remove()}
              className="shrink-0 text-[10px] font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Remove engine
            </button>
          </div>
        )}

        {/* Live status */}
        {listening && (
          <div
            className="mt-3 flex items-center gap-3 rounded-2xl border px-4 py-2.5"
            style={{ borderColor: "var(--color-accent-faint)", backgroundColor: "var(--color-paper-2)" }}
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: "var(--color-accent)" }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
            </span>
            <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {status ?? "Listening…"}
            </p>
          </div>
        )}
        {micError && (
          <p className="mt-2 text-xs font-medium" style={{ color: "#b34a3a" }}>{micError}</p>
        )}

        {/* Jump bar */}
        <div className="mt-3 flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2 rounded-full border px-3.5 py-2"
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
        </div>

        {/* Mushaf page — swipe */}
        <div
          className="relative mt-3 min-h-0 flex-1 touch-pan-y select-none overflow-hidden rounded-3xl border"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <div
            className="relative h-full w-full"
            style={{
              transform: `translateX(${dragX}px)`,
              transition: snapping ? "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            }}
          >
            {/* prev page (right side in RTL reading) */}
            {page > 1 && (
              <div className="absolute inset-0" style={{ transform: "translateX(100%)" }}>
                {renderPage(page - 1)}
              </div>
            )}
            <div className="absolute inset-0">{renderPage(page)}</div>
            {/* next page (left side — mushaf turns left) */}
            {page < PAGE_COUNT && (
              <div className="absolute inset-0" style={{ transform: "translateX(-100%)" }}>
                {renderPage(page + 1)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mistake confirm bar */}
      {pending && (
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 108px)" }}
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

      {/* Recite bar */}
      {installed && (
        <div
          className="fixed inset-x-0 bottom-0 z-30"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
            background: "linear-gradient(to top, var(--color-paper) 55%, transparent)",
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 px-4">
            <button
              onClick={() => (listening ? void stopRecite() : void startRecite())}
              className="relative flex items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                width: 64,
                height: 64,
                backgroundColor: listening ? "var(--color-accent)" : "var(--color-ink)",
                color: "var(--color-paper)",
                boxShadow: "0 8px 24px color-mix(in oklab, var(--color-ink) 25%, transparent)",
              }}
              aria-label={listening ? "Stop reciting" : "Start reciting"}
            >
              {listening && (
                <span className="absolute inset-0 animate-ping rounded-full opacity-25" style={{ backgroundColor: "var(--color-accent)" }} />
              )}
              {listen === "listening" ? <Square className="h-5 w-5" fill="currentColor" /> : <Mic className="h-6 w-6" />}
            </button>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
              {listen === "listening" ? "Tap to stop" : listen === "warming" ? "Warming up" : "Tap to recite"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function pct(dl: { done: number; total: number }) {
  return Math.round((dl.done / dl.total) * 100);
}

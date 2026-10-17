"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Download, Mic, Search, Square } from "lucide-react";
import { ENGINE_ASSETS, downloadEngine, engineInstalled, uninstallEngine } from "./engine";

/**
 * Quran Tester — recite anywhere in the Quran; the app follows you on the
 * mushaf and flags mistakes for confirmation. Fully on-device: the recognition
 * engine downloads once (~85MB) and audio never leaves the phone.
 *
 * Self-contained under src/features/quran-tester/ — extractable later.
 */

type Surah = { s: number; verses: [number, string, string][] };
type Quran = Surah[];

type ListenState = "idle" | "warming" | "listening";

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
  const [quran, setQuran] = useState<Quran | null>(null);
  const [surahIdx, setSurahIdx] = useState(0);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [listen, setListen] = useState<ListenState>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ surah: number; ayah: number } | null>(null);
  const [wordIdx, setWordIdx] = useState<number | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const surahIdxRef = useRef(surahIdx);
  surahIdxRef.current = surahIdx;

  useEffect(() => {
    fetch("/data/quran.json").then((r) => r.json()).then(setQuran).catch(() => {});
    engineInstalled().then(setInstalled).catch(() => setInstalled(false));
    return () => { void stopRecite(); };
  }, []);

  const surah = quran?.[surahIdx];
  const pct = dl ? Math.round((dl.done / dl.total) * 100) : 0;

  function onSearch(v: string) {
    setSearch(v);
    if (!quran) return;
    const q = v.trim();
    const m = q.match(/^(\d{1,3})(?::(\d{1,3}))?$/); // "2" or "2:255" → jump
    if (m) {
      const s = Math.min(114, Math.max(1, parseInt(m[1], 10)));
      setSurahIdx(s - 1);
      const ayah = m[2];
      if (ayah) scrollToAyah(s, parseInt(ayah, 10));
    }
  }

  function scrollToAyah(s: number, a: number) {
    requestAnimationFrame(() =>
      document.getElementById(`ayah-${s}-${a}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
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
      // forward ~0.25s of audio per post so the worker gets meaty chunks
      if (buf.length >= ctx.sampleRate / 4) {
        workerRef.current?.postMessage({ type: "audio", samples: buf }, [buf.buffer]);
        buf = new Float32Array(0);
      }
    };
    src.connect(node);
    node.connect(ctx.destination); // required for the worklet to run; monitor-free since output is silence-safe
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
      if (quran && surahIdxRef.current !== s - 1) setSurahIdx(s - 1);
      scrollToAyah(s, a);
    } else if (ev.type === "word_progress") {
      const s = ev.surah as number, a = ev.ayah as number;
      setLoc({ surah: s, ayah: a });
      setWordIdx(ev.word_index as number);
      if (quran && surahIdxRef.current !== s - 1) setSurahIdx(s - 1);
    } else if (ev.type === "error") {
      setMicError(String(ev.message ?? "Engine error"));
      void stopRecite();
    } else if (ev.type === "stopped") {
      // flushed
    }
  }

  const listening = listen !== "idle";

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-md"
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
          {installed && !listening && (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
            >
              <Mic className="h-3 w-3" /> Engine ready
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-40 sm:px-6">
        {/* Engine install card */}
        {installed === false && (
          <div
            className="mt-5 rounded-3xl border p-5"
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
                    style={{ width: `${pct}%`, backgroundColor: "var(--color-accent)" }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {(dl.done / 1e6).toFixed(1)} / {(dl.total / 1e6).toFixed(0)} MB — {pct}%
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
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Recite anywhere — the app finds your place and flags mistakes for you to confirm.
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
            className="mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--color-accent-faint)", backgroundColor: "var(--color-paper-2)" }}
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: "var(--color-accent)" }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "var(--color-accent)" }}
              />
            </span>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {status ?? "Listening…"}
            </p>
          </div>
        )}
        {micError && (
          <p className="mt-3 text-xs font-medium" style={{ color: "#b34a3a" }}>{micError}</p>
        )}

        {/* Nav: jump + search */}
        <div className="mt-5 flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2 rounded-full border px-3.5 py-2"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Jump: 2:255 or search a translation…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-muted)]"
              style={{ color: "var(--color-ink)" }}
            />
          </div>
          <select
            value={surahIdx}
            onChange={(e) => setSurahIdx(Number(e.target.value))}
            className="rounded-full border px-3 py-2 text-sm font-semibold outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
            aria-label="Surah"
          >
            {(quran ?? []).map((s, i) => (
              <option key={s.s} value={i}>سورة {s.s}</option>
            ))}
          </select>
        </div>

        {/* Mushaf */}
        {!quran ? (
          <p className="mt-10 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center gap-3">
              <BookOpen className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
                Surah {surah!.s} · {surah!.verses.length} ayahs
              </p>
            </div>
            <div dir="rtl" className="space-y-5 text-right" style={{ fontFamily: "var(--font-arabic, serif)" }}>
              {surah!.verses.map(([n, ar, en]) => {
                const active = loc && loc.surah === surah!.s && loc.ayah === n;
                return (
                  <div
                    key={n}
                    id={`ayah-${surah!.s}-${n}`}
                    className="rounded-2xl px-2 py-1 transition-colors duration-300"
                    style={active ? { backgroundColor: "var(--color-accent-faint)" } : undefined}
                  >
                    <p className="text-[22px] leading-[2.1]" style={{ color: "var(--color-ink)" }}>
                      {ar.split(" ").map((w, wi) => (
                        <span
                          key={wi}
                          data-word={wi}
                          className="inline-block rounded px-0.5 transition-colors duration-150"
                          style={
                            active && wordIdx === wi
                              ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
                              : active && wordIdx !== null && wi < wordIdx
                                ? { color: "var(--color-accent)" }
                                : undefined
                          }
                        >
                          {w}
                        </span>
                      ))}
                      <span
                        className="mx-2 inline-flex h-7 w-7 items-center justify-center rounded-full border align-middle text-[11px] font-semibold"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", fontFamily: "inherit" }}
                      >
                        {n}
                      </span>
                    </p>
                    <p dir="ltr" className="mt-1 text-left text-xs leading-relaxed opacity-70" style={{ color: "var(--color-ink-muted)", fontFamily: "inherit" }}>
                      {en}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
                <span
                  className="absolute inset-0 animate-ping rounded-full opacity-25"
                  style={{ backgroundColor: "var(--color-accent)" }}
                />
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import ContourCanvas from "./ui/ContourCanvas";
import { startPitchStream, hzToNote, type PitchStream, type PitchFrame } from "./live/pitch";

// P0 spike page: proves the live pitch pipeline end-to-end — AudioWorklet MPM
// → frames → canvas trail. Everything else in recite-coach builds on the claim
// this page verifies: ~40ms felt latency on a real phone.

export default function ReciteCoachClient() {
  const [stream, setStream] = useState<PitchStream | null>(null);
  const [err, setErr] = useState("");
  const [readout, setReadout] = useState<PitchFrame | null>(null);
  const framesRef = useRef<() => PitchFrame[]>(() => []);

  const frames = useCallback(() => framesRef.current(), []);

  useEffect(() => {
    if (!stream) return;
    framesRef.current = stream.frames;
    const id = setInterval(() => {
      const fs = stream.frames();
      const last = fs.length ? fs[fs.length - 1] : null;
      setReadout(last && last.voiced ? last : null);
    }, 90);
    return () => clearInterval(id);
  }, [stream]);

  async function toggle() {
    setErr("");
    if (stream) {
      stream.stop();
      setStream(null);
      framesRef.current = () => [];
      setReadout(null);
      return;
    }
    try {
      setStream(await startPitchStream());
    } catch {
      setErr("Microphone unavailable — check permission.");
    }
  }

  const listening = !!stream;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <header className="px-5 pt-5">
        <h1 className="font-serif text-lg" style={{ color: "var(--color-ink)" }}>Recite Coach</h1>
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Live pitch trail — recite and watch your melody
        </p>
      </header>

      <div
        className="mx-4 mt-4 flex-1 overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "#0E1116" }}
      >
        <ContourCanvas getFrames={frames} active={listening} />
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0">
          {readout ? (
            <p className="text-sm tabular-nums" style={{ color: "var(--color-ink)" }}>
              {hzToNote(readout.hz)} · {Math.round(readout.hz)} Hz
              <span className="ml-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                clarity {Math.round(readout.clarity * 100)}%
              </span>
            </p>
          ) : (
            <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {listening ? "Listening…" : err || "Tap the mic and recite."}
            </p>
          )}
        </div>
        <button
          onClick={() => void toggle()}
          className="flex h-12 w-12 items-center justify-center rounded-full border shadow-sm transition-transform active:scale-90"
          style={
            listening
              ? { borderColor: "var(--color-accent)", backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
              : { borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-soft)" }
          }
          aria-label={listening ? "Stop" : "Start pitch tracking"}
        >
          {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

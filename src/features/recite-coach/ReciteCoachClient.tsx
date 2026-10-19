"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import ContourCanvas from "./ui/ContourCanvas";
import ReportCard from "./ui/ReportCard";
import { startPitchStream, hzToNote, type PitchStream, type PitchFrame } from "./live/pitch";
import { analyze, type Report } from "./engine/analyze";
import { gradeAudio, type DeepGrade } from "./engine/deepGrade";

// P0/P2 spike surface: live pitch trail while reciting; stopping produces the
// reference-free report card. Word-level tajwīd scoring joins once the tester
// alignment feeds spans (P3).

export default function ReciteCoachClient() {
  const [stream, setStream] = useState<PitchStream | null>(null);
  const [err, setErr] = useState("");
  const [readout, setReadout] = useState<PitchFrame | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [deep, setDeep] = useState<DeepGrade | null | undefined>(null);
  const [grading, setGrading] = useState(false);
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
      const hist = stream.history();
      const pcm = await stream.stopRecording();
      const rate = stream.sampleRate;
      stream.stop();
      setStream(null);
      framesRef.current = () => [];
      setReadout(null);
      // need ≥3s of audio to say anything honest
      if (hist.length && hist[hist.length - 1].t - hist[0].t >= 3) {
        setReport(analyze(hist));
        // Law layer: replay the captured PCM through the phoneme engine.
        // undefined = engine not installed → report omits the tier honestly.
        setGrading(true);
        try {
          setDeep(await gradeAudio(pcm, rate) ?? undefined);
        } catch {
          setDeep(undefined);
        } finally {
          setGrading(false);
        }
      }
      return;
    }
    setReport(null);
    setDeep(null);
    try {
      const s = await startPitchStream();
      s.startRecording();
      setStream(s);
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
          {report ? "Session report" : "Recite a passage — watch your melody, then get graded"}
        </p>
      </header>

      {!report && (
        <div
          className="mx-4 mt-4 h-64 overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "#0E1116" }}
        >
          <ContourCanvas getFrames={frames} active={listening} />
        </div>
      )}

      {!report && (
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
            aria-label={listening ? "Stop and grade" : "Start reciting"}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
        </div>
      )}

      {report && (
        <>
          {grading && (
            <p className="px-5 pt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Deep grading — replaying your audio through the phoneme engine…
            </p>
          )}
          {!grading && deep === undefined && (
            <p className="px-5 pt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Word-level grading needs the on-device Quran engine — install it in Quran Tester.
            </p>
          )}
          <ReportCard report={report} deep={deep} />
          <div className="px-5 pb-8">
            <button
              onClick={() => setReport(null)}
              className="w-full rounded-xl border py-3 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
            >
              Recite again
            </button>
          </div>
        </>
      )}
    </div>
  );
}

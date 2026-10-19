"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Upload } from "lucide-react";
import ContourCanvas from "./ui/ContourCanvas";
import ReportCard from "./ui/ReportCard";
import { startPitchStream, hzToNote, type PitchStream, type PitchFrame } from "./live/pitch";
import { analyze, type Report } from "./engine/analyze";
import { gradeAudio, type DeepGrade } from "./engine/deepGrade";
import { saveSession, listSessions } from "./engine/store";
import { ladderRows, type LadderRow } from "./engine/ladder";
import { extractContour } from "./engine/contour";
import { compareContours, type CompareResult } from "./engine/align";

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
  const [ladder, setLadder] = useState<LadderRow[] | null>(null);
  const [recT0, setRecT0] = useState(0); // ctx time of PCM sample 0
  // Practice: user-supplied reference clip (their own file — we never ship
  // copyrighted recitations). Gold contour overlays the canvas; on stop the
  // session is DTW-compared in interval space.
  const [refFrames, setRefFrames] = useState<PitchFrame[] | null>(null);
  const [refBuf, setRefBuf] = useState<AudioBuffer | null>(null);
  const [refName, setRefName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [refVol, setRefVol] = useState(0.8);
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  const playRef = useRef<{ stop(): void } | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
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
      const { pcm, t0 } = await stream.stopRecording();
      const rate = stream.sampleRate;
      setRecT0(t0);
      stream.stop();
      setStream(null);
      framesRef.current = () => [];
      setReadout(null);
      // need ≥3s of audio to say anything honest
      if (hist.length && hist[hist.length - 1].t - hist[0].t >= 3) {
        const rep = analyze(hist);
        setReport(rep);
        setCmp(refFrames ? compareContours(hist, refFrames) : null);
        // Law layer: replay the captured PCM through the phoneme engine.
        // undefined = engine not installed → report omits the tier honestly.
        setGrading(true);
        let d: DeepGrade | undefined;
        try {
          d = await gradeAudio(pcm, rate) ?? undefined;
        } catch { /* deep grade stays undefined — style tier still shown */ }
        setDeep(d);
        setGrading(false);
        // Persist + ladder: the /1000 means nothing without history behind it.
        try {
          const row = {
            ts: Date.now(),
            score: rep.score,
            durationSec: rep.durationSec,
            axes: Object.fromEntries(rep.axes.map((a) => [a.key, a.value])),
            issues: d?.issues.length ?? 0,
            maddsShort: d?.madds.filter((m) =>
              m.haraka != null && m.haraka < (m.cls === "lazim" ? 5.5 : m.cls === "jaiz" ? 3.5 : 1.5)).length ?? 0,
            maddsTotal: d?.madds.length ?? 0,
          };
          const hist2 = await listSessions();
          await saveSession(row);
          setLadder(ladderRows(rep.axes, hist2));
        } catch { /* storage is best-effort */ }
      }
      return;
    }
    setReport(null);
    setDeep(null);
    setLadder(null);
    try {
      const s = await startPitchStream();
      s.startRecording();
      setStream(s);
    } catch {
      setErr("Microphone unavailable — check permission.");
    }
  }

  async function loadRef(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      // mono mixdown for the contour
      const ch0 = buf.getChannelData(0);
      const mono = buf.numberOfChannels > 1 ? new Float32Array(ch0.length) : ch0;
      for (let c = 1; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
      }
      setRefBuf(buf);
      setRefFrames(extractContour(mono, buf.sampleRate));
      setRefName(file.name);
      setCmp(null);
    } catch {
      setErr("Couldn't decode that audio file.");
    }
    e.target.value = "";
  }

  function togglePlay() {
    if (playing) { playRef.current?.stop(); playRef.current = null; setPlaying(false); return; }
    if (!refBuf) return;
    const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
    const src = ctx.createBufferSource();
    src.buffer = refBuf;
    const gain = ctx.createGain();
    gain.gain.value = refVol;
    gainRef.current = gain;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => setPlaying(false);
    src.start();
    playRef.current = { stop: () => { try { src.stop(); } catch { /* already ended */ } } };
    setPlaying(true);
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
          <ContourCanvas getFrames={frames} active={listening} reference={refFrames} />
        </div>
      )}

      {/* reference clip — user-supplied audio, contour + playback + volume */}
      {!report && (
        <div className="mx-4 mt-3 flex items-center gap-2">
          <label
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-transform active:scale-95"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
          >
            <Upload className="h-3.5 w-3.5" />
            {refName || "Load a reference clip"}
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => void loadRef(e)} />
          </label>
          {refBuf && (
            <>
              <button
                onClick={togglePlay}
                className="flex h-8 w-8 items-center justify-center rounded-full border transition-transform active:scale-90"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)" }}
                aria-label={playing ? "Pause reference" : "Play reference"}
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05} value={refVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRefVol(v);
                  if (gainRef.current) gainRef.current.gain.value = v;
                }}
                className="w-20 accent-[#fbbf24]"
                aria-label="Reference volume"
              />
            </>
          )}
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
          <ReportCard report={report} deep={deep} ladder={ladder} recT0={recT0} cmp={cmp} />
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

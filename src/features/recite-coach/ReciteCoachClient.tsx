"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Upload, Disc3, X } from "lucide-react";
import ContourCanvas from "./ui/ContourCanvas";
import ReportCard from "./ui/ReportCard";
import { startPitchStream, hzToNote, type PitchStream, type PitchFrame } from "./live/pitch";
import { analyze, type Report } from "./engine/analyze";
import { gradeAudio, type DeepGrade } from "./engine/deepGrade";
import { saveSession, listSessions, saveRef, listRefs, deleteRef, type RefRow } from "./engine/store";
import { ladderRows, type LadderRow } from "./engine/ladder";
import { extractContour } from "./engine/contour";
import { compareContours, type CompareResult } from "./engine/align";

// The assess surface: live contour (gold = chosen reference), record →
// report. References are either dropped audio files or clips recorded
// in-app — both stay on-device.

type Mode = "assess" | "recref";

export default function ReciteCoachClient() {
  const [stream, setStream] = useState<PitchStream | null>(null);
  const [mode, setMode] = useState<Mode>("assess");
  const [err, setErr] = useState("");
  const [readout, setReadout] = useState<PitchFrame | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [deep, setDeep] = useState<DeepGrade | null | undefined>(null);
  const [grading, setGrading] = useState(false);
  const [ladder, setLadder] = useState<LadderRow[] | null>(null);
  const [recT0, setRecT0] = useState(0);
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  // reference: either a decoded AudioBuffer (file) or a saved RefRow (PCM)
  const [refFrames, setRefFrames] = useState<PitchFrame[] | null>(null);
  const [refBuf, setRefBuf] = useState<AudioBuffer | null>(null);
  const [refName, setRefName] = useState("");
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [playing, setPlaying] = useState(false);
  const [refVol, setRefVol] = useState(0.8);
  const playRef = useRef<{ stop(): void } | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const framesRef = useRef<() => PitchFrame[]>(() => []);

  const frames = useCallback(() => framesRef.current(), []);

  useEffect(() => {
    void listRefs().then(setRefs).catch(() => {});
  }, []);

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

  async function begin(m: Mode) {
    setErr("");
    setReport(null);
    setDeep(null);
    setLadder(null);
    setCmp(null);
    // switching modes mid-session: drop the live stream first — two open
    // AudioContexts on one mic is a leak and a source of feedback confusion
    if (stream) {
      stream.stop();
      setStream(null);
      framesRef.current = () => [];
      setReadout(null);
    }
    try {
      const s = await startPitchStream();
      s.startRecording();
      setMode(m);
      setStream(s);
    } catch {
      setErr("Microphone unavailable — check permission.");
    }
  }

  async function toggle() {
    if (!stream) { await begin("assess"); return; }
    const hist = stream.history();
    const { pcm, t0 } = await stream.stopRecording();
    const rate = stream.sampleRate;
    stream.stop();
    setStream(null);
    framesRef.current = () => [];
    setReadout(null);

    if (mode === "recref") {
      // Save as a personal reference clip — contour + PCM, on-device.
      if (pcm.length / rate < 2) { setErr("Too short — hold it for a couple of seconds."); return; }
      const row: RefRow = { name: `Recitation ${new Date().toLocaleDateString()}`, ts: Date.now(), sr: rate, pcm };
      try {
        row.id = await saveRef(row);
        setRefs((rs) => [row, ...rs]);
        selectRef(row);
      } catch { /* storage best-effort */ }
      return;
    }

    setRecT0(t0);
    if (hist.length && hist[hist.length - 1].t - hist[0].t >= 3) {
      const rep = analyze(hist);
      setReport(rep);
      setCmp(refFrames ? compareContours(hist, refFrames) : null);
      setGrading(true);
      let d: DeepGrade | undefined;
      try {
        d = await gradeAudio(pcm, rate) ?? undefined;
      } catch { /* style tier still shown */ }
      setDeep(d);
      setGrading(false);
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
  }

  function selectRef(row: RefRow) {
    const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
    const buf = ctx.createBuffer(1, row.pcm.length, row.sr);
    buf.copyToChannel(row.pcm as Float32Array<ArrayBuffer>, 0);
    setRefBuf(buf);
    setRefFrames(extractContour(row.pcm, row.sr));
    setRefName(row.name);
    setCmp(null);
  }

  async function removeRef(id: number | undefined) {
    if (id == null) return;
    await deleteRef(id).catch(() => {});
    setRefs((rs) => rs.filter((r) => r.id !== id));
  }

  async function loadRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
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
          {report ? "Session report" : "Recite — your melody draws live, then gets graded"}
        </p>
      </header>

      {!report && (
        <div
          className="relative mx-4 mt-4 h-72 overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "#0E1116" }}
        >
          <ContourCanvas getFrames={frames} active={listening} reference={refFrames} />
          {/* floating readout pill */}
          <div className="absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] tabular-nums" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9fb0c0" }}>
            {readout ? `${hzToNote(readout.hz)} · ${Math.round(readout.hz)} Hz` : listening ? "listening…" : refName ? `ref: ${refName}` : "no reference"}
          </div>
        </div>
      )}

      {/* reference row: load file, record own, saved clips, play+volume */}
      {!report && (
        <div className="mx-4 mt-3">
          <div className="flex items-center gap-2">
            <label
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-transform active:scale-95"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
            >
              <Upload className="h-3 w-3" /> file
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => void loadRefFile(e)} />
            </label>
            <button
              onClick={() => void (stream && mode === "recref" ? toggle() : begin("recref"))}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-transform active:scale-95"
              style={{
                borderColor: listening && mode === "recref" ? "#f87171" : "var(--color-paper-3)",
                color: listening && mode === "recref" ? "#f87171" : "var(--color-ink-muted)",
              }}
            >
              <Disc3 className="h-3 w-3" />
              {listening && mode === "recref" ? "save clip" : "record ref"}
            </button>
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
                  className="w-16 accent-[#fbbf24]"
                  aria-label="Reference volume"
                />
              </>
            )}
          </div>
          {refs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {refs.slice(0, 6).map((r) => (
                <span key={r.id} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]" style={{ borderColor: "var(--color-paper-3)" }}>
                  <button onClick={() => selectRef(r)} style={{ color: refName === r.name ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                    {r.name}
                  </button>
                  <button onClick={() => void removeRef(r.id)} aria-label="Delete clip" style={{ color: "var(--color-ink-muted)" }}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {err && <p className="mt-2 text-xs" style={{ color: "#f87171" }}>{err}</p>}
        </div>
      )}

      {/* the mic — assess session */}
      {!report && (
        <div className="flex flex-1 flex-col items-center justify-end pb-6 pt-8">
          <button
            onClick={() => void toggle()}
            className="relative flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-90"
            style={
              listening
                ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)", boxShadow: "0 0 0 6px rgba(74,222,128,0.15)" }
                : { border: "1px solid var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-soft)" }
            }
            aria-label={listening ? "Stop and grade" : "Start reciting"}
          >
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-full" style={{ backgroundColor: "rgba(74,222,128,0.15)" }} />
            )}
            {listening ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
          </button>
          <p className="mt-3 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            {listening ? (mode === "recref" ? "recording reference…" : "recite, tap to grade") : "tap to begin"}
          </p>
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

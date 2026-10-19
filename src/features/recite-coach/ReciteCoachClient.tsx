"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Upload, Disc3, X, Loader2, Music2, TrendingUp } from "lucide-react";
import ContourCanvas from "./ui/ContourCanvas";
import ReportCard from "./ui/ReportCard";
import { startPitchStream, hzToNote, type PitchStream, type PitchFrame } from "./live/pitch";
import { analyze, type Report } from "./engine/analyze";
import { gradeAudio, type DeepGrade } from "./engine/deepGrade";
import { saveSession, listSessions, saveRef, listRefs, deleteRef, type RefRow, type SessionRow } from "./engine/store";
import { ladderRows, nextRungs, type LadderRow } from "./engine/ladder";
import { extractContour } from "./engine/contour";
import { compareContours, type CompareResult } from "./engine/align";

// Three surfaces:
//   Assess   — record → style report + deep grade + ladder
//   Practice — clip library: published coach clips, personal recordings,
//              dropped files; pick one and its contour anchors the assess run
//   Progress — ladder + session history across takes

type Tab = "assess" | "practice" | "progress";
type Mode = "assess" | "recref";

interface ServerClip {
  id: string;
  title: string;
  reciter: string | null;
  passage: string | null;
  style: string | null;
  duration: number | null;
}

const AXIS_LABELS: Record<string, string> = {
  tempo: "Pace", pitch: "Pitch control", range: "Range use",
  vibrato: "Vibrato", cadence: "Endings", breath: "Breath", ghunnah: "Nasal color",
};

function newRefRow(sr: number, pcm: Float32Array): RefRow {
  return { name: `Recitation ${new Date().toLocaleDateString()}`, ts: Date.now(), sr, pcm };
}

function newSessionRow(rep: Report, d: DeepGrade | undefined): SessionRow {
  return {
    ts: Date.now(),
    score: rep.score,
    durationSec: rep.durationSec,
    axes: Object.fromEntries(rep.axes.map((a) => [a.key, a.value])),
    issues: d?.issues.length ?? 0,
    maddsShort: d?.madds.filter((m) =>
      m.haraka != null && m.haraka < (m.cls === "lazim" ? 5.5 : m.cls === "jaiz" ? 3.5 : 1.5)).length ?? 0,
    maddsTotal: d?.madds.length ?? 0,
  };
}

export default function ReciteCoachClient() {
  const [tab, setTab] = useState<Tab>("assess");
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
  const [refFrames, setRefFrames] = useState<PitchFrame[] | null>(null);
  const [refBuf, setRefBuf] = useState<AudioBuffer | null>(null);
  const [refName, setRefName] = useState("");
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [clips, setClips] = useState<ServerClip[] | null>(null);
  const [clipLoading, setClipLoading] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [refVol, setRefVol] = useState(0.8);
  const playRef = useRef<{ stop(): void } | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const framesRef = useRef<() => PitchFrame[]>(() => []);

  const frames = useCallback(() => framesRef.current(), []);

  useEffect(() => {
    void listRefs().then(setRefs).catch(() => {});
    void fetch("/api/recite-clips")
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d) => setClips(Array.isArray(d.clips) ? d.clips : []))
      .catch(() => setClips([]));
  }, []);

  useEffect(() => {
    if (tab === "progress" && sessions === null) {
      void listSessions().then(setSessions).catch(() => setSessions([]));
    }
  }, [tab, sessions]);

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
      setTab("assess");
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
      const row = newRefRow(rate, pcm);
      try {
        row.id = await saveRef(row);
        setRefs((rs) => [row, ...rs]);
        setRefFromPcm(row.pcm, row.sr, row.name);
        setTab("practice");
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
        const row = newSessionRow(rep, d);
        const hist2 = await listSessions();
        await saveSession(row);
        setSessions(null); // Progress tab reloads
        setLadder(ladderRows(rep.axes, hist2));
      } catch { /* storage is best-effort */ }
    }
  }

  function setRefFromPcm(pcm: Float32Array, sr: number, name: string) {
    const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
    const buf = ctx.createBuffer(1, pcm.length, sr);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    setRefBuf(buf);
    setRefFrames(extractContour(pcm, sr));
    setRefName(name);
    setCmp(null);
  }

  function setRefFromBuffer(buf: AudioBuffer, name: string) {
    const ch0 = buf.getChannelData(0);
    // mono mixdown: start from channel 0, fold the rest in at 1/n — the
    // previous version initialized zeros and skipped ch0 entirely
    const mono = buf.numberOfChannels > 1 ? Float32Array.from(ch0) : ch0;
    for (let c = 1; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    setRefBuf(buf);
    setRefFrames(extractContour(mono, buf.sampleRate));
    setRefName(name);
    setCmp(null);
  }

  function selectRef(row: RefRow) {
    setRefFromPcm(row.pcm, row.sr, row.name);
  }

  async function loadClip(c: ServerClip) {
    setErr("");
    setClipLoading(c.id);
    const url = `/api/recite-clips?stream=${c.id}&proxy=1`;
    try {
      // cache-first: a clip you've practiced against keeps working offline
      const cached = await caches.match(url);
      const res = cached ?? await fetch(url);
      if (res.ok && !cached) {
        void caches.open("recite-clips").then((cache) => cache.put(url, res.clone())).catch(() => {});
      }
      if (!res.ok) throw new Error();
      const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      setRefFromBuffer(buf, `${c.reciter ? c.reciter + " — " : ""}${c.title}`);
    } catch {
      setErr("Couldn't load that clip.");
    } finally {
      setClipLoading(null);
    }
  }

  async function removeRef(id: number | undefined) {
    if (id == null) return;
    const target = refs.find((r) => r.id === id);
    await deleteRef(id).catch(() => {});
    setRefs((rs) => rs.filter((r) => r.id !== id));
    if (target && refName === target.name) { setRefName(""); setRefFrames(null); setRefBuf(null); }
  }

  async function loadRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      setRefFromBuffer(buf, file.name);
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

  const TABS: { key: Tab; label: string }[] = [
    { key: "assess", label: "Assess" },
    { key: "practice", label: "Practice" },
    { key: "progress", label: "Progress" },
  ];

  return (
    <div className="flex min-h-[70vh] flex-col">
      <header className="px-5 pt-5">
        <h1 className="font-serif text-lg" style={{ color: "var(--color-ink)" }}>Recite Coach</h1>
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {tab === "assess" ? (report ? "Session report" : "Recite — your melody draws live, then gets graded")
            : tab === "practice" ? "Pick a reference — its gold line anchors your next run"
            : "Your ladder across sessions"}
        </p>
      </header>

      {/* mode tabs */}
      <div className="mx-4 mt-3 flex gap-1 rounded-full border p-1" style={{ borderColor: "var(--color-paper-3)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key !== "practice") setErr(""); }}
            className="flex-1 rounded-full py-1.5 text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: tab === t.key ? "var(--color-ink)" : "transparent",
              color: tab === t.key ? "var(--color-paper)" : "var(--color-ink-muted)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ASSESS ── */}
      {tab === "assess" && (
        <>
          {!report && (
            <div
              className="relative mx-4 mt-4 h-72 overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "#0E1116" }}
            >
              <ContourCanvas getFrames={frames} active={listening} reference={refFrames} />
              <div className="absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] tabular-nums" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9fb0c0" }}>
                {readout ? `${hzToNote(readout.hz)} · ${Math.round(readout.hz)} Hz` : listening ? "listening…" : refName ? `ref: ${refName}` : "no reference"}
              </div>
              {refName && !listening && (
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fbbf24" }}
                    aria-label={playing ? "Pause reference" : "Play reference"}
                  >
                    {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>
          )}

          {!report && (
            <div className="mx-4 mt-3 flex items-center justify-between">
              <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                {refName ? `Practicing against ${refName}` : "No reference set — pick one in Practice, or just recite"}
              </p>
              {refBuf && (
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
              )}
            </div>
          )}

          {err && <p className="mx-4 mt-2 text-xs" style={{ color: "#f87171" }}>{err}</p>}

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
        </>
      )}

      {/* ── PRACTICE ── */}
      {tab === "practice" && (
        <div className="mx-4 mt-4 space-y-5 pb-8">
          {/* coach library — published clips */}
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
              <Music2 className="h-3.5 w-3.5" /> Library
            </h2>
            {clips === null ? (
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
            ) : clips.length === 0 ? (
              <p className="rounded-xl border p-4 text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                No clips published yet — the admin library fills this shelf.
              </p>
            ) : (
              <div className="space-y-1.5">
                {clips.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => void loadClip(c)}
                    disabled={clipLoading === c.id}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium" style={{ color: "var(--color-ink)" }}>{c.title}</p>
                      <p className="truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        {[c.reciter, c.passage, c.style, c.duration ? `${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {clipLoading === c.id
                      ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: "var(--color-accent)" }} />
                      : <Play className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* personal clips */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
              Your clips — on this device only
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void (stream && mode === "recref" ? toggle() : begin("recref"))}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-transform active:scale-95"
                style={{
                  borderColor: listening && mode === "recref" ? "#f87171" : "var(--color-paper-3)",
                  color: listening && mode === "recref" ? "#f87171" : "var(--color-ink-muted)",
                }}
              >
                <Disc3 className="h-3 w-3" />
                {listening && mode === "recref" ? "save clip" : "record a clip"}
              </button>
              <label
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-transform active:scale-95"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
              >
                <Upload className="h-3 w-3" /> load a file
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => void loadRefFile(e)} />
              </label>
            </div>
            {refs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {refs.slice(0, 8).map((r) => (
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
          </section>

          {/* selected reference transport */}
          {refName && (
            <section className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" style={{ color: "var(--color-ink)" }}>{refName}</p>
                  <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>gold line on the assess canvas</p>
                </div>
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
              </div>
              <button
                onClick={() => setTab("assess")}
                className="mt-3 w-full rounded-lg border py-2 text-[11px] font-medium"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
              >
                Recite against this reference →
              </button>
            </section>
          )}
        </div>
      )}

      {/* ── PROGRESS ── */}
      {tab === "progress" && (
        <div className="mx-4 mt-4 space-y-4 pb-8">
          {!sessions ? (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
              <TrendingUp className="mx-auto mb-2 h-5 w-5" style={{ color: "var(--color-ink-muted)" }} />
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                No sessions yet — finish an assess run and your ladder starts here.
              </p>
            </div>
          ) : (
            (() => {
              const last = sessions[0];
              const rows = ladderRows(
                Object.entries(last.axes).map(([key, value]) => ({ key, value })),
                sessions.slice(1),
              );
              const rungs = nextRungs(rows, 1);
              const best = Math.max(...sessions.map((s) => s.score));
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { k: "Last", v: String(last.score) },
                      { k: "Best", v: String(best) },
                      { k: "Sessions", v: String(sessions.length) },
                    ].map((s) => (
                      <div key={s.k} className="rounded-xl border p-3 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
                        <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.v}</p>
                        <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{s.k}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div key={r.key} className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>{AXIS_LABELS[r.key] ?? r.key}</p>
                          <div className="flex items-center gap-2 text-[10px] tabular-nums">
                            {r.delta != null && r.delta !== 0 && (
                              <span style={{ color: r.delta > 0 ? "#4ade80" : "#f87171" }}>
                                {r.delta > 0 ? "+" : ""}{Math.round(r.delta)}
                              </span>
                            )}
                            <span style={{ color: "var(--color-ink-muted)" }}>{Math.round(r.value)} · best {Math.round(r.best)}</span>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                          <div className="h-full rounded-full" style={{ width: `${r.value}%`, backgroundColor: "var(--color-accent)" }} />
                        </div>
                        <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                          {r.stage}{r.toNext > 0 ? ` · ${Math.round(r.toNext)} to next` : " · top rung"}
                        </p>
                      </div>
                    ))}
                  </div>

                  {rungs.length > 0 && (
                    <p className="text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                      Nearest rung: {AXIS_LABELS[rungs[0].key] ?? rungs[0].key} — {Math.round(rungs[0].toNext)} points away
                    </p>
                  )}

                  <div>
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Recent</h2>
                    <div className="space-y-1">
                      {sessions.slice(0, 10).map((s, i) => (
                        <div key={s.ts} className="flex items-center justify-between rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--color-paper-3)" }}>
                          <span style={{ color: "var(--color-ink-muted)" }}>
                            {new Date(s.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {i === 0 ? " · latest" : ""}
                          </span>
                          <span className="tabular-nums" style={{ color: "var(--color-ink)" }}>
                            {s.score} · {Math.round(s.durationSec)}s{s.maddsTotal ? ` · ${s.maddsShort}/${s.maddsTotal} short madds` : ""}{s.issues ? ` · ${s.issues} issues` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

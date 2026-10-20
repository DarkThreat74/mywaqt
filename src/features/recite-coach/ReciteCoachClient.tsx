"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic, Square, Play, Pause, Upload, X, Loader2, Music2,
  TrendingUp, Download, HardDriveDownload, Dices, ChevronDown,
} from "lucide-react";
import { AUDIO_CACHE_NAME, audioCacheKey, getCachedAudioKeys, removeAudioOffline, saveAudioOffline } from "@/components/audio-player-context";
import ContourCanvas from "./ui/ContourCanvas";
import ReportCard from "./ui/ReportCard";
import { startPitchStream, hzToNote, type PitchStream, type PitchFrame } from "./live/pitch";
import { analyze, type Report } from "./engine/analyze";
import { gradeAudio, type DeepGrade } from "./engine/deepGrade";
import { saveSession, listSessions, saveRef, listRefs, deleteRef, type RefRow, type SessionRow } from "./engine/store";
import { ladderRows, nextRungs, type LadderRow } from "./engine/ladder";
import { extractContour } from "./engine/contour";
import { compareContours, type CompareResult } from "./engine/align";
import { SURAHS } from "@/lib/content/quran";
import { engineInstalled } from "@/features/quran-tester/engine";
import { warmQt } from "@/features/quran-tester/session";

// Three surfaces, no header:
//   Stats    — where you started, session-by-session, per-axis ladder
//   Practice — recite against a reference clip (library or your own)
//   Assess   — a random (or chosen) āyah; decode locks to it and the
//              verdict stream confirms you recited the right passage

type Tab = "stats" | "practice" | "assess";
type SessionKind = "practice" | "assess" | "recref";

interface ServerClip {
  id: string;
  title: string;
  reciter: string | null;
  passage: string | null;
  style: string | null;
  duration: number | null;
  fileSize: number | null;
  analysis: {
    passage?: { surah: number; ayah: number; ayahEnd: number };
    words?: unknown[];
    madds?: unknown[];
    ghunnahs?: unknown[];
  } | null;
}

interface QuranSurah { s: number; verses: [number, string, string][] }
interface AyahPick { surah: number; ayah: number; ar: string; en: string }

const AXIS_LABELS: Record<string, string> = {
  tempo: "Pace", pitch: "Pitch control", range: "Range use",
  vibrato: "Vibrato", cadence: "Endings", breath: "Breath", ghunnah: "Nasal color",
};

function newRefRow(sr: number, pcm: Float32Array): RefRow {
  return { name: `Clip ${new Date().toLocaleDateString()}`, ts: Date.now(), sr, pcm };
}

function newSessionRow(rep: Report, d: DeepGrade | undefined, label?: string): SessionRow {
  return {
    ts: Date.now(),
    label,
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
  const [tab, setTab] = useState<Tab>("practice");
  const [stream, setStream] = useState<PitchStream | null>(null);
  const [kind, setKind] = useState<SessionKind>("practice");
  const [err, setErr] = useState("");
  const [readout, setReadout] = useState<PitchFrame | null>(null);
  const [liveRange, setLiveRange] = useState<[number, number] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportLabel, setReportLabel] = useState("");
  const [deep, setDeep] = useState<DeepGrade | null | undefined>(null);
  const [grading, setGrading] = useState(false);
  const [ladder, setLadder] = useState<LadderRow[] | null>(null);
  const [recT0, setRecT0] = useState(0);
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  const [mismatch, setMismatch] = useState(false);
  // the take's frame stream, kept for the report's per-word pitch views
  const [takeFrames, setTakeFrames] = useState<PitchFrame[] | null>(null);

  // reference (practice)
  const [refFrames, setRefFrames] = useState<PitchFrame[] | null>(null);
  const [refBuf, setRefBuf] = useState<AudioBuffer | null>(null);
  const [refName, setRefName] = useState("");
  const [refExpected, setRefExpected] = useState<{ surah: number; ayah: number; ayahEnd: number } | null>(null);
  const [monitor, setMonitor] = useState(false);

  // library
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [clips, setClips] = useState<ServerClip[] | null>(null);
  const [clipLoading, setClipLoading] = useState<string | null>(null);
  const [clipCached, setClipCached] = useState<Set<string>>(new Set());
  const [clipDl, setClipDl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  // stats
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  // assess
  const [quran, setQuran] = useState<QuranSurah[] | null>(null);
  const [ayah, setAyah] = useState<AyahPick | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSurah, setPickSurah] = useState(1);
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [refVol, setRefVol] = useState(0.8);
  const playRef = useRef<{ stop(): void } | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const framesRef = useRef<() => PitchFrame[]>(() => []);
  const rangeRef = useRef<{ lo: number; hi: number } | null>(null);

  const frames = useCallback(() => framesRef.current(), []);
  const listening = !!stream;

  useEffect(() => {
    void listRefs().then(setRefs).catch(() => {});
    const refreshCached = () => void getCachedAudioKeys().then(setClipCached).catch(() => {});
    refreshCached();
    window.addEventListener("waqt:audio-cache-changed", refreshCached);
    void fetch("/api/recite-clips")
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d) => setClips(Array.isArray(d.clips) ? d.clips : []))
      .catch(() => setClips([]));
    void listSessions().then(setSessions).catch(() => setSessions([]));
    // Warm the phoneme engine during idle — deep grading borrows the warm
    // worker instead of paying a fresh ~66MB model load after every take.
    void engineInstalled().then((ok) => { if (ok) warmQt(); }).catch(() => {});
    return () => window.removeEventListener("waqt:audio-cache-changed", refreshCached);
  }, []);

  // Quran text — local asset, cached by the SW for offline assess
  useEffect(() => {
    if (tab !== "assess" || quran) return;
    void fetch("/data/quran.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d)) setQuran(d); else setQuran([]); })
      .catch(() => setQuran([]));
  }, [tab, quran]);

  useEffect(() => {
    if (!stream) return;
    framesRef.current = stream.frames;
    rangeRef.current = null;
    const id = setInterval(() => {
      const fs = stream.frames();
      const last = fs.length ? fs[fs.length - 1] : null;
      setReadout(last && last.voiced ? last : null);
      // session pitch span — what you actually reached, lo→hi
      for (const f of fs) {
        if (!f.voiced) continue;
        if (!rangeRef.current) rangeRef.current = { lo: f.hz, hi: f.hz };
        else { if (f.hz < rangeRef.current.lo) rangeRef.current.lo = f.hz; if (f.hz > rangeRef.current.hi) rangeRef.current.hi = f.hz; }
      }
      setLiveRange(rangeRef.current ? [rangeRef.current.lo, rangeRef.current.hi] : null);
    }, 90);
    return () => clearInterval(id);
  }, [stream]);

  // Tab-to-begin lives below `toggle` — see the keydown effect after it.

  // ---------------------------------------------------------------- ayah

  function randomAyah(from?: QuranSurah[]): AyahPick | null {
    const q = from ?? quran;
    if (!q?.length) return null;
    const s = q[Math.floor(Math.random() * q.length)];
    const v = s.verses[Math.floor(Math.random() * s.verses.length)];
    return { surah: s.s, ayah: v[0], ar: v[1], en: v[2] };
  }

  function spinAyah() {
    if (spinning || !quran?.length) return;
    setSpinning(true);
    setErr("");
    let ticks = 0;
    spinRef.current = setInterval(() => {
      ticks++;
      const a = randomAyah();
      if (a) setAyah(a);
      if (ticks >= 14) { // ~900ms of tumbling, then it lands
        if (spinRef.current) clearInterval(spinRef.current);
        spinRef.current = null;
        setSpinning(false);
      }
    }, 65);
  }

  function chooseAyah(sNum: number, aNum: number) {
    const s = quran?.find((x) => x.s === sNum);
    const v = s?.verses.find((x) => x[0] === aNum);
    if (s && v) setAyah({ surah: sNum, ayah: aNum, ar: v[1], en: v[2] });
    setPickOpen(false);
  }

  // ------------------------------------------------------------- reference

  function downmix16k(pcm: Float32Array, sr: number) {
    if (sr <= 16000) return pcm;
    const ratio = sr / 16000;
    const out = new Float32Array(Math.floor(pcm.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const s = Math.floor(i * ratio);
      let sum = 0, n = 0;
      for (let j = s; j < Math.min(s + Math.ceil(ratio), pcm.length); j++) { sum += pcm[j]; n++; }
      out[i] = sum / n;
    }
    return out;
  }

  async function setRefFromBuffer(buf: AudioBuffer, name: string) {
    const ch0 = buf.getChannelData(0);
    const mono = buf.numberOfChannels > 1 ? Float32Array.from(ch0) : ch0;
    for (let c = 1; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    setRefBuf(buf);
    setRefFrames(await extractContour(downmix16k(mono, buf.sampleRate), Math.min(buf.sampleRate, 16000)));
    setRefName(name);
    setRefExpected(null);
    setCmp(null);
  }

  function clipUrl(c: ServerClip) {
    return `/api/recite-clips?stream=${c.id}`;
  }

  async function loadClip(c: ServerClip) {
    setErr("");
    setClipLoading(c.id);
    const url = clipUrl(c);
    try {
      const hit = await caches.open(AUDIO_CACHE_NAME).then((cache) => cache.match(new Request(url)));
      const res = hit ?? await fetch(`${url}&proxy=1`);
      if (!res.ok) throw new Error();
      const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      await setRefFromBuffer(buf, `${c.reciter ? c.reciter + " — " : ""}${c.title}`);
      if (c.analysis?.passage?.surah && c.analysis.passage.ayah) {
        setRefExpected({
          surah: c.analysis.passage.surah,
          ayah: c.analysis.passage.ayah,
          ayahEnd: c.analysis.passage.ayahEnd,
        });
      }
      setPickerOpen(false);
    } catch {
      setErr("Couldn't load that clip.");
    } finally {
      setClipLoading(null);
    }
  }

  function previewClip(e: React.MouseEvent, c: ServerClip) {
    e.stopPropagation();
    if (previewing === c.id) {
      previewRef.current?.pause();
      previewRef.current = null;
      setPreviewing(null);
      return;
    }
    previewRef.current?.pause();
    const a = new Audio(clipUrl(c));
    a.onended = () => setPreviewing(null);
    a.onerror = () => setPreviewing(null);
    previewRef.current = a;
    setPreviewing(c.id);
    void a.play().catch(() => setPreviewing(null));
  }

  async function toggleClipOffline(e: React.MouseEvent, c: ServerClip) {
    e.stopPropagation();
    const url = clipUrl(c);
    const key = audioCacheKey(url);
    setErr("");
    if (clipCached.has(key)) {
      await removeAudioOffline(url).catch(() => setErr("Couldn't remove the download."));
      getCachedAudioKeys().then(setClipCached).catch(() => {});
      return;
    }
    setClipDl(c.id);
    try {
      await saveAudioOffline(url, { talkId: c.id, title: c.title, fileSize: c.fileSize ?? undefined });
      setClipCached(await getCachedAudioKeys());
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't download that clip.");
    } finally {
      setClipDl(null);
    }
  }

  async function removeRef(id: number | undefined) {
    if (id == null) return;
    const target = refs.find((r) => r.id === id);
    await deleteRef(id).catch(() => {});
    setRefs((rs) => rs.filter((r) => r.id !== id));
    if (target && refName === target.name) { setRefName(""); setRefFrames(null); setRefBuf(null); setRefExpected(null); }
  }

  async function selectRef(row: RefRow) {
    const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
    const buf = ctx.createBuffer(1, row.pcm.length, row.sr);
    buf.copyToChannel(row.pcm as Float32Array<ArrayBuffer>, 0);
    await setRefFromBuffer(buf, row.name);
    setPickerOpen(false);
  }

  async function loadRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      await setRefFromBuffer(buf, file.name);
      setPickerOpen(false);
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

  function startMonitor() {
    if (!refBuf || !monitor) return;
    const ctx = playCtxRef.current ?? (playCtxRef.current = new AudioContext());
    const src = ctx.createBufferSource();
    src.buffer = refBuf;
    const gain = ctx.createGain();
    gain.gain.value = refVol;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => { playRef.current = null; };
    src.start();
    playRef.current = { stop: () => { try { src.stop(); } catch { /* ended */ } } };
  }

  // ------------------------------------------------------------- recording

  async function begin(k: SessionKind) {
    setErr("");
    setReport(null);
    setDeep(null);
    setLadder(null);
    setCmp(null);
    setMismatch(false);
    if (stream) {
      stream.stop();
      setStream(null);
      framesRef.current = () => [];
      setReadout(null);
    }
    if (k === "assess" && !ayah) { setErr("Pick or spin an āyah first."); return; }
    try {
      const s = await startPitchStream();
      s.startRecording();
      setKind(k);
      setStream(s);
      if (k === "practice") startMonitor();
    } catch {
      setErr("Microphone unavailable — check permission.");
    }
  }

  async function toggle() {
    if (!stream) {
      await begin(tab === "assess" ? "assess" : "practice");
      return;
    }
    const hist = stream.history();
    const { pcm, t0 } = await stream.stopRecording();
    const rate = stream.sampleRate;
    const k = kind;
    stream.stop();
    playRef.current?.stop();
    playRef.current = null;
    setPlaying(false);
    setStream(null);
    framesRef.current = () => [];
    setReadout(null);

    if (k === "recref") {
      if (pcm.length / rate < 2) { setErr("Too short — hold it for a couple of seconds."); return; }
      const row = newRefRow(rate, pcm);
      try {
        row.id = await saveRef(row);
        setRefs((rs) => [row, ...rs]);
        await selectRef(row);
      } catch { /* storage best-effort */ }
      return;
    }

    setRecT0(t0);
    const label = k === "assess" && ayah
      ? `${SURAHS[ayah.surah - 1]?.name ?? `Surah ${ayah.surah}`} · ${ayah.surah}:${ayah.ayah}`
      : refName || "Free read";
    setReportLabel(label);

    if (!(hist.length && hist[hist.length - 1].t - hist[0].t >= 3)) return;
    const rep = analyze(hist);
    setReport(rep);
    setTakeFrames(hist);
    setCmp(refFrames && k === "practice" ? compareContours(hist, refFrames) : null);
    setGrading(true);
    let d: DeepGrade | undefined;
    try {
      const expected = k === "assess" && ayah
        ? { surah: ayah.surah, ayah: ayah.ayah, ayahEnd: ayah.ayah }
        : k === "practice" ? refExpected : null;
      d = await gradeAudio(pcm, rate, expected) ?? undefined;
    } catch { /* style tier still shown */ }
    setDeep(d);
    setGrading(false);

    // wrong-āyah guard: locked decode emits verdicts; if most words are
    // flagged/unheard, what they recited isn't the displayed passage
    if (k === "assess" && d?.wordVerdicts.length) {
      const flagged = d.wordVerdicts.filter((w) =>
        w.slip || (w.vowelErrors?.length ?? 0) > 0 ||
        (w.state && w.state !== "heard" && w.state !== "ok")).length;
      if (flagged / d.wordVerdicts.length > 0.6) setMismatch(true);
    }

    try {
      const row = newSessionRow(rep, d, label);
      const hist2 = await listSessions();
      await saveSession(row);
      setSessions(await listSessions().catch(() => null));
      setLadder(ladderRows(rep.axes, hist2));
    } catch { /* storage is best-effort */ }
  }

  // Tab begins/ends the take — declared after toggle so the handler binds the
  // current closure, not a stale one.
  useEffect(() => {
    if (tab !== "assess") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || report || spinning) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      void toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, report, spinning, stream, ayah]);

  // ------------------------------------------------------------------ ui

  const TABS: { key: Tab; label: string }[] = [
    { key: "stats", label: "Stats" },
    { key: "practice", label: "Practice" },
    { key: "assess", label: "Assess" },
  ];

  const contourBox = (
    <div
      className="relative h-52 overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "#0E1116" }}
    >
      <ContourCanvas getFrames={frames} active={listening} reference={kind === "practice" ? refFrames : null} />
      <div className="absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] tabular-nums" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9fb0c0" }}>
        {readout ? `${hzToNote(readout.hz)} · ${Math.round(readout.hz)} Hz` : listening ? "listening…" : refName && kind === "practice" ? `ref: ${refName}` : "—"}
      </div>
      {liveRange && (
        <div className="absolute bottom-3 left-3 rounded-full px-3 py-1 text-[10px] tabular-nums" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9fb0c0" }}>
          span {hzToNote(liveRange[0])}–{hzToNote(liveRange[1])}
        </div>
      )}
      {refName && !listening && kind === "practice" && (
        <div className="absolute right-3 top-3">
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
  );

  const recordButton = (onPress?: () => void, label?: string) => (
    <div className="flex flex-col items-center pb-4 pt-5">
      <button
        onClick={onPress ?? (() => void toggle())}
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
        {label ?? (listening ? "recite — tap to grade" : "tap to begin")}
      </p>
    </div>
  );

  const reportSection = report && (
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
      {mismatch && (
        <div className="mx-5 mt-3 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "#f87171", color: "#f87171" }}>
          That doesn&apos;t sound like the displayed āyah — most words didn&apos;t match. Check you read the right passage; this report is kept for reference only.
        </div>
      )}
      {reportLabel && (
        <p className="px-5 pt-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
          {reportLabel}
        </p>
      )}
      <ReportCard
        report={report} deep={deep} ladder={ladder} recT0={recT0} cmp={cmp}
        frames={takeFrames}
        verseText={(s, a) => quran?.find((x) => x.s === s)?.verses.find((v) => v[0] === a)?.[1]}
      />
      <div className="px-5 pb-8">
        <button
          onClick={() => { setReport(null); setMismatch(false); }}
          className="w-full rounded-xl border py-3 text-sm font-medium transition-transform active:scale-[0.98]"
          style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
        >
          Recite again
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[70vh] flex-col">
      {/* tabs — no header, the segments are the identity */}
      <div className="mx-4 mt-3 flex gap-1 rounded-full border p-1" style={{ borderColor: "var(--color-paper-3)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setErr(""); }}
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

      {err && <p className="mx-4 mt-2 text-xs" style={{ color: "#f87171" }}>{err}</p>}

      {/* ── STATS ── */}
      {tab === "stats" && (
        <div className="mx-4 mt-4 space-y-4 pb-8">
          {!sessions ? (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
              <TrendingUp className="mx-auto mb-2 h-5 w-5" style={{ color: "var(--color-ink-muted)" }} />
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                No sessions yet — record in Practice or Assess and your history starts here.
              </p>
            </div>
          ) : (
            (() => {
              const last = sessions[0];
              const first = sessions[sessions.length - 1];
              const rows = ladderRows(
                Object.entries(last.axes).map(([key, value]) => ({ key, value })),
                sessions.slice(1),
              );
              const rungs = nextRungs(rows, 1);
              const best = Math.max(...sessions.map((s) => s.score));
              const gained = last.score - first.score;
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { k: "Started", v: String(first.score), sub: new Date(first.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) },
                      { k: "Latest", v: String(last.score), sub: sessions.length > 1 && gained !== 0 ? `${gained > 0 ? "+" : ""}${gained} since` : "" },
                      { k: "Best", v: String(best), sub: `${sessions.length} session${sessions.length === 1 ? "" : "s"}` },
                    ].map((s) => (
                      <div key={s.k} className="rounded-xl border p-3 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
                        <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.v}</p>
                        <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{s.k}</p>
                        {s.sub && <p className="text-[9px]" style={{ color: "var(--color-ink-muted)", opacity: 0.7 }}>{s.sub}</p>}
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
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Sessions</h2>
                    <div className="space-y-1">
                      {sessions.slice(0, 15).map((s, i) => (
                        <div key={s.ts} className="flex items-center justify-between rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--color-paper-3)" }}>
                          <span className="min-w-0 truncate" style={{ color: "var(--color-ink-muted)" }}>
                            <span style={{ color: "var(--color-ink)" }}>{s.label ?? "Session"}</span>
                            {" · "}{new Date(s.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {i === 0 ? " · latest" : ""}
                          </span>
                          <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink)" }}>
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

      {/* ── PRACTICE ── */}
      {tab === "practice" && (
        <div className="mx-4 mt-4 space-y-3 pb-8">
          {report ? reportSection : (
            <>
              {/* reference strip */}
              {refName ? (
                <div className="flex items-center gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-paper-3)" }}>
                  <button
                    onClick={togglePlay}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
                    aria-label={playing ? "Pause" : "Play reference"}
                  >
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium" style={{ color: "var(--color-ink)" }}>{refName}</p>
                    <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                      {refExpected ? `locked to ${refExpected.surah}:${refExpected.ayah}` : "gold line on the canvas"}
                    </p>
                  </div>
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
                  <button
                    onClick={() => { setRefName(""); setRefFrames(null); setRefBuf(null); setRefExpected(null); setCmp(null); }}
                    aria-label="Clear reference"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {contourBox}

              {/* monitor option — reference plays aloud while you record */}
              {refName && !listening && (
                <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  <input
                    type="checkbox"
                    checked={monitor}
                    onChange={(e) => setMonitor(e.target.checked)}
                    className="accent-[#4ade80]"
                  />
                  Play the reference aloud while I record
                  <span style={{ opacity: 0.7 }}>(headphones — speakers bleed into the take)</span>
                </label>
              )}

              {recordButton(
                refName || listening ? undefined : () => setPickerOpen(true),
                listening ? "recite — tap to grade" : refName ? "tap to recite" : "tap — then pick a reference",
              )}
            </>
          )}
        </div>
      )}

      {/* ── ASSESS ── */}
      {tab === "assess" && (
        <div className="mx-4 mt-4 space-y-3 pb-8">
          {report ? reportSection : (
            <>
              {/* āyah card */}
              <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setPickOpen((o) => !o)}
                    className="flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    {ayah ? `${SURAHS[ayah.surah - 1]?.name ?? `Surah ${ayah.surah}`} · ${ayah.surah}:${ayah.ayah}` : "Choose an āyah"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={spinAyah}
                    disabled={spinning || !quran?.length || listening}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-transform active:scale-95 disabled:opacity-50"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                  >
                    <Dices className="h-3 w-3" />
                    {spinning ? "…" : "random"}
                  </button>
                </div>

                {pickOpen && (
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      value={pickSurah}
                      onChange={(e) => setPickSurah(Number(e.target.value))}
                      className="min-w-0 flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-xs"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                    >
                      {SURAHS.map((s, i) => <option key={i + 1} value={i + 1}>{i + 1}. {s.name}</option>)}
                    </select>
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) chooseAyah(pickSurah, Number(e.target.value)); }}
                      className="w-24 rounded-lg border bg-transparent px-2 py-1.5 text-xs"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                    >
                      <option value="" disabled>āyah</option>
                      {quran?.find((s) => s.s === pickSurah)?.verses.map((v) => (
                        <option key={v[0]} value={v[0]}>{v[0]}</option>
                      ))}
                    </select>
                  </div>
                )}

                {ayah ? (
                  <>
                    <p
                      dir="rtl"
                      className={`mt-3 text-center text-xl leading-[2.2] transition-opacity ${spinning ? "opacity-40" : "opacity-100"}`}
                      style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink)" }}
                    >
                      {ayah.ar}
                    </p>
                    {!spinning && (
                      <p className="mt-1 text-center text-[11px] italic" style={{ color: "var(--color-ink-muted)" }}>
                        {ayah.en}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {quran === null ? "Loading the muṣḥaf…" : "Spin for a random āyah or pick one above."}
                  </p>
                )}
              </div>

              {contourBox}

              {recordButton(undefined, listening
                ? "recite to the end — tap to grade"
                : ayah ? "press Tab or tap to begin" : "pick an āyah first")}
            </>
          )}
        </div>
      )}

      {/* ── clip picker modal ── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ backgroundColor: "rgba(14,17,22,0.6)" }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t p-4 sm:rounded-2xl sm:border"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
                <Music2 className="mr-1 inline h-3.5 w-3.5" /> Pick a reference
              </p>
              <button onClick={() => setPickerOpen(false)} aria-label="Close" style={{ color: "var(--color-ink-muted)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {clips === null ? (
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
            ) : clips.length === 0 ? (
              <p className="rounded-xl border p-4 text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                No clips published yet — your admin library fills this shelf.
              </p>
            ) : (
              <div className="space-y-1.5">
                {clips.map((c) => {
                  const cached = clipCached.has(audioCacheKey(clipUrl(c)));
                  return (
                    <div
                      key={c.id}
                      className="flex w-full items-center gap-1 rounded-xl border pl-2 pr-1.5 py-1.5"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                    >
                      <button
                        onClick={(e) => previewClip(e, c)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                        aria-label={previewing === c.id ? "Stop preview" : "Preview clip"}
                      >
                        {previewing === c.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => void loadClip(c)}
                        disabled={clipLoading === c.id}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-left disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium" style={{ color: "var(--color-ink)" }}>{c.title}</p>
                          <p className="truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                            {[c.reciter, c.passage, c.style, c.duration ? `${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : null].filter(Boolean).join(" · ")}
                            {c.analysis?.words && <span style={{ color: "var(--color-accent)" }}> · analyzed</span>}
                            {cached && <span style={{ color: "var(--color-success)" }}> · offline</span>}
                          </p>
                        </div>
                        {clipLoading === c.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: "var(--color-accent)" }} />}
                      </button>
                      <button
                        onClick={(e) => void toggleClipOffline(e, c)}
                        disabled={clipDl === c.id}
                        title={cached ? "Remove offline copy" : "Download for offline practice"}
                        className="shrink-0 rounded-lg p-2"
                        style={{ color: cached ? "var(--color-success)" : "var(--color-ink-muted)", minWidth: 36, minHeight: 36 }}
                      >
                        {clipDl === c.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : cached ? <HardDriveDownload className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* your own clips */}
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
              Yours — on this device only
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setPickerOpen(false); void (stream && kind === "recref" ? toggle() : begin("recref")); }}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-transform active:scale-95"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
              >
                <Mic className="h-3 w-3" /> record a clip
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
                    <button onClick={() => void selectRef(r)} style={{ color: refName === r.name ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                      {r.name}
                    </button>
                    <button onClick={() => void removeRef(r.id)} aria-label="Delete clip" style={{ color: "var(--color-ink-muted)" }}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Server-side recite-clip analysis.
 *
 * Runs the same Zipformer phoneme engine the app uses (onnxruntime-node)
 * against an uploaded clip, entirely inside the process route:
 *   pass 1 — free decode auto-locates the passage (surah:ayah range)
 *   pass 2 — locked decode against the located passage: per-word spans via
 *            the tracker's heard→expected trail, madd runs in haraka units,
 *            ghunnah ms, saktah marks, pauses, word verdicts
 *
 * Engine assets are the same files the browser downloads — vendored in R2
 * under quran-tester/ and cached in /tmp across warm invocations.
 *
 * Style is a tempo heuristic (median phoneme gap), not a certainty — the
 * admin can still override the column.
 */
import * as ort from "onnxruntime-node";
import { createRecognitionSession, type RecognitionSession } from "@tilawa/core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { downloadObjectToFile } from "@/lib/r2/client";

const ENGINE_DIR = join(tmpdir(), "waqt-recite-engine");
const ENGINE_FILES = ["model.onnx", "corpus.json"] as const;

async function ensureEngine(): Promise<void> {
  mkdirSync(ENGINE_DIR, { recursive: true });
  for (const name of ENGINE_FILES) {
    const p = join(ENGINE_DIR, name);
    if (!existsSync(p)) {
      await downloadObjectToFile(`quran-tester/${name}`, p);
    }
  }
}

function decodePcm(path: string): Float32Array {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary missing");
  const out = execFileSync(ffmpegPath, [
    "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-",
  ], { maxBuffer: 1024 * 1024 * 1024 });
  return new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4));
}

async function makeSession(onEvent: (m: Record<string, unknown>) => void): Promise<RecognitionSession> {
  const model = readFileSync(join(ENGINE_DIR, "model.onnx"));
  const corpus = JSON.parse(readFileSync(join(ENGINE_DIR, "corpus.json"), "utf8"));
  const session = await createRecognitionSession({
    ort: ort as never,
    model,
    corpus,
    onEvent: (m: unknown) => onEvent(m as Record<string, unknown>),
    slipHead: "high",
    config: {
      settleFrames: 15,
      holdWindow: 22,
      holdRate: 0.6,
      lostRate: 0.45,
      relocateEveryFrames: 30,
      relocateQueryChars: 80,
    },
    debug: false,
  } as Parameters<typeof createRecognitionSession>[0]);
  session.zipformer?.correction.setMode("correction");
  if (session.zipformer) Object.assign(session.zipformer.correction.thresholds, {
    omissionMaxHeard: 0.5, substitutionDistance: 0.7, vowelMargin: 0.08, vowelWordMargin: 0.85,
  });
  return session;
}

async function decode(session: RecognitionSession, pcm: Float32Array) {
  const CHUNK = 16384;
  for (let i = 0; i < pcm.length; i += CHUNK) {
    await session.feed(pcm.slice(i, i + CHUNK) as Float32Array);
  }
  await session.stop();
}

interface Heard { ch: string; frame: number }
interface EngineInternals {
  engine?: {
    buffer?: Heard[];
    tracker?: { heard: Heard[]; trail: number[]; localWordOfPos: Int32Array; firstWord: number };
    corpus?: { wordSurah: Int32Array; wordAyah: Int32Array; wordInAyah: Int32Array };
  };
  decoder?: { framesDecoded?: number };
}
const internals = (s: RecognitionSession) => (s.zipformer as unknown as EngineInternals | null);

const ELONG = /^[اـۥۦ۾]+$/;
const NASAL = /ڇ|نن|مم|ں/;

function measureRuns(chars: Heard[], msPerFrame: number) {
  const madds: { ms: number; at: number; cls: "lazim" | "jaiz" | "qasr"; haraka?: number }[] = [];
  const ghunnahs: { ms: number; at: number }[] = [];
  let runFrame = -1, runAt = -1, runKind: "madd" | "ghunna" | null = null, runTok = "";
  const close = (endFrame: number) => {
    if (runFrame >= 0 && runKind) {
      const ms = Math.max(0, (endFrame - runFrame) * msPerFrame);
      if (runKind === "madd") {
        const cls = runTok.includes("ۦ") ? "lazim" as const : runTok.includes("ۥ") ? "jaiz" as const : "qasr" as const;
        madds.push({ ms, at: runAt, cls });
      } else ghunnahs.push({ ms, at: runAt });
    }
    runFrame = -1; runKind = null; runTok = "";
  };
  chars.forEach((c, i) => {
    const kind = (ELONG.test(c.ch) && c.ch !== "ا") ? "madd" as const : NASAL.test(c.ch) ? "ghunna" as const : null;
    if (kind === runKind) { if (kind) runTok += c.ch; return; }
    close(c.frame);
    runKind = kind; runFrame = kind ? c.frame : -1; runAt = kind ? i : -1; runTok = kind ? c.ch : "";
  });
  if (chars.length) close(chars[chars.length - 1].frame + 1);
  return { madds, ghunnahs };
}

function harakaMs(heard: Heard[], msPerFrame: number): number {
  const gaps: number[] = [];
  for (let i = 1; i < heard.length; i++) {
    const d = heard[i].frame - heard[i - 1].frame;
    if (d > 0 && !ELONG.test(heard[i].ch)) gaps.push(d);
  }
  gaps.sort((a, b) => a - b);
  return gaps.length ? gaps[gaps.length >> 1] * msPerFrame : 0;
}

export interface ClipAnalysisResult {
  analysis: Record<string, unknown>;
  passage: { surah: number; ayah: number; ayahEnd: number } | null;
  /** murattal | mujawwad — tempo heuristic only */
  style: string | null;
}

export async function analyzeClipAudio(inputPath: string): Promise<ClipAnalysisResult> {
  await ensureEngine();
  const pcm = decodePcm(inputPath);
  const audioMs = (pcm.length / 16000) * 1000;

  // ── pass 1: locate ──
  // The engine surfaces position through verse_match (confirmed track) and
  // verse_candidate (speculative) events — candidates carry {surah, ayah}.
  // Modal surah + min/max ayah of confirmed matches = the recited range.
  const strong: { surah: number; ayah: number }[] = [];
  const weak: { surah: number; ayah: number }[] = [];
  const s1 = await makeSession((m) => {
    if (m.type === "relocated") {
      const to = (m as { to?: { surah: number; ayah: number } }).to;
      if (to) strong.push({ surah: to.surah, ayah: to.ayah });
      return;
    }
    if (m.type === "verse_match" || m.type === "located" || m.type === "cursor") {
      const cands = (m.candidates as { surah: number; ayah: number }[] | undefined)
        ?? [m as { surah?: number; ayah?: number }];
      for (const c of cands) if (c?.surah && c?.ayah) strong.push({ surah: c.surah, ayah: c.ayah });
    }
    if (m.type === "verse_candidate") {
      const cands = (m.candidates as { surah: number; ayah: number }[] | undefined)
        ?? [m as { surah?: number; ayah?: number }];
      for (const c of cands) if (c?.surah && c?.ayah) weak.push({ surah: c.surah, ayah: c.ayah });
    }
  });
  await decode(s1, pcm);

  const hits = strong.length ? strong : weak;
  if (!hits.length) {
    // Couldn't anchor the recitation — still return what we heard so the
    // admin sees the attempt; passage/style stay unset for manual entry.
    return { analysis: { version: 1, located: false, durationSec: +(pcm.length / 16000).toFixed(1) }, passage: null, style: null };
  }
  const bySurah = new Map<number, number[]>();
  for (const h of hits) {
    const arr = bySurah.get(h.surah) ?? [];
    arr.push(h.ayah);
    bySurah.set(h.surah, arr);
  }
  const [surah, ayahs] = [...bySurah.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const passage = { surah, ayah: Math.min(...ayahs), ayahEnd: Math.max(...ayahs) };

  // ── pass 2: locked decode → verdicts + word spans ──
  const verdicts: Record<string, unknown>[] = [];
  const correctionNotes: Record<string, unknown>[] = [];
  const s2 = await makeSession((m) => {
    if (m.type === "verdicts" && Array.isArray(m.changes)) verdicts.push(...(m.changes as Record<string, unknown>[]));
    if (m.type === "correction_note") correctionNotes.push(m.issue as Record<string, unknown>);
  });
  s2.zipformer?.setExpected({ surah: passage.surah, ayah: passage.ayah, ayahEnd: passage.ayahEnd });
  await decode(s2, pcm);

  const z = internals(s2);
  const heard = z?.engine?.tracker?.heard ?? z?.engine?.buffer ?? [];
  const framesDecoded = z?.decoder?.framesDecoded ?? 0;
  const msPerFrame = framesDecoded > 0 ? audioMs / framesDecoded : 40;
  const hk = harakaMs(heard, msPerFrame);
  const { madds, ghunnahs } = measureRuns(heard, msPerFrame);
  for (const m of madds) if (hk > 0) m.haraka = +(m.ms / hk).toFixed(2);
  const saktahs = heard.filter((c) => c.ch.includes("ۜ")).map((c) => +(c.frame * msPerFrame).toFixed(0));

  // per-word spans via tracker trail: trail[i] = expected ref pos for heard[i]
  interface WordStat {
    surah: number; ayah: number; word: number; wordIndex: number;
    startMs: number; endMs: number; heard: string;
    madds: { ms: number; haraka?: number; cls: string }[];
    ghunnahMs: number;
  }
  const words: WordStat[] = [];
  const tracker = z?.engine?.tracker;
  const corpus = z?.engine?.corpus;
  if (tracker && corpus && tracker.trail.length === tracker.heard.length) {
    const byWord = new Map<number, Heard[]>();
    tracker.heard.forEach((c, i) => {
      const cell = tracker.trail[i];
      if (cell <= 0) return;
      const w = tracker.localWordOfPos[Math.min(cell, tracker.localWordOfPos.length) - 1];
      const arr = byWord.get(w) ?? [];
      arr.push(c);
      byWord.set(w, arr);
    });
    for (const [local, chars] of [...byWord.entries()].sort((a, b) => a[0] - b[0])) {
      const gi = tracker.firstWord + local;
      const runs = measureRuns(chars, msPerFrame);
      for (const m of runs.madds) if (hk > 0) m.haraka = +(m.ms / hk).toFixed(2);
      words.push({
        surah: corpus.wordSurah[gi], ayah: corpus.wordAyah[gi], word: corpus.wordInAyah[gi],
        wordIndex: gi,
        startMs: +(chars[0].frame * msPerFrame).toFixed(0),
        endMs: +((chars[chars.length - 1].frame + 1) * msPerFrame).toFixed(0),
        heard: chars.map((c) => c.ch).join(""),
        madds: runs.madds.map((m) => ({ ms: +m.ms.toFixed(0), haraka: m.haraka, cls: m.cls })),
        ghunnahMs: +runs.ghunnahs.reduce((s, g) => s + g.ms, 0).toFixed(0),
      });
    }
  }

  const pauses: { atMs: number; ms: number }[] = [];
  for (let i = 1; i < heard.length; i++) {
    const gap = (heard[i].frame - heard[i - 1].frame) * msPerFrame;
    if (gap >= 400) pauses.push({ atMs: +(heard[i - 1].frame * msPerFrame).toFixed(0), ms: +gap.toFixed(0) });
  }

  const analysis = {
    version: 1,
    engine: "zipformer-a0w-ep1-a0.5",
    located: true,
    passage,
    durationSec: +(pcm.length / 16000).toFixed(1),
    msPerFrame: +msPerFrame.toFixed(2),
    harakaMs: +hk.toFixed(0),
    words,
    madds: madds.map((m) => ({ ms: +m.ms.toFixed(0), haraka: m.haraka, cls: m.cls })),
    ghunnahs: ghunnahs.map((g) => +g.ms.toFixed(0)),
    saktahs,
    pauses,
    verdicts: verdicts.map((v) => ({
      wordIndex: v.wordIndex, state: v.state, heardRatio: v.heardRatio,
      gop: v.gop, vowelErrors: v.vowelErrors, slip: v.slip,
    })),
    issues: correctionNotes.filter(Boolean),
  };

  // Style heuristic: mujawwad stretches phonemes (~150ms+ median gap);
  // murattal runs tighter. Deliberately a guess — admin can override.
  const style = hk >= 150 ? "mujawwad" : "murattal";

  return { analysis, passage, style };
}

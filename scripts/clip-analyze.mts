/**
 * Recite-clip analysis pipeline (runs locally, per upload batch).
 *
 *   pnpm tsx scripts/clip-analyze.mts <audio-file> [--passage 1:1-7] [--yes] [--out file.analysis.json]
 *
 * Pipeline:
 *   1. ffmpeg → 16kHz mono PCM
 *   2. Pass 1 — free decode through the same Zipformer engine the app uses:
 *      auto-locates the passage (surah:ayah) from the audio itself
 *   3. You confirm the located passage (or --passage / --yes skips the ask)
 *   4. Pass 2 — decode again with the passage locked: per-word verdicts
 *      (GOP, vowel errors, slip prob) + exact word spans via the tracker's
 *      heard→expected trail
 *   5. Per-word stats: timings, heard phonemes, madd runs (class + haraka),
 *      ghunnah ms, pauses/saktah positions
 *   6. Writes <name>.analysis.json — attach it in Admin → Recite Clips upload
 *
 * Engine assets land in scripts/.engine/ on first run (same files the app
 * downloads: model.onnx ~66MB + corpus.json ~5.5MB).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import * as ort from "onnxruntime-node";
import { createRecognitionSession, type RecognitionSession } from "@tilawa/core";
import ffmpegPath from "ffmpeg-static";

// ── args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const audioPath = args.find((a) => !a.startsWith("--"));
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const YES = args.includes("--yes");
const passageArg = opt("passage");
if (!audioPath) {
  console.error("usage: pnpm tsx scripts/clip-analyze.mts <audio-file> [--passage 1:1-7] [--yes] [--out x.json]");
  process.exit(1);
}

// ── engine assets (same upstreams as the app's /qt-dl proxy) ──────────
const ASSET_DIR = join("scripts", ".engine");
const ASSETS: Record<string, string> = {
  "model.onnx": "https://github.com/yazinsai/tilawa/releases/download/zipformer-a0w-ep1-a0.5/zipformer_a0w_ep1_a05.int8.onnx",
  "corpus.json": "https://github.com/yazinsai/tilawa/releases/download/v0.3.0/zipformer_quran.json",
};
async function ensureAssets() {
  mkdirSync(ASSET_DIR, { recursive: true });
  for (const [name, url] of Object.entries(ASSETS)) {
    const p = join(ASSET_DIR, name);
    if (existsSync(p)) continue;
    console.log(`downloading ${name}…`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`download ${name}: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(p));
  }
}

// ── audio → 16k mono f32 ──────────────────────────────────────────────
function decodePcm(path: string): Float32Array {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary missing");
  const out = execFileSync(ffmpegPath, [
    "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-",
  ], { maxBuffer: 1024 * 1024 * 1024 });
  return new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4));
}

// ── same decode settings as the app's worker ──────────────────────────
async function makeSession(onEvent: (m: Record<string, unknown>) => void): Promise<RecognitionSession> {
  const model = readFileSync(join(ASSET_DIR, "model.onnx"));
  const corpus = JSON.parse(readFileSync(join(ASSET_DIR, "corpus.json"), "utf8"));
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

// ── internals (same reach as the app worker's heard-dump) ─────────────
interface Heard { ch: string; frame: number }
interface EngineInternals {
  engine?: {
    buffer?: Heard[];
    tracker?: { heard: Heard[]; trail: number[]; localWordOfPos: Int32Array; wordStarts: Int32Array; firstWord: number };
    corpus?: { wordSurah: Int32Array; wordAyah: Int32Array; wordInAyah: Int32Array; wordPhonemes(w: number): string };
  };
  decoder?: { framesDecoded?: number };
}
const internals = (s: RecognitionSession) => (s.zipformer as unknown as EngineInternals | null);

// ── madd/ghunnah run measurement (ported from engine/deepGrade.ts) ────
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

// ── pass 1: locate ────────────────────────────────────────────────────
await ensureAssets();
const pcm = decodePcm(audioPath!);
console.log(`decoded ${(pcm.length / 16000).toFixed(1)}s of audio`);

// holder object: TS doesn't narrow property reads across the closure below
const found = { loc: null as { surah: number; ayah: number; lastAyah: number } | null };
const verses = new Set<string>();
const s1 = await makeSession((m) => {
  if (m.type === "located" || m.type === "relocated") {
    const loc = m as { from?: { surah: number; ayah: number }; to?: { surah: number; ayah: number } };
    if (loc.from) found.loc = { surah: loc.from.surah, ayah: loc.from.ayah, lastAyah: loc.from.ayah };
  }
  if (m.type === "cursor") {
    const c = m as { surah: number; ayah: number };
    if (found.loc && c.surah === found.loc.surah) found.loc.lastAyah = Math.max(found.loc.lastAyah, c.ayah);
  }
  if (m.type === "verse_match") {
    const v = m as { surah: number; ayah: number };
    if (v.surah && v.ayah) verses.add(`${v.surah}:${v.ayah}`);
  }
});
console.log("pass 1: locating…");
await decode(s1, pcm);

let passage: { surah: number; ayah: number; ayahEnd: number };
if (passageArg) {
  const m = passageArg.match(/^(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) { console.error("--passage must look like 1:1-7"); process.exit(1); }
  passage = { surah: +m[1], ayah: +m[2], ayahEnd: +(m[3] ?? m[2]) };
} else {
  if (!found.loc) { console.error("couldn't locate the passage — pass --passage S:A-B"); process.exit(1); }
  const guess = { surah: found.loc.surah, ayah: found.loc.ayah, ayahEnd: found.loc.lastAyah };
  console.log(`located: ${guess.surah}:${guess.ayah}-${guess.ayahEnd}  (verses seen: ${[...verses].join(", ") || "none"})`);
  if (YES) {
    passage = guess;
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise<string>((r) => rl.question(`confirm ${guess.surah}:${guess.ayah}-${guess.ayahEnd}? [Y/n or S:A-B] `, r));
    rl.close();
    const t = ans.trim();
    if (/^\d+:\d+(-\d+)?$/.test(t)) {
      const m = t.match(/^(\d+):(\d+)(?:-(\d+))?$/)!;
      passage = { surah: +m[1], ayah: +m[2], ayahEnd: +(m[3] ?? m[2]) };
    } else if (t === "" || /^y/i.test(t)) {
      passage = guess;
    } else {
      console.log("aborted — rerun with --passage S:A-B");
      process.exit(1);
    }
  }
}
console.log(`passage: ${passage.surah}:${passage.ayah}-${passage.ayahEnd}`);

// ── pass 2: locked decode → verdicts + word spans ─────────────────────
// Fresh session (model reload is seconds) so the collector binds cleanly.
const verdicts: Record<string, unknown>[] = [];
const correctionNotes: Record<string, unknown>[] = [];
const s2 = await makeSession((m) => {
  if (m.type === "verdicts" && Array.isArray(m.verdicts)) verdicts.push(...(m.verdicts as Record<string, unknown>[]));
  if (m.type === "correction_note") correctionNotes.push(m.issue as Record<string, unknown>);
});
s2.zipformer?.setExpected({ surah: passage.surah, ayah: passage.ayah, ayahEnd: passage.ayahEnd });
console.log("pass 2: measuring against the locked passage…");
await decode(s2, pcm);

// ── assemble ──────────────────────────────────────────────────────────
const z = internals(s2);
const heard = z?.engine?.tracker?.heard ?? z?.engine?.buffer ?? [];
const framesDecoded = z?.decoder?.framesDecoded ?? 0;
const audioMs = (pcm.length / 16000) * 1000;
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

// pauses: gaps between consecutive heard chars > 400ms
const pauses: { atMs: number; ms: number }[] = [];
for (let i = 1; i < heard.length; i++) {
  const gap = (heard[i].frame - heard[i - 1].frame) * msPerFrame;
  if (gap >= 400) pauses.push({ atMs: +(heard[i - 1].frame * msPerFrame).toFixed(0), ms: +gap.toFixed(0) });
}

const analysis = {
  version: 1,
  engine: "zipformer-a0w-ep1-a0.5",
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

const outPath = opt("out") ?? audioPath!.replace(/\.[^.]+$/, "") + ".analysis.json";
writeFileSync(outPath, JSON.stringify(analysis, null, 1));
console.log(`\nwrote ${outPath}`);
console.log(`  ${words.length} words · ${madds.length} madds · ${ghunnahs.length} ghunnah holds · ${pauses.length} pauses · ${verdicts.length} verdicts`);
console.log(`  attach "${basename(outPath)}" in Admin → Recite Clips when uploading`);

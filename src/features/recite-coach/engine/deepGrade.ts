"use client";

// Deep grade: replay the recorded session PCM through the phoneme engine in
// a fresh worker, collecting per-word correction issues. This is the law
// layer — live MPM gives contour; this gives "which words were right/wrong".
// Requires the tester's engine assets to be installed (engineInstalled());
// when they aren't, the report shows the style tier only and says so.

import { engineInstalled } from "@/features/quran-tester/engine";
import { borrowQtEngine, qtPost, subscribeQt } from "@/features/quran-tester/session";

export interface DeepIssue {
  surah: number;
  ayah: number;
  word: number;
  kind: string;
}

export interface SpanMeasure {
  ms: number;
  /** char offset in the heard stream */
  at: number;
  /** madd class from the token the model heard: lazim 6ḥ, jaiz ~4-5ḥ, other ~2ḥ */
  cls?: "lazim" | "jaiz" | "qasr";
  /** measured length in ḥaraka units (ms / session's median phoneme duration) */
  haraka?: number;
}

export interface WordVerdict {
  wordIndex: number;
  surah?: number;
  ayah?: number;
  word?: number;
  /** "heard" | "partial" | "unheard" | "mismatch" — engine verdict state */
  state?: string;
  gop?: number;
  vowelErrors?: unknown[];
  slip?: boolean;
}

export interface WordSpan {
  surah: number;
  ayah: number;
  /** word position inside the āyah (1-based) */
  word: number;
  wordIndex: number;
  /** seconds into the session audio */
  startSec: number;
  endSec: number;
  /** phonemes the engine actually heard, joined */
  heard: string;
  madds: { ms: number; cls?: "lazim" | "jaiz" | "qasr"; haraka?: number }[];
  ghunnahMs: number;
}

export interface DeepGrade {
  issues: DeepIssue[];
  /** per-word grading — the word-for-word breakdown */
  wordVerdicts: WordVerdict[];
  /** ayahs the tracker matched — where the recitation was */
  verses: string[];
  /** per-word time spans + measured runs, via the tracker trail */
  words: WordSpan[];
  wordsHeard: number;
  /** measured elongation (madd) run durations, ms */
  madds: SpanMeasure[];
  /** measured nasal (ghunnah) run durations, ms */
  ghunnahs: SpanMeasure[];
  /** heard saktah (breathless-pause) marks — position in ms of session audio */
  saktahs: number[];
  /** ms per CTC frame, calibrated from audio length — for pause↔frame mapping */
  msPerFrame: number;
}

// Elongation tokens: ۥ/ۦ/۾ elongation marks, tatweel ـ, repeated ا/و/ي carriers.
export const ELONG = /^[اـۥۦ۾]+$/;
// Nasal tokens: ڇ ghunnah marker, or geminate ن/م repeats (shaddah nasals).
export const NASAL = /ڇ|نن|مم|ں/;

export function measureRuns(chars: { ch: string; frame: number; margin: number }[], msPerFrame: number) {
  const madds: SpanMeasure[] = [];
  const ghunnahs: SpanMeasure[] = [];
  let runFrame = -1;   // CTC frame where the open run started
  let runAt = -1;      // char index where it started
  let runKind: "madd" | "ghunna" | null = null;
  const close = (endFrame: number) => {
    if (runFrame >= 0 && runKind) {
      const ms = Math.max(0, (endFrame - runFrame) * msPerFrame);
      const cls = runKind === "madd"
        ? runTok.includes("ۦ") ? "lazim" as const : runTok.includes("ۥ") ? "jaiz" as const : "qasr" as const
        : undefined;
      (runKind === "madd" ? madds : ghunnahs).push({ ms, at: runAt, cls });
    }
    runFrame = -1;
    runKind = null;
    runTok = "";
  };
  let runTok = "";
  chars.forEach((c, i) => {
    // bare alef is a letter, not a stretch — only multi-alef tokens count
    const kind = (ELONG.test(c.ch) && c.ch !== "ا") ? "madd" as const
      : NASAL.test(c.ch) ? "ghunna" as const : null;
    if (kind === runKind) { if (kind) runTok += c.ch; return; }
    close(c.frame);
    runKind = kind;
    runFrame = kind ? c.frame : -1;
    runAt = kind ? i : -1;
    runTok = kind ? c.ch : "";
  });
  if (chars.length) close(chars[chars.length - 1].frame + 1);
  return { madds, ghunnahs };
}

export async function gradeAudio(
  pcm: Float32Array,
  sampleRate: number,
  /** When practicing against an analyzed reference clip, lock the decode to its
   *  passage — verdicts then grade against what the clip actually recited
   *  (the clip's standard becomes the reference). Omit for free assess. */
  expected?: { surah: number; ayah: number; ayahEnd?: number } | null,
): Promise<DeepGrade | null> {
  if (!(await engineInstalled())) return null;

  // Borrow the warm singleton when it's free — a fresh worker pays the
  // ~66MB model load every take (the ~5s stall before verdicts arrive).
  const borrowed = borrowQtEngine(sampleRate);
  const worker = borrowed ?? new Worker(new URL("../../quran-tester/recite.worker.ts", import.meta.url));
  const issues: DeepIssue[] = [];
  const wordVerdicts: WordVerdict[] = [];
  const verses: string[] = [];
  type RawWord = { surah: number; ayah: number; word: number; wordIndex: number; chars: { ch: string; frame: number; margin: number }[] };
  // Worker events are heterogeneous — one loose-but-typed bag covers them all.
  type EngineMsg = {
    type: string;
    message?: string;
    issue?: { surah: number; ayah: number; wordIndex?: number; word?: number; kind: string };
    surah?: number;
    ayah?: number;
    changes?: { wordIndex?: number; surah: number; ayah: number; word: number; state: string; gop: number; vowelErrors?: string[]; slip?: boolean }[];
    matched_indices?: number[];
    chars?: { ch: string; frame: number; margin: number }[];
    words?: RawWord[];
    framesDecoded?: number;
  };
  let rawWords: RawWord[] = [];
  let wordsHeard = 0;
  let heard: { ch: string; frame: number; margin: number }[] = [];
  let framesDecoded = 0;

  // Event channel differs by worker kind: the shared session worker
  // broadcasts through subscribeQt; a dedicated one uses onmessage.
  const handlers = new Set<(m: EngineMsg) => void>();
  let unsub: (() => void) | null = null;
  if (borrowed) {
    unsub = subscribeQt((ev) => { for (const h of handlers) h(ev as EngineMsg); });
  } else {
    worker.onmessage = (ev: MessageEvent) => { for (const h of handlers) h(ev.data); };
  }
  const post = (msg: Record<string, unknown>) =>
    borrowed ? qtPost(msg) : worker.postMessage(msg);

  try {
    if (!borrowed) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("engine init timed out")), 120_000);
        const h = (m: EngineMsg) => {
          if (m.type === "ready") { clearTimeout(timer); handlers.delete(h); resolve(); }
          else if (m.type === "error") { clearTimeout(timer); handlers.delete(h); reject(new Error(m.message ?? "engine error")); }
        };
        handlers.add(h);
        worker.postMessage({ type: "init", sampleRate });
      });
    }

    // Correction notes + positions arrive on the shared onEvent channel —
    // swap handlers to collect, then feed the whole clip and stop.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("engine decode timed out")), 300_000);
      const h = (m: EngineMsg) => {
        if (m.type === "correction_note" && m.issue) {
          // issue.word is 0-BASED in-ayah; wordIndex is GLOBAL — using the
          // global index here rendered as "word 4523". Display space is
          // 1-based; ayah-level kinds carry no word at all (0).
          const ayahLevel = m.issue.kind === "possible_skipped_ayah" || m.issue.kind === "unclear_ayah";
          issues.push({
            surah: m.issue.surah, ayah: m.issue.ayah,
            word: ayahLevel ? 0 : (m.issue.word ?? 0) + 1, kind: m.issue.kind,
          });
        } else if (m.type === "verse_match" && m.surah) {
          const v = `${m.surah}:${m.ayah}`;
          if (!verses.includes(v)) verses.push(v);
        } else if (m.type === "verdicts" && Array.isArray(m.changes)) {
          for (const c of m.changes) {
            wordVerdicts.push({
              wordIndex: c.wordIndex ?? 0,
              surah: c.surah, ayah: c.ayah, word: c.word + 1, // 0-based in-ayah → 1-based display
              state: c.state, gop: c.gop,
              vowelErrors: c.vowelErrors, slip: c.slip,
            });
          }
        } else if (m.type === "word_progress") {
          wordsHeard = Math.max(wordsHeard, (m.matched_indices?.length ?? 0));
        } else if (m.type === "heard") {
          heard = m.chars ?? [];
          rawWords = m.words ?? [];
          framesDecoded = m.framesDecoded ?? 0;
        } else if (m.type === "stopped") {
          clearTimeout(timer);
          handlers.delete(h);
          resolve();
        } else if (m.type === "error") {
          clearTimeout(timer);
          handlers.delete(h);
          reject(new Error(m.message ?? "engine error"));
        }
      };
      handlers.add(h);
      // Free-decode when no reference: a wrong read must stay wrong. When an
      // analyzed clip is loaded, lock to its passage for real per-word verdicts.
      post({ type: "expect", passage: expected ?? null });
      const CHUNK = 16384;
      for (let i = 0; i < pcm.length; i += CHUNK) {
        post({ type: "audio-sync", samples: pcm.slice(i, i + CHUNK) });
      }
      post({ type: "stop" });
    });
  } finally {
    unsub?.();
    if (borrowed) {
      // Leave the shared engine clean for the next live take.
      post({ type: "reset" });
    } else {
      worker.terminate();
    }
  }

  // framesDecoded vs actual audio length self-calibrates ms/frame — no need
  // to know the model's subsampling factor.
  const audioMs = (pcm.length / sampleRate) * 1000;
  const msPerFrame = framesDecoded > 0 ? audioMs / framesDecoded : 40;
  const { madds, ghunnahs } = measureRuns(heard, msPerFrame);

  // Ḥaraka unit: median inter-token gap over non-elongation tokens — one
  // phoneme ≈ one ḥaraka, calibrated to this reciter's own tempo so a slow
  // mujawwid reader isn't punished for a fast-reader scale.
  const gaps: number[] = [];
  for (let i = 1; i < heard.length; i++) {
    const d = heard[i].frame - heard[i - 1].frame;
    if (d > 0 && !ELONG.test(heard[i].ch)) gaps.push(d);
  }
  gaps.sort((a, b) => a - b);
  const harakaMs = gaps.length ? gaps[gaps.length >> 1] * msPerFrame : 0;
  for (const m of madds) {
    if (harakaMs > 0) m.haraka = m.ms / harakaMs;
  }

  // ۜ = saktah (breathless pause). Each token instance marks where the model
  // heard one — the report matches long pauses to these positions.
  const saktahs = heard.filter((c) => c.ch.includes("ۜ")).map((c) => c.frame * msPerFrame);

  // Per-word spans: same tracker-trail segmentation the clip-analyze script
  // uses, now emitted by the worker. Each word gets its time window (for the
  // report's click-a-word pitch view) plus its own madd/ghunnah measures.
  const words: WordSpan[] = rawWords.map((w) => {
    const runs = measureRuns(w.chars, msPerFrame);
    for (const m of runs.madds) if (harakaMs > 0) m.haraka = m.ms / harakaMs;
    return {
      surah: w.surah, ayah: w.ayah, word: w.word, wordIndex: w.wordIndex,
      startSec: (w.chars[0]?.frame ?? 0) * msPerFrame / 1000,
      endSec: ((w.chars[w.chars.length - 1]?.frame ?? 0) + 1) * msPerFrame / 1000,
      heard: w.chars.map((c) => c.ch).join(""),
      madds: runs.madds,
      ghunnahMs: runs.ghunnahs.reduce((s, g) => s + g.ms, 0),
    };
  });

  return { issues, wordVerdicts, verses, words, wordsHeard, madds, ghunnahs, saktahs, msPerFrame };
}

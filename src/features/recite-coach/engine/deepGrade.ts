"use client";

// Deep grade: replay the recorded session PCM through the phoneme engine in
// a fresh worker, collecting per-word correction issues. This is the law
// layer — live MPM gives contour; this gives "which words were right/wrong".
// Requires the tester's engine assets to be installed (engineInstalled());
// when they aren't, the report shows the style tier only and says so.

import { engineInstalled } from "@/features/quran-tester/engine";

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

export interface DeepGrade {
  issues: DeepIssue[];
  /** ayahs the tracker matched — where the recitation was */
  verses: string[];
  wordsHeard: number;
  /** measured elongation (madd) run durations, ms */
  madds: SpanMeasure[];
  /** measured nasal (ghunnah) run durations, ms */
  ghunnahs: SpanMeasure[];
}

// Elongation tokens: ۥ/ۦ/۾ elongation marks, tatweel ـ, repeated ا/و/ي carriers.
const ELONG = /^[اـۥۦ۾]+$/;
// Nasal tokens: ڇ ghunnah marker, or geminate ن/م repeats (shaddah nasals).
const NASAL = /ڇ|نن|مم|ں/;

function measureRuns(chars: { ch: string; frame: number; margin: number }[], msPerFrame: number) {
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

export async function gradeAudio(pcm: Float32Array, sampleRate: number): Promise<DeepGrade | null> {
  if (!(await engineInstalled())) return null;

  const worker = new Worker(new URL("../../quran-tester/recite.worker.ts", import.meta.url));
  const issues: DeepIssue[] = [];
  const verses: string[] = [];
  let wordsHeard = 0;
  let heard: { ch: string; frame: number; margin: number }[] = [];
  let framesDecoded = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("engine init timed out")), 120_000);
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === "ready") { clearTimeout(timer); resolve(); }
        else if (m.type === "error") { clearTimeout(timer); reject(new Error(m.message)); }
      };
      worker.postMessage({ type: "init", sampleRate });
    });

    // Correction notes + positions arrive on the shared onEvent channel —
    // swap handlers to collect, then feed the whole clip and stop.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("engine decode timed out")), 300_000);
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === "correction_note" && m.issue) {
          issues.push({
            surah: m.issue.surah, ayah: m.issue.ayah,
            word: m.issue.wordIndex ?? m.issue.word ?? 0, kind: m.issue.kind,
          });
        } else if (m.type === "verse_match" && m.surah) {
          const v = `${m.surah}:${m.ayah}`;
          if (!verses.includes(v)) verses.push(v);
        } else if (m.type === "word_progress") {
          wordsHeard = Math.max(wordsHeard, (m.matched_indices?.length ?? 0));
        } else if (m.type === "heard") {
          heard = m.chars ?? [];
          framesDecoded = m.framesDecoded ?? 0;
        } else if (m.type === "stopped") {
          clearTimeout(timer);
          resolve();
        } else if (m.type === "error") {
          clearTimeout(timer);
          reject(new Error(m.message));
        }
      };
      // Free-decode: no expected passage — the coach never tells the engine
      // what it "should" hear; a wrong read must stay wrong.
      worker.postMessage({ type: "expect", passage: null });
      const CHUNK = 16384;
      for (let i = 0; i < pcm.length; i += CHUNK) {
        worker.postMessage({ type: "audio", samples: pcm.slice(i, i + CHUNK) });
      }
      worker.postMessage({ type: "stop" });
    });
  } finally {
    worker.terminate();
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

  return { issues, verses, wordsHeard, madds, ghunnahs };
}

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

export interface DeepGrade {
  issues: DeepIssue[];
  /** ayahs the tracker matched — where the recitation was */
  verses: string[];
  wordsHeard: number;
}

export async function gradeAudio(pcm: Float32Array, sampleRate: number): Promise<DeepGrade | null> {
  if (!(await engineInstalled())) return null;

  const worker = new Worker(new URL("../../quran-tester/recite.worker.ts", import.meta.url));
  const issues: DeepIssue[] = [];
  const verses: string[] = [];
  let wordsHeard = 0;

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

  return { issues, verses, wordsHeard };
}

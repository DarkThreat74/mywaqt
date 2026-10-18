/**
 * Quran Tester — on-device engine assets.
 *
 * Everything this feature needs lives under src/features/quran-tester/ so the
 * whole feature can be lifted into a standalone app later. The recognition
 * model (~66MB) and phoneme corpus (~5MB) are NOT bundled — they download on
 * demand when the user taps "Install engine" and live in a dedicated
 * CacheStorage bucket + IndexedDB flag, so uninstalling frees the space.
 *
 * Model: Quran-Lab zipformer_p-arabic (INT8 ONNX, streaming phoneme CTC).
 * License: NPL-1.2 — free to use/redistribute, never charge for features it
 * powers, and the app must state that automatic tajweed feedback can be wrong
 * and is not a substitute for a qualified teacher.
 */

export interface EngineAsset {
  /** Cache key under /qt/ — also the URL the worker fetches at runtime */
  file: string;
  url: string;
  bytes: number; // expected size, for progress + integrity sanity
}

// Assets come through our own /qt-dl/ proxy — the upstream hosts (GitHub
// release assets) send no CORS headers, so direct browser fetch fails.
// Swap upstream to our own CDN (R2) inside the proxy route when volume grows.
export const ENGINE_ASSETS: EngineAsset[] = [
  {
    file: "model.onnx",
    url: "/qt-dl/model.onnx",
    bytes: 66_000_000,
  },
  {
    file: "corpus.json",
    url: "/qt-dl/corpus.json",
    bytes: 5_500_000,
  },
  // The ort WASM runtimes are vendored static files at /qt/ (public/qt/) —
  // bundled with the app, not part of the download.
];

export const ENGINE_CACHE = "quran-tester-engine-v1";
const LS_KEY = "qt:engine-installed";

export async function engineInstalled(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  if (localStorage.getItem(LS_KEY) !== "1") return false;
  const cache = await caches.open(ENGINE_CACHE);
  for (const a of ENGINE_ASSETS) {
    if (!(await cache.match(engineUrl(a)))) return false;
  }
  return true;
}

export function engineUrl(a: EngineAsset) {
  return `${self.location.origin}/qt/${a.file}`;
}

/** Fetch a cached asset body. Returns null when not installed. */
export async function engineAsset(file: string): Promise<Response | null> {
  const cache = await caches.open(ENGINE_CACHE);
  return (await cache.match(`${self.location.origin}/qt/${file}`)) ?? null;
}

/**
 * Download all engine assets into CacheStorage with byte-level progress.
 * Resumable-ish: already-cached assets are skipped.
 */
export async function downloadEngine(
  onProgress: (doneBytes: number, totalBytes: number, current: string) => void,
): Promise<void> {
  const total = ENGINE_ASSETS.reduce((s, a) => s + a.bytes, 0);
  let done = 0;
  const cache = await caches.open(ENGINE_CACHE);

  for (const a of ENGINE_ASSETS) {
    if (await cache.match(engineUrl(a))) {
      done += a.bytes;
      continue;
    }
    onProgress(done, total, a.file);
    // no-store: the proxy response is HTTP-cacheable, so a re-install would
    // otherwise pull 66MB from the disk cache in seconds and look like the
    // delete never happened. Every install must really download.
    const res = await fetch(a.url, { cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`download failed: ${a.file}`);

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done: fin, value } = await reader.read();
      if (fin) break;
      chunks.push(value);
      onProgress(
        Math.min(done + chunks.reduce((s, c) => s + c.length, 0), total),
        total,
        a.file,
      );
    }
    const blob = new Blob(chunks as BlobPart[]);
    await cache.put(
      engineUrl(a),
      new Response(blob, {
        headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
      }),
    );
    done += blob.size;
    onProgress(done, total, a.file);
  }

  // ort WASM runtime — vendored at /qt/ and cached write-through by the SW,
  // but only on first fetch. Prefetch it here so a user who installs and
  // immediately goes offline can still boot the engine. Both the base and
  // jsep variants; whichever ORT picks, it's resident.
  for (const f of [
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm",
  ]) {
    const key = `${self.location.origin}/qt/${f}`;
    if (await cache.match(key)) continue;
    // Required — "installed" must mean truly offline-ready. These are small
    // same-origin files; if they fail the install was on a dead network and
    // shouldn't claim success.
    const res = await fetch(`/qt/${f}`);
    if (!res.ok) throw new Error(`download failed: ${f}`);
    await cache.put(key, res);
  }

  localStorage.setItem(LS_KEY, "1");
}

/**
 * Wipe ONLY Quran Tester's on-device storage: the shared cache bucket
 * (engine + mushaf pages + glyph fonts), its IndexedDB (local mistake
 * mirror — server copy resyncs on next load), and its localStorage flag.
 * Nothing else in the app is touched.
 */
export async function wipeQuranTesterData(): Promise<void> {
  try { localStorage.removeItem(LS_KEY); } catch {}
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("qt:")) { try { localStorage.removeItem(k); } catch {} }
  }
  if (typeof caches !== "undefined") {
    try { await caches.delete(ENGINE_CACHE); } catch {}
  }
  try {
    await new Promise<void>((res) => {
      const rq = indexedDB.deleteDatabase("quran-tester");
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    });
  } catch {}
}

export async function uninstallEngine(): Promise<void> {
  localStorage.removeItem(LS_KEY);
  if (typeof caches === "undefined") return;
  // Mushaf pages/fonts share this bucket via write-through — nuking the
  // whole bucket is correct (they re-download lazily on next view).
  await caches.delete(ENGINE_CACHE);
  // Verify: if the bucket somehow still holds the model, evict keys one by
  // one — a half-deleted engine is worse than a clean one either way.
  const still = await engineInstalled();
  if (still) {
    const cache = await caches.open(ENGINE_CACHE);
    for (const a of ENGINE_ASSETS) await cache.delete(engineUrl(a));
  }
}

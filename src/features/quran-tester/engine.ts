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
    const res = await fetch(a.url);
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
  localStorage.setItem(LS_KEY, "1");
}

export async function uninstallEngine(): Promise<void> {
  localStorage.removeItem(LS_KEY);
  if (typeof caches !== "undefined") await caches.delete(ENGINE_CACHE);
}

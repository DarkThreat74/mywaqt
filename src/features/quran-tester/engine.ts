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

// ort WASM runtime + capture worklet + basmala font — vendored statics,
// prefetched into the bucket so "installed" means truly offline-ready.
// (QPC2BSML holds the ﭑﭒﭓ glyph codepoints — without it every basmala
// renders as plain letters offline.)
const RUNTIME_FILES: [string, string][] = [
  ["ort-wasm-simd-threaded.mjs", "/qt/ort-wasm-simd-threaded.mjs"],
  ["ort-wasm-simd-threaded.wasm", "/qt/ort-wasm-simd-threaded.wasm"],
  // The worker bundle itself — a hashed /_next/static URL dies on every
  // deploy; pinning it here makes the engine fully self-contained.
  ["recite-worker.js", "/qt/recite-worker.js"],
  ["qt-capture.js", "/worklets/qt-capture.js"],
  ["QPC2BSML.ttf", "/fonts/qpc2/QPC2BSML.ttf"],
];
// The .jsep/.asyncify ORT variants sit in public/qt but the wasm-only build
// never loads them — keeping them required made a prefetch gap permanently
// report "not installed". They're still served static-first when present.

// Shared offline assets — cached by the service worker, not the engine
// bucket, but "installed" must mean the whole listener works offline.
const SHARED_FILES = [
  "/data/ayah-pages.json",
  "/data/surah-meta.json",
  "/data/quran.json",
  // Look-alike index — offline muta detection silently disables without it.
  "/data/mutashabihat.json",
  "/rc/pitch-worklet.js",
];

// A cached entry whose body is empty is poison, not an install — a HEAD
// response (or a truncated download) put() under the key still *matches*,
// and an empty worker.js loads as a valid empty script that hangs forever.
// Delete it so the next fetch/install repairs the bucket.
async function missingOrEmpty(cache: Cache, key: string): Promise<boolean> {
  const res = await cache.match(key);
  if (!res) return true;
  try {
    const size = (await res.clone().blob()).size;
    if (size === 0) {
      await cache.delete(key);
      return true;
    }
  } catch { /* unreadable body counts as present — don't thrash the bucket */ }
  return false;
}

export async function engineInstalled(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  if (localStorage.getItem(LS_KEY) !== "1") return false;
  const cache = await caches.open(ENGINE_CACHE);
  for (const a of ENGINE_ASSETS) {
    if (await missingOrEmpty(cache, engineUrl(a))) return false;
  }
  // Legacy installs predate the runtime prefetch — check those files too,
  // or an offline first-run would fail on a missing ort wasm/worklet.
  for (const [key] of RUNTIME_FILES) {
    if (await missingOrEmpty(cache, `${self.location.origin}/qt/${key}`)) return false;
  }
  for (const p of SHARED_FILES) {
    if (!(await caches.match(p))) return false;
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
    // A cleanly-terminated truncated stream is still a corrupt model — and
    // the resume-skip above would keep it forever. Reject anything short.
    if (blob.size < a.bytes * 0.9) {
      await cache.delete(engineUrl(a));
      throw new Error(`download truncated: ${a.file} (${blob.size}B)`);
    }
    await cache.put(
      engineUrl(a),
      new Response(blob, {
        headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
      }),
    );
    done += blob.size;
    onProgress(done, total, a.file);
  }

  // Vendored statics prefetched into the bucket so "installed" means truly
  // offline-ready. The worklet lives under /qt/ too because Capacitor's
  // WebView has no reliable service worker: the session falls back to a
  // blob: module URL built from this cached copy when the plain /worklets/
  // load fails. Always re-put — an onnxruntime-web upgrade would otherwise
  // leave a stale ort-wasm pair in the bucket forever (engineInstalled
  // checks existence, not version).
  for (const [key, url] of RUNTIME_FILES) {
    const k = `${self.location.origin}/qt/${key}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`download failed: ${key}`);
    await cache.put(k, res);
  }

  // ~160MB sits in best-effort storage by default — the browser can silently
  // evict the whole bucket under disk pressure. Ask for durable storage;
  // denial is normal (engagement heuristic) and harmless.
  try { await navigator.storage.persist(); } catch {}

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

// Bundles the recite worker into a single stable-URL file at
// public/qt/recite-worker.js. A hashed /_next/static chunk URL can 404
// after a deploy (or 503 offline) — "Engine bundle failed to load".
// A stable /qt/ URL is pinned into the engine cache bucket at install,
// so the worker script is as immutable and offline-safe as the model.
import { build } from "esbuild";

await build({
  entryPoints: ["src/features/quran-tester/recite.worker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  outfile: "public/qt/recite-worker.js",
  // @tilawa/core uses `import ... with { type: "json" }`.
  supported: { "import-attributes": true },
  // The WASM binary + ORT backend .mjs stay runtime-loaded from /qt/
  // (wasmPaths) — only the JS glue is inlined.
  logLevel: "warning",
});

console.log("qt worker bundle → public/qt/recite-worker.js");

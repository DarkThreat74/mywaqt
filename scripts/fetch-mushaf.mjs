// Vendors the QPC2 15-line mushaf (604 page JSONs + per-page woff2 fonts)
// into public/ so it ships with the app and works offline — no runtime fetch
// to GitHub. Source: zonetecde/mushaf-layout (v2 branch). Run once: node scripts/fetch-mushaf.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/v2";
const PAGES = "public/data/mushaf/QPC2";
const FONTS = "public/fonts/qpc2";
await mkdir(PAGES, { recursive: true });
await mkdir(FONTS, { recursive: true });

async function get(url, dest) {
  if (existsSync(dest)) return true; // resumable
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) { await writeFile(dest, Buffer.from(await r.arrayBuffer())); return true; }
    } catch {}
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  console.error("FAILED", url);
  return false;
}

let ok = 0, fail = 0;
const jobs = [];
for (let p = 1; p <= 604; p++) {
  const n = String(p).padStart(3, "0");
  jobs.push(get(`${BASE}/mushaf/QPC2/page-${n}.json`, `${PAGES}/page-${n}.json`));
  jobs.push(get(`${BASE}/fonts/QPC2/p${n}.woff2`, `${FONTS}/p${n}.woff2`));
}
jobs.push(get(`${BASE}/fonts/QPC2/QPC2BSML.ttf`, `${FONTS}/QPC2BSML.ttf`));

const CHUNK = 16;
for (let i = 0; i < jobs.length; i += CHUNK) {
  const rs = await Promise.all(jobs.slice(i, i + CHUNK));
  for (const r of rs) r ? ok++ : fail++;
  if (i % 160 === 0) console.log(`${Math.min(i + CHUNK, jobs.length)}/${jobs.length}`);
}
console.log(`done — ${ok} ok, ${fail} failed`);

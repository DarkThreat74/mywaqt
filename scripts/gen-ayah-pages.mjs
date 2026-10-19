// One-shot: build public/data/ayah-pages.json — flat array where
// ayahPages[globalIndex] = mushaf page. globalIndex walks surah 1 ayah 1 →
// surah 114 last ayah. Source: zonetecde/mushaf-layout v2 (QPC2 pages).
import { writeFileSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/v2/mushaf/QPC2";

const ayahPage = new Map(); // "s:a" -> page

for (let p = 1; p <= 604; p++) {
  const res = await fetch(`${BASE}/page-${String(p).padStart(3, "0")}.json`);
  if (!res.ok) throw new Error(`page ${p}: ${res.status}`);
  const json = await res.json();
  for (const line of json.lines) {
    if (line.type !== "text" || !line.words) continue;
    for (const w of line.words) {
      const [s, a] = w.location.split(":").map(Number);
      const k = `${s}:${a}`;
      if (!ayahPage.has(k)) ayahPage.set(k, p);
    }
  }
  if (p % 50 === 0) console.log(`${p}/604`);
}

// Flatten to [s][a] pages — array of 114 arrays
const out = {};
for (const [k, p] of ayahPage) {
  const [s, a] = k.split(":").map(Number);
  (out[s] ??= {})[a] = p;
}
writeFileSync("public/data/ayah-pages.json", JSON.stringify(out));
console.log(`wrote ${ayahPage.size} ayah→page entries`);

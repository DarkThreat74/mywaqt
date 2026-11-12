#!/usr/bin/env node
// Build the taggable-place dataset for Calendar's place picker.
//
// Sources (in priority order):
//   1. public/myapps/sirat/index.html  — #data JSON + the P.push(...) park seeds
//   2. scripts/sirat/out/parks-candidates.json — reviewed collector candidates
//
// Output: public/data/sirat-places.json — a flat array the picker can fetch
// directly (the service worker already caches /data/* cache-first).
//
// Run:  node scripts/sirat/build-places.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const siratPath = join(root, "public/myapps/sirat/index.html");
const candidatesPath = join(root, "scripts/sirat/out/parks-candidates.json");
const outPath = join(root, "public/data/sirat-places.json");

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function areaOf(record) {
  return record.ar || record.area || "";
}

const places = [];
const byId = new Set();
const byNameArea = new Set();
const byNameAddr = new Set();

function bareName(name) {
  // "Northside Park (Wheaton)" and "Stacy Park" vs "Stacy" should compare equal.
  return norm(name).replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function pushPlace(place) {
  const nameKey = `${bareName(place.name)}|${norm(place.area)}`;
  const addrKey = `${norm(place.name)}|${norm(place.address)}`;
  const base = bareName(place.name);
  if (byNameArea.has(nameKey) || byNameAddr.has(addrKey)) return false;
  // Same-area containment: "Stacy" ≈ "Stacy Park", "Northside Park" ≈ "Northside Park Wheaton".
  for (const existing of places) {
    if (norm(existing.area) !== norm(place.area) && place.area && existing.area) continue;
    const other = bareName(existing.name);
    if (other && base && (other === base || other.startsWith(`${base} `) || base.startsWith(`${other} `))) return false;
  }
  let id = place.id || `place-${norm(place.name).replace(/ /g, "-")}`;
  while (byId.has(id)) id = `${id}-x`;
  byId.add(id);
  byNameArea.add(nameKey);
  byNameAddr.add(addrKey);
  places.push({ ...place, id });
  return true;
}

// ── 1. Sirat #data + P.push seeds ──
const html = readFileSync(siratPath, "utf8");
const dataMatch = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
if (!dataMatch) throw new Error("Sirat #data block not found");
const data = JSON.parse(dataMatch[1]);
for (const p of data) {
  if (!p?.n) continue;
  pushPlace({
    id: p.i || undefined,
    name: p.n,
    address: p.a || "",
    kind: p.k || "D",
    area: areaOf(p),
    lat: typeof p.la === "number" ? p.la : null,
    lng: typeof p.ln === "number" ? p.ln : null,
    src: "sirat",
    kids: p.ac === "kids" || undefined,
  });
}

const pushMatch = html.match(/P\.push\(([\s\S]*?)\n\);/);
if (pushMatch) {
  // The seed block is JS object literals — evaluate it in this trusted,
  // repo-owned file only.
  const seeds = eval(`[${pushMatch[1]}]`);
  for (const p of seeds) {
    if (!p?.n) continue;
    pushPlace({
      id: p.i || undefined,
      name: p.n,
      address: p.a || "",
      kind: p.k || "D",
      area: areaOf(p),
      lat: typeof p.la === "number" ? p.la : null,
      lng: typeof p.ln === "number" ? p.ln : null,
      src: "sirat",
      kids: p.ac === "kids" || undefined,
    });
  }
}

// ── 2. Collector candidates ──
if (existsSync(candidatesPath)) {
  const candidates = JSON.parse(readFileSync(candidatesPath, "utf8"));
  for (const c of candidates.parks || []) {
    const s = c.sirat || {};
    if (!s.n) continue;
    pushPlace({
      id: s.i || undefined,
      name: s.n,
      address: s.a || "",
      kind: s.k || "D",
      area: s.ar || c.area || "",
      lat: typeof s.la === "number" ? s.la : (typeof c.latitude === "number" ? c.latitude : null),
      lng: typeof s.ln === "number" ? s.ln : (typeof c.longitude === "number" ? c.longitude : null),
      src: `collector:${c.source_name || "unknown"}`,
      kids: c.kids || s.ac === "kids" || undefined,
    });
  }
}

writeFileSync(outPath, JSON.stringify(places, null, 0) + "\n", "utf8");
const byKind = {};
for (const p of places) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
console.log(`Wrote ${places.length} places to public/data/sirat-places.json`);
console.log("By kind:", byKind);

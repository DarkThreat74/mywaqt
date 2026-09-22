/**
 * Imports the praytime crawler registry (MIT-licensed, github.com/praytime/praytime)
 * into masjid_sources: each masjid's name/address/geo plus the public endpoint
 * that publishes its iqamah (Masjidal API, Mohid widget, Mawaqit, ...).
 *
 * Run: pnpm exec tsx scripts/import-praytime.mts
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync, statSync, existsSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const envContent = readFileSync(join(process.cwd(), ".env"), "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
const sql = neon(process.env.DATABASE_URL!);

const TMP = join(process.cwd(), ".tmp-praytime");
if (!existsSync(TMP)) {
  execSync(`git clone --depth 1 https://github.com/praytime/praytime "${TMP}"`, { stdio: "inherit" });
}

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (e.endsWith(".ts")) yield p;
  }
}

function platformOf(url: string): string {
  if (url.includes("masjidal.com")) return "masjidal";
  if (url.includes("mawaqit")) return "mawaqit";
  if (url.includes("masjidbox")) return "masjidbox";
  if (url.includes("muslimfeed")) return "muslimfeed";
  if (url.includes("madinaapps") || url.includes("madina")) return "madinaapps";
  return "widget"; // masjid's own site (mohid etc.)
}

interface Row {
  external_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  timezone: string | null;
  website: string | null;
  fetch_url: string | null;
  platform: string | null;
}

const rows: Row[] = [];
const seen = new Set<string>();

for (const file of walk(join(TMP, "src/crawlers"))) {
  const src = readFileSync(file, "utf-8");

  // Each ids entry contains uuid4 + nested geo{} — slice a window around
  // each uuid4 occurrence (covers the whole object literal).
  const idObjs: string[] = [];
  for (const m of src.matchAll(/uuid4:/g)) {
    const start = src.lastIndexOf("{", m.index);
    idObjs.push(src.slice(start, m.index + 1200));
  }
  // Fetch URLs in the file (deduped, template placeholders excluded)
  const urls = [
    ...new Set(
      [...src.matchAll(/["'`](https?:\/\/[^"'`]+)["'`]/g)]
        .map((m) => m[1])
        .filter((u) => !u.includes("${") && !u.includes("github.com") && !u.includes("google") && !u.includes("firebase")),
    ),
  ];

  idObjs.forEach((o, i) => {
    const grab = (k: string) => o.match(new RegExp(`${k}:\\s*["']([^"']*)["']`))?.[1] ?? null;
    const lat = parseFloat(o.match(/latitude:\s*(-?[\d.]+)/)?.[1] ?? "");
    const lng = parseFloat(o.match(/longitude:\s*(-?[\d.]+)/)?.[1] ?? "");
    const uuid4 = grab("uuid4");
    const name = grab("name");
    if (!uuid4 || !name || isNaN(lat) || isNaN(lng) || seen.has(uuid4)) return;
    seen.add(uuid4);
    // Positional mapping: url[i] serves ids[i] when counts line up; single-id
    // files just take their one endpoint.
    const fetchUrl = urls.length === 1 ? urls[0] : (urls[i] ?? urls[0] ?? null);
    rows.push({
      external_id: uuid4,
      name,
      address: grab("address"),
      lat,
      lng,
      timezone: grab("timeZoneId"),
      website: grab("url"),
      fetch_url: fetchUrl,
      platform: fetchUrl ? platformOf(fetchUrl) : null,
    });
  });
}

console.log(`Parsed ${rows.length} masjids from crawler registry`);

let inserted = 0;
for (const r of rows) {
  try {
    await sql.query(
      `INSERT INTO masjid_sources (external_id, name, address, lat, lng, timezone, website, fetch_url, platform)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (external_id) DO UPDATE SET
         name=EXCLUDED.name, address=EXCLUDED.address, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         timezone=EXCLUDED.timezone, website=EXCLUDED.website, fetch_url=EXCLUDED.fetch_url, platform=EXCLUDED.platform`,
      [r.external_id, r.name, r.address, r.lat, r.lng, r.timezone, r.website, r.fetch_url, r.platform],
    );
    inserted++;
  } catch (e) {
    console.error("skip", r.name, String(e).slice(0, 80));
  }
}
console.log(`Upserted ${inserted} masjid sources`);
rmSync(TMP, { recursive: true, force: true });

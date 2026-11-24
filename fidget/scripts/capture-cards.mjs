// Capture a real frame of every toy as its shelf-card still.
// Serves public/ statically, loads each element in _capture.html under
// headless Chrome with a virtual-time budget (lets it settle mid-pose),
// and writes public/toys/<world>/<piece>/card.png.
// Usage: node scripts/capture-cards.mjs [toyId ...]
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json", ".css": "text/css" };

// world card colors + per-toy zoom/attr overrides where the element is small or needs a nudge
const reg = readFileSync(join(ROOT, "src/registry.ts"), "utf8");
const worlds = Object.fromEntries([...reg.matchAll(/id: "(\w+)",[\s\S]*?card: "(#[0-9a-f]+)"/g)].map(m => [m[1], m[2]]));
const toys = [...reg.matchAll(/id: "([^"]+)",\s*title: "[^"]+",\s*tag: "([^"]+)",\s*file: "([^"]+)"/g)]
  .map(m => ({ id: m[1], tag: m[2], file: m[3] }));
const OVERRIDES = {
  "paradise/cd-dial": { attrs: { tracks: "/toys/paradise/audio/" } },
  "pinball/drain": { attrs: { window: "5000" } },
};
const only = process.argv.slice(2);
const picked = only.length ? toys.filter(t => only.includes(t.id)) : toys;

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(ROOT, "public", path === "/" ? "_capture.html" : path);
  try { const data = readFileSync(file); res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
console.log(`serving on :${port}, ${picked.length} toys, chrome: ${CHROME}`);

for (const t of picked) {
  const w = t.id.split("/")[0];
  const o = OVERRIDES[t.id] ?? {};
  const q = new URLSearchParams({ src: `/toys/${t.id}/${t.file}`, tag: t.tag, bg: worlds[w] ?? "#222", z: o.z ?? "1" });
  for (const [k, v] of Object.entries(o.attrs ?? {})) q.set(`a_${k}`, v);
  const url = `http://127.0.0.1:${port}/_capture.html?${q}`;
  const dest = join(ROOT, "public/toys", t.id, "card.png");
  const tmp = join(tmpdir(), `fidget-card-${t.id.replace(/\//g, "-")}.png`);
  mkdirSync(join(ROOT, "public/toys", t.id), { recursive: true });
  try {
    execFileSync(CHROME, ["--headless=new", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${join(tmpdir(), `fidget-capture-${process.pid}`)}`,
      `--screenshot=${tmp}`, "--window-size=440,440", "--hide-scrollbars",
      url],
      { stdio: "ignore", timeout: 45000 });
    copyFileSync(tmp, dest);
    console.log(`${existsSync(dest) ? "ok " : "FAIL"} ${t.id}`);
  } catch (e) { console.log(`FAIL ${t.id}: ${String(e).slice(0, 120)}`); }
}
server.close();

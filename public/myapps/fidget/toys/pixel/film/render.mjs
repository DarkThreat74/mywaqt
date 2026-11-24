// Frame-stepped capture of ?film=1 into an X-ready MP4.
// No packages: Node 22's built-in fetch + WebSocket drive headless Chrome over CDP,
// frames are piped straight into ffmpeg.
//
//   python3 -m http.server 8000           # in the project folder
//   node film/render.mjs                  # -> film/squall-jar-x.mp4
//
// Options (env): W=1080 H=1080 FPS=60 SCALE=2 URL=http://localhost:8000/?film=1 OUT=film/squall-jar-x.mp4

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = +(process.env.W || 1080), H = +(process.env.H || 1080);
const FPS = +(process.env.FPS || 60), SCALE = +(process.env.SCALE || 2);
const URL_ = process.env.URL || 'http://localhost:8000/?film=1';
const OUT = process.env.OUT || 'film/squall-jar-x.mp4';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sj-'))}`,
  '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 100 && !(await evaluate('!!window.__film').catch(() => false)); i++) await sleep(100);
const duration = await evaluate('window.__film.duration');
const frames = Math.round(duration * FPS);
console.log(`capturing ${frames} frames @ ${FPS}fps (${W}x${H} x${SCALE}) -> ${OUT}`);

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high', '-tune', 'animation',
  '-movflags', '+faststart', '-r', String(FPS), OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let f = 0; f < frames; f++) {
  await evaluate(`window.__film.step(${FPS})`);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 60 === 0) process.stdout.write(`\r${f}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
console.log(`\rdone: ${OUT}`);
ws.close(); chrome.kill();

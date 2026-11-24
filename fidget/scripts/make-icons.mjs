// Render the launcher icon + splash PNGs from scripts/icon/*.svg via
// headless Chrome, at every density Android expects. Replaces the
// default Capacitor placeholder art.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileP = promisify(execFile);
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const RES = join(ROOT, "android/app/src/main/res");
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);

const svgUrl = (name, w, h) => {
  const svg = readFileSync(join(ROOT, "scripts/icon", name), "utf8");
  return "data:text/html," + encodeURIComponent(
    `<style>html,body{margin:0}svg{display:block;width:${w}px;height:${h}px}</style>` +
    svg.replace('viewBox="0 0 100 100"', `viewBox="0 0 100 100" width="${w}" height="${h}"`));
};

async function shot(svg, w, h, dest) {
  const tmp = join(tmpdir(), `icon-${process.pid}-${dest.replace(/\W/g, "_")}.png`);
  await execFileP(CHROME, ["--headless=new", "--no-first-run", "--force-device-scale-factor=1",
    `--user-data-dir=${join(tmpdir(), `fidget-icon-${process.pid}`)}`,
    `--screenshot=${tmp}`, `--window-size=${w},${h}`, "--hide-scrollbars", "--default-background-color=00000000",
    svgUrl(svg, w, h)], { timeout: 30000 });
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, readFileSync(tmp));
  console.log("ok", dest.split("/res/")[1]);
}

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(DENSITIES)) {
  for (const name of ["ic_launcher", "ic_launcher_round"])
    await shot("icon.svg", s, s, join(RES, `mipmap-${d}/${name}.png`));
  await shot("fg.svg", s * 2.25, s * 2.25, join(RES, `mipmap-${d}/ic_launcher_foreground.png`));
}
// Splash: full-frame dark field with the mark centered (capacitor centers the bitmap)
await shot("splash.svg", 480, 800, join(RES, "drawable/splash.png"));
for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  await shot("splash.svg", 480, 800, join(RES, `drawable-port-${d}/splash.png`));
  await shot("splash.svg", 800, 480, join(RES, `drawable-land-${d}/splash.png`));
}
console.log("done");

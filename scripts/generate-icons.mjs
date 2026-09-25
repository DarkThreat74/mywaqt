/**
 * Icon generator — regenerate every icon the app needs from one source image.
 *
 *   pnpm icons path/to/source.png
 *   pnpm icons source.png --bg=#f5f0e8      # background for opaque icons
 *
 * Source should be a square PNG, ideally 1024x1024+ with a transparent
 * background. Outputs to public/:
 *
 *   favicon-16.png, favicon-32.png   browser tab icons
 *   favicon.ico                      multi-size ico (16/32/48)
 *   apple-touch-icon.png             iPhone/iPad home screen (180, opaque bg)
 *   icon-192.png, icon-512.png       PWA / Android home screen
 *   icon-maskable-192/512.png        Android adaptive icons (safe-zone padded)
 *
 * NOTE: icon.svg is vector and untouched — replace it manually if the
 * mark itself changes.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const [srcArg, ...flags] = process.argv.slice(2);
if (!srcArg) {
  console.error("usage: pnpm icons <source.png> [--bg=#f5f0e8]");
  process.exit(1);
}
const bgFlag = flags.find((f) => f.startsWith("--bg="));
const bg = bgFlag ? bgFlag.slice(5) : "#f5f0e8";

const OUT = join(process.cwd(), "public");
const src = sharp(srcArg);
const meta = await src.metadata();
if (!meta.width || !meta.height) {
  console.error("couldn't read source image");
  process.exit(1);
}
if (meta.width !== meta.height) {
  console.warn(`warning: source is ${meta.width}x${meta.height} — icons will be cropped to a center square`);
}

// Trim empty margins, then pad to a transparent square so the mark fills
// the frame at every size (favicons stay legible).
const trimmed = await sharp(srcArg).trim().toBuffer();
const tMeta = await sharp(trimmed).metadata();
// ~10% padding so iOS/Android masks don't clip the mark's edges
const side = Math.round(Math.max(tMeta.width, tMeta.height) * 1.1);
const squareBuf = await sharp(trimmed)
  .resize({ width: side, height: side, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const square = { clone: () => sharp(squareBuf) };

// All icons sit on the parchment background — a consistent tile in browser
// tabs, task switchers, and home screens regardless of OS theme.
async function png(size, file) {
  await opaque(size, file);
}

// Opaque icon on background color (Apple forbids transparency)
async function opaque(size, file) {
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await square.clone().resize(size, size).png().toBuffer() }])
    .png()
    .toFile(join(OUT, file));
  console.log(`  ${file}`);
}

// Maskable: source shrunk into the ~80% safe zone on a solid background
async function maskable(size, file) {
  const inner = Math.round(size * 0.8);
  const icon = await square.clone().resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: icon }])
    .png()
    .toFile(join(OUT, file));
  console.log(`  ${file}`);
}

// Minimal .ico writer — embeds PNG buffers (valid for all modern browsers)
async function ico(sizes, file) {
  const pngs = await Promise.all(sizes.map((s) => square.clone().resize(s, s).png().toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const entries = [];
  let offset = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0);   // width
    e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1);   // height
    e.writeUInt16LE(1, 4);                              // planes
    e.writeUInt16LE(32, 6);                             // bpp
    e.writeUInt32LE(pngs[i].length, 8);                 // data size
    e.writeUInt32LE(offset, 12);                        // data offset
    offset += pngs[i].length;
    entries.push(e);
  }
  await writeFile(join(OUT, file), Buffer.concat([header, ...entries, ...pngs]));
  console.log(`  ${file}`);
}

console.log(`generating icons from ${srcArg} (bg ${bg})`);
await png(16, "favicon-16.png");
await png(32, "favicon-32.png");
await ico([16, 32, 48], "favicon.ico");
await opaque(180, "apple-touch-icon.png");
await png(192, "icon-192.png");
await png(512, "icon-512.png");
await maskable(192, "icon-maskable-192.png");
await maskable(512, "icon-maskable-512.png");
console.log("done — icon.svg unchanged (vector, replace manually if the mark changed)");

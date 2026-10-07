/* eslint-disable @typescript-eslint/no-require-imports */
// Generates public/icon-badge.png — a 96x96 transparent PNG used as the
// Android status-bar notification badge. Status-bar icons are alpha-masked:
// any opaque pixel renders as a white silhouette, so the app icon (an opaque
// dark tile) shows as a white blob. This file is a transparent canvas with
// five opaque rounded bars — the same five-prayer-bands motif as icon.svg.
const zlib = require("zlib");
const fs = require("fs");

const S = 96;
const px = Buffer.alloc(S * S * 4, 0); // transparent

// bars: [x, y, w, h] — logo proportions scaled up, opaque white
const bars = [
  [16, 18, 64, 8],
  [16, 33, 48, 8],
  [16, 48, 57, 8],
  [16, 63, 40, 8],
  [16, 78, 64, 8],
];
const R = 4; // corner radius for rounded ends

function inBar(x, y, [bx, by, bw, bh]) {
  if (y < by || y >= by + bh) return false;
  const midX = bx + R, endX = bx + bw - R;
  if (x >= midX && x < endX) return true;
  const cx = x < midX ? bx + R : bx + bw - R - 1;
  const cy = by + bh / 2 - 0.5;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= R * R;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (bars.some((b) => inBar(x, y, b))) {
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 255;
    }
  }
}

// PNG: 8-byte sig, IHDR (RGBA), IDAT (zlib of scanlines w/ filter 0), IEND
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const raw = Buffer.alloc(S * (1 + S * 4));
for (let y = 0; y < S; y++) {
  raw[y * (1 + S * 4)] = 0; // filter: none
  px.copy(raw, y * (1 + S * 4) + 1, y * S * 4, (y + 1) * S * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync("public/icon-badge.png", png);
console.log("wrote public/icon-badge.png", png.length, "bytes");

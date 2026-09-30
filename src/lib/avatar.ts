/** Client-side avatar helpers — uploads are center-cropped to a 128px webp
 *  data URL (~6KB) so they store inline in users.avatar_url, no object
 *  storage needed. Presets render emoji-on-color through the same pipeline
 *  so uploaded and picked avatars are indistinguishable downstream. */

export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const s = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/webp", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

/** Preset avatars — emoji glyph on a warm solid. Rendered to a real image so
 *  every consumer (friend lists, admin, match history) treats them as photos. */
export const AVATAR_PRESETS: { emoji: string; bg: string }[] = [
  { emoji: "🕌", bg: "#2f6b4f" },
  { emoji: "🌙", bg: "#33456e" },
  { emoji: "⭐", bg: "#7a5c2e" },
  { emoji: "🌿", bg: "#4a6741" },
  { emoji: "🕊️", bg: "#5e6e7e" },
  { emoji: "📿", bg: "#6e4634" },
  { emoji: "🌅", bg: "#8a5533" },
  { emoji: "🐪", bg: "#6b5a3e" },
];

export function presetAvatarDataUrl(emoji: string, bg: string): string {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = "64px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 64, 70);
  return c.toDataURL("image/webp", 0.85);
}

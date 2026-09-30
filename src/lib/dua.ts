/* Dua replies to prayer nudges — presets are fixed so they're always safe;
   custom text goes through a local cleanliness gate (no AI provider in the
   stack — this is the filter the user chose). */

export const DUA_PRESETS = [
  "Jzk — may Allah grant you Jannah. Ameen",
  "Jazakallahu ahsanul jaza",
  "May Allah accept our efforts, ameen",
] as const;

export const DUA_MAX_CHARS = 160;
export const DUA_MAX_WORDS = 25;

const DUA_NOT_OK = "That doesn't read like a dua — write a short prayer for them.";

// Small profanity/abuse blocklist — the whole point of the check is that
// nothing hostile reaches the friend who nudged. Leetspeak-normalized.
const BLOCKED = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dick", "pussy", "whore",
  "slut", "nigger", "faggot", "retard", "kys", "die", "hate you", "stfu",
  "shut up", "idiot", "stupid", "dumb", "loser", "ugly",
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[@4]/g, "a").replace(/3/g, "e").replace(/[1!|]/g, "i")
    .replace(/0/g, "o").replace(/\$/g, "s").replace(/5/g, "s").replace(/7/g, "t")
    .replace(/[^a-zء-ي\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns an error string when the text isn't a proper dua, else null. */
export function validateDua(text: string): string | null {
  const t = text.trim();
  if (t.length < 2) return DUA_NOT_OK;
  if (t.length > DUA_MAX_CHARS) return "Keep it short — a dua fits in 160 characters.";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > DUA_MAX_WORDS) return "Keep it short — a dua doesn't need more than 25 words.";
  if (/https?:|www\.|\.com|\.net|\.io/i.test(t)) return DUA_NOT_OK;
  // Mostly letters, please — emoji-only or symbol soup isn't a prayer.
  const letters = t.match(/[\p{L}]/gu)?.length ?? 0;
  if (letters < t.length * 0.5) return DUA_NOT_OK;
  // "aaaaaaa" / "!!!!" spam
  if (/(.)\1{4,}/i.test(t)) return DUA_NOT_OK;

  const flat = ` ${normalize(t)} `;
  for (const bad of BLOCKED) {
    if (flat.includes(` ${bad} `) || flat.includes(` ${bad}`)) return DUA_NOT_OK;
  }
  return null;
}

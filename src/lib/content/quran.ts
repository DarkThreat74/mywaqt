// Surah metadata + helpers for the Quran Challenge tool.
// Single source of truth — the API picks random ayat from this table, the
// client builds answer options and hints from the same rows.

export interface Surah {
  n: number;
  name: string;
  english: string;
  ayahs: number;
  meccan: boolean;
}

export const SURAHS: Surah[] = [
  { n: 1, name: "Al-Fatihah", english: "The Opener", ayahs: 7, meccan: true },
  { n: 2, name: "Al-Baqarah", english: "The Cow", ayahs: 286, meccan: false },
  { n: 3, name: "Aal-e-Imran", english: "Family of Imran", ayahs: 200, meccan: false },
  { n: 4, name: "An-Nisa", english: "The Women", ayahs: 176, meccan: false },
  { n: 5, name: "Al-Ma'idah", english: "The Table Spread", ayahs: 120, meccan: false },
  { n: 6, name: "Al-An'am", english: "The Cattle", ayahs: 165, meccan: true },
  { n: 7, name: "Al-A'raf", english: "The Heights", ayahs: 206, meccan: true },
  { n: 8, name: "Al-Anfal", english: "The Spoils of War", ayahs: 75, meccan: false },
  { n: 9, name: "At-Tawbah", english: "The Repentance", ayahs: 129, meccan: false },
  { n: 10, name: "Yunus", english: "Jonah", ayahs: 109, meccan: true },
  { n: 11, name: "Hud", english: "Hud", ayahs: 123, meccan: true },
  { n: 12, name: "Yusuf", english: "Joseph", ayahs: 111, meccan: true },
  { n: 13, name: "Ar-Ra'd", english: "The Thunder", ayahs: 43, meccan: false },
  { n: 14, name: "Ibrahim", english: "Abraham", ayahs: 52, meccan: true },
  { n: 15, name: "Al-Hijr", english: "The Rocky Tract", ayahs: 99, meccan: true },
  { n: 16, name: "An-Nahl", english: "The Bee", ayahs: 128, meccan: true },
  { n: 17, name: "Al-Isra", english: "The Night Journey", ayahs: 111, meccan: true },
  { n: 18, name: "Al-Kahf", english: "The Cave", ayahs: 110, meccan: true },
  { n: 19, name: "Maryam", english: "Mary", ayahs: 98, meccan: true },
  { n: 20, name: "Ta-Ha", english: "Ta-Ha", ayahs: 135, meccan: true },
  { n: 21, name: "Al-Anbiya", english: "The Prophets", ayahs: 112, meccan: true },
  { n: 22, name: "Al-Hajj", english: "The Pilgrimage", ayahs: 78, meccan: false },
  { n: 23, name: "Al-Mu'minun", english: "The Believers", ayahs: 118, meccan: true },
  { n: 24, name: "An-Nur", english: "The Light", ayahs: 64, meccan: false },
  { n: 25, name: "Al-Furqan", english: "The Criterion", ayahs: 77, meccan: true },
  { n: 26, name: "Ash-Shu'ara", english: "The Poets", ayahs: 227, meccan: true },
  { n: 27, name: "An-Naml", english: "The Ant", ayahs: 93, meccan: true },
  { n: 28, name: "Al-Qasas", english: "The Stories", ayahs: 88, meccan: true },
  { n: 29, name: "Al-Ankabut", english: "The Spider", ayahs: 69, meccan: true },
  { n: 30, name: "Ar-Rum", english: "The Romans", ayahs: 60, meccan: true },
  { n: 31, name: "Luqman", english: "Luqman", ayahs: 34, meccan: true },
  { n: 32, name: "As-Sajdah", english: "The Prostration", ayahs: 30, meccan: true },
  { n: 33, name: "Al-Ahzab", english: "The Combined Forces", ayahs: 73, meccan: false },
  { n: 34, name: "Saba", english: "Sheba", ayahs: 54, meccan: true },
  { n: 35, name: "Fatir", english: "The Originator", ayahs: 45, meccan: true },
  { n: 36, name: "Ya-Sin", english: "Ya-Sin", ayahs: 83, meccan: true },
  { n: 37, name: "As-Saffat", english: "Those Ranged in Ranks", ayahs: 182, meccan: true },
  { n: 38, name: "Sad", english: "Sad", ayahs: 88, meccan: true },
  { n: 39, name: "Az-Zumar", english: "The Groups", ayahs: 75, meccan: true },
  { n: 40, name: "Ghafir", english: "The Forgiver", ayahs: 85, meccan: true },
  { n: 41, name: "Fussilat", english: "Explained in Detail", ayahs: 54, meccan: true },
  { n: 42, name: "Ash-Shura", english: "The Consultation", ayahs: 53, meccan: true },
  { n: 43, name: "Az-Zukhruf", english: "The Ornaments of Gold", ayahs: 89, meccan: true },
  { n: 44, name: "Ad-Dukhan", english: "The Smoke", ayahs: 59, meccan: true },
  { n: 45, name: "Al-Jathiyah", english: "The Kneeling", ayahs: 37, meccan: true },
  { n: 46, name: "Al-Ahqaf", english: "The Wind-Curved Sandhills", ayahs: 35, meccan: true },
  { n: 47, name: "Muhammad", english: "Muhammad", ayahs: 38, meccan: false },
  { n: 48, name: "Al-Fath", english: "The Victory", ayahs: 29, meccan: false },
  { n: 49, name: "Al-Hujurat", english: "The Rooms", ayahs: 18, meccan: false },
  { n: 50, name: "Qaf", english: "Qaf", ayahs: 45, meccan: true },
  { n: 51, name: "Adh-Dhariyat", english: "The Winnowing Winds", ayahs: 60, meccan: true },
  { n: 52, name: "At-Tur", english: "The Mount", ayahs: 49, meccan: true },
  { n: 53, name: "An-Najm", english: "The Star", ayahs: 62, meccan: true },
  { n: 54, name: "Al-Qamar", english: "The Moon", ayahs: 55, meccan: true },
  { n: 55, name: "Ar-Rahman", english: "The Most Merciful", ayahs: 78, meccan: false },
  { n: 56, name: "Al-Waqi'ah", english: "The Inevitable", ayahs: 96, meccan: true },
  { n: 57, name: "Al-Hadid", english: "The Iron", ayahs: 29, meccan: false },
  { n: 58, name: "Al-Mujadila", english: "The Pleading Woman", ayahs: 22, meccan: false },
  { n: 59, name: "Al-Hashr", english: "The Exile", ayahs: 24, meccan: false },
  { n: 60, name: "Al-Mumtahanah", english: "She Who Is Examined", ayahs: 13, meccan: false },
  { n: 61, name: "As-Saf", english: "The Ranks", ayahs: 14, meccan: false },
  { n: 62, name: "Al-Jumu'ah", english: "Friday", ayahs: 11, meccan: false },
  { n: 63, name: "Al-Munafiqun", english: "The Hypocrites", ayahs: 11, meccan: false },
  { n: 64, name: "At-Taghabun", english: "Mutual Disillusion", ayahs: 18, meccan: false },
  { n: 65, name: "At-Talaq", english: "The Divorce", ayahs: 12, meccan: false },
  { n: 66, name: "At-Tahrim", english: "The Prohibition", ayahs: 12, meccan: false },
  { n: 67, name: "Al-Mulk", english: "The Sovereignty", ayahs: 30, meccan: true },
  { n: 68, name: "Al-Qalam", english: "The Pen", ayahs: 52, meccan: true },
  { n: 69, name: "Al-Haqqah", english: "The Reality", ayahs: 52, meccan: true },
  { n: 70, name: "Al-Ma'arij", english: "The Ascending Stairways", ayahs: 44, meccan: true },
  { n: 71, name: "Nuh", english: "Noah", ayahs: 28, meccan: true },
  { n: 72, name: "Al-Jinn", english: "The Jinn", ayahs: 28, meccan: true },
  { n: 73, name: "Al-Muzzammil", english: "The Enshrouded One", ayahs: 20, meccan: true },
  { n: 74, name: "Al-Muddaththir", english: "The Cloaked One", ayahs: 56, meccan: true },
  { n: 75, name: "Al-Qiyamah", english: "The Resurrection", ayahs: 40, meccan: true },
  { n: 76, name: "Al-Insan", english: "The Man", ayahs: 31, meccan: false },
  { n: 77, name: "Al-Mursalat", english: "Those Sent Forth", ayahs: 50, meccan: true },
  { n: 78, name: "An-Naba", english: "The Tidings", ayahs: 40, meccan: true },
  { n: 79, name: "An-Nazi'at", english: "Those Who Drag Forth", ayahs: 46, meccan: true },
  { n: 80, name: "Abasa", english: "He Frowned", ayahs: 42, meccan: true },
  { n: 81, name: "At-Takwir", english: "The Overthrowing", ayahs: 29, meccan: true },
  { n: 82, name: "Al-Infitar", english: "The Cleaving", ayahs: 19, meccan: true },
  { n: 83, name: "Al-Mutaffifin", english: "The Defrauding", ayahs: 36, meccan: true },
  { n: 84, name: "Al-Inshiqaq", english: "The Splitting Open", ayahs: 25, meccan: true },
  { n: 85, name: "Al-Buruj", english: "The Constellations", ayahs: 22, meccan: true },
  { n: 86, name: "At-Tariq", english: "The Night Comer", ayahs: 17, meccan: true },
  { n: 87, name: "Al-A'la", english: "The Most High", ayahs: 19, meccan: true },
  { n: 88, name: "Al-Ghashiyah", english: "The Overwhelming", ayahs: 26, meccan: true },
  { n: 89, name: "Al-Fajr", english: "The Dawn", ayahs: 30, meccan: true },
  { n: 90, name: "Al-Balad", english: "The City", ayahs: 20, meccan: true },
  { n: 91, name: "Ash-Shams", english: "The Sun", ayahs: 15, meccan: true },
  { n: 92, name: "Al-Layl", english: "The Night", ayahs: 21, meccan: true },
  { n: 93, name: "Ad-Duha", english: "The Morning Hours", ayahs: 11, meccan: true },
  { n: 94, name: "Ash-Sharh", english: "The Relief", ayahs: 8, meccan: true },
  { n: 95, name: "At-Tin", english: "The Fig", ayahs: 8, meccan: true },
  { n: 96, name: "Al-Alaq", english: "The Clot", ayahs: 19, meccan: true },
  { n: 97, name: "Al-Qadr", english: "The Night of Decree", ayahs: 5, meccan: true },
  { n: 98, name: "Al-Bayyinah", english: "The Clear Proof", ayahs: 8, meccan: false },
  { n: 99, name: "Az-Zalzalah", english: "The Earthquake", ayahs: 8, meccan: false },
  { n: 100, name: "Al-Adiyat", english: "The Courser", ayahs: 11, meccan: true },
  { n: 101, name: "Al-Qari'ah", english: "The Calamity", ayahs: 11, meccan: true },
  { n: 102, name: "At-Takathur", english: "Rivalry in Increase", ayahs: 8, meccan: true },
  { n: 103, name: "Al-Asr", english: "The Declining Day", ayahs: 3, meccan: true },
  { n: 104, name: "Al-Humazah", english: "The Slanderer", ayahs: 9, meccan: true },
  { n: 105, name: "Al-Fil", english: "The Elephant", ayahs: 5, meccan: true },
  { n: 106, name: "Quraysh", english: "Quraysh", ayahs: 4, meccan: true },
  { n: 107, name: "Al-Ma'un", english: "Small Kindnesses", ayahs: 7, meccan: true },
  { n: 108, name: "Al-Kawthar", english: "The Abundance", ayahs: 3, meccan: true },
  { n: 109, name: "Al-Kafirun", english: "The Disbelievers", ayahs: 6, meccan: true },
  { n: 110, name: "An-Nasr", english: "The Divine Support", ayahs: 3, meccan: false },
  { n: 111, name: "Al-Masad", english: "The Palm Fiber", ayahs: 5, meccan: true },
  { n: 112, name: "Al-Ikhlas", english: "The Sincerity", ayahs: 4, meccan: true },
  { n: 113, name: "Al-Falaq", english: "The Daybreak", ayahs: 5, meccan: true },
  { n: 114, name: "An-Nas", english: "Mankind", ayahs: 6, meccan: true },
];

export const TOTAL_AYAHS = SURAHS.reduce((a, s) => a + s.ayahs, 0); // 6236

/** Deterministic PRNG — same sequence for a seed on client and server. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Local corpus + uniqueness engine ────────────────────────────────────
// /data/quran.json: [{ s, verses: [[ayah, arabic, english]] }] (risan/quran-json,
// uthmani + Saheeh Intl). Loaded once by the client — game is fully offline
// after that and every fragment can be proven unique against the corpus.

export interface Verse {
  s: number;
  a: number;
  ar: string;
  en: string;
  /** display words (uthmani, diacritics kept) — 1:1 aligned with nw */
  w: string[];
  /** normalized words for matching (harakat/tatweel stripped, alefs unified) */
  nw: string[];
}

// This edition uses small-high marks (U+06D6–U+06ED) both as stop marks AND
// as intra-word diacritics — ~30k sit inside words. Word boundaries are plain
// spaces, so strip every mark within a word rather than splitting on them.
const MARK_RE = /[ً-ْٰـۖ-ۭ]/g;

function normWord(w: string): string {
  let s = w.replace(MARK_RE, "").replace(/[ٱأإآ]/g, "ا");
  // Clitic normalization: واصبر / فاصبر / بكتاب / لكتاب are the same phrase
  // as اصبر / كتاب to a reader — only the conjunction/preposition letter was
  // merged onto the front. Strip one leading clitic so phrase-level dupes
  // like "اصبر على ما يقولون" (4 ayahs) get caught. Only shrinks the pool —
  // a false merge disqualifies a fragment, it can never create a wrong one.
  if (s.length > 3 && /^[وفبل]/.test(s)) s = s.slice(1);
  return s;
}

export function normalizeArabic(s: string): string[] {
  return s.split(/\s+/).filter(Boolean).map(normWord);
}

const BISMILLAH_NORM = "سم الله الرحمن الرحيم"; // بسم loses its ب clitic in normWord

export function loadCorpus(raw: { s: number; verses: [number, string, string][] }[]): Verse[] {
  const out: Verse[] = [];
  for (const su of raw) {
    for (const [a, ar, en] of su.verses) {
      let w = ar.split(/\s+/).filter(Boolean);
      let nw = w.map(normWord);
      // Ayah 1 of most surahs carries a prefixed Bismillah — drop it from
      // both arrays so fragments/hints never leak "بسم الله الرحمن الرحيم".
      if (a === 1 && su.s !== 1 && su.s !== 9 && nw.slice(0, 4).join(" ") === BISMILLAH_NORM) {
        w = w.slice(4);
        nw = nw.slice(4);
      }
      out.push({ s: su.s, a, ar, en, w, nw });
    }
  }
  return out;
}

export interface CorpusIndex {
  /** Normalized n-gram (n=3..7) → occurrence count across EVERY position of every verse. */
  grams: Map<string, number>;
}

/** One-time index build over 6236 verses. */
export function buildIndex(verses: Verse[]): CorpusIndex {
  const grams = new Map<string, number>();
  for (const v of verses) {
    for (let n = 3; n <= 7; n++) { // up to 7: fragment 6 + one-word extension check
      for (let i = 0; i + n <= v.nw.length; i++) {
        const g = v.nw.slice(i, i + n).join(" ");
        grams.set(g, (grams.get(g) ?? 0) + 1);
      }
    }
  }
  return { grams };
}

/**
 * A fragment that exists NOWHERE else in the Quran — at ANY position, not
 * just verse boundaries. "اصبر على ما يقولون" closes four different ayahs,
 * so the shown text must be globally unique or a player who knows the
 * repeated phrase gets an ambiguous question. Tries openings then endings,
 * shortest first. Display slice comes from the original uthmani words.
 */
export function uniqueFragment(
  v: Verse,
  idx: CorpusIndex,
): { text: string; side: "start" | "end" } | null {
  // The shown fragment must be globally unique AND, when the verse continues
  // past it, its one-word extension must be unique too — otherwise the cut
  // sits inside a longer repeated phrase ("اصبر على ما يقولون" ends four
  // ayahs) and the question is genuinely ambiguous.
  const gram1 = (words: string[]) => (idx.grams.get(words.join(" ")) ?? 0);
  for (const n of [3, 4, 5, 6]) {
    if (v.nw.length < n) continue;
    const pre = v.nw.slice(0, n);
    if (gram1(pre) !== 1) continue;
    if (v.nw.length === n || gram1(v.nw.slice(0, n + 1)) === 1) {
      return { text: v.w.slice(0, n).join(" ") + " …", side: "start" };
    }
  }
  for (const n of [3, 4, 5, 6]) {
    if (v.nw.length < n) continue;
    const suf = v.nw.slice(-n);
    if (gram1(suf) !== 1) continue;
    if (v.nw.length === n || gram1(v.nw.slice(-(n + 1))) === 1) {
      return { text: "… " + v.w.slice(-n).join(" "), side: "end" };
    }
  }
  return null;
}

/**
 * Ayahs that leak their own surah: mentioning "Joseph" means Yusuf, "spider"
 * means Ankabut, etc. Checked against BOTH the English translation and key
 * Arabic words — a fragment containing these would hand over the answer.
 */
const LEAK_TOKENS: Record<number, string[]> = {
  2: ["heifer", "cow", "بقر", "بقرة"],
  4: ["النساء"],
  6: ["cattle", "انعام"],
  10: ["Jonah", "يونس"],
  11: ["Hud", "هود"],
  12: ["Joseph", "يوسف"],
  14: ["Abraham", "ابراهيم", "إبراهيم"],
  16: ["bee", "نحل"],
  17: ["night journey", "اسر"],
  18: ["cave", "كهف"],
  19: ["Mary", "مريم"],
  21: ["prophets"],
  27: ["ant", "نمل"],
  29: ["spider", "عنكبوت"],
  33: ["confederates", "احزاب"],
  34: ["Sheba", "سبا"],
  36: ["يس"],
  47: ["Muhammad", "محمد"],
  48: ["victory", "فتح"],
  50: ["ق"],
  55: ["رحمن الرحيم"], // "Ar-Rahman" surah — every ayah repeating the phrase is itself a hint
  62: ["Friday", "جمعه", "جمعة"],
  68: ["pen", "قلم"],
  71: ["Noah", "نوح"],
  72: ["jinn", "جن"],
  89: ["dawn"],
  91: ["sun", "شمس"],
  92: ["night covers"],
  93: ["morning"],
  95: ["fig", "تين"],
  97: ["decree", "قدر"],
  98: ["clear proof", "بينه", "بينة"],
  99: ["earthquake", "زلزال"],
  101: ["calamity", "قارعه", "قارعة"],
  102: ["rivalry", "تكاثر"],
  103: ["عصر"],
  105: ["elephant", "فيل"],
  106: ["Quraysh", "قريش"],
  108: ["abundance", "كوثر"],
  109: ["disbelievers", "كافرون"],
  110: ["نصر"],
  111: ["palm fiber", "مسد"],
  112: ["اخلاص"],
  113: ["daybreak", "فلق"],
  114: ["مankind"],
};

export function leaksAnswer(v: Verse): boolean {
  const tokens = LEAK_TOKENS[v.s];
  if (!tokens) return false;
  const joined = v.nw.join(" ");
  return tokens.some((t) => v.en.includes(t) || joined.includes(t));
}

/**
 * Distractor surahs that "make sense" for the answer — picked from surahs of
 * similar length so a long ayah is paired with long-surah options.
 */
export function plausibleOptions(answer: Surah, count: number, rand = Math.random): Surah[] {
  const pool = SURAHS
    .filter((s) => s.n !== answer.n)
    .sort((a, b) => Math.abs(a.ayahs - answer.ayahs) - Math.abs(b.ayahs - answer.ayahs))
    .slice(0, Math.max(count * 4, 16));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const opts = pool.slice(0, count - 1).concat(answer);
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}


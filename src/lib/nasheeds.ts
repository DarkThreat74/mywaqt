// Nasheed library — the curated content bank for /nasheeds.
// Lyrics are human-curated (researched, then user-reviewed): never generate.
// Add a nasheed = one entry here. Drop its audio file at
// public/audio/nasheeds/<slug>.mp3 and set `audio` to the same path —
// the global player + offline audio cache pick it up automatically.

export interface Nasheed {
  slug: string;
  title: string;          // Latin-script title (search)
  arabic: string;         // Arabic title — the register anchor
  artist: string | null;  // munshid, or null for traditional
  audio: string | null;   // e.g. "/audio/nasheeds/talaa-al-badru.mp3"
  verses: string[][];     // stanzas → lines, rendered RTL with stanza gaps
}

export const NASHEEDS: Nasheed[] = [
  {
    slug: "talaa-al-badru",
    title: "Tala'a al-Badru 'Alayna",
    arabic: "طلع البدر علينا",
    artist: null, // traditional — sung to the Prophet ﷺ on arrival in Madinah
    audio: null,
    verses: [
      ["طلع البدر علينا", "من ثنيات الوداع"],
      ["وجب الشكر علينا", "ما دعا لله داع"],
      ["أيها المبعوث فينا", "جئت بالأمر المطاع"],
      ["جئت شرفت المدينة", "مرحبا يا خير داع"],
    ],
  },
  {
    slug: "mawlaya",
    title: "Mawlaya",
    arabic: "مولاي صل وسلم",
    artist: "Sami Yusuf",
    audio: null,
    verses: [
      ["مولاي صلي وسلم دائما أبدا", "على حبيبك خير الخلق كلهم"],
      ["مولاي صلي وسلم دائما أبدا", "على حبيبك خير الخلق كلهم"],
      ["هو الحبيب الذي ترجى شفاعته", "لكل هول من الأهوال مقتحم"],
      ["فاق النبيين في خلق وفي خلق", "ولم يدانوه في علم ولا كرم"],
      ["وكلهم من رسول الله ملتمس", "غرفا من البحر أو رشفا من الديم"],
    ],
  },
];

export const NASHEED_BY_SLUG = new Map(NASHEEDS.map((n) => [n.slug, n]));

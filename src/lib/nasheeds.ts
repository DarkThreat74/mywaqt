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
    slug: "tere-sadqe-mein-aaqa",
    title: "Tere Sadqe Mein Aaqa",
    arabic: "تیرے صدقے میں آقا",
    artist: "Muhammad Aziz Chishti",
    audio: null,
    verses: [
      ["تیرے صدقے میں آقا سارے جہاں کو دین ملا", "بے دینوں نے کلمہ پڑھا لا الہ الا اللہ"],
      [
        "سمتِ نبی ابو جہل گیا، آقا سے اس نے یہ کہا",
        "گر ہو نبی بتلاؤ ذرا، میری مٹھی میں ہے کیا",
        "آقا کا فرمان ہوا اور فضلِ سبحان اللہ",
        "مٹھی سے پتھر بولا لا الہ الا اللہ",
      ],
      [
        "اپنی بہن سے بولے عمر، یہ تو بتا کیا کرتی تھی",
        "میرے آنے سے پہلے چپکے چپکے کیا پڑھتی تھی",
        "بہن نے جب قرآن پڑھا، سن کے کلامِ پاکِ خدا",
        "دل یہ عمر کا بول اٹھا لا الہ الا اللہ",
      ],
      [
        "وہ جو بلالِ حبشی ہیں، سرورِ دین کا پیارا ہے",
        "دنیا کے ہر عاشق کی آنکھوں کا وہ تارا ہے",
        "ظلم ہوئے کتنے ان پر، سینے پہ رکھا پتھر",
        "پھر بھی لب پہ جاری تھا لا الہ الا اللہ",
      ],
      [
        "میرے نبی کے غلاموں کا رتبہ بڑا ہے شان بڑی",
        "چاہے غوثِ اعظم ہو یا ہو داتا ہجویری",
        "یاد نہیں تمہیں وہ منظر، خواجہ نے جب خود چل کر",
        "نوے لاکھ کو پروایا لا الہ الا اللہ",
      ],
      [
        "میرے مولا میرے خدا، تو ہی خالقِ ارض و سما",
        "تو ہی مالکِ روزِ جزا، میں ہوں سراپا جرم و خطا",
        "پھر بھی تجھ سے ہے یہ دعا، وقتِ نزع جب آئے میرا",
        "لب پہ ہو بس ایک صدا لا الہ الا اللہ",
      ],
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

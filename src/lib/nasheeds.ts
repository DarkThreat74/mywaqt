// Nasheed library — the curated content bank for /nasheeds.
// Lyrics are human-curated (researched, then user-reviewed): never generate.
// Add a nasheed = one entry here. Drop its audio file at
// public/audio/nasheeds/<slug>.mp3 and set `audio` to the same path —
// the global player + offline audio cache pick it up automatically.

export interface NasheedStanza {
  chorus?: boolean;    // refrain stanzas render as highlighted panels
  lines: string[];     // each entry is one sung line (Arabic or Latin)
}

export interface Nasheed {
  slug: string;
  title: string;          // Latin-script title (search)
  arabic: string;         // Arabic title — the register anchor
  artist: string | null;  // munshid, or null for traditional
  audio: string | null;   // e.g. "/audio/nasheeds/talaa-al-badru.mp3"
  verses: NasheedStanza[];
}

export const NASHEEDS: Nasheed[] = [
  {
    slug: "talaa-al-badru",
    title: "Tala'a al-Badru 'Alayna",
    arabic: "طلع البدر علينا",
    artist: null, // traditional — sung to the Prophet ﷺ on arrival in Madinah
    audio: null,
    verses: [
      { lines: ["طلع البدر علينا", "من ثنيات الوداع"] },
      { lines: ["وجب الشكر علينا", "ما دعا لله داع"] },
      { lines: ["أيها المبعوث فينا", "جئت بالأمر المطاع"] },
      { lines: ["جئت شرفت المدينة", "مرحبا يا خير داع"] },
    ],
  },
  {
    slug: "tere-sadqe-mein-aaqa",
    title: "Tere Sadqe Mein Aaqa",
    arabic: "تیرے صدقے میں آقا",
    artist: "Muhammad Aziz Chishti",
    audio: null,
    verses: [
      {
        chorus: true,
        lines: ["تیرے صدقے میں آقا سارے جہاں کو دین ملا", "بے دینوں نے کلمہ پڑھا لا الہ الا اللہ"],
      },
      {
        lines: [
          "سمتِ نبی ابو جہل گیا، آقا سے اس نے یہ کہا",
          "گر ہو نبی بتلاؤ ذرا، میری مٹھی میں ہے کیا",
          "آقا کا فرمان ہوا اور فضلِ سبحان اللہ",
          "مٹھی سے پتھر بولا لا الہ الا اللہ",
        ],
      },
      {
        lines: [
          "اپنی بہن سے بولے عمر، یہ تو بتا کیا کرتی تھی",
          "میرے آنے سے پہلے چپکے چپکے کیا پڑھتی تھی",
          "بہن نے جب قرآن پڑھا، سن کے کلامِ پاکِ خدا",
          "دل یہ عمر کا بول اٹھا لا الہ الا اللہ",
        ],
      },
      {
        lines: [
          "وہ جو بلالِ حبشی ہیں، سرورِ دین کا پیارا ہے",
          "دنیا کے ہر عاشق کی آنکھوں کا وہ تارا ہے",
          "ظلم ہوئے کتنے ان پر، سینے پہ رکھا پتھر",
          "پھر بھی لب پہ جاری تھا لا الہ الا اللہ",
        ],
      },
      {
        lines: [
          "میرے نبی کے غلاموں کا رتبہ بڑا ہے شان بڑی",
          "چاہے غوثِ اعظم ہو یا ہو داتا ہجویری",
          "یاد نہیں تمہیں وہ منظر، خواجہ نے جب خود چل کر",
          "نوے لاکھ کو پروایا لا الہ الا اللہ",
        ],
      },
      {
        lines: [
          "میرے مولا میرے خدا، تو ہی خالقِ ارض و سما",
          "تو ہی مالکِ روزِ جزا، میں ہوں سراپا جرم و خطا",
          "پھر بھی تجھ سے ہے یہ دعا، وقتِ نزع جب آئے میرا",
          "لب پہ ہو بس ایک صدا لا الہ الا اللہ",
        ],
      },
    ],
  },
  {
    slug: "mawlaya",
    title: "Mawlaya",
    arabic: "مولاي صل وسلم",
    artist: "Sami Yusuf",
    audio: null,
    verses: [
      {
        chorus: true,
        lines: ["مولاي صلي وسلم دائما أبدا", "على حبيبك خير الخلق كلهم"],
      },
      { lines: ["هو الحبيب الذي ترجى شفاعته", "لكل هول من الأهوال مقتحم"] },
      { lines: ["فاق النبيين في خلق وفي خلق", "ولم يدانوه في علم ولا كرم"] },
      { lines: ["وكلهم من رسول الله ملتمس", "غرفا من البحر أو رشفا من الديم"] },
    ],
  },
  {
    slug: "subhanallah",
    title: "Subhanallah",
    arabic: "سبحان الله",
    artist: "Maher Zain feat. Mesut Kurtis",
    audio: null,
    verses: [
      {
        chorus: true,
        lines: ["سبحان الله", "سبحان الله", "سبحان الله", "سبحان الله"],
      },
      {
        chorus: true,
        lines: [
          "سبحانك ربي سبحانك",
          "سبحانك ما أعظم شأنك",
          "ندعوك ونرجو غفرانك",
          "ندعوك ونرجو غفرانك ربي",
        ],
      },
      {
        lines: [
          "As I travel through the earth",
          "I can't help but notice",
          "The symphony I hear all around",
          "From the smallest grain of sand to the faraway planets",
          "To a flower putting roots in the ground",
        ],
      },
      {
        lines: [
          "Every bird in the sky, every rock and every raindrop",
          "says as it falls from the clouds",
          "Every ant, every plant, every breeze and all the seas",
          "They all sing:",
        ],
      },
      {
        chorus: true,
        lines: [
          "سبحانك ربي سبحانك",
          "سبحانك ما أعظم شأنك",
          "ندعوك ونرجو غفرانك",
          "ندعوك ونرجو غفرانك ربي",
        ],
      },
      {
        lines: [
          "جل الله في كل كون الله، ألمح نور الله",
          "وذكر ربي في دقات قلبي يهتف باسم الله",
          "خلق الله صنع الله ما أبهاه، والأكوان تسبح باسم الله",
          "جل الله في علاه يا رباه يا رحمن الله",
        ],
      },
      {
        chorus: true,
        lines: [
          "سبحانك ربي سبحانك",
          "سبحانك ما أعظم شأنك",
          "ندعوك ونرجو غفرانك",
          "ندعوك ونرجو غفرانك ربي",
        ],
      },
    ],
  },
  {
    slug: "insha-allah",
    title: "Insha Allah",
    arabic: "إن شاء الله",
    artist: "Maher Zain",
    audio: null,
    verses: [
      {
        lines: [
          "Every time you feel like you cannot go on",
          "You feel so lost and that you're so alone",
          "All you see is night, and darkness all around",
          "You feel so helpless, you can't see which way to go",
          "Don't despair and never lose hope",
          "'Cause Allah is always by your side",
        ],
      },
      {
        chorus: true,
        lines: ["Insha Allah, Insha Allah", "Insha Allah, you'll find your way"],
      },
      {
        lines: [
          "Every time you commit one more mistake",
          "You feel you can't repent and that it's way too late",
          "You're so confused, wrong decisions you have made",
          "Haunt your mind and your heart is full of shame",
          "But don't despair and never lose hope",
          "'Cause Allah is always by your side",
        ],
      },
      {
        chorus: true,
        lines: ["Insha Allah, Insha Allah", "Insha Allah, you'll find your way"],
      },
      {
        lines: [
          "Turn to Allah, He's never far away",
          "Put your trust in Him, raise your hands and pray",
          "Ooh Ya Allah, guide my steps, don't let me go astray",
          "You're the only one who can show me the way",
          "Show me the way, show me the way, show me the way",
        ],
      },
      {
        chorus: true,
        lines: ["Insha Allah, Insha Allah", "Insha Allah, we'll find our way"],
      },
    ],
  },
];

export const NASHEED_BY_SLUG = new Map(NASHEEDS.map((n) => [n.slug, n]));

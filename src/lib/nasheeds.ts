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
  {
    slug: "ya-ahl-bayt-an-nabi",
    title: "Ya Ahl Bayt an-Nabi",
    arabic: "يا آل بيت النبي",
    artist: null, // traditional hadrah madih
    audio: null,
    verses: [
      {
        chorus: true,
        lines: ["يا آل بيت النبي الطيب العربي", "بكم دعوت ربي بتفريج كربي"],
      },
      {
        lines: [
          "السعد لمن خدم مادمت خادمكم",
          "والبسط حالي والأفراح طوع يدي",
        ],
      },
      {
        chorus: true,
        lines: ["يا آل بيت النبي الطيب العربي", "بكم دعوت ربي بتفريج كربي"],
      },
      {
        lines: [
          "لا غيب الله عنا وجهكم أبدا",
          "حتى يطيب بكم عيشي إلى الأبد",
        ],
      },
      {
        chorus: true,
        lines: ["يا آل بيت النبي الطيب العربي", "بكم دعوت ربي بتفريج كربي"],
      },
      {
        lines: [
          "أنا الفقير إليكم والغني بكم",
          "وليس لي بعدكم حرص على أحد",
        ],
      },
      {
        chorus: true,
        lines: ["يا آل بيت النبي الطيب العربي", "بكم دعوت ربي بتفريج كربي"],
      },
    ],
  },
  {
    slug: "hal-sallayta-alayh",
    title: "Hal Sallayta al-Yawm Alayh",
    arabic: "هل صليت اليوم عليه",
    artist: "Abdullah Kamil",
    audio: null,
    verses: [
      {
        chorus: true,
        lines: [
          "هل حقاً تشتاق إليه؟",
          "ترجو أن تُسقى بيديه",
          "أرغم أنف الظلم وقولها",
          "هل صليت اليوم عليه؟",
        ],
      },
      {
        lines: [
          "الفائز حقاً من صلى",
          "والخاسر من عنه تخلى",
          "مت يا مبغض أحمد غِلاً",
          "قد صلينا اليوم عليه",
        ],
      },
      {
        lines: [
          "نصراً نصراً لمكانته",
          "غيظاً لمحارب سنته",
          "ربي ارحمنا بشفاعته",
          "قولوا صلي الله عليه",
        ],
      },
      {
        lines: [
          "خاب الهالك من يشتمه",
          "والهين من لا يكرمه",
          "ربي كافيه وعاصمه",
          "مهما اجترأ الوغد عليه",
        ],
      },
      {
        lines: [
          "شرح الرحمن له صدراً",
          "رفع المنان له ذكراً",
          "فهو أجل العالم قدراً",
          "يرنوا النجم إلى نعليه",
        ],
      },
      {
        lines: [
          "أكرم بمقام محمود",
          "ولواء الحمد المعقود",
          "وحباه بحوض مورود",
          "وهو شفيع الخلق لديه",
        ],
      },
      {
        lines: [
          "جاء سراجاً هل ربيعاً",
          "أكرم خلق الله جميعاً",
          "أكرمهم نسباً وصنيعاً",
          "طهر خالقه أبويه",
        ],
      },
      {
        lines: [
          "جاء نذيراً جاء بشيراً",
          "فيد تسقي الناس نميراً",
          "ويد تقتلع الشريرا",
          "ما أروعه في حاليه",
        ],
      },
      {
        lines: [
          "سطعت بالحق رسالته",
          "أفزعت البغي بسالته",
          "فتكت بالظلم عدالته",
          "مزق سطوته بيديه",
        ],
      },
      {
        lines: [
          "دعوته الأرحم والأسمى",
          "هو بحر يتدفق حلماً",
          "لن يبطش بثقيف مهما",
          "آذوه وأدموا قدميه",
        ],
      },
      {
        lines: [
          "كان رؤوفاً كان حليماً",
          "كان بأهل الأرض رحيماً",
          "يكرم مسكيناً ويتيماً",
          "يؤوي المضطهدين إليه",
        ],
      },
      {
        lines: [
          "أسعدت الطفل دعابته",
          "طالت للراكب سجدته",
          "قام يصلي وحفيدته",
          "يحملها بين ذراعيه",
        ],
      },
      {
        lines: [
          "هو رحمة ربي الرحمن",
          "رحم الإنس مع الجان",
          "يرفق حتى بالحيوان",
          "حتى الجزع يحن إليه",
        ],
      },
      {
        lines: [
          "حدث وأسمع عن بركته",
          "يبرئ أسقام صحابته",
          "يسقي العصبة من مِجَنِّه",
          "يطعم جيشاً من كفيه",
        ],
      },
      {
        lines: [
          "والعجماوات أطاعته",
          "شجر وصخور لبته",
          "سل أُحُدَ كيف أحبته",
          "تنطق بالتسليم عليه",
        ],
      },
      {
        lines: [
          "الصخر أرق من الناس",
          "فاخشع يا ذا القلب القاسي",
          "يا ويل الجاحد والناسي",
          "سد عن الهادي أذنيه",
        ],
      },
      {
        lines: [
          "كان الأزهد في دنيانا",
          "كم بات ليالي جوعانا",
          "نام ولم يفرش ما لانا",
          "بل قد أثر في جنبيه",
        ],
      },
      {
        lines: [
          "ما أطيبه ما ألطفه",
          "وبخالقه ما أعرفه",
          "ما أتقاه وما أخوفه",
          "دمع الخشية في عينيه",
        ],
      },
      {
        lines: [
          "هو خير الناس وأحلاهم",
          "هو أصدقهم هو أوفاهم",
          "هو أجودهم هو أسخاهم",
          "غمر الدنيا جود يديه",
        ],
      },
      {
        lines: [
          "صل على المعطاء محمد",
          "لا أكرم منه ولا أجود",
          "أعطى أطعم أسقى أنجد",
          "وكسا العريان ببرديه",
        ],
      },
      {
        lines: [
          "شمس تتبعه أقمار",
          "فمهاجرهم والأنصار",
          "بذلوا جادوا نصروا غاروا",
          "لخليل الباري وعليه",
        ],
      },
      {
        lines: [
          "هبوا اليوم لنصر نبينا",
          "واتبعوا سنة هادينا",
          "وأهينوا كل أعادينا",
          "ليعض الشيطان يديه",
        ],
      },
      {
        lines: [
          "صل على أجمل مصباح",
          "سنته غيث الأرواح",
          "وهو العاقب وهو الماحي",
          "حشر الناس على قدميه",
        ],
      },
      {
        lines: [
          "أذكى وأجل الصلوات",
          "تتجدد كل الأوقات",
          "عد جميع المخلوقات",
          "وسلام الرحمن عليه",
        ],
      },
      {
        chorus: true,
        lines: [
          "هل حقاً تشتاق إليه؟",
          "ترجو أن تُسقى بيديه",
          "أرغم أنف الظلم وقولها",
          "هل صليت اليوم عليه؟",
          "قولوا صلي الله عليه",
        ],
      },
    ],
  },
  {
    slug: "qamarun",
    title: "Qamarun",
    arabic: "قمرٌ",
    artist: "Mikhaael Mala",
    audio: null,
    verses: [
      {
        chorus: true,
        lines: [
          "قمرٌ قمرٌ قمرٌ سيدنا النبي قمرٌ",
          "وجميلٌ وجميلٌ وجميلٌ سيدنا النبي وجميلٌ",
        ],
      },
      {
        lines: [
          "وأجملُ منك لم ترَ قطُّ عينٌ",
          "وأطيبُ منك لم تلدِ النساءُ",
          "خلقتَ مبرءاً من كل عيبٍ",
          "كأنك قد خلقتَ كما تشاءُ",
        ],
      },
      {
        chorus: true,
        lines: [
          "قمرٌ قمرٌ قمرٌ سيدنا النبي قمرٌ",
          "وجميلٌ وجميلٌ وجميلٌ سيدنا النبي وجميلٌ",
        ],
      },
      {
        lines: [
          "وكفُّ المصطفى كالوردِ نادي",
          "وعطرُها يبقى إذا مست أيادي",
          "وعمَّ نوالُها كلَّ العبادي",
          "حبيبُ اللهِ يا خيرَ البرايا",
        ],
      },
      {
        chorus: true,
        lines: [
          "قمرٌ قمرٌ قمرٌ سيدنا النبي قمرٌ",
          "وجميلٌ وجميلٌ وجميلٌ سيدنا النبي وجميلٌ",
        ],
      },
      {
        lines: [
          "ولا ظلَّ له بل كان نورا",
          "تنالُ الشمسُ منه والبدورا",
          "ولم يكن الهدى لولا ظهورُه",
          "وكلُّ الكونِ أنارَ بنورِ طه",
        ],
      },
      {
        chorus: true,
        lines: [
          "قمرٌ قمرٌ قمرٌ سيدنا النبي قمرٌ",
          "وجميلٌ وجميلٌ وجميلٌ سيدنا النبي وجميلٌ",
        ],
      },
    ],
  },
  {
    slug: "hal-laka-sirrun",
    title: "Hal Laka Sirrun 'Indallah",
    arabic: "هل لك سرٌّ عند الله",
    artist: "Mishary Rashid Alafasy",
    audio: null,
    verses: [
      {
        lines: [
          "هل لك سرٌّ عند الله",
          "بينك أنت وبين الله",
          "هل لك صدقاتٌ تخفى",
          "لا يعلمها إلا الله",
        ],
      },
      {
        lines: [
          "قصصٌ لا تُكشف إلا",
          "بكتابك حين ترى الله",
          "ما أحراك بهذا أن",
          "يكبر قدرك عند الله",
        ],
      },
    ],
  },
];

export const NASHEED_BY_SLUG = new Map(NASHEEDS.map((n) => [n.slug, n]));

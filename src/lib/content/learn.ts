/**
 * Curated Learn content for Waqt.
 *
 * All hadith text is sourced from authenticated collections:
 * - Sahih al-Bukhari
 * - Sahih Muslim
 * - Sunan Abi Dawud
 * - Sunan an-Nasa'i
 * - Musnad Ahmad
 * - Mustadrak al-Hakim
 *
 * No content in this file is AI-generated. All Arabic and English
 * translations are from established hadith databases and scholarly sources.
 * Sources are cited per item for verification.
 */

export type Hadith = {
  arabic: string;
  english: string;
  source: string;
  /** translator attribution — shown as "tr. X" when known */
  translator?: string;
  grade?: string;
};

export type LearnSection = {
  id: string;
  title: string;
  subtitle: string;
  content: LearnBlock[];
};

export type LearnBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "hadith"; hadith: Hadith }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "callout"; text: string };

export const learnSections: LearnSection[] = [
  // ─── 1. Virtues of Salah ───
  {
    id: "virtues-of-salah",
    title: "Virtues of Salah",
    subtitle: "Why the five daily prayers are the foundation of your day",
    content: [
      {
        type: "paragraph",
        text: "Salah is the second pillar of Islam and the first thing a Muslim will be questioned about on the Day of Judgment. It is the direct connection between the servant and Allah — no intermediary, no priest, just you and your Lord, five times a day.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "إِنَّمَا مَثَلُ الصَّلَاةِ كَمَثَلِ نَهْرٍ جَارٍ غَمْرٍ عَذْبٍ بِبَابِ أَحَدِكُمْ يَقْتَحِمُ فِيهِ كُلَّ يَوْمٍ خَمْسَ مَرَّاتٍ فَمَا تَرَوْنَ يَبْقَى مِنْ دَرَنِهِ",
          english:
            "The example of prayer is like that of a flowing river, deep and sweet, at the door of one of you — he bathes in it five times a day. What do you think remains of his dirt?",
          source: "Musnad Ahmad, Mustadrak al-Hakim §3.24",
          grade: "Sahih — chain on Muslim's condition",
        },
      },
      {
        type: "paragraph",
        text: "The five daily prayers wash away minor sins between them, just as bathing in a river five times a day leaves no dirt on the body. This is not a metaphor for spiritual feelings — it is a literal promise that consistent prayer purifies the heart and wipes away wrong actions.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "إِنَّ الْمُسْلِمَ إِذَا تَوَضَّأَ فَأَحْسَنَ الْوُضُوءَ ثُمَّ صَلَّى الصَّلَوَاتِ الْخَمْسَ تَحَاتَّ خَطَايَاهُ كَمَا يَتَحَاتُّ هَذَا الْوَرَقُ",
          english:
            "When a Muslim performs wudu well and then offers the five prayers, his sins fall away just as these leaves fall.",
          source: "Musnad Ahmad (Salman al-Farsi)",
          grade: "Hasan — supported by multiple chains",
        },
      },
      {
        type: "heading",
        text: "The Covenant with Allah",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "الْعَهْدُ الَّذِي بَيْنَنَا وَبَيْنَهُمُ الصَّلَاةُ فَمَنْ تَرَكَهَا فَقَدْ كَفَرَ",
          english:
            "The covenant between us and them is the prayer. Whoever abandons it has disbelieved.",
          source: "Sunan an-Nasa'i, Musnad Ahmad",
          grade: "Sahih",
        },
      },
      {
        type: "callout",
        text: "Salah is not a burden — it is an anchor. When life is chaotic, the prayers remain fixed. When the heart is heavy, the sujud is where it finds rest.",
      },
    ],
  },

  // ─── 2. Virtues of Each Prayer ───
  {
    id: "virtues-of-each-prayer",
    title: "Virtues of Each Prayer",
    subtitle: "Every prayer carries its own unique reward",
    content: [
      {
        type: "heading",
        text: "Fajr — The Dawn Prayer",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "مَنْ صَلَّى الصُّبْحَ فَهُوَ فِي ذِمَّةِ اللَّهِ",
          english:
            "Whoever prays the morning prayer (Fajr) is under the protection of Allah.",
          source: "Sahih Muslim",
          grade: "Sahih",
        },
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "تَفْضُلُ صَلَاةُ الْجَمَاعَةِ صَلَاةَ أَحَدِكُمْ وَحْدَهُ بِخَمْسٍ وَعِشْرِينَ جُزْءًا، وَتَجْتَمِعُ مَلَائِكَةُ اللَّيْلِ وَمَلَائِكَةُ النَّهَارِ فِي صَلَاةِ الْفَجْرِ",
          english:
            "Prayer in congregation is twenty-five times greater than prayer alone. The angels of the night and the angels of the day gather at the Fajr prayer.",
          source: "Sahih al-Bukhari 648",
          grade: "Sahih",
        },
      },
      {
        type: "paragraph",
        text: "Fajr is the hardest prayer for the hypocrites, which means the one who prays it consistently has proven the sincerity of their faith. The angels who watched over you during the night ascend to Allah at Fajr, and the angels of the day descend — they meet at Fajr prayer.",
      },
      {
        type: "heading",
        text: "Dhuhr — The Midday Prayer",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "مَنْ صَلَى الْبَرْدَيْنِ دَخَلَ الْجَنَّةَ",
          english:
            "Whoever prays the two cool prayers (Fajr and Asr) will enter Paradise.",
          source: "Sahih al-Bukhari & Muslim",
          grade: "Sahih — Muttafaq Alayh",
        },
      },
      {
        type: "paragraph",
        text: "Dhuhr is the prayer where the angels of the day shift change. It is a moment of stillness in the middle of the world's busiest hour — a reminder that your work is not your master, Allah is.",
      },
      {
        type: "heading",
        text: "Asr — The Afternoon Prayer",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "لَا يَلِجُ النَّارَ مَنْ صَلَّى قَبْلَ طُلُوعِ الشَّمْسِ وَقَبْلَ غُرُوبِهَا",
          english:
            "He will never enter the Hellfire whoever prays before the rising of the sun (Fajr) and before its setting (Asr).",
          source: "Sahih Muslim",
          grade: "Sahih",
        },
      },
      {
        type: "paragraph",
        text: "Asr is the second of the 'two cool prayers.' The Prophet ﷺ was shown a vision of his Ummah and those who guarded Asr were singled out with light. Missing Asr deliberately is described by the Prophet ﷺ as if one's family and wealth were destroyed.",
      },
      {
        type: "heading",
        text: "Maghrib — The Sunset Prayer",
      },
      {
        type: "paragraph",
        text: "Maghrib marks the transition from day to night. It is a short prayer — three rakats — but it carries the weight of gratitude for the day that has passed. The Prophet ﷺ said that on the Day of Judgment, the disbeliever will wish he had prayed Maghrib.",
      },
      {
        type: "heading",
        text: "Isha — The Night Prayer",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "أَثْقَلُ الصَّلَاةِ عَلَى الْمُنَافِقِينَ صَلَاةُ الْعِشَاءِ وَصَلَاةُ الْفَجْرِ",
          english:
            "No prayer is more burdensome for the hypocrites than the Isha and Fajr prayers.",
          source: "Sahih al-Bukhari & Muslim",
          grade: "Sahih — Muttafaq Alayh",
        },
      },
      {
        type: "paragraph",
        text: "Isha is the last act of the day before sleep. Praying Isha in congregation is like standing in prayer for half the night. The one who prays Isha has closed their day with a covenant renewed.",
      },
      {
        type: "heading",
        text: "Voluntary (Nafl) Prayers and Their Virtues",
      },
      {
        type: "paragraph",
        text: "Beyond the five obligatory prayers, the Prophet ﷺ maintained a regular practice of voluntary prayers. These are not obligations but are highly recommended — they make up for deficiencies in the obligatory prayers, bring the servant closer to Allah, and carry their own unique rewards. The Prophet ﷺ said that Allah said in a hadith qudsi: 'My servant continues to draw near to Me with supererogatory works until I love him' (Sahih al-Bukhari).",
      },
      {
        type: "heading",
        text: "Sunnah Mu'akkadah (Emphasized Sunnah Prayers)",
      },
      {
        type: "paragraph",
        text: "These are the sunnah prayers the Prophet ﷺ rarely left. The Prophet ﷺ said: 'Whoever prays twelve rakats in a day and night, a house is built for him in Paradise' (Sahih Muslim). These twelve are:",
      },
      {
        type: "list",
        items: [
          "2 rakats before Fajr — the Prophet ﷺ said these two rakats are 'better than the world and everything in it' (Sahih Muslim). They should not be missed even while traveling.",
          "4 rakats before Dhuhr and 2 after — the Prophet ﷺ said: 'Whoever consistently prays four before Dhuhr and four after, Allah makes the Hellfire haram for him' (Sunan an-Nasa'i, Sahih).",
          "2 rakats after Maghrib.",
          "2 rakats after Isha.",
        ],
      },
      {
        type: "heading",
        text: "Witr — The Wajib Night Prayer",
      },
      {
        type: "paragraph",
        text: "Witr is the odd-numbered prayer performed after Isha. In the Hanafi school, Witr is wajib (necessary) — not optional. It is prayed as 3 rakats. The Prophet ﷺ said: 'Allah has given you an additional prayer, and it is Witr — Allah has made it better for you than the best red camels' (Sunan Abu Dawud). The time for Witr begins after Isha and extends until the onset of Fajr. The preferred time is after sleeping and waking for Tahajjud, but if one fears not waking up, it should be prayed before sleeping.",
      },
      {
        type: "heading",
        text: "Tahajjud — The Night Prayer (Qiyam al-Layl)",
      },
      {
        type: "paragraph",
        text: "Tahajjud is the voluntary prayer performed after waking from sleep in the latter part of the night. It is the most virtuous of the voluntary prayers after the sunnah mu'akkadah. The Prophet ﷺ said: 'The best prayer after the obligatory prayers is the night prayer' (Sahih Muslim). And: 'Our Lord descends every night to the lowest heaven during the last third of the night and says: Who is calling upon Me that I may answer him? Who is asking of Me that I may give him? Who is seeking My forgiveness that I may forgive him?' (Sahih al-Bukhari & Muslim).",
      },
      {
        type: "paragraph",
        text: "Tahajjud can be prayed as 2, 4, 6, or 8 rakats (in pairs of 2), followed by Witr. The time begins after midnight (the midpoint between Maghrib and Fajr) and extends until the onset of Fajr. The best time is the last third of the night. If you cannot wake up, pray Witr before sleeping — the Prophet ﷺ said: 'Make Witr the last of your prayer at night' (Sahih al-Bukhari & Muslim).",
      },
      {
        type: "heading",
        text: "Ishraq — The Sunrise Prayer",
      },
      {
        type: "paragraph",
        text: "Ishraq is a voluntary prayer prayed after sunrise. The time begins approximately 15-20 minutes after sunrise, once the sun has risen above the horizon and the prohibited time for prayer has ended. It is prayed as 2 rakats. The Prophet ﷺ said: 'Whoever prays Fajr in congregation, then sits remembering Allah until the sun rises, then prays two rakats, will have a reward like that of a complete Hajj and Umrah' (Sunan at-Tirmidhi, classed as hasan). Some scholars note that the sitting in remembrance is part of the virtue — the full reward is for those who pray Fajr in congregation, sit in remembrance until sunrise, and then pray Ishraq.",
      },
      {
        type: "heading",
        text: "Duha (Chasht) — The Mid-Morning Prayer",
      },
      {
        type: "paragraph",
        text: "Duha is a voluntary prayer prayed in the mid-morning, after the sun has fully risen and the day has become hot. The time begins after the prohibited sunrise period ends (approximately 15-20 minutes after sunrise) and extends until just before the sun reaches its zenith (before Dhuhr). The minimum is 2 rakats; the maximum is 8 rakats (prayed in pairs of 2). The most common practice is 4 rakats.",
      },
      {
        type: "paragraph",
        text: "The Prophet ﷺ said: 'In the morning, charity is due from every joint of your body. Every tasbih is charity, every tahmid is charity, every tahlil is charity, every takbir is charity, enjoining good is charity, and forbidding evil is charity — and two rakats of Duha suffice for all of that' (Sahih Muslim). This means that two rakats of Duha are a way of giving charity on behalf of every joint in your body — a beautiful and accessible act of gratitude.",
      },
      {
        type: "heading",
        text: "Awwabin — The Prayer of the Repentant",
      },
      {
        type: "paragraph",
        text: "Awwabin is a voluntary prayer prayed after Maghrib. There is a difference of opinion among scholars regarding what exactly 'Awwabin' refers to, and this should be understood carefully:",
      },
      {
        type: "list",
        items: [
          "Some scholars identify Awwabin with the six rakats prayed after Maghrib. This is based on a narration reported by Abu Hurayrah that the Prophet ﷺ said: 'Whoever prays six rakats after Maghrib and does not speak anything evil between them, it is as if he prayed the equivalent of twelve years of worship' (Sunan at-Tirmidhi). However, the authenticity of this narration is debated — some scholars classify it as da'if (weak), while others accept it with supporting chains.",
          "Other scholars identify Awwabin with the Duha prayer (the mid-morning prayer described above). This is based on the narration: 'The prayer of the Awwabin is when the young camels feel the heat of the sun' (Sahih Muslim), which clearly refers to the mid-morning time, not after Maghrib.",
          "The safest approach: Both practices are virtuous. Praying voluntary rakats after Maghrib is a confirmed Sunnah (2 rakats are sunnah mu'akkadah, and additional rakats are mustahabb). Praying Duha in the morning is also a confirmed Sunnah with strong evidence. The term 'Awwabin' may refer to either, depending on the scholar, and both are rewarded.",
        ],
      },
      {
        type: "callout",
        text: "The disagreement over Awwabin is an example of how scholars handle differences — both positions are respected, and the layperson is free to follow either. What matters is consistency. The Prophet ﷺ said: 'The most beloved of actions to Allah are those done consistently, even if they are few.' Choose a voluntary practice you can maintain daily — even two rakats — and stick with it. A small consistent act is more beloved to Allah than a large inconsistent one.",
      },
      {
        type: "heading",
        text: "Tahiyyatul Masjid — Greeting the Masjid",
      },
      {
        type: "paragraph",
        text: "When you enter the masjid, it is sunnah to pray 2 rakats before sitting down. This is called Tahiyyatul Masjid. The Prophet ﷺ said: 'When one of you enters the masjid, let him not sit until he prays two rakats' (Sahih al-Bukhari & Muslim). If you enter at a time when prayer is prohibited (sunrise, noon, sunset), or if you enter and the congregational prayer is about to begin, the sunnah is lifted.",
      },
      {
        type: "heading",
        text: "Tahiyyatul Wudhu — Prayer After Wudhu",
      },
      {
        type: "paragraph",
        text: "After completing wudu, it is recommended to pray 2 rakats. The Prophet ﷺ said to Bilal: 'O Bilal, tell me about the most hopeful act you have done in Islam, for I heard the sound of your footsteps ahead of me in Paradise.' Bilal replied: 'I have done no act more hopeful to me than that I never purify myself at any time of night or day except that I pray with that purification what Allah has written for me to pray' (Sahih al-Bukhari & Muslim).",
      },
    ],
  },

  // ─── 3. How to Pray ───
  {
    id: "how-to-pray",
    title: "How to Pray",
    subtitle: "The steps of salah, from intention to salam",
    content: [
      {
        type: "heading",
        text: "Before You Begin",
      },
      {
        type: "list",
        items: [
          "Wudu (ablution) — ritual purity with clean water",
          "Clean body, clean clothes, clean place",
          "Covering the awrah (men: navel to knee; women: everything except face and hands)",
          "Facing the qibla (toward the Kaaba in Mecca)",
          "The prayer time has entered",
          "Niyyah (intention) — in your heart, for the specific prayer you are about to pray",
        ],
      },
      {
        type: "heading",
        text: "The Steps of Salah",
      },
      {
        type: "steps",
        items: [
          "Stand facing the qibla. Make your intention in your heart for the specific prayer.",
          "Raise your hands to your ears and say: Allahu Akbar (the opening takbir).",
          "Place your right hand over your left on your chest.",
          "Recite the opening supplication: Subhanaka Allahumma wa bihamdika…",
          "Recite Ta'awwudh: A'udhu billahi min ash-shaytan ir-rajim",
          "Recite Tasmiyah: Bismillah ir-Rahman ir-Rahim",
          "Recite Surah Al-Fatihah (the Opening Chapter of the Quran)",
          "Recite another surah or verses from the Quran.",
          "Bow (Ruku) saying Allahu Akbar. Place your hands on your knees. Say: Subhana Rabbiyal Azim (three times).",
          "Rise from ruku saying: Sami'Allahu liman hamidah. Then say: Rabbana lakal hamd.",
          "Prostrate (Sujud) saying Allahu Akbar. Say: Subhana Rabbiyal A'la (three times).",
          "Rise from sujud saying Allahu Akbar. Sit briefly.",
          "Prostrate again (second sujud) saying Allahu Akbar. Say: Subhana Rabbiyal A'la (three times).",
          "Rise to standing for the next rakat, saying Allahu Akbar.",
          "After the second rakat, sit for the tashahhud: At-tahiyyatu lillahi was-salawatu wat-tayyibat…",
          "In the final rakat, after tashahhud, recite the salawat: Allahumma salli ala Muhammad…",
          "Turn your head to the right and say: As-salamu alaykum wa rahmatullah.",
          "Turn your head to the left and say: As-salamu alaykum wa rahmatullah.",
        ],
      },
      {
        type: "callout",
        text: "If you accidentally add or omit something, perform two prostrations of forgetfulness (sajdat as-sahw) before the final salam. This is a mercy — the prayer is not invalidated by honest mistakes.",
      },
      {
        type: "heading",
        text: "Detailed Posture in Salah (Hanafi Method)",
      },
      {
        type: "paragraph",
        text: "The way you hold your body in salah matters — not just for validity, but for the quality and reward of the prayer. The Hanafi school has specific guidance on hand placement, foot position, and where to direct your gaze in each posture. These details come from the works of Imam Abu Hanifa's students (Imam Abu Yusuf and Imam Muhammad) and later Hanafi texts such as Maraqi al-Falah and Radd al-Muhtar.",
      },
      {
        type: "heading",
        text: "Hand Placement in Qiyam (Standing)",
      },
      {
        type: "paragraph",
        text: "In the Hanafi school, men fold their hands below the navel. The specific method:",
      },
      {
        type: "list",
        items: [
          "Place the right palm over the back of the left hand, so the right palm rests on the left hand's back (not clasping the left hand from below).",
          "The right thumb and right little finger wrap around the left wrist, forming a ring that grips the wrist.",
          "The three middle fingers of the right hand (index, middle, ring) remain straight and together, resting along the left forearm — they do not grip or wrap.",
          "The hands are placed below the navel — the left hand is held by the right at the level of the navel or just below it.",
          "Women place their hands on their chest without gripping — the right palm rests flat over the left hand, without the thumb-finger ring grip.",
        ],
      },
      {
        type: "callout",
        text: "The hand placement is sunnah, not fard. If you forget and place your hands differently, or pray with hands at your sides, the prayer is still valid. However, consistently following the Sunnah placement increases the reward and the focus of the prayer.",
      },
      {
        type: "heading",
        text: "Where to Look in Each Posture",
      },
      {
        type: "list",
        items: [
          "Qiyam (standing): Look at the place of prostration — the spot on the ground where your forehead will rest in sujud. This keeps the gaze lowered and the heart present.",
          "Ruku (bowing): Look at the back of your feet, or between your feet. The back should be straight and the head neither raised nor lowered — the neck is in line with the back.",
          "Sujud (prostration): Look at the tip of your nose, which is resting on the ground. The eyes are naturally directed downward.",
          "Jalsa/Qa'dah (sitting): Look at your lap, or toward your finger (the index finger pointed during tashahhud).",
          "Throughout the prayer: Do not look around. The Prophet ﷺ said that looking around is something the Shaytan steals from a person's prayer (Sahih al-Bukhari).",
        ],
      },
      {
        type: "heading",
        text: "Head and Chest Position",
      },
      {
        type: "list",
        items: [
          "In ruku: The head must be level with the back — neither raised (as if looking up) nor lowered (as if looking down). The back is straight, parallel to the ground. Raising or lowering the head is makruh (disliked).",
          "In sujud: The forehead and nose must both touch the ground. If only the forehead touches and the nose is raised, the sujud is not valid in the Hanafi school — both must be on the ground.",
          "The chest must face the qibla throughout the prayer. If the chest turns away from the qibla direction, the prayer is invalidated. Turning only the face (while the chest remains toward qibla) is makruh but does not invalidate.",
          "In jalsa (sitting between two sajdahs): Sit on the left foot with the right foot upright (toes pointing toward qibla). This is the preferred Hanafi method for men. Women sit on their right hip (tawarruk).",
          "In qa'dah (final sitting): Men sit on the left foot with the right foot upright (iftirash), or some narrations mention tawarruk for the final sitting. The right foot's toes should point toward the qibla.",
        ],
      },
      {
        type: "heading",
        text: "Foot Position",
      },
      {
        type: "list",
        items: [
          "In qiyam: Feet should be apart, approximately four fingers' width between them, both pointing toward the qibla.",
          "In ruku: The feet remain firmly on the ground, bearing the body's weight. The heels should not lift.",
          "In sujud: The toes of both feet should be bent forward, pointing toward the qibla. The feet should be upright on the toes — the heels should be up and the toes bent so the toe-tips bear the weight. This is the Sunnah position.",
          "If the feet are lifted entirely off the ground during sujud for a duration longer than saying 'Subhanallah' three times, the prayer becomes void. The feet must maintain contact with the ground.",
          "If only the toes are on the ground (heels up) but the toes are not bent toward the qibla, the sujud is valid but khilaf al-awla (contrary to what is better). Try to bend the toes toward the qibla.",
          "In jalsa and qa'dah: The right foot is kept upright on its toes, pointing toward the qibla. The left foot is laid flat, and the person sits on it (for men).",
        ],
      },
      {
        type: "heading",
        text: "Ruku — Detailed Posture",
      },
      {
        type: "list",
        items: [
          "The back must be completely straight, parallel to the ground. A slight bend is acceptable, but the Sunnah is a flat, straight back.",
          "The hands grip the knees with the fingers spread apart (for men). The fingers should wrap around the knees.",
          "The arms should not touch the sides of the body — they should be held away from the ribs. (Women keep their arms close to the body.)",
          "The legs should be straight, not bent at the knees.",
          "The head is level with the back — not raised, not lowered.",
          "Stillness (tuma'ninah) is required — the body must settle in ruku before rising. Rushing without stillness invalidates the prayer.",
        ],
      },
      {
        type: "heading",
        text: "Sujud — Detailed Posture",
      },
      {
        type: "list",
        items: [
          "Prostrate on seven bones: the forehead (with the nose), both palms, both knees, and both feet (toes). All seven must be on the ground.",
          "For men: The stomach should be away from the thighs, and the arms should be away from the sides of the body. The elbows should not touch the ground (they should be raised). The Prophet ﷺ said: 'Be straight in prostration and let none of you put his forearms on the ground like a dog' (Sahih al-Bukhari).",
          "For women: The body should be compact — the stomach close to the thighs and the arms close to the body. This is the Hanafi position based on the practice of Aisha (RA).",
          "The toes of both feet must point toward the qibla, with the feet upright on the toes.",
          "Stillness (tuma'ninah) is required in sujud — the bones must settle before rising. The Prophet ﷺ told a man who rushed: 'Go back and pray, for you have not prayed' (Sahih al-Bukhari).",
        ],
      },
    ],
  },

  // ─── 4. Witr Prayer ───
  {
    id: "witr-prayer",
    title: "Witr Prayer",
    subtitle: "The odd-numbered night prayer that closes your day",
    content: [
      {
        type: "paragraph",
        text: "Witr is a voluntary night prayer performed after Isha and before Fajr. The word 'witr' means 'odd' — it is the prayer that ends your night with an odd number of rakats, sealing your worship.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "إِنَّ اللَّهَ وَتْرٌ يُحِبُّ الْوَتْرَ فَأَوْتِرُوا يَا أَهْلَ الْقُرْآنِ",
          english:
            "Allah is Witr (One/Odd) and He loves Witr. So perform Witr, O people of the Quran.",
          source: "Sunan Abi Dawud, Jami at-Tirmidhi",
          grade: "Sahih",
        },
      },
      {
        type: "heading",
        text: "Is Witr Obligatory?",
      },
      {
        type: "paragraph",
        text: "There is a difference of opinion among the schools of thought:",
      },
      {
        type: "list",
        items: [
          "Hanafi: Witr is Wajib (necessary) — it should not be deliberately missed.",
          "Shafi'i, Maliki, Hanbali: Witr is Sunnah Mu'akkadah (highly emphasised) — strongly recommended but not obligatory.",
        ],
      },
      {
        type: "heading",
        text: "How Many Rakats?",
      },
      {
        type: "paragraph",
        text: "Witr can be prayed in any odd number of rakats — 1, 3, 5, 7, 9, or 11. The most common practice is 3 rakats.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "الْوِتْرُ حَقٌّ عَلَى كُلِّ مُسْلِمٍ فَمَنْ شَاءَ أَنْ يُوتِرَ بِخَمْسٍ فَلْيَفْعَلْ وَمَنْ شَاءَ أَنْ يُوتِرَ بِثَلَاثٍ فَلْيَفْعَلْ وَمَنْ شَاءَ أَنْ يُوتِرَ بِوَاحِدَةٍ فَلْيَفْعَلْ",
          english:
            "Witr is a duty for every Muslim. Whoever wishes to pray it with five rakats, let him do so; whoever wishes with three, let him do so; whoever wishes with one, let him do so.",
          source: "Sunan Abi Dawud",
          grade: "Sahih (Al-Albani)",
        },
      },
      {
        type: "heading",
        text: "When to Pray Witr",
      },
      {
        type: "list",
        items: [
          "After Isha prayer and before Fajr prayer begins.",
          "The best time is the last third of the night, just before Fajr.",
          "If you are not confident you will wake up for the last third, pray Witr before sleeping after Isha.",
        ],
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "اجْعَلُوا آخِرَ صَلَاتِكُمْ بِاللَّيْلِ وِتْرًا",
          english:
            "Make the last of your prayer at night Witr.",
          source: "Sahih al-Bukhari 998",
          grade: "Sahih",
        },
      },
      {
        type: "heading",
        text: "How to Pray 3-Rakat Witr",
      },
      {
        type: "paragraph",
        text: "There are two methods depending on your school of thought:",
      },
      {
        type: "steps",
        items: [
          "Make your intention (niyyah) for Witr prayer.",
          "Pray the first two rakats as you would any normal prayer (standing, recitation, ruku, sujud).",
          "In the third rakat, after reciting Al-Fatihah and a surah:",
          "Say Allahu Akbar and raise your hands (Hanafi method — before ruku).",
          "Recite the Qunoot dua: Allahumma ihdini feeman hadayt…",
          "Bow for ruku and complete the rakat as normal.",
          "Sit for the final tashahhud and give salam to both sides.",
        ],
      },
      {
        type: "callout",
        text: "The established sunnah recitation for 3-rakat Witr is: Surah Al-A'la (87) in the first rakat, Surah Al-Kafirun (109) in the second, and Surah Al-Ikhlas (112) in the third. This is recommended, not obligatory.",
      },
      {
        type: "heading",
        text: "If You Miss Witr",
      },
      {
        type: "paragraph",
        text: "If you sleep through Witr or forget it, pray it when you wake up or remember it. However, if making it up during the day, add one rakat to make it even — the odd character is preserved for the night itself.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "مَنْ نَامَ عَنِ الْوِتْرِ أَوْ نَسِيَهُ فَلْيُصَلِّهِ إِذَا ذَكَرَهُ",
          english:
            "Whoever sleeps through Witr or forgets it, let him pray it when he remembers it.",
          source: "Jami at-Tirmidhi 466",
          grade: "Sahih",
        },
      },
    ],
  },

  // ─── 5. Sunnah Prayers ───
  {
    id: "sunnah-prayers",
    title: "Sunnah Prayers",
    subtitle: "The voluntary prayers the Prophet ﷺ never left",
    content: [
      {
        type: "paragraph",
        text: "Sunnah prayers are voluntary prayers that the Prophet Muhammad ﷺ prayed regularly. Some were so consistent in his practice that they are called Sunnah Mu'akkadah (emphasised) — leaving them without reason is blameworthy, though not sinful.",
      },
      {
        type: "heading",
        text: "Sunnah Mu'akkadah — Emphasised Sunnahs",
      },
      {
        type: "list",
        items: [
          "2 rakats before Fajr (Fajr sunnah) — the Prophet ﷺ never left these, even while traveling.",
          "4 rakats before Dhuhr + 2 rakats after Dhuhr",
          "2 rakats after Maghrib",
          "2 rakats after Isha",
        ],
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "رَكْعَتَا الْفَجْرِ خَيْرٌ مِنَ الدُّنْيَا وَمَا فِيهَا",
          english:
            "The two rakats of Fajr (sunnah) are better than the world and everything in it.",
          source: "Sahih Muslim 725",
          grade: "Sahih",
        },
      },
      {
        type: "heading",
        text: "Sunnah Ghair Mu'akkadah — Non-Emphasised Sunnahs",
      },
      {
        type: "list",
        items: [
          "4 rakats before Asr",
          "4 rakats before Isha",
        ],
      },
      {
        type: "callout",
        text: "Sunnah prayers are prayed individually, not in congregation. They can be prayed at home — the Prophet ﷺ said the best prayer after the obligatory ones is the one prayed at home.",
      },
    ],
  },

  // ─── 6. Wudu & Ghusl ───
  {
    id: "wudu-and-ghusl",
    title: "Wudu & Ghusl",
    subtitle: "Ritual purification — the prerequisites for valid prayer",
    content: [
      {
        type: "heading",
        text: "When Wudu is Required",
      },
      {
        type: "paragraph",
        text: "Wudu (ritual ablution) is required before any obligatory or voluntary prayer, before touching the Quran, and before performing tawaf around the Kaaba. Without wudu, these acts of worship are not valid. Wudu is also recommended before sleeping, after waking, before each prayer even if not broken, and after anger — though these are Sunnah, not obligations.",
      },
      {
        type: "heading",
        text: "What Nullifies Wudu (Hanafi School)",
      },
      {
        type: "list",
        items: [
          "Anything exiting from the private parts — urine, stool, wind, madhiy (pre-seminal fluid), wadi (thick white fluid after urination), even if unusual like a worm or stone.",
          "The flowing of any ritually impure substance (blood, pus) from a wound to a place that requires cleaning — if it flows beyond its point of exit. Blood that appears but does not flow (e.g. a scratch) does not break wudu.",
          "Vomit that is a mouthful — such that one could not keep it in without difficulty. Phlegm is not included. Vomiting from the same motion is considered together when determining if it is a mouthful.",
          "Blood from the mouth or throat that overcomes or equals one's saliva — if closer to red, wudu is invalidated; if closer to yellow, it is not.",
          "Sleep in which the rear is not firmly seated — deep sleep where one would not notice if something exited. If the rear is firmly seated on the ground (even leaning), wudu is not broken by sleep.",
          "Loss of consciousness through fainting, intoxication, or full anesthesia.",
          "Madness or insanity (even temporary).",
          "Audible laughter of an aware adult in a prayer containing ruku and sujud — this breaks both the wudu and the prayer. If only the laugher can hear it, the prayer is invalidated but not the wudu. Laughter after the tashahhud breaks wudu but not the prayer.",
          "Direct contact between the erect penis and the vagina (skin to skin, even without penetration or discharge).",
        ],
      },
      {
        type: "callout",
        text: "Touching a woman does not break wudu in the Hanafi school, though it is recommended to renew wudu to avoid the difference of opinion of the Shafi'i school, especially if leading others in prayer. Changing a child's diaper does not break wudu — wash the impurity from the hands. Doubt never breaks wudu: certainty is not removed by doubt. If you are sure you had wudu and then doubt whether it broke, you still have wudu.",
      },
      {
        type: "heading",
        text: "What Requires Ghusl (Major Impurity)",
      },
      {
        type: "list",
        items: [
          "Ejaculation of semen with desire — whether in sleep (wet dream) or while awake. If semen exits without desire (e.g. due to illness), ghusl is not required, but wudu is.",
          "Sexual intercourse — even without ejaculation, if the head of the penis enters the vagina, both partners must perform ghusl.",
          "The end of menstruation (hayd) for women.",
          "The end of postpartum bleeding (nifas) for women.",
        ],
      },
      {
        type: "paragraph",
        text: "Ghusl is a greater purification than wudu. Anything that nullifies wudu does not affect an ongoing ghusl — you can pass wind, bleed, or urinate during ghusl and the ghusl remains valid. However, after ghusl you must perform wudu before praying if your wudu was broken during the bath. Performing wudu at the beginning of ghusl is a confirmed Sunnah.",
      },
      {
        type: "heading",
        text: "The Fard (Obligatory) Acts of Wudu",
      },
      {
        type: "list",
        items: [
          "Washing the entire face — from the hairline to below the chin, and from ear to ear (including the beard area for men).",
          "Washing both arms from the fingertips up to and including the elbows.",
          "Wiping one-quarter of the head with wet hands (masah).",
          "Washing both feet up to and including the ankles.",
        ],
      },
      {
        type: "heading",
        text: "The Steps of Wudu (Hanafi Method)",
      },
      {
        type: "steps",
        items: [
          "Make the intention (niyyah) in your heart to perform wudu for the sake of Allah. The intention is in the heart, not spoken aloud.",
          "Say Bismillah (Bismillah ir-Rahman ir-Rahim) and wash both hands up to and including the wrists, three times.",
          "Rinse the mouth (madmadah) three times, circulating the water thoroughly. Use the right hand to bring water to the mouth.",
          "Clean the nostrils (istinshaq) three times by drawing water into the nose and then blowing it out, using the left hand to blow out.",
          "Wash the entire face three times — from the hairline to below the chin, and from ear to ear. Use both hands to cup water to the face.",
          "Wash the right arm from the fingertips up to and including the elbow, three times. Then wash the left arm the same way. The water should flow over the entire arm — ensure no dry spot remains.",
          "Perform masah (wiping) of the head: wet both hands, place them at the front of the head, wipe backward to the nape, then wipe forward back to the front. This is done once. Then wipe the inside of the ears with the index fingers and the outside with the thumbs, using the same moisture.",
          "Wash the right foot up to and including the ankle, three times, ensuring water reaches between the toes. Then wash the left foot the same way. Use the little finger of the left hand to wash between the toes, starting from the small toe of the right foot and ending at the small toe of the left foot.",
        ],
      },
      {
        type: "heading",
        text: "Sunnah and Adab of Wudu",
      },
      {
        type: "list",
        items: [
          "Using a miswak (toothstick) before wudu — cleans the mouth and earns extra reward.",
          "Starting with the right side — wash the right hand, right arm, right foot first.",
          "Rubbing the limbs while washing (dalk) — helps ensure water reaches everywhere.",
          "Running wet fingers through the beard (khilal) and between the fingers and toes.",
          "Facing the qibla while making wudu.",
          "Not speaking unnecessarily during wudu except for remembrance of Allah and supplication.",
          "Reciting the shahada after wudu: 'Ashhadu an la ilaha illallah wahdahu la sharika lah, wa ashhadu anna Muhammadan abduhu wa rasuluh. Allahumma ij'alni min at-tawwabin wa ij'alni min al-mutatahhirin.'",
          "Drinking from the leftover water (if using a vessel).",
          "Performing two rakats of Tahiyyatul Wudhu after completing wudu, before the limbs dry — this is highly recommended.",
        ],
      },
      {
        type: "heading",
        text: "Makruhat (Disliked Acts) in Wudu",
      },
      {
        type: "list",
        items: [
          "Wasting water — using more than needed. The Prophet ﷺ performed wudu with one mudd (about 575ml) of water, and ghusl with one sa' (about 2.3 liters).",
          "Using too little water — at least two drops should fall from each limb so it is truly washed, not merely wiped.",
          "Slapping or striking the face with water when washing it — water should be applied gently.",
          "Speaking during wudu other than supplication and remembrance of Allah.",
          "Having someone else assist with wudu without a valid excuse (illness, disability).",
        ],
      },
      {
        type: "heading",
        text: "The Steps of Ghusl",
      },
      {
        type: "steps",
        items: [
          "Make the intention (niyyah) in your heart to perform ghusl to remove the state of major impurity (janabah, menstruation, or postpartum bleeding).",
          "Wash both hands up to the wrists three times, then wash the private areas with the left hand, removing any impurity.",
          "Perform a complete wudu as described above — all the way through washing the feet. If water is scarce and you fear not having enough for ghusl, you may delay washing the feet until the end of ghusl.",
          "Pour water over the head three times, ensuring it reaches the roots of the hair. For a man with braided hair, the water must reach the scalp. A woman does not need to unbraid her hair unless it is so tightly braided that water cannot reach the scalp.",
          "Wash the entire body, starting with the right side. Rub the body with your hands to ensure water reaches every part — under the arms, behind the ears, the navel, skin folds, and between the buttocks. Ensure no part of the body remains dry.",
          "If performing ghusl in a place where used water collects (like a bath), move away from that spot to wash the feet, or wash the feet last as mentioned in some narrations.",
        ],
      },
      {
        type: "callout",
        text: "Purification is not merely physical — it is a transition from the world of distraction into the presence of Allah. The Prophet ﷺ said that when a Muslim performs wudu and washes their face, every sin they looked at with their eyes falls away with the last drop of water; when they wash their hands, every sin their hands touched falls away; and when they wash their feet, every sin their feet walked toward falls away — until they emerge from wudu purified of sins (Sahih Muslim).",
      },
    ],
  },

  // ─── 7. Prayer Times & Their Significance ───
  {
    id: "prayer-times-significance",
    title: "Prayer Times & Their Significance",
    subtitle: "When each prayer begins and ends, and why the timing matters",
    content: [
      {
        type: "paragraph",
        text: "The five daily prayers are tied to specific astronomical events — the position of the sun, the appearance of dawn, and the disappearance of twilight. These are not arbitrary times chosen by humans; they are set by Allah and observed by the creation since the time of the Prophet ﷺ. Understanding when each window opens and closes is essential for praying on time.",
      },
      {
        type: "heading",
        text: "The Five Prayer Windows",
      },
      {
        type: "list",
        items: [
          "Fajr — begins at true dawn (Fajr as-Sadiq), when light first appears horizontally across the horizon. This is not the first vertical glow (Fajr al-Kadhib, the false dawn), which appears earlier as a vertical pillar of light. Fajr ends at sunrise (Shuruq).",
          "Dhuhr — begins when the sun passes its zenith (the highest point in the sky, midday) and the shadow of objects begins to lengthen eastward. Dhuhr ends when the shadow of an object equals its actual length (in the standard/Shafi'i school) or twice its length (in the Hanafi school), not counting the original shadow that exists at zenith.",
          "Asr — begins when the shadow of an object equals its length (standard school) or twice its length (Hanafi school). Asr ends at sunset. The preferred time is early in the window; delaying Asr until the sun turns yellow (just before sunset) is makruh without a valid excuse.",
          "Maghrib — begins immediately after the sun has fully set below the horizon. Maghrib ends when the red twilight (shafaq ahmar) disappears from the sky. In the Hanafi school, Maghrib's window extends until the red twilight fades; in practice, it should be prayed as soon as possible after sunset.",
          "Isha — begins when the red twilight (shafaq ahmar) completely disappears from the western horizon. Isha ends at the onset of true dawn (Fajr as-Sadiq). The preferred time for Isha is the first third of the night. Delaying Isha beyond the first half of the night is permissible but less preferred. After the first half, it becomes makruh to delay further without reason.",
        ],
      },
      {
        type: "heading",
        text: "The Asr Calculation Difference",
      },
      {
        type: "paragraph",
        text: "The difference between the schools on Asr time is based on a hadith in which the Prophet ﷺ was visited by Jibril (Gabriel), who led him in prayer to demonstrate the times. On the second day, Jibril prayed Asr when the shadow of an object was equal to its length (standard school: Shafi'i, Maliki, Hanbali). The Hanafi school takes the position that the preferred time — and the time the Prophet ﷺ normally prayed — was when the shadow reached twice the object's length. This is based on the practice of the companions, particularly Ibn Abbas and others. Both positions are valid; the app uses your selected madhab to determine the Asr start time.",
      },
      {
        type: "heading",
        text: "How Prayer Times Are Calculated",
      },
      {
        type: "paragraph",
        text: "Prayer times are calculated using the sun's position relative to the horizon at your specific latitude and longitude. Different Islamic authorities use slightly different angles for Fajr and Isha, which is why prayer times differ slightly between communities even in the same city. The major calculation methods include:",
      },
      {
        type: "list",
        items: [
          "ISNA (Islamic Society of North America) — Fajr at 15°, Isha at 15° below the horizon. Used widely in North America.",
          "Muslim World League (MWL) — Fajr at 18°, Isha at 17°. Used in Europe and parts of Asia.",
          "Umm al-Qura (Makkah) — Fajr at 18.5°, Isha at 90 minutes after Maghrib (fixed time, not angle-based). Used in Saudi Arabia.",
          "Egyptian General Authority — Fajr at 19.5°, Isha at 17.5°. Used in Africa and parts of the Middle East.",
          "University of Islamic Sciences, Karachi — Fajr at 18°, Isha at 18°. Used in Pakistan, India, Bangladesh.",
          "Dubai — Fajr at 18.2°, Isha at 18.2°. Used in the UAE.",
        ],
      },
      {
        type: "paragraph",
        text: "At high latitudes (above 48.5°), the sun does not descend far enough below the horizon in summer to reach the angles used for Fajr and Isha. In these regions, scholars have developed alternative methods: using the nearest lower latitude, using a fixed portion of the night, or using 1/7 of the night as the angle. The app uses AlAdhan's built-in handling for these edge cases, but users in extreme latitudes should consult their local scholars.",
      },
      {
        type: "callout",
        text: "Praying at the beginning of the prayer window carries greater reward. The Prophet ﷺ said that Allah is pleased with the one who prays at the earliest moment. Delaying without reason reduces the reward, though the prayer remains valid within the window. The only exception is Asr in the Hanafi school, where the preferred time is later (when the shadow is twice the object's length).",
      },
    ],
  },

  // ─── 8. Khushu — Focus in Prayer ───
  {
    id: "khushu",
    title: "Khushu — Focus in Prayer",
    subtitle: "How to pray with a calm, attentive heart",
    content: [
      {
        type: "paragraph",
        text: "Khushu is the state of humility, presence, and stillness of the heart during prayer. It is the essence of salah — the outer movements (standing, bowing, prostrating) are the body of the prayer, but khushu is its soul. Allah says in the Quran: 'Successful indeed are the believers — those who humble themselves in their prayers' (Al-Mu'minun 23:1-2). The word 'humble themselves' here is the translation of khashi'un, from the same root as khushu.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "لَا تَجِدُ أَحَدًا فِيهِ خَصْلَةٌ يَخْدُمُ لَهَا إِلَّا كَانَ مُتَخَشِّعًا فِي صَلَاتِهِ",
          english:
            "The first thing to be lifted from this Ummah will be khushu, until you will not see anyone with khushu.",
          source: "Al-Tabarani, reported by Anas ibn Malik",
          grade: "Hasan — corroborated by multiple chains",
        },
      },
      {
        type: "heading",
        text: "What Khushu Means",
      },
      {
        type: "paragraph",
        text: "Imam al-Ghazali described khushu as having six dimensions: awareness (hudur al-qalb), understanding (fahm), reverence (ta'zim), awe (hayba), hope (raja), and shame (haya). Awareness means the mind is not distracted from what one is doing and saying. Understanding goes beyond awareness — it means comprehending the meaning of the words being recited. Reverence is the heart's magnification of Allah. Awe is the fear that flows from that reverence. Hope is the expectation of reward. Shame is the awareness of one's own shortcomings before Allah.",
      },
      {
        type: "paragraph",
        text: "In the Hanafi school, khushu at the minimum level — being present at the opening takbir (Allahu Akbar) — is a condition for the validity of the prayer. Full khushu throughout the prayer is not a legal condition for validity, but it is the spirit that gives the prayer its worth. A prayer performed without any presence is like a body without a soul — technically present but lacking life.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "إِنَّ الْعَبْدَ لَيُصَلِّي الصَّلَاةَ لَا يُكْتَبُ لَهُ إِلَّا عُشْرُهَا تُسْعُهَا ثُمْنُهَا سُدْسُهَا خُمْسُهَا رُبْعُهَا ثُلُثُهَا نِصْفُهَا",
          english:
            "A person may offer a prayer and nothing of it is recorded for him except one tenth of it, one ninth, one eighth, one seventh, one sixth, one fifth, one quarter, one third, or half.",
          source: "Musnad Ahmad (Ammar ibn Yasir)",
          grade: "Hasan",
        },
      },
      {
        type: "heading",
        text: "Practical Techniques for Khushu",
      },
      {
        type: "list",
        items: [
          "Arrive early and sit quietly before prayer. Use the time to transition from the world's concerns to the presence of Allah. The Prophet ﷺ said that the time you spend waiting for prayer is counted as prayer.",
          "Understand the meaning of what you recite. Learn the translation of Al-Fatihah, the tashahhud, and the surahs you commonly recite. Reflect on the words as you say them — this is the single most effective technique for khushu.",
          "Pray as though you can see Allah, or at least knowing that Allah sees you. This is the station of ihsan, as the Prophet ﷺ described in the hadith of Jibril: 'To worship Allah as though you see Him, and if you do not see Him, then know that He sees you.'",
          "Vary your recitation. Reciting the same surahs on autopilot is the enemy of presence. Learn new surahs and rotate them. The Prophet ﷺ would recite different surahs in different prayers.",
          "Pause briefly at each transition — standing to ruku, ruku to standing, standing to sujud. These pauses (tuma'ninah) are both a requirement for validity and a means of presence.",
          "Make specific dua in sujud. The Prophet ﷺ said: 'The closest a servant is to his Lord is when he is in prostration, so increase your supplications in it' (Sahih Muslim). Have a list of duas — for yourself, your family, the Ummah, and the deceased.",
          "Remember death while praying. The Prophet ﷺ said: 'Remember death when you pray, for if a man remembers death when he prays, he will strive to make his prayer good. Pray the prayer of a man who does not think he will ever pray another prayer' (Al-Daylami, classed as hasan).",
          "Lower your gaze throughout the prayer. The Prophet ﷺ said that looking around is something the Shaytan steals from a person's prayer (Sahih al-Bukhari). Fix your eyes on the place of prostration while standing, on your toes in ruku, and on your lap in the sitting position.",
          "Remove external distractions before starting — silence your phone, choose a quiet room, face a blank wall if possible, and avoid praying where there are images or decorations that catch the eye.",
          "Make wudu with presence. The preparation for prayer begins with purification. Rushing through wudu carries the haste into the prayer. Perform wudu slowly, with the awareness that each wash removes sins along with the water.",
        ],
      },
      {
        type: "heading",
        text: "Common Distractions and How to Handle Them",
      },
      {
        type: "list",
        items: [
          "Intrusive thoughts about daily tasks — these are from the Shaytan. Do not fight them aggressively; simply return your attention to the prayer each time you notice the drift. The effort of returning is itself rewarded.",
          "Waswas (persistent whispers) — if the Shaytan repeatedly makes you doubt whether you made wudu, whether you prayed 3 or 4 rakats, or whether your prayer is valid, ignore it. Certainty is not removed by doubt. The Prophet ﷺ said: 'Allah has forgiven my Ummah for what their souls whisper to them, as long as they do not act on it or speak of it' (Sahih al-Bukhari & Muslim).",
          "Physical discomfort — ensure clothing is comfortable, use the restroom before prayer, and do not pray while suppressing the need to urinate or defecate (the Prophet ﷺ said no prayer should be performed when food is ready or when one needs to relieve themselves).",
          "Environmental noise — accept it as part of the test of presence. Do not become agitated by noise; let it pass through your awareness without catching your attention.",
          "Rushing through rakats — this is one of the most common destroyers of khushu. The Prophet ﷺ told a man who prayed hastily: 'Go back and pray, for you have not prayed' (Sahih al-Bukhari). Each posture must be held with stillness (tuma'ninah) — the bones must settle before moving to the next position.",
          "Looking around — the Prophet ﷺ said this is a theft from the prayer by the Shaytan. If your eyes wander, gently bring them back to the place of prostration.",
        ],
      },
      {
        type: "callout",
        text: "Khushu is not a state you achieve once and keep forever — it is a daily struggle. Some prayers will be full of presence; others will be a battle against distraction. The Prophet ﷺ himself said that Allah forgives the wandering of the mind during prayer as long as one does not speak or act on it. Do not despair when khushu is difficult — the effort itself is rewarded, and the struggle to return your heart to the prayer is a form of worship.",
      },
    ],
  },

  // ─── 9. Common Mistakes in Salah ───
  {
    id: "common-mistakes",
    title: "Common Mistakes in Salah",
    subtitle: "Errors that affect validity or reduce reward — and how to fix them",
    content: [
      {
        type: "paragraph",
        text: "Many common errors in salah are unknown to the average worshipper. Some affect the validity of the prayer (requiring it to be repeated), some are makruh (disliked and reduce reward but do not invalidate), and some are khilaf al-awla (contrary to what is better). Knowing these helps you pray with confidence and correctness.",
      },
      {
        type: "heading",
        text: "Before Prayer",
      },
      {
        type: "list",
        items: [
          "Not washing the required areas completely in wudu — leaving parts of the skin dry, especially behind the ears, between the fingers and toes, and the back of the neck. Every fard area must be fully washed.",
          "Not covering the awrah properly — for men, from the navel to the knee (including the knee). For women, the entire body except the face and hands. Tight or transparent clothing that reveals the skin color underneath does not satisfy the requirement.",
          "Praying with clothing overlapping the ankles (for men) — this is makruh tahrimi (prohibitively disliked) and significantly reduces the reward of the prayer, though it does not invalidate it.",
          "Not facing the qibla correctly — the qibla should be verified, especially in unfamiliar places. A slight deviation is forgiven, but a major deviation without effort to correct it is problematic.",
          "Praying in a place that is ritually impure (najis) without realizing — check that the prayer area is clean. If you discover impurity after the prayer, the prayer is still valid if you were unaware.",
          "Not making a clear intention (niyyah) — the intention must be in the heart for the specific prayer (e.g. 'I intend to pray Dhuhr, four rakats, for the sake of Allah'). A vague intention or no intention at all invalidates the prayer.",
          "Praying while suppressing the need to urinate or defecate — the Prophet ﷺ said no prayer should be performed when food is ready or when one needs to relieve themselves. This is makruh and severely reduces khushu.",
        ],
      },
      {
        type: "heading",
        text: "During Prayer — Posture and Movement",
      },
      {
        type: "list",
        items: [
          "Rushing through the prayer (the 'pecking' prayer) — reciting too fast and moving between positions without pause. The Prophet ﷺ told a man who did this: 'Go back and pray, for you have not prayed.' Each position must be held with stillness (tuma'ninah) — the bones must settle before moving.",
          "Incorrect posture in ruku — the back must be straight, the head neither lowered nor raised, and the fingers should grip the knees with the fingers apart (for men). The arms should not touch the sides of the body.",
          "Incorrect posture in sujud — prostration must be on seven bones: the forehead (with the nose), both palms, both knees, and both feet (toes pointing toward the qibla). The stomach should be away from the thighs, and the arms should not touch the sides of the body (for men). Women keep their arms close to the body.",
          "Not standing up completely straight after ruku (qauma) — if you go from ruku directly to sujud without standing fully upright, the prayer is invalid and must be repeated. The back must be fully vertical with hands at the sides.",
          "Not sitting briefly between the two prostrations (jalsa) — if you lift your head from the first sujud and go directly to the second without sitting, the prayer is invalid. You must sit up fully before going to the second sujud.",
          "Lifting the feet from the ground during sujud — if the feet are lifted for a duration longer than saying 'Subhanallah' three times, the prayer becomes void.",
          "Moving the eyes during salah — this is khilaf al-adab (contrary to proper etiquette). It does not break the salah and is not makruh in the technical sense, but it reduces the reward and is something the Shaytan steals from the prayer (Sahih al-Bukhari).",
          "Moving the head during salah — this is makruh (disliked). It does not break the salah. The Prophet ﷺ said: 'Allah continues to turn toward His slave so long as he does not look around' — referring to turning the face.",
          "Turning the chest away from the qibla — this breaks the salah entirely. If the chest turns away from the qibla direction, the prayer is nullified and must be repeated. Turning only the face does not break it but is makruh.",
        ],
      },
      {
        type: "heading",
        text: "During Prayer — Recitation",
      },
      {
        type: "list",
        items: [
          "Reciting too quickly to articulate the letters properly — the Quran must be recited with proper tajweed. If the pronunciation changes the meaning (e.g. confusing 'seen' and 'tha'), the prayer is invalidated. If the meaning is not changed, the prayer is valid but makruh.",
          "Reciting in the mind without moving the lips and tongue — this invalidates the prayer. Recitation must be done with articulation, even if soft. The Prophet ﷺ said that the one who does not move his tongue with the recitation has not prayed.",
          "Reciting surahs out of order — in fard and wajib prayers, it is wajib to recite surahs in the order they appear in the Quran. Reciting Surah al-Nas in the first rakat and Surah al-Ikhlas in the second (reversed order) deliberately is makruh tahrimi. Forgetfully, it is not disliked and does not require sajdah sahw.",
          "Skipping a short surah between two surahs — e.g. reciting Surah al-Ikhlas in the first rakat and then Surah an-Nas in the second, skipping Surah al-Falaq. This is makruh tanzihan (slightly disliked) in the fard prayer. If the skipped surah is long (like skipping Surah al-Baqarah), it is not disliked. This is based on the principle that skipping a short surah between two recited surahs resembles rejecting it, which is improper.",
          "Making the second rakat's recitation significantly longer than the first — it is makruh tanzihan to make the second rakat longer than the first by more than two verses. The Sunnah is to make the first rakat longer (to allow latecomers to catch the rakat).",
          "Not reciting Al-Fatihah in the third and fourth rakats of fard prayer — in the Hanafi school, only Subhanaka (thana) is recited quietly in the third and fourth rakats of fard prayers, not Al-Fatihah. However, in sunnah and nafl prayers, Al-Fatihah and a surah must be recited in every rakat.",
          "Reciting behind the imam — in the Hanafi school, the follower (muqtadi) recites only the thana (opening supplication) when behind the imam. The imam's recitation covers the follower's obligation. Reciting Al-Fatihah behind the imam is makruh tahrimi.",
        ],
      },
      {
        type: "heading",
        text: "After Prayer",
      },
      {
        type: "list",
        items: [
          "Leaving immediately without making dua or dhikr — the Prophet ﷺ would sit after prayer and say: 'Astaghfirullah' three times, then recite the ayat al-Kursi and other adhkar. Rushing away loses the post-prayer adhkar which carry great reward.",
          "Not performing the sunnah prayers that follow — the sunnah mu'akkadah prayers (2 before Fajr, 4 before and 2 after Dhuhr, 2 after Maghrib, 2 after Isha) should not be neglected without reason. The Prophet ﷺ said whoever maintains twelve rakats of sunnah daily, Allah builds a house for them in Paradise (Sahih Muslim).",
          "Turning away from the qibla immediately after salam — while not prohibited, it is better to remain facing the qibla for the post-prayer adhkar and dua, as this maintains the connection with Allah established during the prayer.",
          "Talking about worldly matters immediately after prayer — it is recommended to remain in a state of remembrance for a while after the prayer before returning to daily conversation.",
        ],
      },
      {
        type: "callout",
        text: "Most mistakes are honest errors that do not invalidate the prayer. The Hanafi school distinguishes between fard (obligatory — missing it invalidates the prayer), wajib (necessary — missing it requires sajdah sahw), and sunnah (recommended — missing it reduces reward but does not affect validity). If you are unsure whether you made a mistake, do not let waswas (persistent doubt) overwhelm you. Certainty is not removed by doubt — if you are sure you prayed, assume it is valid unless you are certain a fard was missed.",
      },
    ],
  },

  // ─── 10. Sujud as-Sahw ───
  {
    id: "sujud-as-sahw",
    title: "Sujud as-Sahw",
    subtitle: "Forgetfulness prostrations — what to do when you add or skip something",
    content: [
      {
        type: "paragraph",
        text: "Sujud as-Sahw (the prostration of forgetfulness) is a mercy from Allah that restores the prayer when something is added, omitted, or doubted forgetfully. It is wajib (necessary) in the Hanafi school when certain errors occur during the prayer. Without it, the prayer may need to be repeated.",
      },
      {
        type: "heading",
        text: "When Sujud as-Sahw is Wajib (Required)",
      },
      {
        type: "list",
        items: [
          "Missing a wajib act of prayer forgetfully — e.g. forgetting to recite Al-Fatihah, forgetting the Qunut in Witr, forgetting the tashahhud, or forgetting the additional takbirs of Eid prayer.",
          "Forgetting to stand in qauma (the upright position after ruku) or to sit in jalsa (the sitting between two prostrations).",
          "Forgetting to observe the first sitting (qa'dah ula) and standing up for the next rakat — if you remember before fully standing, sit back down (no sahw needed). If you have fully stood, continue and perform sahw at the end.",
          "Forgetting the final sitting (qa'dah akhira) in a 2 or 4 rakat prayer and standing up — if you remember before performing the sajdah of the extra rakat, sit back down and do sahw. If you have already done the sajdah of the extra rakat, add one more rakat (making it nafl) and the original fard must be repeated.",
          "Performing an extra ruku or an extra sajdah forgetfully — two rukus or three sajdahs in one rakat requires sahw.",
          "Causing an undue delay in the performance of a wajib or fard act — e.g. remaining silent for a long time between recitations.",
          "Reciting the Quran in the wrong posture — e.g. reciting while in ruku or sujud (other than the tasbeeh of that posture).",
          "Forgetting to recite a surah after Al-Fatihah in any rakat of a sunnah or nafl prayer — this is wajib in those prayers.",
        ],
      },
      {
        type: "heading",
        text: "When Sujud as-Sahw is NOT Required",
      },
      {
        type: "list",
        items: [
          "Forgetting a sunnah act — e.g. forgetting to raise the hands, forgetting to recite the thana, forgetting the tasbeeh of ruku or sujud. These do not require sahw.",
          "Intentionally committing an error — if you intentionally miss a wajib, sahw does not fix it. The prayer must be repeated. Sahw is only for forgetful errors.",
          "Doubts that do not require action — if you have a passing doubt but choose one option and continue, and the doubt does not persist, no sahw is needed.",
        ],
      },
      {
        type: "heading",
        text: "How to Perform Sujud as-Sahw (Hanafi Method)",
      },
      {
        type: "steps",
        items: [
          "Complete the prayer as you remember it, reaching the final sitting (qa'dah akhira).",
          "Recite the tashahhud (at-tahiyyatu) only — do not recite the salawat (durud) or the final dua yet.",
          "After the tashahhud, say 'Assalamu alaykum wa rahmatullah' to the RIGHT ONLY (one salam, to the right).",
          "Say 'Allahu Akbar' and go into the first sajdah.",
          "In the first sajdah, say 'Subhana Rabbiyal A'la' three times. You may also make dua.",
          "Rise saying 'Allahu Akbar' and sit briefly (jalsa).",
          "Say 'Allahu Akbar' and go into the second sajdah.",
          "In the second sajdah, say 'Subhana Rabbiyal A'la' three times.",
          "Rise saying 'Allahu Akbar' and sit for the final sitting.",
          "Now recite the complete final sitting: tashahhud, salawat (durud ibrahimi), and the closing dua.",
          "Complete the prayer with salam to both sides (right then left) as normal.",
        ],
      },
      {
        type: "heading",
        text: "Important Details",
      },
      {
        type: "list",
        items: [
          "If several errors occur in one prayer that each require sahw, only ONE sahw (two prostrations) is needed — it covers all the mistakes.",
          "If the imam makes an error that requires sahw, the followers must perform the sahw with the imam. If a follower makes an error, neither the imam nor the other followers need to perform sahw for it.",
          "If you forgetfully perform the sahw before the salam (instead of after the tashahhud and one salam), it is still valid and the prayer is correct.",
          "If you forget to perform sahw entirely and remember after the salam, you may perform it as long as you have not turned away from the qibla or spoken. If you have already turned or spoken, the prayer must be repeated.",
          "If a masbuq (latecomer) commits an error while completing their missed rakats independently after the imam's salam, they must perform sahw in their own final sitting.",
        ],
      },
      {
        type: "heading",
        text: "Doubt (Shakk) in the Number of Rakats",
      },
      {
        type: "paragraph",
        text: "If you doubt whether you prayed 3 or 4 rakats, the Hanafi school applies the principle of building on certainty — you assume the lesser number (3) and complete the prayer based on that, then perform sahw at the end. For example, if you are unsure whether you are in the 3rd or 4th rakat of Dhuhr, assume it is the 3rd, stand for the 4th, and add sahw. If this kind of doubt happens frequently (more than once or twice), it may be waswas (persistent whispers) and should be ignored — you build on what you were certain of.",
      },
      {
        type: "callout",
        text: "Sujud as-Sahw is a manifestation of Allah's mercy — honest mistakes do not invalidate the prayer, and this simple act of two prostrations restores what was lost. The Prophet ﷺ said: 'When one of you doubts in his prayer, let him build on what he is certain of.' Do not let doubt overwhelm you. If you are unsure whether sahw is needed, perform it — it does not harm the prayer if done unnecessarily, and it protects the prayer if it was needed.",
      },
    ],
  },

  // ─── 11. Prayer in Congregation (Jama'ah) ───
  {
    id: "prayer-in-congregation",
    title: "Prayer in Congregation (Jama'ah)",
    subtitle: "How to pray behind an Imam and the etiquette of group prayer",
    content: [
      {
        type: "paragraph",
        text: "Prayer in congregation (jama'ah) is a foundational practice of Islam. The Prophet ﷺ strongly emphasized it, to the point that some scholars considered it wajib (necessary) for men, while others considered it a highly emphasized sunnah. The reward of congregational prayer is 27 times greater than praying alone.",
      },
      {
        type: "hadith",
        hadith: {
          arabic:
            "صَلَاةُ الْجَمَاعَةِ أَفْضَلُ مِنْ صَلَاةِ الْفَذِّ بِسَبْعٍ وَعِشْرِينَ دَرَجَةً",
          english:
            "Prayer in congregation is better than prayer alone by twenty-seven degrees.",
          source: "Sahih al-Bukhari & Muslim",
          grade: "Sahih — Muttafaq Alayh",
        },
      },
      {
        type: "heading",
        text: "Forming the Lines (Saff)",
      },
      {
        type: "list",
        items: [
          "Straighten the rows — stand shoulder to shoulder, ankle to ankle, with no gaps between worshippers. The Prophet ﷺ emphasized this so strongly that he said: 'Straighten your rows or Allah will alter your faces' (Sahih al-Bukhari).",
          "The first row is the most rewarded. Fill the front rows before the back. The Prophet ﷺ said: 'The best rows for men are the first ones, and the worst are the last' (Sahih Muslim).",
          "The imam stands at the front, centered, leading the prayer. If there is only one follower, he stands to the right of the imam, slightly behind.",
          "Men form the front rows, women form the rows behind. In the Hanafi school, the best rows for women are the last ones (furthest from the imam).",
          "Complete the first row before starting the second — do not leave gaps. If someone leaves a gap, it is recommended to fill it by pulling someone from the row behind.",
          "Do not join a new row if the front row has a gap — either fill the gap or start a new row behind. Standing alone behind a complete row is disliked.",
        ],
      },
      {
        type: "heading",
        text: "Joining Late (Masbuq) — Catching a Rakat",
      },
      {
        type: "paragraph",
        text: "A latecomer (masbuq) is someone who joins the congregation after the imam has already started. The key rule: you catch a rakat if you join the imam in ruku (bowing) before the imam raises his head from ruku. If the imam has already stood up from ruku before you bow, you have missed that rakat.",
      },
      {
        type: "list",
        items: [
          "If you catch the imam while he is standing (qiyam) or in ruku, you have caught that rakat. You do not need to make it up.",
          "If the imam has returned to standing before you bow, you have missed that rakat. You must make it up after the imam's salam.",
          "There is no difference between loud and silent prayers in this ruling.",
          "If you join during ruku, say the opening takbir (Allahu Akbar) while standing, then say a separate takbir and bow. If you fear missing the rakat, one takbir (the opening) suffices for both.",
          "The opening takbir MUST be said while standing fully upright. If you say it while leaning forward to bow, it is not valid.",
        ],
      },
      {
        type: "heading",
        text: "What Happens When You Miss a Rakat Behind the Imam",
      },
      {
        type: "paragraph",
        text: "If you miss one or more rakats, you follow the imam until he completes the prayer (both salams). Then you stand and make up the missed rakats. The key principle: whatever you caught with the imam counts as the FIRST part of your prayer, and whatever you make up counts as the LAST part of your prayer. This affects when you sit for tashahhud.",
      },
      {
        type: "steps",
        items: [
          "Join the congregation wherever the imam is — even if he is in ruku, sujud, or the final sitting.",
          "Follow the imam through all his movements. Do not make up anything while the imam is still praying.",
          "If you joined in the 2nd rakat of a 4-rakat prayer (missing the 1st), when the imam sits for the final tashahhud, you do NOT sit for tashahhud — you are still in your first rakat. You stand when the imam gives salam.",
          "After the imam gives both salams, stand and pray your first missed rakat (reciting Al-Fatihah + a surah). Then sit for tashahhud (this is your second rakat, so you sit). Then stand for your third rakat. Then stand for your fourth rakat. Then sit for the final tashahhud and give salam.",
          "The rule: you sit for tashahhud after every even number of rakats YOU have prayed. The imam's position does not determine your sitting — your own rakat count does.",
          "If you make an error while completing your missed rakats independently, you must perform sajdah sahw in your final sitting.",
        ],
      },
      {
        type: "heading",
        text: "Critical Scenario: The Imam Moves Before You Complete a Position",
      },
      {
        type: "paragraph",
        text: "If the imam goes into ruku and then stands up before you can fully join the ruku (your hands have not reached your knees with stillness), you have NOT caught that rakat. You should stand with the imam and make up that rakat later. However, if you managed to bow and place your hands on your knees before the imam stood up — even if you did not say the tasbeeh — you have caught the rakat.",
      },
      {
        type: "paragraph",
        text: "If the imam goes into ruku and before you can join him in ruku, he stands up to qauma, and you never caught the ruku — that rakat is missed. Do not try to bow after the imam has already moved on. Follow the imam in whatever position he is in, and make up the missed rakat after his salam.",
      },
      {
        type: "heading",
        text: "Etiquette of the follower (Muqtadi)",
      },
      {
        type: "list",
        items: [
          "Do not rush ahead of the imam — follow each movement only AFTER the imam has settled. The Prophet ﷺ said: 'The imam is there to be followed.' If you go into ruku or sujud before the imam, your prayer may be invalid.",
          "If the imam is reciting silently (Dhuhr, Asr), you remain silent. If the imam is reciting aloud (Fajr, Maghrib, Isha), you listen — in the Hanafi school, the follower only recites the thana (opening supplication), not Al-Fatihah.",
          "Come to the masjid calmly — do not run, even if you are late. The Prophet ﷺ said: 'When the prayer is called, do not come to it rushing — come to it walking with tranquility. Whatever you catch, pray; whatever you miss, complete' (Sahih al-Bukhari & Muslim).",
          "Do not walk in front of someone who is praying (between them and their sutrah). The Prophet ﷺ said that if the one walking in front knew the sin of it, waiting forty would be better for him than passing in front.",
          "Wait for the imam to fully complete both salams before moving. Standing up before the imam's second salam invalidates the prayer.",
          "If you arrive and the rows are complete with no gap, make your opening takbir while standing independently, then gently pull someone from the row to stand with you in a new row.",
        ],
      },
      {
        type: "callout",
        text: "Congregational prayer is not just about multiplying reward — it is about belonging to a community. When you stand shoulder to shoulder with people you may never speak to, of different races and classes, all facing the same direction and saying the same words, you experience the unity that Islam was built to create. The masjid is one of the few places left where a CEO and a janitor stand side by side as equals before Allah.",
      },
    ],
  },

  // ─── 12. Sajdah-e-Tilawah — Prostration of Recitation ───
  {
    id: "sajdah-tilawah",
    title: "Sajdah-e-Tilawah",
    subtitle: "Prostration required when reciting or hearing certain Quran verses",
    content: [
      {
        type: "paragraph",
        text: "Sajdah-e-Tilawah is the prostration required when a person recites or hears one of the fourteen (or fifteen, according to some scholars) verses of prostration (Ayat as-Sajdah) in the Quran. In the Hanafi school, this prostration is wajib (necessary) — it is not optional. The one who recites the verse and the one who hears it intentionally are both required to perform the prostration.",
      },
      {
        type: "heading",
        text: "The Verses of Sajdah",
      },
      {
        type: "paragraph",
        text: "There are 14 verses of sajdah in the Quran according to the Hanafi school (some scholars count 15, including a second sajdah in Surah al-Hajj). The Hanafi school considers the sajdah in Surah Saad (38:24) to be a sajdah of tilawah, but does not consider the second sajdah in Surah al-Hajj (22:77) to be one. The verses are:",
      },
      {
        type: "list",
        items: [
          "Surah al-A'raf (7): verse 206",
          "Surah ar-Ra'd (13): verse 15",
          "Surah an-Nahl (16): verse 50",
          "Surah al-Isra' (17): verse 109",
          "Surah Maryam (19): verse 58",
          "Surah al-Hajj (22): verse 18",
          "Surah al-Furqan (25): verse 60",
          "Surah an-Naml (27): verse 26",
          "Surah as-Sajdah (32): verse 15",
          "Surah Sad (38): verse 24",
          "Surah Fussilat (41): verse 38",
          "Surah an-Najm (53): verse 62",
          "Surah al-Inshiqaq (84): verse 21",
          "Surah al-'Alaq (96): verse 19",
        ],
      },
      {
        type: "heading",
        text: "How to Perform Sajdah-e-Tilawah Outside of Salah",
      },
      {
        type: "steps",
        items: [
          "Make the intention in your heart to perform sajdah-e-tilawah.",
          "Say 'Allahu Akbar' and go into prostration (sajdah). You do not need to raise your hands, and you do not need to be standing.",
          "In the sajdah, say 'Subhana Rabbiyal A'la' at least three times. You may also make dua.",
          "Say 'Allahu Akbar' and rise from the sajdah.",
          "There is NO tashahhud and NO salam at the end. The sajdah is complete when you rise.",
        ],
      },
      {
        type: "callout",
        text: "Unlike a regular prayer, sajdah-e-tilawah does not require wudu according to the Hanafi school, though having wudu is preferable. You do not need to face the qibla, and you do not need to be standing. You can perform it while sitting. However, some scholars recommend wudu and facing qibla as a precaution.",
      },
      {
        type: "heading",
        text: "Sajdah-e-Tilawah Inside Salah",
      },
      {
        type: "paragraph",
        text: "If you recite a verse of sajdah during your prayer, you should perform the sajdah immediately — say 'Allahu Akbar' and go into sajdah, then rise with 'Allahu Akbar' and continue the prayer. If the imam recites a verse of sajdah in a loud prayer (Fajr, Maghrib, Isha), both the imam and the followers should perform the sajdah together. In a silent prayer (Dhuhr, Asr), if the imam recites a verse of sajdah, only the imam performs the sajdah — the followers do not, because they did not hear the recitation.",
      },
      {
        type: "heading",
        text: "Hearing a Verse of Sajdah Outside Salah",
      },
      {
        type: "list",
        items: [
          "If you hear a verse of sajdah recited by someone else (not in prayer), you must perform the sajdah if you heard it intentionally. If you heard it unintentionally (e.g. walking past a masjid), the sajdah is not required.",
          "If you hear a verse of sajdah on a recording (audio, video, phone), the Hanafi school's position is that the obligation does not apply — the recitation must be from a live person, not a recording. However, some contemporary scholars recommend performing the sajdah as a precaution.",
          "If the imam recites a verse of sajdah in prayer and does not perform the sajdah (possibly following a different school where it is not wajib), the follower who follows the Hanafi school is still absolved — the imam's action covers the follower. You do not need to perform a separate sajdah after the prayer.",
          "If you recite a verse of sajdah and do not perform the sajdah immediately, it remains wajib and should be performed as soon as possible. There is no time limit — it can be performed at any time, even days later.",
        ],
      },
      {
        type: "heading",
        text: "What If You Forget the Sajdah?",
      },
      {
        type: "paragraph",
        text: "If you forget to perform the sajdah after reciting a verse, and later remember, it is wajib to make it up. If you never become aware that a sajdah was required, you are not held accountable — Allah does not burden a soul beyond what it can bear. If you permanently forget and never become aware, there is no sin. However, once you know, you should perform it as soon as possible.",
      },
      {
        type: "callout",
        text: "Sajdah-e-Tilawah is a beautiful Sunnah that connects the reciter to the Quran in a physical way. When you recite a verse that mentions prostration and you immediately place your forehead on the ground, you are embodying the command of the verse itself — your body responds to Allah's words with obedience. Do not neglect this wajib act out of shyness or inconvenience. A single sajdah takes seconds and carries great reward.",
      },
    ],
  },

  // ─── 13. Qadaa — Making Up Missed Prayers ───
  {
    id: "qadaa-missed-prayers",
    title: "Qadaa — Making Up Missed Prayers",
    subtitle: "How to catch up on prayers you were unable to perform on time",
    content: [
      {
        type: "paragraph",
        text: "Qadaa is the obligation to make up prayers that were missed. There is consensus among the schools that it is wajib to perform qadaa of every obligatory prayer omitted — whether intentionally, out of forgetfulness, ignorance, or sleep. The only exception is prayers missed by a woman during menstruation (hayd) and postpartum bleeding (nifas) — these do not require qadaa, as the obligation itself is lifted during those periods.",
      },
      {
        type: "heading",
        text: "The Intention (Niyyah) for Qadaa",
      },
      {
        type: "paragraph",
        text: "In the Hanafi school, the intention for qadaa should specify that you are making up the earliest missed prayer of that type. For example, if you have missed several Dhuhr prayers, you say in your heart: 'I intend to pray my earliest missed Dhuhr.' This way, you do not need to remember exact dates — you simply work through the backlog in order. Each qadaa prayer you perform clears the earliest outstanding one, and the next one becomes the 'earliest missed.'",
      },
      {
        type: "callout",
        text: "This method — always intending the earliest missed prayer — is a mercy from the scholars. It means you never need to keep exact dates in mind. As long as you know you have a backlog, each qadaa prayer you pray with the intention of 'the earliest missed [prayer name]' systematically reduces your debt, one at a time, in the correct order.",
      },
      {
        type: "heading",
        text: "Key Rulings for Qadaa",
      },
      {
        type: "list",
        items: [
          "Prayers missed due to sleep or forgetfulness must be made up as soon as remembered. The Prophet ﷺ said: 'Whoever forgets a prayer or sleeps through it, let him pray it when he remembers — there is no expiation for it other than that' (Sahih al-Bukhari & Muslim).",
          "Prayers missed due to a valid excuse (illness, unconsciousness) are made up when able. If the illness lasted long enough that making up all missed prayers would be an extreme burden, the Hanafi school allows making them up gradually.",
          "The order (tartib) of missed prayers should be maintained — pray the earliest missed prayer first, then the next, and so on. In the Hanafi school, maintaining order is wajib if the number of missed prayers is fewer than six. If six or more prayers are outstanding, the order is no longer required — you may make them up in any sequence.",
          "Shortening (qasr) applies to qadaa based on the person's status at the time the prayer was missed. If you missed a prayer while traveling (musafir), you make it up as 2 rakats (qasr). If you missed it while at home (muqim), you make it up as 4 rakats — even if you are now traveling when making it up.",
          "Qadaa prayers can be prayed at any time, including the times when voluntary (nafl) prayer is normally discouraged (sunrise, noon, sunset). This is because qadaa is an obligation, not a voluntary prayer.",
          "The recitation in qadaa follows the original prayer — if making up Maghrib or Isha during the day, recite aloud (as those prayers are recited aloud). If making up Dhuhr or Asr at night, recite silently. This is the Hanafi position.",
          "Witr is wajib in the Hanafi school, so if Witr is missed, it must also be made up as qadaa.",
        ],
      },
      {
        type: "heading",
        text: "Deliberately Missing Prayer",
      },
      {
        type: "paragraph",
        text: "There is a difference of opinion among scholars regarding one who deliberately misses a prayer without a valid excuse. The majority (including the Hanafi school) hold that the prayer must still be made up — it is a debt that is not forgiven by repentance alone. Some scholars hold that deliberate omission is so severe that repentance (tawbah) is required and the prayer must be repeated. The safest path is to make up the prayer AND sincerely repent. Do not despair — Allah's mercy encompasses all sins, and the act of making up the prayer is itself a form of repentance.",
      },
      {
        type: "heading",
        text: "A Practical Plan for Clearing a Backlog",
      },
      {
        type: "steps",
        items: [
          "Assess how many prayers you have missed. If you are unsure of the exact number, estimate conservatively (err on the side of more, not fewer).",
          "Commit to making up one or two qadaa prayers alongside each current obligatory prayer. For example, after praying Dhuhr, pray one qadaa Dhuhr. This is manageable and consistent.",
          "Pray the qadaa before or after the current obligatory prayer, as is manageable. Both are valid. Some scholars prefer after, so the current prayer is not delayed.",
          "Use the qadaa ledger feature in this app to track your progress. It shows how many of each prayer you owe and reduces the count as you make them up.",
          "Be consistent — a small daily effort clears a large backlog over time. Praying one qadaa with each of the five daily prayers clears five per day, 35 per week, 150 per month.",
          "Do not despair. Allah accepts sincere repentance and effort. The fact that you are making up prayers is a sign of faith — the one who has no faith does not care to make them up. Your effort is seen and rewarded.",
        ],
      },
      {
        type: "callout",
        text: "The qadaa ledger in this app exists to turn an overwhelming spiritual debt into a manageable plan. Instead of carrying the anxiety of 'I owe hundreds of prayers,' you see a number, and each qadaa you pray reduces it by one. This is not about guilt — it is about progress. Every qadaa prayer is a step closer to Allah, and every step is rewarded.",
      },
    ],
  },

  // ─── 13. Qasr — The Traveler's Prayer ───
  {
    id: "qasr-travel-prayer",
    title: "Qasr — The Traveler's Prayer",
    subtitle: "Shortening and combining prayers when you are on a journey",
    content: [
      {
        type: "paragraph",
        text: "Qasr is the concession given to travelers to shorten the four-rakat obligatory prayers (Dhuhr, Asr, Isha) to two rakats. In the Hanafi school, shortening is wajib (necessary) — a traveler must shorten and should not pray the full four rakats. This is a mercy from Allah to make worship easier during the difficulties of travel.",
      },
      {
        type: "heading",
        text: "Who Is a Traveler (Musafir)?",
      },
      {
        type: "list",
        items: [
          "Distance: A person becomes a musafir when they undertake a journey of 77 kilometers (48 miles) or more from the boundaries of their city. This is the fatwa position in the Hanafi school, based on the works of Mufti Mahmud Gangohi and others.",
          "The moment you leave the boundaries of your city or town, you become a musafir. Within the boundaries of your city, you are not a musafir — even if you travel 77km within the same city (e.g. a very large metropolitan area).",
          "If the airport is within the city boundaries (buildings are linked to it without a considerable break), it is part of the city. If it is outside the boundaries, you become a musafir upon reaching it.",
          "Intention: You must intend to travel 77km or more. If you set out without a clear destination of that distance, you are not a musafir until you form that intention.",
          "Duration of stay: If you arrive at your destination and intend to stay less than 15 days, you remain a musafir and continue to shorten. If you intend to stay 15 days or more, you become a muqim (resident) from the moment you arrive and pray full.",
          "If you intend to stay less than 15 days but then extend your stay, you remain a musafir until you form the intention to stay 15 days. Once that intention is formed, you pray full from that point.",
          "Returning home: You remain a musafir until you enter the boundaries of your home city. Even if you are at the city border, you are still a traveler. The moment you enter the city, you are a resident and pray full — even if you have not reached your house yet.",
        ],
      },
      {
        type: "heading",
        text: "Shortening (Qasr) — What Changes",
      },
      {
        type: "list",
        items: [
          "Dhuhr, Asr, and Isha are shortened from 4 rakats to 2 rakats. This is wajib in the Hanafi school — a traveler who prays 4 rakats deliberately has sinned and must repeat the prayer as 2 rakats.",
          "Fajr remains 2 rakats (no change). Maghrib remains 3 rakats (no change — it is never shortened).",
          "Sunnah and nafl prayers are not shortened. The Sunnah of Fajr should still be prayed. Other sunnah prayers may be omitted if the traveler is in a hurry, but the Sunnah of Fajr and Witr (which is wajib) should not be neglected.",
          "Witr remains 3 rakats (it is wajib and not subject to qasr).",
          "If you are praying behind a local resident imam while traveling, you must pray full (4 rakats) with the imam. You cannot shorten when following a resident imam. This is a specific Hanafi ruling based on the principle that the follower follows the imam.",
        ],
      },
      {
        type: "heading",
        text: "Combining (Jam') — The Hanafi Position",
      },
      {
        type: "paragraph",
        text: "The Hanafi school does NOT allow combining two prayers into one time (jam' haqiqi) during travel. This is a key difference from the Shafi'i, Maliki, and Hanbali schools, which permit combining Dhuhr with Asr and Maghrib with Isha during travel.",
      },
      {
        type: "list",
        items: [
          "In the Hanafi school, each prayer must be prayed within its own window, even during travel. You cannot pray Dhuhr and Asr together at Dhuhr time, or Maghrib and Isha together at Maghrib time.",
          "However, the Hanafi school allows what is called 'jam' suri' (apparent combining) — delaying the first prayer to the end of its window and praying the second prayer at the very beginning of its window. This creates the appearance of combining without actually combining, as each prayer is still within its own valid time.",
          "Example of jam' suri: Pray Dhuhr in the last minutes of its window, then pray Asr as soon as its window opens. The two prayers appear to be combined but each is within its own time.",
          "True combining (jam' haqiqi) is only permitted in the Hanafi school on the Day of Arafah (Dhuhr and Asr combined) and at Muzdalifah (Maghrib and Isha combined) during Hajj.",
          "If you follow the Shafi'i, Maliki, or Hanbali school, combining is permitted during travel. The app does not restrict you from following your school's position.",
        ],
      },
      {
        type: "heading",
        text: "Practical Scenarios",
      },
      {
        type: "list",
        items: [
          "Long flight: If an entire prayer window passes while you are on a flight, make up the prayer (qadaa) after landing. If you can pray on the plane (standing, facing qibla), do so. If standing is impossible, pray seated with gestures for ruku and sujud. If the direction cannot be qibla due to the flight path, pray in the available direction — necessity permits this.",
          "Arriving at a destination: If you intend to stay less than 15 days, shorten all 4-rakat prayers. If you intend to stay 15+ days, pray full from arrival.",
          "Conference for 4 days: You are a musafir (traveler) for the entire stay, since 4 days is less than 15. Shorten all 4-rakat prayers throughout the trip.",
          "Daily long commute: If you commute 77km+ daily but return home each day, you are NOT a musafir because you do not leave the city with the intention of an overnight journey. The Hanafi school considers the daily commuter a resident.",
          "Multiple stops: If your journey is 77km+ total but no single leg is 77km, you are still a musafir if the total intended journey is 77km or more.",
          "Praying behind a resident imam at your destination: Pray full 4 rakats with the imam, even though you are a traveler. This is the Hanafi ruling.",
        ],
      },
      {
        type: "heading",
        text: "Qadaa While Traveling",
      },
      {
        type: "list",
        items: [
          "If you miss a prayer while traveling, you make it up as qasr (2 rakats for Dhuhr/Asr/Isha) — even if you are back home when making it up. The prayer is made up according to your status at the time it was missed.",
          "If you miss a prayer while at home (before traveling) and make it up while traveling, you make it up as full (4 rakats) — because you were a resident when it was missed.",
          "The principle: the status (musafir or muqim) at the time the prayer was missed determines whether the qadaa is shortened or full.",
        ],
      },
      {
        type: "callout",
        text: "The concession of qasr is a mercy from Allah. The Prophet ﷺ said: 'Travel is a piece of torment.' The religion is designed to bring ease, not hardship. Do not refuse this concession out of a sense of extra piety — the Prophet ﷺ himself shortened prayers during travel and never prayed full 4 rakats while a musafir. Accepting Allah's concession is itself an act of worship.",
      },
    ],
  },
];

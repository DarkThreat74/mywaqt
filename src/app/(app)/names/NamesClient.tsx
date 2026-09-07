"use client";

import { useState } from "react";
import { Search, X, BookOpen } from "lucide-react";

interface DivineName {
  number: number;
  arabic: string;
  transliteration: string;
  meaning: string;
}

const NAMES: DivineName[] = [
  { number: 1, arabic: "الرَّحْمَنُ", transliteration: "Ar-Rahman", meaning: "The Most Compassionate" },
  { number: 2, arabic: "الرَّحِيمُ", transliteration: "Ar-Raheem", meaning: "The Most Merciful" },
  { number: 3, arabic: "الْمَلِكُ", transliteration: "Al-Malik", meaning: "The King" },
  { number: 4, arabic: "الْقُدُّوسُ", transliteration: "Al-Quddus", meaning: "The Holy" },
  { number: 5, arabic: "السَّلَامُ", transliteration: "As-Salam", meaning: "The Source of Peace" },
  { number: 6, arabic: "الْمُؤْمِنُ", transliteration: "Al-Mu'min", meaning: "The Guardian of Faith" },
  { number: 7, arabic: "الْمُهَيْمِنُ", transliteration: "Al-Muhaymin", meaning: "The Protector" },
  { number: 8, arabic: "الْعَزِيزُ", transliteration: "Al-Azeez", meaning: "The Almighty" },
  { number: 9, arabic: "الْجَبَّارُ", transliteration: "Al-Jabbar", meaning: "The Compeller" },
  { number: 10, arabic: "الْمُتَكَبِّرُ", transliteration: "Al-Mutakabbir", meaning: "The Majestic" },
  { number: 11, arabic: "الْخَالِقُ", transliteration: "Al-Khaliq", meaning: "The Creator" },
  { number: 12, arabic: "الْبَارِئُ", transliteration: "Al-Bari'", meaning: "The Maker" },
  { number: 13, arabic: "الْمُصَوِّرُ", transliteration: "Al-Musawwir", meaning: "The Fashioner" },
  { number: 14, arabic: "الْغَفَّارُ", transliteration: "Al-Ghaffar", meaning: "The Forgiving" },
  { number: 15, arabic: "الْقَهَّارُ", transliteration: "Al-Qahhar", meaning: "The Subduer" },
  { number: 16, arabic: "الْوَهَّابُ", transliteration: "Al-Wahhab", meaning: "The Bestower" },
  { number: 17, arabic: "الرَّزَّاقُ", transliteration: "Ar-Razzaq", meaning: "The Provider" },
  { number: 18, arabic: "الْفَتَّاحُ", transliteration: "Al-Fattah", meaning: "The Opener" },
  { number: 19, arabic: "الْعَلِيمُ", transliteration: "Al-'Aleem", meaning: "The All-Knowing" },
  { number: 20, arabic: "الْقَابِضُ", transliteration: "Al-Qabid", meaning: "The Withholder" },
  { number: 21, arabic: "الْبَاسِطُ", transliteration: "Al-Basit", meaning: "The Expander" },
  { number: 22, arabic: "الْخَافِضُ", transliteration: "Al-Khafid", meaning: "The Abaser" },
  { number: 23, arabic: "الرَّافِعُ", transliteration: "Ar-Rafi'", meaning: "The Exalter" },
  { number: 24, arabic: "الْمُعِزُّ", transliteration: "Al-Mu'izz", meaning: "The Bestower of Honor" },
  { number: 25, arabic: "الْمُذِلُّ", transliteration: "Al-Mudhill", meaning: "The Humiliator" },
  { number: 26, arabic: "السَّمِيعُ", transliteration: "As-Sami'", meaning: "The All-Hearing" },
  { number: 27, arabic: "الْبَصِيرُ", transliteration: "Al-Baseer", meaning: "The All-Seeing" },
  { number: 28, arabic: "الْحَكَمُ", transliteration: "Al-Hakam", meaning: "The Judge" },
  { number: 29, arabic: "الْعَدْلُ", transliteration: "Al-'Adl", meaning: "The Just" },
  { number: 30, arabic: "اللَّطِيفُ", transliteration: "Al-Lateef", meaning: "The Subtle One" },
  { number: 31, arabic: "الْخَبِيرُ", transliteration: "Al-Khabeer", meaning: "The All-Aware" },
  { number: 32, arabic: "الْحَلِيمُ", transliteration: "Al-Haleem", meaning: "The Forbearing" },
  { number: 33, arabic: "الْعَظِيمُ", transliteration: "Al-'Azeem", meaning: "The Magnificent" },
  { number: 34, arabic: "الْغَفُورُ", transliteration: "Al-Ghafoor", meaning: "The All-Forgiving" },
  { number: 35, arabic: "الشَّكُورُ", transliteration: "Ash-Shakoor", meaning: "The Grateful" },
  { number: 36, arabic: "الْعَلِيُّ", transliteration: "Al-'Alee", meaning: "The Most High" },
  { number: 37, arabic: "الْكَبِيرُ", transliteration: "Al-Kabeer", meaning: "The Greatest" },
  { number: 38, arabic: "الْحَفِيظُ", transliteration: "Al-Hafeez", meaning: "The Preserver" },
  { number: 39, arabic: "الْمُقِيتُ", transliteration: "Al-Muqeet", meaning: "The Sustainer" },
  { number: 40, arabic: "الْحَسِيبُ", transliteration: "Al-Haseeb", meaning: "The Reckoner" },
  { number: 41, arabic: "الْجَلِيلُ", transliteration: "Al-Jaleel", meaning: "The Majestic" },
  { number: 42, arabic: "الْكَرِيمُ", transliteration: "Al-Kareem", meaning: "The Generous" },
  { number: 43, arabic: "الرَّقِيبُ", transliteration: "Ar-Raqeeb", meaning: "The Watchful" },
  { number: 44, arabic: "الْمُجِيبُ", transliteration: "Al-Mujeeb", meaning: "The Responsive" },
  { number: 45, arabic: "الْوَاسِعُ", transliteration: "Al-Wasi'", meaning: "The All-Encompassing" },
  { number: 46, arabic: "الْحَكِيمُ", transliteration: "Al-Hakeem", meaning: "The Wise" },
  { number: 47, arabic: "الْوَدُودُ", transliteration: "Al-Wadood", meaning: "The Loving" },
  { number: 48, arabic: "الْمَجِيدُ", transliteration: "Al-Majeed", meaning: "The Glorious" },
  { number: 49, arabic: "الْبَاعِثُ", transliteration: "Al-Ba'ith", meaning: "The Resurrector" },
  { number: 50, arabic: "الشَّهِيدُ", transliteration: "Ash-Shaheed", meaning: "The Witness" },
  { number: 51, arabic: "الْحَقُّ", transliteration: "Al-Haqq", meaning: "The Truth" },
  { number: 52, arabic: "الْوَكِيلُ", transliteration: "Al-Wakeel", meaning: "The Trustee" },
  { number: 53, arabic: "الْقَوِيُّ", transliteration: "Al-Qawiyy", meaning: "The Strong" },
  { number: 54, arabic: "الْمَتِينُ", transliteration: "Al-Mateen", meaning: "The Firm" },
  { number: 55, arabic: "الْوَلِيُّ", transliteration: "Al-Waliyy", meaning: "The Protecting Friend" },
  { number: 56, arabic: "الْحَمِيدُ", transliteration: "Al-Hameed", meaning: "The Praiseworthy" },
  { number: 57, arabic: "الْمُحْصِي", transliteration: "Al-Muhsi", meaning: "The All-Enumerating" },
  { number: 58, arabic: "الْمُبْدِئُ", transliteration: "Al-Mubdi'", meaning: "The Originator" },
  { number: 59, arabic: "الْمُعِيدُ", transliteration: "Al-Mu'eed", meaning: "The Restorer" },
  { number: 60, arabic: "الْمُحْيِي", transliteration: "Al-Muhyi", meaning: "The Giver of Life" },
  { number: 61, arabic: "الْمُمِيتُ", transliteration: "Al-Mumeet", meaning: "The Bringer of Death" },
  { number: 62, arabic: "الْحَيُّ", transliteration: "Al-Hayy", meaning: "The Ever-Living" },
  { number: 63, arabic: "الْقَيُّومُ", transliteration: "Al-Qayyum", meaning: "The Self-Sustaining" },
  { number: 64, arabic: "الْوَاجِدُ", transliteration: "Al-Wajid", meaning: "The Finder" },
  { number: 65, arabic: "الْمَاجِدُ", transliteration: "Al-Majid", meaning: "The Noble" },
  { number: 66, arabic: "الْوَاحِدُ", transliteration: "Al-Wahid", meaning: "The One" },
  { number: 67, arabic: "الْأَحَدُ", transliteration: "Al-Ahad", meaning: "The Unique" },
  { number: 68, arabic: "الصَّمَدُ", transliteration: "As-Samad", meaning: "The Eternal Refuge" },
  { number: 69, arabic: "الْقَادِرُ", transliteration: "Al-Qadir", meaning: "The Capable" },
  { number: 70, arabic: "الْمُقْتَدِرُ", transliteration: "Al-Muqtadir", meaning: "The Powerful" },
  { number: 71, arabic: "الْمُقَدِّمُ", transliteration: "Al-Muqaddim", meaning: "The Expediter" },
  { number: 72, arabic: "الْمُؤَخِّرُ", transliteration: "Al-Mu'akhkhir", meaning: "The Delayer" },
  { number: 73, arabic: "الْأَوَّلُ", transliteration: "Al-Awwal", meaning: "The First" },
  { number: 74, arabic: "الْآخِرُ", transliteration: "Al-Akhir", meaning: "The Last" },
  { number: 75, arabic: "الظَّاهِرُ", transliteration: "Az-Zahir", meaning: "The Manifest" },
  { number: 76, arabic: "الْبَاطِنُ", transliteration: "Al-Batin", meaning: "The Hidden" },
  { number: 77, arabic: "الْوَالِي", transliteration: "Al-Wali", meaning: "The Governor" },
  { number: 78, arabic: "الْمُتَعَالِي", transliteration: "Al-Muta'ali", meaning: "The Most Exalted" },
  { number: 79, arabic: "الْبَرُّ", transliteration: "Al-Barr", meaning: "The Most Kind" },
  { number: 80, arabic: "التَّوَّابُ", transliteration: "At-Tawwab", meaning: "The Accepter of Repentance" },
  { number: 81, arabic: "الْمُنْتَقِمُ", transliteration: "Al-Muntaqim", meaning: "The Avenger" },
  { number: 82, arabic: "الْعَفُوُّ", transliteration: "Al-'Afuww", meaning: "The Pardoner" },
  { number: 83, arabic: "الرَّؤُوفُ", transliteration: "Ar-Ra'uf", meaning: "The Most Kind" },
  { number: 84, arabic: "مَالِكُ الْمُلْكِ", transliteration: "Malik-ul-Mulk", meaning: "Master of the Kingdom" },
  { number: 85, arabic: "ذُو الْجَلَالِ وَالْإِكْرَامِ", transliteration: "Dhul-Jalali wal-Ikram", meaning: "Lord of Majesty and Bounty" },
  { number: 86, arabic: "الْمُقْسِطُ", transliteration: "Al-Muqsit", meaning: "The Equitable" },
  { number: 87, arabic: "الْجَامِعُ", transliteration: "Al-Jami'", meaning: "The Gatherer" },
  { number: 88, arabic: "الْغَنِيُّ", transliteration: "Al-Ghaniyy", meaning: "The Self-Sufficient" },
  { number: 89, arabic: "الْمُغْنِي", transliteration: "Al-Mughni", meaning: "The Enricher" },
  { number: 90, arabic: "الْمَانِعُ", transliteration: "Al-Mani'", meaning: "The Preventer" },
  { number: 91, arabic: "الضَّارُّ", transliteration: "Ad-Darr", meaning: "The Distresser" },
  { number: 92, arabic: "النَّافِعُ", transliteration: "An-Nafi'", meaning: "The Benefactor" },
  { number: 93, arabic: "النُّورُ", transliteration: "An-Noor", meaning: "The Light" },
  { number: 94, arabic: "الْهَادِي", transliteration: "Al-Hadi", meaning: "The Guide" },
  { number: 95, arabic: "الْبَدِيعُ", transliteration: "Al-Badi'", meaning: "The Incomparable" },
  { number: 96, arabic: "الْبَاقِي", transliteration: "Al-Baqi", meaning: "The Everlasting" },
  { number: 97, arabic: "الْوَارِثُ", transliteration: "Al-Warith", meaning: "The Inheritor" },
  { number: 98, arabic: "الرَّشِيدُ", transliteration: "Ar-Rasheed", meaning: "The Guide to the Right Path" },
  { number: 99, arabic: "الصَّبُورُ", transliteration: "As-Saboor", meaning: "The Patient" },
];

export default function NamesClient() {
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? NAMES.filter((n) =>
        n.transliteration.toLowerCase().includes(trimmed) ||
        n.meaning.toLowerCase().includes(trimmed) ||
        n.arabic.includes(query.trim())
      )
    : NAMES;

  const isSearching = trimmed.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1
          className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: "var(--color-ink)" }}
        >
          99 Names of Allah
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Asma ul Husna · The Beautiful Names
        </p>
      </div>

      {/* ── Search ── */}
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--color-ink-muted)" }}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or meaning…"
          aria-label="Search the 99 names"
          className="w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink)",
            minHeight: 44,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          </button>
        )}
      </div>

      {/* ── Result count ── */}
      <div className="mb-4 flex items-center justify-between px-1">
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {isSearching
            ? `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}`
            : "99 names"}
        </p>
        {isSearching && filtered.length > 0 && (
          <button
            onClick={() => setQuery("")}
            className="text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-accent)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Names grid ── */}
      {filtered.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          {filtered.map((name) => (
            <article
              key={name.number}
              className="group flex items-start gap-3 rounded-2xl border p-3.5 transition-colors hover:border-[var(--color-accent)]"
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper)",
                minHeight: 88,
              }}
            >
              {/* Number badge */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tabular-nums"
                style={{
                  backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)",
                  color: "var(--color-accent)",
                }}
                aria-hidden="true"
              >
                {name.number}
              </div>

              {/* Text block */}
              <div className="min-w-0 flex-1">
                {/* Arabic — the visual hero */}
                <p
                  className="text-2xl leading-[1.4] tracking-wide"
                  style={{
                    color: "var(--color-ink)",
                    fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
                    direction: "rtl",
                    textAlign: "right",
                  }}
                  lang="ar"
                >
                  {name.arabic}
                </p>
                {/* Transliteration */}
                <p
                  className="mt-1 text-sm font-medium leading-snug"
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  {name.transliteration}
                </p>
                {/* Meaning */}
                <p
                  className="mt-0.5 text-xs leading-snug"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {name.meaning}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        /* ── Empty state ── */
        <div
          className="flex flex-col items-center rounded-2xl border p-8 text-center"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
          }}
        >
          <div
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
            }}
          >
            <BookOpen className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--color-ink-soft)" }}>
            No names match &ldquo;{query.trim()}&rdquo;
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Try searching by transliteration, meaning, or Arabic text.
          </p>
          <button
            onClick={() => setQuery("")}
            className="mt-4 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}

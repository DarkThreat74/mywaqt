"use client";

/**
 * App registry — every installable "app" in the Waqt drawer/store.
 * One home: the drawer grid, the store page, and the install toggle
 * all read from CATEGORIES. Add a new app = one entry here + its key
 * in lib/nav-tabs.ts.
 */

export interface AppDef {
  key: string;       // registry key — present in hiddenTabs = hidden/uninstalled
  href: string;
  label: string;
  arabic: string;
  description: string;
  rating: string;
  installs: string;
  art: () => React.ReactElement;
  ranked?: boolean;
}

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function QiblaArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="24" r="17" />
      <circle cx="24" cy="24" r="13" opacity="0.35" />
      <path d="M24 9v3M24 36v3M9 24h3M36 24h3" opacity="0.6" />
      <path d="M30 18l-4.5 7.5L18 30l4.5-7.5z" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BirthdayArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="8" r="1.6" />
      <path d="M24 11v5" />
      <path d="M12 40V27c0-2 1-3 3-3h18c2 0 3 1 3 3v13" />
      <path d="M12 31c2 2 4 2 6 0s4-2 6 0 4 2 6 0 4-2 6 0" />
      <path d="M8 40h32" />
    </svg>
  );
}

export function SubsArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M15 8h18v30l-3-2.4-3 2.4-3-2.4-3 2.4-3-2.4-3 2.4z" />
      <path d="M20 16h8" />
      <path d="M20 21h8" />
      <path d="M24 33a6 6 0 1 1 1.2-3.7" />
      <path d="M25.3 24.8v4.5h-4.5" />
    </svg>
  );
}

export function GuideArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 14c-4-2.5-9-3-14-2v26c5-1 10-.5 14 2 4-2.5 9-3 14-2V12c-5-1-10-.5-14 2z" />
      <path d="M24 14v26" />
      <circle cx="24" cy="26" r="5.5" />
      <path d="M26.2 23.8l-4 1.6 1.6 4 4-1.6z" />
    </svg>
  );
}

export function MasjidArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M14 34v-6a10 10 0 0 1 20 0v6" />
      <path d="M24 16v-4" />
      <circle cx="24" cy="10.5" r="1.6" />
      <path d="M10 34h28M12 38h24" />
      <path d="M8 34V22M40 34V22" />
      <circle cx="8" cy="20" r="1.6" />
      <circle cx="40" cy="20" r="1.6" />
    </svg>
  );
}

export function DhikrArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      {[...Array(9)].map((_, i) => {
        const a = Math.PI * (0.15 + (i / 8) * 0.7);
        return <circle key={i} cx={24 + 15 * Math.cos(a)} cy={22 + 15 * Math.sin(a)} r="2.6" />;
      })}
      <path d="M35 34c1.5 4 1 7-1 9" />
      <path d="M35 43h.01" />
      <circle cx="31.5" cy="40" r="2" />
      <path d="M31.5 42v3" />
    </svg>
  );
}

export function NamesArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 6l4.2 9.8L38 11.5l-4.3 9.8L43.5 24l-9.8 4.2 4.3 9.8-9.8-4.3L24 43.5l-4.2-9.8-9.8 4.3 4.3-9.8L4.5 24l9.8-4.2L10 10l9.8 4.2z" />
      <circle cx="24" cy="24" r="4" />
    </svg>
  );
}

export function StudyArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="26" r="15" />
      <path d="M24 5v4M20 5h8" />
      <path d="M24 26V17" />
      <path d="M24 26l6 4" opacity="0.55" />
    </svg>
  );
}

export function LearnArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 12c-4-2.5-9-3-14-2v28c5-1 10-.5 14 2 4-2.5 9-3 14-2V10c-5-1-10-.5-14 2z" />
      <path d="M14 17c2.5-.4 5-.2 7 .5M14 23c2.5-.4 5-.2 7 .5M34 17c-2.5-.4-5-.2-7 .5M34 23c-2.5-.4-5-.2-7 .5" opacity="0.5" />
    </svg>
  );
}

export function QuranArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <rect x="10" y="8" width="28" height="32" rx="2.5" />
      <path d="M16 8v32" opacity="0.4" />
      <circle cx="27" cy="24" r="6.5" />
      <path d="M27 19.5l1 2.6 2.8.2-2.2 1.8.7 2.8-2.3-1.5-2.3 1.5.7-2.8-2.2-1.8 2.8-.2z" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

export function MutashabihArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M8 20h14c6 0 8 4 14 4" />
      <path d="M22 20c6 0 8-4 14-4" opacity="0.45" />
      <path d="M8 30h22" />
      <path d="M8 30h12c6 0 8 6 14 6" opacity="0.45" />
      <circle cx="8" cy="20" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TalksArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="24" r="16" />
      <path d="M21 18.5v11l9-5.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MessageArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M10 12h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H20l-7 7v-7h-3a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" />
      <circle cx="17" cy="23" r="1.8" />
      <circle cx="24" cy="23" r="1.8" />
      <circle cx="31" cy="23" r="1.8" />
    </svg>
  );
}

export function HomeworkArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M14 6h20a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" />
      <path d="M14 6v36" opacity="0.4" />
      <path d="M20 18l3 3 6-6" />
      <path d="M20 30h12" opacity="0.5" />
    </svg>
  );
}

export function ShieldArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 5l15 5v11c0 10-6.5 18-15 22-8.5-4-15-12-15-22V10z" />
      <path d="M29 18a7.5 7.5 0 1 0 4 13.4A9 9 0 1 1 29 18z" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

export function StoreArt() {
  // Bag with a star
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M12 15h24l-1.5 24a3 3 0 0 1-3 2.8h-15a3 3 0 0 1-3-2.8z" />
      <path d="M18 15a6 6 0 0 1 12 0" />
      <path d="M24 22l1.6 3.3 3.6.3-2.7 2.4.8 3.5-3.3-1.9-3.3 1.9.8-3.5-2.7-2.4 3.6-.3z" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

export const ALL_APPS: AppDef[] = [
  { key: "/qibla", href: "/qibla", label: "Qibla", arabic: "قبلة", description: "Direction to the Kaaba, live compass", rating: "4.9", installs: "18K", art: QiblaArt },
  { key: "/dhikr", href: "/dhikr", label: "Dhikr", arabic: "ذكر", description: "Tasbih counter with sequences", rating: "4.8", installs: "24K", art: DhikrArt },
  { key: "/masjids", href: "/masjids", label: "Masjids", arabic: "مساجد", description: "Nearby masjids & iqamah times", rating: "4.7", installs: "9K", art: MasjidArt },
  { key: "/shield", href: "/shield", label: "Salah Shield", arabic: "درع", description: "Locks distracting apps while prayer is due", rating: "4.9", installs: "16K", art: ShieldArt },
  { key: "/quran", href: "/quran", label: "AyaTrace", arabic: "قرآن", description: "Name the surah from a verse", rating: "4.9", installs: "15K", art: QuranArt, ranked: true },
  { key: "/mutashabihat", href: "/mutashabihat", label: "Mutashabih", arabic: "متشابه", description: "Train on verses that look alike", rating: "4.8", installs: "7K", art: MutashabihArt, ranked: true },
  { key: "/names", href: "/names", label: "99 Names", arabic: "أسماء الله", description: "Names of Allah, one a day", rating: "4.9", installs: "21K", art: NamesArt },
  { key: "/homework", href: "/homework", label: "Homework", arabic: "واجب", description: "Assignments, deadlines, stats", rating: "4.7", installs: "11K", art: HomeworkArt },
  { key: "/study", href: "/study", label: "Study", arabic: "دراسة", description: "Focus timer & ambient sounds", rating: "4.8", installs: "14K", art: StudyArt },
  { key: "/learn", href: "/learn", label: "Learn", arabic: "علم", description: "Prayer knowledge, step by step", rating: "4.6", installs: "6K", art: LearnArt },
  { key: "/talks", href: "/talks", label: "Talks", arabic: "دروس", description: "Lectures & khutbahs", rating: "4.8", installs: "12K", art: TalksArt },
  { key: "/subscriptions", href: "/subscriptions", label: "Money", arabic: "مصاريف", description: "Subscriptions & spending log", rating: "4.7", installs: "8K", art: SubsArt },
  { key: "/birthdays", href: "/birthdays", label: "Birthdays", arabic: "أعياد", description: "Never miss one again", rating: "4.8", installs: "10K", art: BirthdayArt },
  { key: "messages", href: "/messages", label: "Messages", arabic: "رسائل", description: "Prayer-friend chats", rating: "4.8", installs: "13K", art: MessageArt },
  { key: "/guide", href: "/guide", label: "Guide", arabic: "دليل", description: "How Waqt works", rating: "4.6", installs: "5K", art: GuideArt },
];

export const APP_BY_KEY = new Map(ALL_APPS.map((a) => [a.key, a]));

export const CATEGORIES: { title: string; keys: string[] }[] = [
  { title: "Prayer", keys: ["/qibla", "/dhikr", "/masjids", "/shield"] },
  { title: "Quran", keys: ["/quran", "/mutashabihat", "/names"] },
  { title: "Study", keys: ["/homework", "/study", "/learn", "/talks"] },
  { title: "Life", keys: ["/subscriptions", "/birthdays"] },
  { title: "Social", keys: ["messages"] },
  { title: "Help", keys: ["/guide"] },
];

// Single registry of installable "apps" — everything reachable from the
// tools drawer. The four mains (Calendar, Prayer, Today, Settings) are
// fixed in the bottom nav and aren't apps.
// Keys: 'messages' for the nav item; the rest are keyed by href.
export const HIDEABLE_TABS = [
  { key: "messages", label: "Messages" },
  { key: "/masjids", label: "Masjids" },
  { key: "/shield", label: "Salah Shield" },
  { key: "/talks", label: "Talks" },
  { key: "/qibla", label: "Qibla" },
  { key: "/dhikr", label: "Dhikr" },
  { key: "/mutashabihat", label: "Mutashabih" },
  { key: "/quran", label: "AyaTrace" },
  { key: "/quran-tester", label: "Quran Tester" },
  { key: "/names", label: "99 Names" },
  { key: "/study", label: "Study" },
  { key: "/learn", label: "Learn" },
  { key: "/subscriptions", label: "Subscriptions" },
  { key: "/birthdays", label: "Birthdays" },
  { key: "/friends", label: "Friends" },
  { key: "/guide", label: "Guide" },
] as const;

export type HideableTabKey = (typeof HIDEABLE_TABS)[number]["key"];

export const HIDEABLE_SET: ReadonlySet<string> = new Set(HIDEABLE_TABS.map((t) => t.key));

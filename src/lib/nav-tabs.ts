// Single registry of user-hideable nav surfaces. The four mains (Calendar,
// Prayer, Today, Settings) are fixed — hiding them would strand navigation.
// Keys: 'messages' for the nav item; tool tabs keyed by their href.
export const HIDEABLE_TABS = [
  { key: "tools-fab", label: "Center tools button" },
  { key: "messages", label: "Messages" },
  { key: "/masjids", label: "Masjids" },
  { key: "/talks", label: "Talks" },
  { key: "/qibla", label: "Qibla" },
  { key: "/dhikr", label: "Dhikr" },
  { key: "/mutashabihat", label: "Mutashabih" },
  { key: "/quran", label: "AyaTrace" },
  { key: "/names", label: "99 Names" },
  { key: "/study", label: "Study" },
  { key: "/learn", label: "Learn" },
  { key: "/subscriptions", label: "Subscriptions" },
  { key: "/birthdays", label: "Birthdays" },
] as const;

export type HideableTabKey = (typeof HIDEABLE_TABS)[number]["key"];

export const HIDEABLE_SET: ReadonlySet<string> = new Set(HIDEABLE_TABS.map((t) => t.key));

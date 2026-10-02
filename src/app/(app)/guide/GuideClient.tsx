"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CloudOff,
  Compass,
  Flame,
  Hand,
  Moon,
  NotebookPen,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

interface GuideItem {
  heading: string;
  body: string;
}

interface GuideSection {
  id: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  intro: string;
  items: GuideItem[];
  link?: { href: string; label: string };
}

const SECTIONS: GuideSection[] = [
  {
    id: "checkins",
    icon: CheckCircle2,
    kicker: "The core",
    title: "Prayer check-ins",
    intro:
      "Everything in Waqt revolves around the five daily prayers. Logging them is the one habit that powers streaks, the League, and your stats.",
    items: [
      {
        heading: "Tap a circle to log",
        body: "On Prayer → Overview, each of today's prayers is a circle. Tap it to check in — you can note whether you prayed at the masjid and which sunnahs you did.",
      },
      {
        heading: "Catch up on past days",
        body: "Missed logging a day? Open the calendar day view for that date and mark prayers retroactively — honest records beat perfect-looking ones.",
      },
      {
        heading: "Assumed prayed",
        body: "If you never mark a prayer and the day ends, it resolves as assumed prayed — no silent penalty. Only the prayers you explicitly mark missed count against you.",
      },
      {
        heading: "Hayd pause",
        body: "If hayd tracking is enabled in Settings, prayer obligations pause automatically during your period and resume after — streaks stay intact.",
      },
    ],
    link: { href: "/prayer", label: "Open Prayer" },
  },
  {
    id: "streaks",
    icon: Flame,
    kicker: "Momentum",
    title: "Streaks & Qadaa",
    intro:
      "Streaks reward consistency; Qadaa tracks what you owe. They measure different things on purpose.",
    items: [
      {
        heading: "Personal streak",
        body: "Counts consecutive days where all five fard prayers are logged as prayed. One missed prayer resets it — gentle pressure, not punishment.",
      },
      {
        heading: "Qadaa tracker",
        body: "Prayers marked missed add to your Qadaa count in Prayer → Stats. Log make-up prayers there to work the number down over time.",
      },
      {
        heading: "Consistency heatmap",
        body: "Stats shows the last 365 days as a grid — darker cells are fuller days of prayer. Patterns jump out fast.",
      },
    ],
    link: { href: "/prayer?tab=stats", label: "Open Stats" },
  },
  {
    id: "friends",
    icon: Users,
    kicker: "Together",
    title: "Friends, nudges & duas",
    intro:
      "Prayer is easier with company. Add friends to see each other's day and keep each other honest — with strict privacy controls.",
    items: [
      {
        heading: "Adding friends",
        body: "Prayer → Friends → share your friend code or link. Requests must be accepted — nobody can add you unilaterally.",
      },
      {
        heading: "Nudges",
        body: "While a friend's prayer window is open, tap the bell on their row to nudge them — up to 3 per prayer, with a short cooldown so it stays kind.",
      },
      {
        heading: "Duas",
        body: "When a friend prays after your nudge, they can send you a dua back. You can send duas any time from their card, too.",
      },
      {
        heading: "What friends see",
        body: "You control sharing in Settings → Privacy: today's status, streaks, sunnah detail — each toggles independently. Nothing is shared by default beyond the basics.",
      },
    ],
    link: { href: "/prayer?tab=friends", label: "Open Friends" },
  },
  {
    id: "league",
    icon: Trophy,
    kicker: "Friendly competition",
    title: "The League",
    intro:
      "The League ranks you and your friends each week — the prayer-page equivalent of a shared leaderboard.",
    items: [
      {
        heading: "How ranking works",
        body: "Position is decided by this week's logged fard prayers. Since everyone aims for all five, ties break on confirmed sunnah muakkadah and witr — that's where the race actually happens.",
      },
      {
        heading: "Shared streaks",
        body: "Days where you AND a friend both complete all five prayers build a shared streak (🔥) shown on their row.",
      },
      {
        heading: "Live view",
        body: "Dots on each row update in the friend's own timezone, so a friend abroad shows their day, not yours.",
      },
    ],
    link: { href: "/prayer", label: "Open the League" },
  },
  {
    id: "planner",
    icon: NotebookPen,
    kicker: "Organize",
    title: "Planner — goals, homework, habits",
    intro:
      "Planner keeps worldly duties arranged around prayer times instead of competing with them.",
    items: [
      {
        heading: "Today",
        body: "A vertical agenda of your day anchored to the prayers — events, due homework, and goals due soon all in one scroll.",
      },
      {
        heading: "Goals by horizon",
        body: "Goals live in five buckets: this week, this month, this year, all-time, and rules to live by — principles you return to rather than finish.",
      },
      {
        heading: "Homework & Done",
        body: "Homework tracks classes and assignments with due times. Completed items move to the Done tab, most recent first.",
      },
      {
        heading: "Habits",
        body: "Small daily practices with their own streaks — check them off each day from the Habits tab.",
      },
    ],
    link: { href: "/goals", label: "Open Planner" },
  },
  {
    id: "quran",
    icon: BookOpen,
    kicker: "Play & learn",
    title: "Quran games",
    intro:
      "Two games that sharpen Quran recognition — solo, ranked, or head-to-head with friends.",
    items: [
      {
        heading: "AyaTrace",
        body: "Shown an ayah, name its surah. Ranked Elite mode adjusts difficulty to your rating and tracks it on a leaderboard.",
      },
      {
        heading: "Mutashabihat",
        body: "The look-alike verses every hifidh mixes up — pick which wording is correct. Curated pairs, not generated content.",
      },
      {
        heading: "1v1 matches",
        body: "Challenge a friend to a best-of match — first correct answer takes the round. Full match history with question-by-question replay.",
      },
    ],
    link: { href: "/quran", label: "Play AyaTrace" },
  },
  {
    id: "tools",
    icon: Compass,
    kicker: "The toolkit",
    title: "Tools & more",
    intro:
      "Tap the center button in the bottom nav to open the toolkit — small focused instruments, each in the same visual language.",
    items: [
      {
        heading: "Worship",
        body: "Qibla compass, dhikr counter, masjid finder with iqamah times, and the Quran games.",
      },
      {
        heading: "Grow",
        body: "99 Names of Allah, study timer with focus sounds, prayer-knowledge lessons in Learn, and a curated talks library.",
      },
      {
        heading: "Customize",
        body: "Settings → Navigation lets you hide tools you don't use, including Messages and the center button itself.",
      },
    ],
  },
  {
    id: "offline",
    icon: CloudOff,
    kicker: "Anywhere",
    title: "Offline & install",
    intro:
      "Waqt is a full PWA — install it like a native app and it keeps working without a connection.",
    items: [
      {
        heading: "Install",
        body: "On iPhone/iPad: Share → Add to Home Screen. On Android/desktop: the browser's Install prompt or menu → Install app.",
      },
      {
        heading: "Offline writes",
        body: "Check-ins made offline queue silently and sync when you're back — a brief banner tells you. Nothing is lost.",
      },
      {
        heading: "Your data stays yours",
        body: "Account switching wipes cached data belonging to the other account on this device, automatically.",
      },
    ],
  },
  {
    id: "calendar",
    icon: CalendarDays,
    kicker: "The day",
    title: "Calendar",
    intro:
      "The calendar is where prayers and life share one timeline.",
    items: [
      {
        heading: "Prayer bands",
        body: "Each prayer's window renders as a soft background band on the day grid — context, not a blocking event.",
      },
      {
        heading: "Events & overlaps",
        body: "Tap to add events; overlapping ones stack side-by-side instead of fighting for space.",
      },
      {
        heading: "Views",
        body: "Day for detail, week/month for shape, list for searching. Swipe or use the arrows to move through time.",
      },
    ],
    link: { href: "/calendar/day", label: "Open calendar" },
  },
  {
    id: "privacy",
    icon: Hand,
    kicker: "Trust",
    title: "Privacy & notifications",
    intro:
      "Waqt holds personal data on a simple promise: it can never leak. These controls put that in your hands.",
    items: [
      {
        heading: "Per-friend sharing",
        body: "Choose exactly what each friend sees — today status, streaks, sunnah detail — from Settings → Privacy.",
      },
      {
        heading: "Notification prefs",
        body: "Push, push+SMS, or quiet — per reminder type. Dua and nudge delivery are configurable separately.",
      },
      {
        heading: "Account controls",
        body: "Sign out everywhere or delete your account entirely from Settings. Deletion has a grace period and then removes your data.",
      },
    ],
    link: { href: "/settings", label: "Open Settings" },
  },
];

export default function GuideClient() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll-spy: highlight the TOC entry for the section nearest the top.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    for (const s of SECTIONS) {
      const el = refs.current[s.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Header */}
      <header className="max-w-2xl">
        <p
          className="text-xs font-medium uppercase tracking-[0.2em]"
          style={{ color: "var(--color-accent)" }}
        >
          Guide
        </p>
        <h1
          className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
          style={{ color: "var(--color-ink)" }}
        >
          How Waqt works
        </h1>
        <p className="mt-3 text-sm leading-relaxed sm:text-base" style={{ color: "var(--color-ink-soft)" }}>
          Prayers are the fixed anchors; everything else arranges around them. This guide walks
          through each part — skim the sections or jump straight to what you need.
        </p>
      </header>

      {/* Mobile TOC — horizontal chips */}
      <nav
        aria-label="Guide sections"
        className="sticky top-0 z-10 -mx-4 mt-6 overflow-x-auto px-4 py-3 backdrop-blur-md lg:hidden"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-paper) 85%, transparent)", scrollbarWidth: "none" }}
      >
        <div className="flex w-max gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: active === s.id ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: active === s.id ? "var(--color-accent-faint)" : "var(--color-paper)",
                color: active === s.id ? "var(--color-accent)" : "var(--color-ink-soft)",
              }}
            >
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      <div className="mt-8 gap-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop TOC — sticky rail */}
        <aside className="hidden lg:block">
          <nav aria-label="Guide sections" className="sticky top-8 space-y-0.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: active === s.id ? "var(--color-accent-faint)" : "transparent",
                  color: active === s.id ? "var(--color-accent)" : "var(--color-ink-soft)",
                  fontWeight: active === s.id ? 600 : 400,
                }}
              >
                <s.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </nav>
        </aside>

        {/* Sections */}
        <div className="space-y-10 sm:space-y-14">
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              className="scroll-mt-24"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
                  style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
                >
                  <s.icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-medium uppercase tracking-[0.18em]"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    {s.kicker}
                  </p>
                  <h2
                    className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {s.title}
                  </h2>
                </div>
              </div>

              <p
                className="mt-4 max-w-2xl text-sm leading-relaxed sm:text-[15px]"
                style={{ color: "var(--color-ink-soft)" }}
              >
                {s.intro}
              </p>

              <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {s.items.map((item) => (
                  <div key={item.heading}>
                    <dt className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                      {item.heading}
                    </dt>
                    <dd
                      className="mt-1 text-sm leading-relaxed"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      {item.body}
                    </dd>
                  </div>
                ))}
              </dl>

              {s.link && (
                <Link
                  href={s.link.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: "var(--color-accent)" }}
                >
                  {s.link.label}
                  <span aria-hidden>→</span>
                </Link>
              )}

              <div
                className="mt-8 h-px sm:mt-10"
                style={{ backgroundColor: "var(--color-paper-3)" }}
                aria-hidden
              />
            </section>
          ))}

          {/* Footer note */}
          <div
            className="rounded-2xl border px-5 py-5 sm:px-6"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <div className="flex items-start gap-3">
              <Sparkles
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: "var(--color-warmth)" }}
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                  Still stuck?
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                  Check the{" "}
                  <Link href="/support" className="font-medium underline underline-offset-2" style={{ color: "var(--color-accent)" }}>
                    support page
                  </Link>{" "}
                  or{" "}
                  <Link href="/settings" className="font-medium underline underline-offset-2" style={{ color: "var(--color-accent)" }}>
                    Settings
                  </Link>{" "}
                  for account, privacy, and notification controls. <Moon className="inline h-3.5 w-3.5 -translate-y-px" aria-hidden />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

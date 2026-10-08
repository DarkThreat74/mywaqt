"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CloudOff,
  Compass,
  Flame,
  GraduationCap,
  Hand,
  Moon,
  NotebookPen,
  Repeat,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The Waqt Guide — structured like a small textbook: numbered chapters, a
 * framed figure plate per chapter, and concept entries instead of a feature
 * dump. Every figure is hand-drawn SVG on design tokens so it works offline
 * and matches both themes.
 */

// ─── Figure primitives ──────────────────────────────────────────────
// Figures share one visual language: hairline strokes on paper-3, ink for
// primary marks, accent for the "live" element, success for check marks.

const INK = "var(--color-ink)";
const SOFT = "var(--color-ink-muted)";
const ACCENT = "var(--color-accent)";
const ACF = "var(--color-accent-faint)";
const P2 = "var(--color-paper-2)";
const P3 = "var(--color-paper-3)";
const OK = "var(--color-success)";
const WARM = "var(--color-warmth)";

function Fig({ children, viewBox }: { children: ReactNode; viewBox: string }) {
  return (
    <svg
      viewBox={viewBox}
      className="h-auto w-full"
      role="img"
      style={{ color: INK }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const dot = (x: number, y: number, fill: string, r = 4) => (
  <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={fill} />
);

/** The five prayer windows as a day timeline — the app's core mental model. */
function FigPrayerDay() {
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  return (
    <Fig viewBox="0 0 320 96">
      <line x1="16" y1="60" x2="304" y2="60" stroke={P3} strokeWidth="1.5" />
      {prayers.map((p, i) => {
        const x = 36 + i * 62;
        const open = i === 2;
        return (
          <g key={p}>
            <rect x={x - 20} y={26} width={40} height={34} rx={6} fill={open ? ACF : P2} stroke={open ? ACCENT : P3} strokeWidth={open ? 1.5 : 1} />
            <circle cx={x} cy={43} r={open ? 7 : 5} fill={i < 2 ? OK : open ? ACCENT : "none"} stroke={open ? "none" : i < 2 ? "none" : SOFT} strokeWidth={i < 2 || open ? 0 : 1.2} />
            {i < 2 && (
              <path d={`M${x - 3} ${43} l2.2 2.4 l4 -4.4`} stroke="var(--color-paper)" strokeWidth={1.6} fill="none" strokeLinecap="round" />
            )}
            <text x={x} y={84} textAnchor="middle" fontSize="9" fill={open ? ACCENT : SOFT} fontWeight={open ? 700 : 400}>{p}</text>
          </g>
        );
      })}
      <path d="M142 14 l8 -8 l8 8" fill="none" stroke={ACCENT} strokeWidth={1.5} strokeLinecap="round" />
      <text x={158} y={12} fontSize="9" fill={ACCENT} fontWeight={600}>now — tap to log</text>
    </Fig>
  );
}

/** Consecutive complete days building a flame streak. */
function FigStreak() {
  return (
    <Fig viewBox="0 0 320 88">
      {Array.from({ length: 7 }, (_, i) => {
        const x = 32 + i * 38;
        const done = i < 5;
        const today = i === 5;
        return (
          <g key={i}>
            <rect x={x - 14} y={30} width={28} height={36} rx={6} fill={done ? ACF : "none"} stroke={done ? ACCENT : today ? ACCENT : P3} strokeWidth={today ? 1.5 : 1} strokeDasharray={today ? "3 3" : "none"} />
            {done
              ? [0, 1, 2, 3, 4].map((d) => dot(x - 8 + d * 4, 48, OK, 1.6))
              : today
                ? [0, 1, 2].map((d) => dot(x - 6 + d * 6, 48, SOFT, 1.6))
                : null}
          </g>
        );
      })}
      <path d="M236 30 c-3 -8 4 -12 3 -19 c6 5 10 9 8 17 c4 -2 5 -5 5 -7 c4 9 -2 17 -8 17 c-6 0 -9 -4 -8 -8 z" fill={WARM} />
      <text x={252} y={34} fontSize="11" fill={WARM} fontWeight={700}>5 days</text>
      <text x={24} y={80} fontSize="9" fill={SOFT}>all five logged = the day counts · a dashed day is still open</text>
    </Fig>
  );
}

/** Two people exchanging a nudge and a dua — with the privacy eye. */
function FigFriends() {
  return (
    <Fig viewBox="0 0 320 100">
      <circle cx={44} cy={44} r={18} fill={ACF} stroke={ACCENT} strokeWidth={1.5} />
      <text x={44} y={49} textAnchor="middle" fontSize="12" fontWeight={700} fill={ACCENT}>Y</text>
      <circle cx={276} cy={44} r={18} fill={P2} stroke={P3} strokeWidth={1.5} />
      <text x={276} y={49} textAnchor="middle" fontSize="12" fontWeight={700} fill={SOFT}>M</text>
      {/* nudge → */}
      <path d="M74 32 H 236" stroke={ACCENT} strokeWidth={1.5} markerEnd="url(#ah)" />
      <text x={155} y={24} textAnchor="middle" fontSize="9" fill={ACCENT}>nudge — &ldquo;Asr is open&rdquo;</text>
      {/* ← dua */}
      <path d="M246 60 H 84" stroke={WARM} strokeWidth={1.5} markerEnd="url(#ahw)" />
      <text x={165} y={76} textAnchor="middle" fontSize="9" fill={WARM}>a dua back when they pray</text>
      <defs>
        <marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 z" fill={ACCENT} />
        </marker>
        <marker id="ahw" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 z" fill={WARM} />
        </marker>
      </defs>
      {/* privacy eye */}
      <g transform="translate(150 88)">
        <ellipse cx={8} cy={4} rx={9} ry={5} fill="none" stroke={SOFT} strokeWidth={1.2} />
        <circle cx={8} cy={4} r={2.4} fill={SOFT} />
        <text x={24} y={7.5} fontSize="9" fill={SOFT}>you choose what each friend sees</text>
      </g>
    </Fig>
  );
}

/** Weekly leaderboard podium — the League's mental model. */
function FigLeague() {
  const bars = [
    { x: 96, h: 34, n: "2", c: P3 },
    { x: 148, h: 48, n: "1", c: ACCENT },
    { x: 200, h: 24, n: "3", c: P3 },
  ];
  return (
    <Fig viewBox="0 0 320 96">
      <text x={24} y={18} fontSize="9" fill={SOFT}>This week&apos;s fard · sunnah breaks the tie</text>
      {bars.map((b) => (
        <g key={b.n}>
          <rect x={b.x} y={82 - b.h} width={40} height={b.h} rx={5} fill={b.c === ACCENT ? ACF : P2} stroke={b.c} strokeWidth={1.5} />
          <text x={b.x + 20} y={90} textAnchor="middle" fontSize="9" fill={b.c === ACCENT ? ACCENT : SOFT} fontWeight={600}>{b.n}</text>
        </g>
      ))}
      <circle cx={168} cy={14} r={9} fill={ACF} stroke={ACCENT} strokeWidth={1.2} />
      <text x={168} y={18} textAnchor="middle" fontSize="9" fontWeight={700} fill={ACCENT}>Y</text>
      <path d="M250 60 l8 -8 l8 8" fill="none" stroke={WARM} strokeWidth={1.5} strokeLinecap="round" />
      <text x={252} y={76} fontSize="9" fill={WARM}>shared streaks too</text>
    </Fig>
  );
}

/** A day column: prayer bands with study blocks claimed into the gaps. */
function FigPlanner() {
  return (
    <Fig viewBox="0 0 320 110">
      <rect x={24} y={8} width={130} height={94} rx={8} fill="none" stroke={P3} strokeWidth={1} />
      {/* prayer bands */}
      <rect x={24} y={14} width={130} height={12} rx={3} fill={P2} />
      <rect x={24} y={52} width={130} height={12} rx={3} fill={P2} />
      <rect x={24} y={86} width={130} height={12} rx={3} fill={P2} />
      <text x={30} y={23} fontSize="8" fill={SOFT}>Dhuhr</text>
      <text x={30} y={61} fontSize="8" fill={SOFT}>Asr</text>
      <text x={30} y={95} fontSize="8" fill={SOFT}>Maghrib</text>
      {/* study blocks between prayers */}
      <rect x={40} y={30} width={100} height={16} rx={4} fill={ACF} stroke={ACCENT} strokeWidth={1.2} />
      <text x={46} y={41} fontSize="8.5" fill={ACCENT} fontWeight={600}>Chem exam · 45m</text>
      <rect x={40} y={68} width={100} height={14} rx={4} fill={P2} stroke={P3} strokeWidth={1} />
      <text x={46} y={78} fontSize="8.5" fill={SOFT}>Reading · 20m</text>
      {/* status legend */}
      <g transform="translate(172 18)">
        {[
          { c: OK, t: "studied — you checked it off" },
          { c: ACCENT, t: "planned — on a coming day" },
          { c: "var(--color-error)", t: "no plan — nothing claimed" },
        ].map((r, i) => (
          <g key={r.t} transform={`translate(0 ${i * 22})`}>
            <rect x={0} y={0} width={22} height={13} rx={4} fill={r.c} opacity={0.15} stroke={r.c} strokeWidth={1} />
            <text x={28} y={10} fontSize="8.5" fill={SOFT}>{r.t}</text>
          </g>
        ))}
      </g>
    </Fig>
  );
}

/** A goal card with tag chips and a test-tag session bar. */
function FigGoals() {
  return (
    <Fig viewBox="0 0 320 100">
      <rect x={24} y={10} width={272} height={80} rx={10} fill="none" stroke={P3} strokeWidth={1.2} />
      <text x={38} y={32} fontSize="12" fontWeight={700} fill={INK}>Pass the MCAT</text>
      <text x={38} y={47} fontSize="9" fill={SOFT}>Jun 14 · all-time · hidden from Today</text>
      {/* tags */}
      {["test", "school"].map((t, i) => (
        <g key={t}>
          <rect x={38 + i * 52} y={56} width={44} height={16} rx={8} fill={i === 0 ? ACF : P2} stroke={i === 0 ? ACCENT : P3} strokeWidth={1} />
          <text x={60 + i * 52} y={67} textAnchor="middle" fontSize="8.5" fill={i === 0 ? ACCENT : SOFT} fontWeight={i === 0 ? 600 : 400}>{t}</text>
        </g>
      ))}
      {/* sessions progress */}
      <rect x={142} y={58} width={120} height={8} rx={4} fill={P2} />
      <rect x={142} y={58} width={54} height={8} rx={4} fill={OK} />
      <text x={142} y={84} fontSize="8.5" fill={SOFT}>a &ldquo;test&rdquo; tag counts real study sessions — 90/200</text>
    </Fig>
  );
}

/** Chore recurrence: interval buttons vs weekday chips. */
function FigChores() {
  return (
    <Fig viewBox="0 0 320 86">
      {["Daily", "Weekly", "2-wk", "Monthly", "N days"].map((t, i) => (
        <g key={t}>
          <rect x={18 + i * 58} y={10} width={52} height={18} rx={9} fill={i === 1 ? ACF : "none"} stroke={i === 1 ? ACCENT : P3} strokeWidth={1} />
          <text x={44 + i * 58} y={22} textAnchor="middle" fontSize="8.5" fill={i === 1 ? ACCENT : SOFT}>{t}</text>
        </g>
      ))}
      <text x={18} y={48} fontSize="8.5" fill={SOFT}>…or fixed weekdays</text>
      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
        const on = i === 1 || i === 4;
        return (
          <g key={i}>
            <circle cx={112 + i * 28} cy={66} r={10} fill={on ? ACCENT : "none"} stroke={on ? ACCENT : P3} strokeWidth={1} />
            <text x={112 + i * 28} y={70} textAnchor="middle" fontSize="9" fontWeight={600} fill={on ? "var(--color-paper)" : SOFT}>{d}</text>
          </g>
        );
      })}
    </Fig>
  );
}

/** Overlapping events stacking side-by-side inside a day grid. */
function FigCalendar() {
  return (
    <Fig viewBox="0 0 320 110">
      <rect x={30} y={8} width={200} height={94} rx={8} fill="none" stroke={P3} />
      {[30, 52, 74].map((y) => (
        <line key={y} x1={30} y1={y} x2={230} y2={y} stroke={P3} strokeWidth={0.75} strokeDasharray="2 3" />
      ))}
      <rect x={30} y={12} width={200} height={14} rx={3} fill={P2} />
      <text x={36} y={22} fontSize="8" fill={SOFT}>Maghrib window</text>
      {/* stacked overlaps — same hour, side-by-side lanes */}
      <rect x={44} y={40} width={84} height={32} rx={4} fill={ACF} stroke={ACCENT} strokeWidth={1.2} />
      <rect x={132} y={40} width={84} height={32} rx={4} fill={P2} stroke={P3} strokeWidth={1} />
      <text x={50} y={52} fontSize="8" fill={ACCENT} fontWeight={600}>Class</text>
      <text x={138} y={52} fontSize="8" fill={SOFT}>Study block</text>
      <text x={50} y={64} fontSize="7.5" fill={SOFT}>overlaps share the lane</text>
      {/* the + button */}
      <circle cx={286} cy={76} r={14} fill={INK} />
      <path d="M286 70 v12 M280 76 h12" stroke="var(--color-paper)" strokeWidth={2} strokeLinecap="round" />
      <text x={286} y={100} textAnchor="middle" fontSize="8" fill={SOFT}>tap + to plan</text>
    </Fig>
  );
}

/** The five-step onboarding rail. */
function FigOnboarding() {
  const steps = ["Name", "Location", "Madhab", "Alerts", "Install"];
  return (
    <Fig viewBox="0 0 320 70">
      {steps.map((s, i) => {
        const x = 42 + i * 60;
        return (
          <g key={s}>
            {i > 0 && <line x1={x - 46} y1={24} x2={x - 14} y2={24} stroke={i <= 2 ? ACCENT : P3} strokeWidth={1.5} />}
            <circle cx={x} cy={24} r={11} fill={i < 2 ? ACCENT : i === 2 ? ACF : "none"} stroke={i < 3 ? ACCENT : P3} strokeWidth={1.5} />
            {i < 2 ? (
              <path d={`M${x - 4.5} ${24} l3 3.2 l5.4 -5.8`} stroke="var(--color-paper)" strokeWidth={1.8} fill="none" strokeLinecap="round" />
            ) : (
              <text x={x} y={28} textAnchor="middle" fontSize="9" fontWeight={700} fill={i === 2 ? ACCENT : SOFT}>{i + 1}</text>
            )}
            <text x={x} y={52} textAnchor="middle" fontSize="8" fill={i === 2 ? ACCENT : SOFT} fontWeight={i === 2 ? 600 : 400}>{s}</text>
          </g>
        );
      })}
      <text x={160} y={66} textAnchor="middle" fontSize="8" fill={SOFT}>leaves save your place — signing out never loses progress</text>
    </Fig>
  );
}

/** Phone + cloud = the PWA works with or without signal. */
function FigOffline() {
  return (
    <Fig viewBox="0 0 320 90">
      <rect x={40} y={10} width={52} height={70} rx={8} fill="none" stroke={ACCENT} strokeWidth={1.5} />
      <rect x={48} y={20} width={36} height={8} rx={2} fill={P2} />
      <rect x={48} y={34} width={28} height={8} rx={2} fill={P2} />
      <rect x={48} y={48} width={32} height={8} rx={2} fill={ACF} />
      <circle cx={66} cy={72} r={3} fill={SOFT} />
      {/* sync arrows */}
      <path d="M108 30 q20 -14 40 0" fill="none" stroke={SOFT} strokeWidth={1.2} markerEnd="url(#ahs)" />
      <path d="M148 56 q-20 14 -40 0" fill="none" stroke={SOFT} strokeWidth={1.2} markerEnd="url(#ahs)" />
      {/* cloud */}
      <path d="M176 50 a12 12 0 0 1 4 -23 a14 14 0 0 1 27 4 a10 10 0 0 1 3 19 z" fill="none" stroke={ACCENT} strokeWidth={1.5} />
      <text x={192} y={72} textAnchor="middle" fontSize="8" fill={SOFT}>syncs later</text>
      <defs>
        <marker id="ahs" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 z" fill={SOFT} />
        </marker>
      </defs>
      <text x={240} y={44} fontSize="9" fill={SOFT}>check-ins queue</text>
      <text x={240} y={56} fontSize="9" fill={SOFT}>offline — nothing lost</text>
    </Fig>
  );
}

/** Privacy toggles — per-friend, per-field sharing. */
function FigPrivacy() {
  const rows = [
    { t: "Streaks & complete days", on: true },
    { t: "Today's live status", on: true },
    { t: "Sunnah detail", on: false },
  ];
  return (
    <Fig viewBox="0 0 320 100">
      {rows.map((r, i) => (
        <g key={r.t} transform={`translate(24 ${14 + i * 28})`}>
          <text x={0} y={13} fontSize="9.5" fill={INK}>{r.t}</text>
          <rect x={230} y={2} width={30} height={16} rx={8} fill={r.on ? ACCENT : P3} />
          <circle cx={r.on ? 253 : 237} cy={10} r={6} fill="var(--color-paper)" />
        </g>
      ))}
      <text x={24} y={96} fontSize="8.5" fill={SOFT}>each toggle is independent — sharing is never all-or-nothing</text>
    </Fig>
  );
}

// ─── Chapter data ───────────────────────────────────────────────────

interface GuideItem {
  heading: string;
  body: string;
  /** Substring of `body` the onboarding quiz tests — rendered underlined. */
  tested?: string;
}

/** Renders body text, underlining the tested phrase (and only that phrase). */
export function Marked({ text, mark }: { text: string; mark?: string }) {
  if (!mark || !text.includes(mark)) return <>{text}</>;
  const i = text.indexOf(mark);
  return (
    <>
      {text.slice(0, i)}
      <u className="decoration-2 underline-offset-[3px]" style={{ textDecorationColor: "var(--color-accent)" }}>
        {mark}
      </u>
      {text.slice(i + mark.length)}
    </>
  );
}

interface GuideSection {
  id: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
  intro: string;
  figure: { el: ReactNode; caption: string };
  items: GuideItem[];
  link?: { href: string; label: string };
}

export const SECTIONS: GuideSection[] = [
  {
    id: "setup",
    icon: GraduationCap,
    kicker: "First launch",
    title: "Onboarding",
    intro:
      "The first-run wizard sets up everything Waqt needs — and it saves your place, so signing out mid-way resumes exactly where you stopped.",
    figure: {
      el: <FigOnboarding />,
      caption: "The onboarding rail — every step persists, so you can leave and come back.",
    },
    items: [
      {
        heading: "Your name, your way",
        body: "First and last name, plus an optional middle initial. If a name would collide with a friend's, Waqt resolves it automatically — 'Muhammad S.' — so lists stay readable.",
      },
      {
        heading: "Location & madhab",
        body: "Prayer times are computed for where you actually are, and asr follows your madhab. You can change either later in Settings.",
      },
      {
        heading: "Notifications & install",
        body: "The wizard asks for notification permission and suggests installing the app — both highly recommended, since check-in reminders and the offline shell are where Waqt earns its keep.",
      },
      {
        heading: "Theme",
        body: "Pick light or dark once — it applies instantly and lives on your device, so it survives sign-outs.",
      },
    ],
  },
  {
    id: "checkins",
    icon: CheckCircle2,
    kicker: "The core",
    title: "Prayer check-ins",
    intro:
      "Everything in Waqt revolves around the five daily prayers. Logging them is the one habit that powers streaks, the League, and your stats.",
    figure: {
      el: <FigPrayerDay />,
      caption: "Today's five windows — filled when logged, highlighted while open.",
    },
    items: [
      {
        heading: "Tap a circle to log",
        body: "On Prayer → Overview, each of today's prayers is a circle. Tap it to check in — note whether you prayed at the masjid and which sunnahs you did.",
        tested: "Tap it to check in",
      },
      {
        heading: "Catch up on past days",
        body: "Missed logging a day? Open the calendar day view for that date and mark prayers retroactively — honest records beat perfect-looking ones.",
      },
      {
        heading: "Assumed prayed",
        body: "If you never mark a prayer and the day ends, it resolves as assumed prayed — no silent penalty. Only prayers you explicitly mark missed count against you.",
        tested: "assumed prayed — no silent penalty",
      },
      {
        heading: "Hayd pause",
        body: "If hayd tracking is enabled in Settings, obligations pause automatically during your period and resume after — streaks stay intact.",
        tested: "obligations pause",
      },
      {
        heading: "The sidebar countdown",
        body: "The sidebar always knows the live window — 'Asr ends in 10m' while it's open, 'Maghrib starts in 10m' before the next one. Tap it to jump to Prayer.",
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
    figure: {
      el: <FigStreak />,
      caption: "A five-day chain — each filled card is a complete day.",
    },
    items: [
      {
        heading: "Personal streak",
        body: "Counts consecutive days where all five fard prayers are logged as prayed. One missed prayer resets it — gentle pressure, not punishment.",
      },
      {
        heading: "Qadaa tracker",
        body: "Prayers marked missed add to your Qadaa count in Prayer → Stats. Log make-up prayers there to work the number down over time.",
        tested: "Prayers marked missed add to your Qadaa count",
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
      "Prayer is easier with company. Friends is opt-in — activate it once, then add each other by code and keep each other honest.",
    figure: {
      el: <FigFriends />,
      caption: "A nudge goes out, a dua comes back — sharing stays under your control.",
    },
    items: [
      {
        heading: "Activate first",
        body: "Friends is off until you activate it in the Friends tab — one tap. Until then nobody can add you and you can't add anyone.",
      },
      {
        heading: "Nicknames",
        body: "Save a friend under the name you know them by — the pencil on their card. It's private to you; their profile still shows the real name.",
      },
      {
        heading: "Same names, sorted",
        body: "Two Muhammads? The list shows 'Muhammad S.' — and if last initials collide too, the middle initial breaks the tie.",
      },
      {
        heading: "Nudges & duas",
        body: "While a friend's prayer window is open, tap the dot to nudge — capped per prayer so it stays kind. When they pray, they can send a dua back.",
        tested: "While a friend's prayer window is open, tap the dot to nudge",
      },
      {
        heading: "Hide from the League",
        body: "On a friend's profile, 'Hide from leaderboard' drops them out of both races — they stay your friend, just out of the standings. Unhide any time from the Friends tab.",
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
      "The League ranks you and your friends each week — a fresh race every Sunday so newer friends can actually win.",
    figure: {
      el: <FigLeague />,
      caption: "Weekly fard decides the order; confirmed sunnah breaks the tie.",
    },
    items: [
      {
        heading: "How ranking works",
        body: "Position is decided by this week's logged fard prayers. Since everyone aims for all five, ties break on confirmed sunnah muakkadah and witr — that's where the race actually happens.",
        tested: "confirmed sunnah muakkadah and witr",
      },
      {
        heading: "Shared streaks",
        body: "Days where you AND a friend both complete all five prayers build a shared streak (🔥) shown on their row.",
      },
      {
        heading: "Live view",
        body: "Dots on each row update in the friend's own timezone, so a friend abroad shows their day, not yours.",
      },
      {
        heading: "Two views of the race",
        body: "The overview League ranks this week + sunnah tiebreaker; the Friends tab lets you sort by week or by raw streak — and hides anyone you've hidden.",
      },
    ],
    link: { href: "/prayer", label: "Open the League" },
  },
  {
    id: "calendar",
    icon: CalendarDays,
    kicker: "The day",
    title: "Calendar & planning",
    intro:
      "The calendar is where prayers and life share one timeline — and the plan sheet claims real study time into the gaps between them.",
    figure: {
      el: (
        <div className="grid gap-4 sm:grid-cols-2">
          <FigCalendar />
          <FigPlanner />
        </div>
      ),
      caption: "Prayer bands behind events (left); the plan sheet's block statuses (right).",
    },
    items: [
      {
        heading: "Prayer bands",
        body: "Each prayer's window renders as a soft background band — context, not a blocking event.",
      },
      {
        heading: "Events & overlaps",
        body: "Tap to add events; overlapping ones stack side-by-side instead of fighting for space.",
      },
      {
        heading: "The plan sheet",
        body: "Tap + → Plan to open today's planner: it shows your free gaps, your blocks, and every assignment's status — studied (green), planned (blue), or no plan (red).",
      },
      {
        heading: "Draft & pick",
        body: "Draft lays a sensible day for you; Pick lets you place a block on any free gap and attach assignments — their status dots show what's already covered.",
      },
    ],
    link: { href: "/calendar/day", label: "Open calendar" },
  },
  {
    id: "planner",
    icon: NotebookPen,
    kicker: "Organize",
    title: "Goals & homework",
    intro:
      "Planner keeps worldly duties arranged around prayer times instead of competing with them — goals across five horizons, homework with real study tracking.",
    figure: {
      el: <FigGoals />,
      caption: "A goal with tags — the 'test' tag turns it into a session counter.",
    },
    items: [
      {
        heading: "Today & Life milestones",
        body: "Today is your day at a glance; 'Life & milestones' opens the all-time goals — the long-arc stuff lives there, not in the weekly list.",
      },
      {
        heading: "One goal view",
        body: "Each goal shows its description and target date inline. The Edit button opens edit mode: reorder with the arrows, rename, retarget, delete — or tap the eye to hide it from Today while it stays on all-time.",
      },
      {
        heading: "Tags",
        body: "Tag a goal — school, faith, health, work, personal. The 'test' tag asks how many study sessions you need, then counts real sessions: '3/200 sessions' with a bar.",
      },
      {
        heading: "Homework",
        body: "Classes color every card. Due badges say 'today 5:00p', and each item carries the same planner status — studied, planned for Th, or no plan. Quiz and exam completions ask for a grade.",
      },
      {
        heading: "Study stats",
        body: "The homework tab header shows this week's focused time next to the date; the Stats button opens the full sheet — month, year, all-time, per-subject breakdown, methods, breaks, and switches.",
      },
    ],
    link: { href: "/goals", label: "Open Planner" },
  },
  {
    id: "habits",
    icon: Repeat,
    kicker: "Rhythm",
    title: "Habits & chores",
    intro:
      "Habits are the daily small stuff; chores are the repeating household duties — both live in one tab now, with real schedules.",
    figure: {
      el: <FigChores />,
      caption: "Two schedule styles — interval-based or fixed weekdays.",
    },
    items: [
      {
        heading: "Habits",
        body: "Small daily practices with their own streaks — check them off each day from the Habits tab.",
      },
      {
        heading: "Chores as a subsection",
        body: "Chores sit at the bottom of Habits — same row style, same check-off, so the tab stays one list. A dot on the Habits chip tells you when something's coming due.",
      },
      {
        heading: "Real schedules",
        body: "A chore can be daily, weekly, biweekly, monthly, or every N days — or pinned to weekdays: 'Mon & Thu'. Weekday chores show 'due today', 'missed Tue', or 'done — next Sat'.",
      },
    ],
    link: { href: "/goals#habits", label: "Open Habits" },
  },
  {
    id: "quran",
    icon: BookOpen,
    kicker: "Play & learn",
    title: "Quran games",
    intro:
      "Two games that sharpen Quran recognition — solo, ranked, or head-to-head with friends.",
    figure: {
      el: (
        <Fig viewBox="0 0 320 84">
          <rect x={40} y={10} width={240} height={56} rx={10} fill="none" stroke={P3} strokeWidth={1.2} />
          <text x={160} y={32} textAnchor="middle" fontSize="13" fill={ACCENT} style={{ fontFamily: "var(--font-amiri, serif)" }}>﴿ وَالْعَصْرِ ﴾</text>
          {["Al-Asr", "Al-Fajr", "Al-Qadr"].map((o, i) => (
            <g key={o}>
              <rect x={52 + i * 76} y={46} width={66} height={14} rx={7} fill={i === 0 ? ACF : "none"} stroke={i === 0 ? OK : P3} strokeWidth={1} />
              <text x={85 + i * 76} y={56} textAnchor="middle" fontSize="7.5" fill={i === 0 ? OK : SOFT}>{o}</text>
            </g>
          ))}
          <text x={160} y={80} textAnchor="middle" fontSize="8.5" fill={SOFT}>name the surah — difficulty follows your rating</text>
        </Fig>
      ),
      caption: "AyaTrace: shown an ayah, name its surah — ranked play adjusts to you.",
    },
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
    figure: {
      el: (
        <Fig viewBox="0 0 320 64">
          {["Qibla", "Dhikr", "Masjid", "Names", "Talks", "Learn"].map((t, i) => (
            <g key={t}>
              <rect x={18 + (i % 3) * 100} y={i < 3 ? 8 : 36} width={88} height={22} rx={8} fill="none" stroke={i === 0 ? ACCENT : P3} strokeWidth={1.2} />
              <text x={62 + (i % 3) * 100} y={i < 3 ? 22 : 50} textAnchor="middle" fontSize="9" fill={i === 0 ? ACCENT : SOFT}>{t}</text>
            </g>
          ))}
        </Fig>
      ),
      caption: "The toolkit — hide the ones you don't use in Settings → Navigation.",
    },
    items: [
      {
        heading: "Worship",
        body: "Qibla compass, dhikr counter, masjid finder with iqamah times, and the Quran games.",
      },
      {
        heading: "Grow",
        body: "99 Names of Allah, the study timer with focus sounds, prayer-knowledge lessons in Learn, and a curated talks library.",
      },
      {
        heading: "Messages",
        body: "Friend messaging lives in the toolkit too — unread counts ride on the tile, so the main nav stays quiet.",
      },
      {
        heading: "Customize",
        body: "Settings → Navigation lets you hide tools you don't use, including Messages and the center button itself.",
      },
      {
        heading: "Re-open this guide",
        body: "The full guide lives at Tools → Guide whenever you need a refresher — same book, same chapters.",
        tested: "Tools → Guide",
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
    figure: {
      el: <FigOffline />,
      caption: "Writes queue on the device and sync when signal returns.",
    },
    items: [
      {
        heading: "Install",
        body: "On iPhone/iPad: Share → Add to Home Screen. On Android/desktop: the browser's Install prompt or menu → Install app.",
      },
      {
        heading: "Offline writes",
        body: "Check-ins made offline queue silently and sync when you're back — a brief banner tells you. Nothing is lost.",
        tested: "queue silently and sync when you're back",
      },
      {
        heading: "Your data stays yours",
        body: "Account switching wipes cached data belonging to the other account on this device, automatically.",
      },
    ],
  },
  {
    id: "privacy",
    icon: Hand,
    kicker: "Trust",
    title: "Privacy & notifications",
    intro:
      "Waqt holds personal data on a simple promise: it can never leak. These controls put that in your hands.",
    figure: {
      el: <FigPrivacy />,
      caption: "Per-field sharing — each toggle is independent.",
    },
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
  const [idx, setIdx] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const s = SECTIONS[idx];
  const last = idx === SECTIONS.length - 1;

  // Page turns reset scroll; arrow keys turn pages like a real reader.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [idx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, SECTIONS.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chapterList = (
    <ol className="space-y-0.5">
      {SECTIONS.map((sec, i) => (
        <li key={sec.id}>
          <button
            onClick={() => { setIdx(i); setTocOpen(false); }}
            aria-current={i === idx ? "page" : undefined}
            className="flex w-full items-baseline gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors"
            style={{
              backgroundColor: i === idx ? "var(--color-accent-faint)" : "transparent",
              color: i === idx ? "var(--color-accent)" : "var(--color-ink-soft)",
              fontWeight: i === idx ? 600 : 400,
            }}
          >
            <span className="w-5 shrink-0 text-right text-[11px] tabular-nums" style={{ color: i === idx ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
              {i + 1}
            </span>
            <span className="min-w-0 truncate">{sec.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex min-h-dvh w-full" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* ── Left rail: book title + chapter nav (desktop) ── */}
      <aside
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r lg:flex"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        <div className="px-6 pb-4 pt-8">
          <p className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            The Waqt Guide
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {SECTIONS.length} chapters · the owner&rsquo;s manual
          </p>
        </div>
        <nav aria-label="Chapters" className="flex-1 px-3 pb-8">
          {chapterList}
        </nav>
      </aside>

      {/* ── Center: the page itself ── */}
      <main className="min-w-0 flex-1">
        {/* Mobile top bar — chapter position + contents */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between border-b px-4 py-2.5 backdrop-blur-md lg:hidden"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
          }}
        >
          <button
            onClick={() => setTocOpen(true)}
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            <BookOpen className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            Contents
          </button>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {idx + 1} / {SECTIONS.length}
          </span>
        </div>

        <article className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
          {/* Chapter opening */}
          <p className="text-[11px] font-medium uppercase tracking-[0.24em]" style={{ color: "var(--color-accent)" }}>
            Chapter {idx + 1} · {s.kicker}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--color-ink)" }}>
            {s.title}
          </h2>

          {/* Intro with drop cap — the book tell */}
          <p className="mt-5 text-base leading-[1.8] sm:text-[17px]" style={{ color: "var(--color-ink-soft)" }}>
            <span
              className="float-left mr-2 mt-1 text-5xl font-semibold leading-[0.8]"
              style={{ color: "var(--color-accent)" }}
              aria-hidden
            >
              {s.intro.charAt(0)}
            </span>
            {s.intro.slice(1)}
          </p>

          {/* Figure plate — the textbook moment, given room */}
          <figure
            className="mt-8 overflow-hidden rounded-2xl border"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <div className="px-5 pb-3 pt-6 sm:px-8 sm:pt-8">
              {s.figure.el}
            </div>
            <figcaption
              className="border-t px-5 py-2.5 text-center text-xs sm:px-8"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
            >
              <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                Fig. {idx + 1}
              </span>
              {" — "}
              {s.figure.caption}
            </figcaption>
          </figure>

          {/* Concepts — numbered textbook entries, single reading column */}
          <dl className="mt-8 space-y-6">
            {s.items.map((item, j) => (
              <div key={item.heading} id={`${s.id}-${j}`} className="flex scroll-mt-20 gap-3.5">
                <span
                  className="mt-1 shrink-0 text-xs font-bold tabular-nums"
                  style={{ color: "var(--color-accent)" }}
                  aria-hidden
                >
                  {idx + 1}.{j + 1}
                </span>
                <div className="min-w-0">
                  <dt className="text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>
                    {item.heading}
                  </dt>
                  <dd className="mt-1.5 text-[15px] leading-[1.75]" style={{ color: "var(--color-ink-soft)" }}>
                    <Marked text={item.body} mark={item.tested} />
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          {s.link && (
            <Link
              href={s.link.href}
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--color-accent)" }}
            >
              {s.link.label}
              <span aria-hidden>→</span>
            </Link>
          )}

          {/* Page turn */}
          <div
            className="mt-12 flex items-center justify-between gap-3 border-t pt-6"
            style={{ borderColor: "var(--color-paper-3)" }}
          >
            {idx > 0 ? (
              <button
                onClick={() => setIdx(idx - 1)}
                className="flex min-w-0 items-center gap-2 text-sm font-medium transition-opacity hover:opacity-60"
                style={{ color: "var(--color-ink-soft)" }}
              >
                <span aria-hidden>←</span>
                <span className="min-w-0 truncate">{SECTIONS[idx - 1].title}</span>
              </button>
            ) : (
              <span />
            )}
            {!last ? (
              <button
                onClick={() => setIdx(idx + 1)}
                className="flex min-w-0 items-center gap-2 text-sm font-medium transition-opacity hover:opacity-60"
                style={{ color: "var(--color-ink-soft)" }}
              >
                <span className="min-w-0 truncate">{SECTIONS[idx + 1].title}</span>
                <span aria-hidden>→</span>
              </button>
            ) : (
              <span />
            )}
          </div>

          {/* Colophon */}
          {last && (
            <div
              className="mt-8 rounded-2xl border px-5 py-5 sm:px-6"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
            >
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--color-warmth)" }} aria-hidden />
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
          )}
        </article>
      </main>

      {/* ── Right rail: on-page outline (wide desktop) ── */}
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-l xl:flex"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        <nav aria-label="In this chapter" className="px-5 pb-8 pt-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
            In this chapter
          </p>
          <ul className="mt-3 space-y-1.5">
            {s.items.map((item, j) => (
              <li key={item.heading}>
                <a
                  href={`#${s.id}-${j}`}
                  className="flex items-baseline gap-2 text-[13px] leading-snug transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {idx + 1}.{j + 1}
                  </span>
                  {item.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* ── Mobile contents sheet ── */}
      {tocOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Table of contents">
          <button
            aria-label="Close contents"
            onClick={() => setTocOpen(false)}
            className="absolute inset-0"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t px-4 pb-8 pt-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} aria-hidden />
            <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.24em]" style={{ color: "var(--color-ink-muted)" }}>
              Contents
            </p>
            {chapterList}
          </div>
        </div>
      )}
    </div>
  );
}

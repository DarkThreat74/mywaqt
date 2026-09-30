"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Moon, Sun } from "lucide-react";

/* ── Mock thread ── */
const FRIEND = "Ahmad";
const M: { own: boolean; text: string; time: string }[] = [
  { own: false, text: "Assalamu alaikum — did you catch Fajr today?", time: "5:58 AM" },
  { own: true, text: "Wa alaikum salaam. Just finished, alhamdulillah. Masjid was packed.", time: "6:12 AM" },
  { own: false, text: "MashaAllah. I'm on day 4 of the streak — keep me honest.", time: "6:14 AM" },
  { own: true, text: "Always. Isha together tomorrow?", time: "6:15 AM" },
  { own: false, text: "In sha Allah 🤲", time: "6:16 AM" },
];

const VARIANTS = [
  { id: "letters", label: "Letters" },
  { id: "spine", label: "The Spine" },
  { id: "dusk", label: "Dusk" },
  { id: "stream", label: "Stream" },
  { id: "post", label: "Postcards" },
  { id: "ribbon", label: "Ribbon" },
  { id: "mushaf", label: "Mushaf" },
  { id: "whisper", label: "Whisper" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "imessage", label: "iMessage" },
  { id: "discord", label: "Discord" },
  { id: "gchat", label: "Google Chat" },
] as const;

type Variant = (typeof VARIANTS)[number]["id"];

export default function StyleLab() {
  const [v, setV] = useState<Variant>("letters");
  const [light, setLight] = useState(true);

  // Lab-only theme override — restores whatever the app had on exit.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.dataset.theme;
    el.dataset.theme = light ? "light" : "dark";
    return () => { if (prev) el.dataset.theme = prev; else delete el.dataset.theme; };
  }, [light]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2.5"
        style={{ borderColor: "var(--color-paper-3)", paddingTop: "calc(0.625rem + env(safe-area-inset-top))" }}>
        <button
          onClick={() => setLight((l) => !l)}
          aria-label={light ? "Preview dark" : "Preview light"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
        >
          {light ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
        {VARIANTS.map((x) => (
          <button key={x.id} onClick={() => setV(x.id)}
            className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={v === x.id
              ? { backgroundColor: "var(--color-ink)", color: "var(--color-paper)", borderColor: "var(--color-ink)" }
              : { borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {v === "letters" && <Letters />}
        {v === "spine" && <Spine />}
        {v === "dusk" && <Dusk />}
        {v === "stream" && <Stream />}
        {v === "post" && <Postcards />}
        {v === "ribbon" && <Ribbon />}
        {v === "mushaf" && <Mushaf />}
        {v === "whisper" && <Whisper />}
        {v === "whatsapp" && <WhatsApp />}
        {v === "imessage" && <IMessage />}
        {v === "discord" && <Discord />}
        {v === "gchat" && <GChat />}
      </div>
    </div>
  );
}

const Ticks = ({ read }: { read?: boolean }) =>
  read
    ? <CheckCheck className="h-3 w-3" style={{ color: "var(--color-accent)" }} />
    : <Check className="h-3 w-3" style={{ color: "var(--color-ink-muted)" }} />;

/* ═══ 1. LETTERS — editorial cards, sender as letterhead ═══ */
function Letters() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      <header className="border-b px-5 py-4" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <ArrowLeft className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          <div>
            <p className="text-lg italic leading-tight" style={{ color: "var(--color-ink)" }}>{FRIEND}</p>
            <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>Correspondence</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {M.map((m, i) => (
            <article key={i} className={m.own ? "ml-8 sm:ml-16" : "mr-8 sm:mr-16"}>
              <div
                className="rounded-md border p-4"
                style={{
                  borderColor: "var(--color-paper-3)",
                  backgroundColor: m.own ? "var(--color-warmth-faint)" : "var(--color-paper)",
                  boxShadow: "0 1px 0 color-mix(in oklab, var(--color-ink) 6%, transparent)",
                }}
              >
                <div className="flex items-baseline justify-between gap-3 border-b pb-1.5" style={{ borderColor: "var(--color-paper-3)" }}>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: m.own ? "var(--color-warmth)" : "var(--color-accent)" }}>
                    {m.own ? "You" : FRIEND}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {m.time} {m.own && <Ticks read={i < 3} />}
                  </span>
                </div>
                <p className="pt-2.5 text-[15px] italic leading-relaxed" style={{ color: "var(--color-ink)" }}>{m.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
      <footer className="border-t px-5 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="flex-1 border-b pb-1.5 italic" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            Write to {FRIEND}…
          </p>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-accent)" }}>Send</span>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 2. THE SPINE — continuous thread, timestamp gutter ═══ */
function Spine() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      <header className="flex items-center gap-3 px-5 py-3.5">
        <ArrowLeft className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
        <p className="text-base italic" style={{ color: "var(--color-ink)" }}>with {FRIEND}</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="relative mx-auto max-w-xl px-6 pb-8">
          <span className="absolute bottom-0 left-[4.55rem] top-0 w-px sm:left-[5.05rem]" style={{ backgroundColor: "var(--color-paper-3)" }} />
          {M.map((m, i) => (
            <div key={i} className="relative flex gap-4 py-3">
              <span className="w-10 shrink-0 pt-1 text-right text-[10px] tabular-nums sm:w-12" style={{ color: "var(--color-ink-muted)" }}>
                {m.time}
              </span>
              <span
                className="absolute left-[4.55rem] top-4 h-2 w-2 -translate-x-1/2 rounded-full sm:left-[5.05rem]"
                style={{ backgroundColor: m.own ? "var(--color-warmth)" : "var(--color-accent)" }}
              />
              <div className="min-w-0 pl-5">
                <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: m.own ? "var(--color-warmth)" : "var(--color-accent)" }}>
                    {m.own ? "you" : FRIEND.toLowerCase()}
                  </span>
                  {m.text}
                  {m.own && <span className="ml-1.5 inline-flex align-middle"><Ticks read={i < 3} /></span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <footer className="border-t px-5 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="w-10 text-right text-[10px] sm:w-12" style={{ color: "var(--color-ink-muted)" }}>now</span>
          <p className="min-w-0 flex-1 pl-5 italic" style={{ color: "var(--color-ink-muted)" }}>add to the thread…</p>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 3. DUSK — night-watch, glowing, weightless ═══ */
function Dusk() {
  const bg = "oklch(0.17 0.02 255)";
  const glow = "oklch(0.78 0.10 195)";
  const dim = "oklch(0.55 0.03 250)";
  const warm = "oklch(0.75 0.10 55)";
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: bg }}>
      <header className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid oklch(0.28 0.03 255)" }}>
        <ArrowLeft className="h-4 w-4" style={{ color: dim }} />
        <p className="text-base tracking-wide" style={{ color: "oklch(0.92 0.02 250)" }}>{FRIEND}</p>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: dim }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: glow, boxShadow: `0 0 8px ${glow}` }} /> awake
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-xl space-y-6">
          {M.map((m, i) => (
            <div key={i} className={m.own ? "text-right" : "text-left"}>
              <p
                className="text-[15px] font-light leading-relaxed tracking-wide"
                style={{
                  color: m.own ? warm : glow,
                  textShadow: `0 0 14px color-mix(in oklab, ${m.own ? warm : glow} 35%, transparent)`,
                }}
              >
                {m.text}
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.2em]" style={{ color: dim }}>
                {m.own ? "you" : FRIEND.toLowerCase()} · {m.time} {m.own && (i < 3 ? "· seen" : "· sent")}
              </p>
            </div>
          ))}
        </div>
      </div>
      <footer className="px-5 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3">
        <div className="mx-auto flex max-w-xl items-center gap-3 border-t pt-3" style={{ borderColor: "oklch(0.28 0.03 255)" }}>
          <p className="flex-1 text-sm italic" style={{ color: dim }}>whisper…</p>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: glow }}>send →</span>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 4. STREAM — pure column, sender = colour prefix ═══ */
function Stream() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      <header className="border-b px-5 py-3.5 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
        <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--color-ink-muted)" }}>
          you <span style={{ color: "var(--color-accent)" }}>·</span> {FRIEND}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-md space-y-4">
          {M.map((m, i) => (
            <div key={i} className="flex items-baseline gap-3">
              <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: m.own ? "var(--color-warmth)" : "var(--color-accent)" }}>
                {m.own ? "you" : FRIEND.toLowerCase()}
              </span>
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
                {m.text}
                <span className="ml-2 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {m.time}{m.own ? (i < 3 ? " ✓✓" : " ✓") : ""}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>
      <footer className="border-t px-5 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex max-w-md items-baseline gap-3">
          <span className="w-12 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-warmth)" }}>you</span>
          <p className="flex-1 italic" style={{ color: "var(--color-ink-muted)" }}>type…</p>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 5. POSTCARDS — tilted cards, stamp, postmark ═══ */
function Postcards() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--color-paper-2)" }}>
      <header className="px-5 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <ArrowLeft className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          <p className="text-lg italic" style={{ color: "var(--color-ink)" }}>Postcards from {FRIEND}</p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-lg space-y-7">
          {M.map((m, i) => (
            <div
              key={i}
              className={`relative rounded-lg border p-5 ${m.own ? "ml-10 rotate-[0.6deg]" : "mr-10 -rotate-[0.6deg]"}`}
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper)",
                boxShadow: "0 2px 8px color-mix(in oklab, var(--color-ink) 8%, transparent)",
              }}
            >
              {/* stamp */}
              <span
                className="absolute -top-2.5 right-4 flex h-9 w-7 rotate-6 items-center justify-center border text-sm"
                style={{
                  borderColor: "var(--color-paper-3)",
                  backgroundColor: m.own ? "var(--color-warmth-faint)" : "var(--color-accent-faint)",
                  borderRadius: 2,
                }}
              >
                {m.own ? "🕌" : "🌙"}
              </span>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
                {m.own ? "from you" : `from ${FRIEND.toLowerCase()}`} · {m.time}
              </p>
              <p className="mt-2.5 text-[16px] italic leading-relaxed" style={{ color: "var(--color-ink)" }}>{m.text}</p>
              {m.own && (
                <p className="mt-2 text-right text-[9px] uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                  {i < 3 ? "delivered · read" : "sent"}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      <footer className="px-5 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <p className="flex-1 rounded-lg border bg-[var(--color-paper)] px-4 py-2.5 text-sm italic" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            Write a card…
          </p>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-accent)" }}>Mail</span>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 6. RIBBON — one alternately-hung tape ═══ */
function Ribbon() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      <header className="flex items-center gap-3 px-5 py-3.5">
        <ArrowLeft className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
        <p className="text-base italic" style={{ color: "var(--color-ink)" }}>{FRIEND}</p>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="relative mx-auto max-w-md">
          {/* centre thread */}
          <span className="absolute bottom-4 left-1/2 top-0 w-px" style={{ backgroundColor: "var(--color-paper-3)" }} />
          <div className="space-y-6">
            {M.map((m, i) => (
              <div key={i} className={`relative w-[72%] ${m.own ? "ml-auto" : ""}`}>
                {/* pin where the note hangs off the thread */}
                <span
                  className={`absolute -top-1.5 h-3 w-3 rounded-full border-2 ${m.own ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
                  style={{ borderColor: "var(--color-paper)", backgroundColor: m.own ? "var(--color-warmth)" : "var(--color-accent)", top: "-6px" }}
                />
                <div
                  className="px-4 py-3"
                  style={{
                    backgroundColor: m.own ? "var(--color-warmth-faint)" : "var(--color-accent-faint)",
                    borderLeft: m.own ? "none" : "3px solid var(--color-accent)",
                    borderRight: m.own ? "3px solid var(--color-warmth)" : "none",
                  }}
                >
                  <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-ink)" }}>{m.text}</p>
                  <p className={`mt-1.5 text-[9px] uppercase tracking-[0.16em] ${m.own ? "text-right" : ""}`} style={{ color: "var(--color-ink-muted)" }}>
                    {m.time}{m.own ? (i < 3 ? " · read" : " · sent") : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="border-t px-5 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex max-w-md items-center gap-3">
          <p className="flex-1 italic" style={{ color: "var(--color-ink-muted)" }}>pin a note…</p>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-warmth)" }}>Pin</span>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 7. MUSHAF — framed manuscript panel, gold rules ═══ */
function Mushaf() {
  const gold = "var(--color-warmth)";
  return (
    <div className="flex h-full flex-col items-center px-4" style={{ backgroundColor: "var(--color-paper-2)" }}>
      {/* framed page */}
      <div
        className="my-4 flex w-full max-w-lg flex-1 flex-col border-2"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", boxShadow: "inset 0 0 0 6px var(--color-paper), inset 0 0 0 7px var(--color-paper-3)" }}
      >
        <header className="border-b px-6 py-4 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: gold }}>✦ ✦ ✦</p>
          <p className="mt-1 text-lg italic" style={{ color: "var(--color-ink)" }}>{FRIEND}</p>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
          {M.map((m, i) => (
            <div key={i} className={m.own ? "text-right" : "text-left"}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em]" style={{ color: m.own ? gold : "var(--color-accent)" }}>
                {m.own ? "— you —" : `— ${FRIEND.toLowerCase()} —`}
              </p>
              <p className="mt-1 text-[15px] italic leading-relaxed" style={{ color: "var(--color-ink)" }}>{m.text}</p>
              <p className="mt-0.5 text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                {m.time}{m.own ? (i < 3 ? " ✓✓" : " ✓") : ""}
              </p>
            </div>
          ))}
        </div>
        <footer className="border-t px-6 py-4" style={{ borderColor: "var(--color-paper-3)" }}>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm italic" style={{ color: "var(--color-ink-muted)" }}>write beneath the seal…</p>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border text-xs" style={{ borderColor: gold, color: gold }}>✦</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ═══ 8. WHISPER — almost nothing on screen ═══ */
function Whisper() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      <header className="flex items-center px-5 py-4">
        <ArrowLeft className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
        <p className="mx-auto -ml-4 text-sm italic" style={{ color: "var(--color-ink-muted)" }}>{FRIEND}</p>
      </header>
      <div className="flex flex-1 items-center overflow-hidden px-5">
        <div className="mx-auto w-full max-w-md">
          {/* only the latest exchange, huge */}
          <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--color-accent)" }}>{FRIEND.toLowerCase()}</p>
          <p className="mt-2 text-2xl italic leading-snug sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            “{M[M.length - 1].text}”
          </p>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
            {M[M.length - 1].time} · scroll for the rest
          </p>
          <div className="mt-6 space-y-3 opacity-60">
            {M.slice(-3, -1).map((m, i) => (
              <p key={i} className="truncate text-sm italic" style={{ color: "var(--color-ink-muted)" }}>
                {m.own ? "you: " : ""}{m.text}
              </p>
            ))}
          </div>
        </div>
      </div>
      <footer className="px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        <div className="mx-auto flex max-w-md items-baseline gap-3">
          <p className="flex-1 border-b pb-2 text-lg italic" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            answer softly…
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 9. WHATSAPP — tinted wallpaper, green tails, day pills ═══ */
function WhatsApp() {
  const wall = "#efeae2";
  const out = "#d9fdd3";
  const inn = "#ffffff";
  const tickBlue = "#53bdeb";
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: wall, backgroundImage: "radial-gradient(color-mix(in srgb, #54656f 8%, transparent) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
      <header className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: "#f0f2f5", borderBottom: "1px solid #d1d7db" }}>
        <ArrowLeft className="h-5 w-5" style={{ color: "#54656f" }} />
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: "#00a884" }}>A</span>
        <div>
          <p className="text-[15px] font-medium leading-tight text-[#111b21]">{FRIEND}</p>
          <p className="text-[11px] text-[#667781]">online</p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-10">
        <p className="mx-auto mb-4 w-fit rounded-md px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm" style={{ backgroundColor: "#fdf3c6" }}>Today</p>
        <div className="space-y-1.5">
          {M.map((m, i) => (
            <div key={i} className={`flex ${m.own ? "justify-end" : "justify-start"}`}>
              <div
                className="relative max-w-[78%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-snug text-[#111b21] shadow-sm"
                style={{ backgroundColor: m.own ? out : inn, borderTopRightRadius: m.own ? 0 : 8, borderTopLeftRadius: m.own ? 8 : 0 }}
              >
                {m.text}
                <span className="float-right ml-2 mt-1.5 inline-flex items-center gap-0.5 text-[10px] text-[#667781]">
                  {m.time}
                  {m.own && <CheckCheck className="h-3.5 w-3.5" style={{ color: i < 3 ? tickBlue : "#8696a0" }} />}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <footer className="px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-1.5" style={{ backgroundColor: wall }}>
        <div className="flex items-center gap-2">
          <p className="flex-1 rounded-full bg-white px-4 py-2.5 text-[15px] text-[#8696a0] shadow-sm">Message</p>
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#00a884" }}>➤</span>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 10. iMESSAGE — white void, blue/gray balloons, tails ═══ */
function IMessage() {
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b border-[#d9d9d9] px-4 py-3 text-center">
        <span className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: "#a9a9b1" }}>A</span>
        <p className="text-[13px] font-medium text-black">{FRIEND}</p>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-center text-[11px] font-medium text-[#8e8e93]">Today 5:58 AM</p>
        <div className="space-y-1">
          {M.map((m, i) => {
            const isLastOfRun = i === M.length - 1 || M[i + 1].own !== m.own;
            return (
              <div key={i} className={`flex ${m.own ? "justify-end" : "justify-start"}`}>
                <div
                  className="relative max-w-[70%] rounded-[18px] px-3.5 py-2 text-[15px] leading-snug"
                  style={{
                    backgroundColor: m.own ? "#0b93f6" : "#e9e9eb",
                    color: m.own ? "#fff" : "#000",
                    borderBottomRightRadius: m.own && isLastOfRun ? 4 : undefined,
                    borderBottomLeftRadius: !m.own && isLastOfRun ? 4 : undefined,
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-right text-[11px] font-medium text-[#8e8e93]">Read 6:16 AM</p>
        </div>
      </div>
      <footer className="border-t border-[#d9d9d9] px-4 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] pt-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl text-[#8e8e93]">+</span>
          <p className="flex-1 rounded-full border border-[#d9d9d9] px-3.5 py-1.5 text-[15px] text-[#8e8e93]">iMessage</p>
          <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#0b93f6" }}>↑</span>
        </div>
      </footer>
    </div>
  );
}

/* ═══ 11. DISCORD — flat rows, avatar rail, hover actions ═══ */
function Discord() {
  const bg = "#313338";
  const txt = "#dbdee1";
  const dim = "#949ba4";
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: bg }}>
      <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #232428", boxShadow: "0 1px 0 rgb(2 2 2 / 0.2)" }}>
        <ArrowLeft className="h-5 w-5" style={{ color: dim }} />
        <span className="text-[16px] font-bold" style={{ color: "#f2f3f5" }}>@ {FRIEND.toLowerCase()}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-0.5">
          {M.map((m, i) => {
            const newGroup = i === 0 || M[i - 1].own !== m.own;
            return (
              <div key={i} className={`group flex gap-3 ${newGroup ? "mt-3" : "-mt-0.5 pl-12"}`}>
                {newGroup && (
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: m.own ? "#e3a008" : "#5865f2" }}>
                    {m.own ? "Y" : "A"}
                  </span>
                )}
                <div className="min-w-0">
                  {newGroup && (
                    <p className="flex items-baseline gap-2">
                      <span className="text-[15px] font-medium" style={{ color: m.own ? "#e3a008" : "#5865f2" }}>
                        {m.own ? "You" : FRIEND.toLowerCase()}
                      </span>
                      <span className="text-[11px]" style={{ color: dim }}>Today at {m.time}</span>
                    </p>
                  )}
                  <p className="text-[15px] leading-snug" style={{ color: txt }}>{m.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
        <p className="rounded-lg px-4 py-2.5 text-[15px]" style={{ backgroundColor: "#383a40", color: dim }}>
          Message @{FRIEND.toLowerCase()}
        </p>
      </footer>
    </div>
  );
}

/* ═══ 12. GOOGLE CHAT — pill bubbles, plain header, Google grey ═══ */
function GChat() {
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-[#e0e0e0] px-4 py-2.5">
        <ArrowLeft className="h-5 w-5 text-[#5f6368]" />
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white" style={{ backgroundColor: "#1a73e8" }}>A</span>
        <div>
          <p className="text-[14px] font-medium text-[#1f1f1f]">{FRIEND}</p>
          <p className="text-[11px] text-[#5f6368]">Active now</p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-1">
          {M.map((m, i) => {
            const newGroup = i === 0 || M[i - 1].own !== m.own;
            return (
              <div key={i} className={`flex items-end gap-2 ${m.own ? "justify-end" : "justify-start"} ${newGroup ? "mt-3" : ""}`}>
                {!m.own && (
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white ${newGroup ? "" : "invisible"}`}
                    style={{ backgroundColor: "#1a73e8" }}
                  >A</span>
                )}
                <div
                  className="max-w-[75%] px-3.5 py-2 text-[14px] leading-snug"
                  style={m.own
                    ? { backgroundColor: "#d3e3fd", color: "#041e49", borderRadius: 18 }
                    : { backgroundColor: "#f1f3f4", color: "#1f1f1f", borderRadius: 18 }}
                >
                  {m.text}
                  <span className="ml-2 text-[10px]" style={{ color: m.own ? "#174ea6" : "#5f6368" }}>
                    {m.time}{m.own ? (i < 3 ? " ✓✓" : "") : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
        <div className="flex items-center gap-2 rounded-3xl border border-[#e0e0e0] bg-white px-4 py-2">
          <span className="text-lg text-[#5f6368]">+</span>
          <p className="flex-1 text-[14px] text-[#5f6368]">Message</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#1a73e8" }}>➤</span>
        </div>
      </footer>
    </div>
  );
}

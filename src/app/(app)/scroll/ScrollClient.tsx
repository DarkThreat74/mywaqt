"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Flame, Layers, Smartphone } from "lucide-react";
import { shieldNativeAvailable, getScrollStats, pushScrollStats, type ScrollDayStats } from "@/lib/salah-shield-native";

const APP_NAMES: Record<string, string> = {
  "com.instagram.android": "Instagram", "com.instagram.lite": "Instagram Lite",
  "com.zhiliaoapp.musically": "TikTok", "com.ss.android.ugc.trill": "TikTok",
  "com.ss.android.ugc.aweme": "TikTok", "com.zhiliaoapp.musically.go": "TikTok Lite",
  "com.google.android.youtube": "YouTube", "com.snapchat.android": "Snapchat",
  "com.facebook.katana": "Facebook", "com.facebook.lite": "Facebook Lite",
  "com.twitter.android": "X", "com.x.android": "X",
  "com.threads.android": "Threads", "com.reddit.frontpage": "Reddit",
  "com.pinterest": "Pinterest", "com.kwai.video": "Kwai",
  "com.smile.gifmaker": "Kuaishou", "video.likee": "Likee",
  "com.next.innovation.takatak": "Josh",
};
const name = (pkg: string) => APP_NAMES[pkg] ?? pkg.split(".").pop() ?? pkg;
const fmtSec = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`;
const fmtT = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Neutral banding — the number is the fact; the label just names the range.
function stage(total: number) {
  return total < 30 ? "under 30" : total <= 100 ? "30–100" : "over 100";
}

type ServerDay = { date: string; total: number; apps: Record<string, number> | null; sec: Record<string, number> | null; hours: Record<string, number> | null; sessions: { p: string; t: number; c: number; d: number }[] | null };

export default function ScrollClient() {
  const [native, setNative] = useState<boolean | null>(null);
  const [today, setToday] = useState<ScrollDayStats | null>(null);
  const [localHist, setLocalHist] = useState<Record<string, ScrollDayStats>>({});
  const [serverDays, setServerDays] = useState<ServerDay[]>([]);
  const [stamp, setStamp] = useState<Date | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const ok = shieldNativeAvailable();
      if (!live) return;
      setNative(ok);
      if (!ok) return;
      const s = await getScrollStats();
      if (!live || !s) return;
      setToday(s.today);
      setLocalHist(s.history);
      setStamp(new Date());
      void pushScrollStats();
    };
    void refresh();
    const t = setInterval(refresh, 15_000);
    const onShow = () => void refresh();
    window.addEventListener("pageshow", onShow);
    return () => { live = false; clearInterval(t); window.removeEventListener("pageshow", onShow); };
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/scroll/sync").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (live && d?.days) setServerDays(d.days); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Local device data wins for today/recent; server fills older history.
  const days = useMemo(() => {
    const map: Record<string, ScrollDayStats> = {};
    for (const d of serverDays) map[d.date] = {
      date: d.date, total: d.total, apps: d.apps ?? {}, sec: d.sec ?? {},
      hours: d.hours ?? undefined, sessions: d.sessions ?? undefined,
    };
    Object.assign(map, localHist);
    if (today) map[today.date] = today;
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [today, localHist, serverDays]);

  const totalSec = Object.values(today?.sec ?? {}).reduce((s, v) => s + v, 0);
  const sessions = today?.sessions ?? [];
  const longest = sessions.reduce<{ p: string; t: number; c: number; d: number } | null>(
    (m, s) => (m === null || s.c > m.c) ? s : m, null);
  const avgSess = sessions.length ? Math.round(sessions.reduce((s, x) => s + x.c, 0) / sessions.length) : 0;

  const hourAvg = useMemo(() => {
    const sums: Record<number, number[]> = {};
    for (const d of days) for (const [h, n] of Object.entries(d.hours ?? {})) {
      (sums[+h] ??= []).push(n);
    }
    const out: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = sums[i];
      out.push(a ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0);
    }
    return out;
  }, [days]);
  const peakHour = hourAvg.indexOf(Math.max(...hourAvg));

  const apps = useMemo(() => Object.entries(today?.apps ?? {})
    .map(([pkg, n]) => ({ name: name(pkg), n, sec: today?.sec?.[pkg] ?? 0 }))
    .sort((a, b) => b.n - a.n), [today]);
  const appMax = Math.max(1, ...apps.map((a) => a.n));

  const allTime = days.reduce((s, d) => s + d.total, 0);
  const week = days.slice(0, 7);
  const weekTotal = week.reduce((s, d) => s + d.total, 0);
  const maxDay = Math.max(1, ...days.slice(0, 30).map((d) => d.total));

  if (native === false) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center" style={{ color: "var(--color-ink)" }}>
        <Smartphone className="h-8 w-8" style={{ color: "var(--color-accent)" }} />
        <h1 className="mt-4 text-xl font-semibold">Scrolls lives in the app</h1>
        <p className="mt-2 max-w-xs text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Your scroll habits are counted on-device by the Waqt Android app. Install it, turn the counter on in Settings → Guard, and this page fills up.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-24 pt-4" style={{ color: "var(--color-ink)" }}>
      <div className="flex items-center gap-3">
        <Link href="/settings/misc?tab=guard" className="rounded-full p-2" style={{ color: "var(--color-ink-muted)" }} aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Scrolls</h1>
          <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>Short-form habits, counted on this phone</p>
        </div>
      </div>

      {/* Hero */}
      <div className="mt-4 rounded-3xl border p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
        <div className="flex items-baseline justify-between">
          <p className="text-5xl font-semibold tabular-nums">{today ? today.total : "—"}</p>
          {today && <p className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>{stage(today.total)}</p>}
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {today
            ? <>scrolls today{totalSec > 0 ? ` · ${fmtSec(totalSec)} in feeds` : ""}</>
            : "counting…"}
          {stamp ? ` · as of ${stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { v: today ? String(sessions.length) : "—", l: "sessions" },
            { v: today ? String(avgSess) : "—", l: "avg / session" },
            { v: days.length ? String(weekTotal) : "—", l: "this week" },
          ].map((x) => (
            <div key={x.l} className="rounded-xl border py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-base font-semibold tabular-nums">{x.v}</p>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{x.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Time of day */}
      <Section icon={<Clock className="h-4 w-4" />} title="When you scroll" sub={peakHour >= 0 && Math.max(...hourAvg) > 0 ? `peak around ${fmtT(peakHour * 60)}` : undefined}>
        <div className="flex h-20 items-end gap-[3px]" role="img"
          aria-label={Math.max(...hourAvg) > 0 ? `Average scrolls by hour of day; peak around ${fmtT(peakHour * 60)}` : "No hourly data yet"}>
          {hourAvg.map((v, h) => {
            const todayV = today?.hours?.[String(h)] ?? 0;
            const max = Math.max(1, ...hourAvg);
            return (
              <div key={h} className="relative flex flex-1 flex-col items-center justify-end" title={`${h}:00 — ${v} avg${todayV ? `, ${todayV} today` : ""}`}>
                {todayV > 0 && <span className="absolute bottom-full mb-0.5 w-full rounded-sm" style={{ height: Math.max(3, (todayV / max) * 20), background: "var(--color-accent)", opacity: 0.55 }} />}
                <span className="w-full rounded-sm" style={{ height: Math.max(2, (v / max) * 64), background: h === peakHour && v > 0 ? "var(--color-accent)" : "var(--color-paper-3)" }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
          <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span>
        </div>
        <p className="mt-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Bars = your average · glow = today</p>
      </Section>

      {/* Platforms */}
      {apps.length > 0 && (
        <Section icon={<Layers className="h-4 w-4" />} title="Platforms" sub="today">
          <div className="space-y-2.5">
            {apps.map((a) => (
              <div key={a.name}>
                <div className="flex justify-between text-xs">
                  <span>{a.name}</span>
                  <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{a.n}{a.sec > 0 ? ` · ${fmtSec(a.sec)}` : ""}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(a.n / appMax) * 100}%`, background: "var(--color-accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Sessions */}
      {longest && (
        <Section icon={<Flame className="h-4 w-4" />} title="Longest session" sub="today">
          <p className="text-sm"><b className="tabular-nums">{longest.c}</b> scrolls in one sitting — {name(longest.p)}, started {fmtT(longest.t)}{longest.d > 5 ? `, ~${fmtSec(longest.d)}` : ""}</p>
        </Section>
      )}

      {/* History */}
      {days.length > 0 && (
        <Section title={`History · ${allTime} all time`}>
          <div className="flex h-16 items-end gap-1">
            {days.slice(0, 14).reverse().map((d) => (
              <div key={d.date} className="flex-1 rounded-sm" title={`${d.date}: ${d.total}`}
                style={{ height: `${Math.max(4, (d.total / maxDay) * 100)}%`, background: "var(--color-accent)", opacity: d.date === today?.date ? 1 : 0.5 }} />
            ))}
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {days.slice(0, 30).map((d) => {
              const top = Object.entries(d.apps).sort((a, b) => b[1] - a[1])[0];
              return (
                <div key={d.date} className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--color-ink-muted)" }}>{d.date}</span>
                  <span className="tabular-nums">{d.total}{top ? ` · ${name(top[0])}` : ""}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <p className="mt-6 text-center text-[10px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Counted by the accessibility service on this phone — short-form feeds only.<br />Synced to your account for history; nothing is shared.
      </p>
    </div>
  );
}

function Section({ icon, title, sub, children }: { icon?: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span style={{ color: "var(--color-accent)" }}>{icon}</span>}
          <p className="text-xs font-semibold" style={{ color: "var(--color-ink)" }}>{title}</p>
        </div>
        {sub && <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{sub}</p>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

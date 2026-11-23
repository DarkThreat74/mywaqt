"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Layers, Ruler, Smartphone } from "lucide-react";
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

/** px + dpi → metres. null when the day has no distance data (pre-px sync). */
const meters = (d: { pxTotal?: number | null; dpi?: number | null }) =>
  d.pxTotal && d.dpi ? d.pxTotal / (d.dpi * 39.3701) : null;
const fmtM = (m: number | null) =>
  m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`;

/** A felt comparison — the number alone means nothing. */
function comparison(m: number): string | null {
  const things: [number, string][] = [
    [828, "the Burj Khalifa"], [443, "the Empire State"], [330, "the Eiffel Tower"],
    [105, "a football pitch"], [40, "a Boeing 737"], [12, "a city bus"],
    [5.5, "a giraffe"], [2, "a doorway"],
  ];
  for (const [h, label] of things) {
    if (m >= h) {
      const n = m / h;
      return n >= 2 ? `≈ ${n.toFixed(1)}× ${label.replace(/^a |^the /, "")}s` : `≈ ${label} tall`;
    }
  }
  return null;
}

type ServerDay = {
  date: string; total: number;
  apps: Record<string, number> | null; sec: Record<string, number> | null;
  hours: Record<string, number> | null;
  sessions: { p: string; t: number; c: number; d: number }[] | null;
  px: Record<string, number> | null; pxTotal: number | null; dpi: number | null;
};

export default function ScrollClient() {
  const [native, setNative] = useState<boolean | null>(null);
  const [today, setToday] = useState<ScrollDayStats | null>(null);
  const [localHist, setLocalHist] = useState<Record<string, ScrollDayStats>>({});
  const [serverDays, setServerDays] = useState<ServerDay[]>([]);
  const [stamp, setStamp] = useState<Date | null>(null);
  const [targetM, setTargetM] = useState<number | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("waqt.scrollTargetM") : null;
      return raw != null && +raw > 0 ? +raw : null;
    } catch { return null; }
  });
  const [editingTarget, setEditingTarget] = useState(false);

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
      px: d.px ?? undefined, pxTotal: d.pxTotal ?? undefined, dpi: d.dpi ?? undefined,
    };
    Object.assign(map, localHist);
    if (today) map[today.date] = today;
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [today, localHist, serverDays]);

  const todayM = today ? meters(today) : null;
  const totalSec = Object.values(today?.sec ?? {}).reduce((s, v) => s + v, 0);
  const sessions = today?.sessions ?? [];
  const longest = sessions.reduce<{ p: string; t: number; c: number; d: number } | null>(
    (m, s) => (m === null || s.d > m.d) ? s : m, null);

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
    .map(([pkg, n]) => ({
      name: name(pkg), n,
      sec: today?.sec?.[pkg] ?? 0,
      m: today?.px?.[pkg] && today.dpi ? today.px[pkg] / (today.dpi * 39.3701) : null,
    }))
    .sort((a, b) => (b.m ?? b.n) - (a.m ?? a.n)), [today]);
  const appMax = Math.max(1, ...apps.map((a) => a.m ?? a.n));

  const week = days.slice(0, 7);
  const weekM = week.reduce((s, d) => s + (meters(d) ?? 0), 0);
  const allTimeM = days.reduce((s, d) => s + (meters(d) ?? 0), 0);
  const maxDayM = Math.max(1, ...days.slice(0, 30).map((d) => meters(d) ?? 0));
  const anyDist = days.some((d) => meters(d) != null);
  const cmp = todayM != null && todayM >= 2 ? comparison(todayM) : null;

  // Pace: project today's distance over a 24h day. Honest — labels itself.
  const paceM = todayM != null && todayM >= 5
    ? (todayM / Math.max(60, stamp ? stamp.getHours() * 60 + stamp.getMinutes() : new Date().getHours() * 60 + new Date().getMinutes())) * 1440
    : null;

  const saveTarget = (v: number | null) => {
    setTargetM(v);
    setEditingTarget(false);
    try {
      if (v == null) localStorage.removeItem("waqt.scrollTargetM");
      else localStorage.setItem("waqt.scrollTargetM", String(v));
    } catch { /* private mode */ }
  };

  if (native === false) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center" style={{ color: "var(--color-ink)" }}>
        <Smartphone className="h-8 w-8" style={{ color: "var(--color-accent)" }} />
        <h1 className="mt-4 text-xl font-semibold">Scrolls lives in the app</h1>
        <p className="mt-2 max-w-xs text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Your scroll distance is measured on-device by the Waqt Android app. Install it, turn the counter on in Settings → Guard, and this page fills up.
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
          <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>How far your thumb travelled today</p>
        </div>
      </div>

      {/* Hero — distance is the loud number */}
      <div className="mt-4 rounded-3xl border p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
        <p className="text-5xl font-semibold tabular-nums">
          {today ? (fmtM(todayM) ?? String(today.total)) : "—"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          {today ? (
            <>
              {cmp && <span className="font-medium" style={{ color: "var(--color-ink)" }}>{cmp} · </span>}
              {todayM != null ? "scrolled today" : "swipes today"}
              {totalSec > 0 ? ` · ${fmtSec(totalSec)} in feeds` : ""}
              {` · ${today.total} cards`}
            </>
          ) : "measuring…"}
          {stamp ? ` · as of ${stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { v: today ? String(sessions.length) : "—", l: "sessions" },
            { v: days.length && anyDist ? fmtM(weekM) ?? "—" : "—", l: "this week" },
            { v: days.length && anyDist ? fmtM(allTimeM) ?? "—" : "—", l: "all time" },
          ].map((x) => (
            <div key={x.l} className="rounded-xl border py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-base font-semibold tabular-nums">{x.v}</p>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{x.l}</p>
            </div>
          ))}
        </div>

        {/* Daily target — the tape fills toward it. Stored on this device only. */}
        {todayM != null && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
            {editingTarget ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Daily distance target">
                {[25, 50, 100, 200].map((v) => (
                  <button key={v} onClick={() => saveTarget(v)}
                    className="rounded-md border px-2.5 py-1 text-[11px] tabular-nums"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                    {v} m
                  </button>
                ))}
                <button onClick={() => saveTarget(null)} className="px-2 py-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>off</button>
              </div>
            ) : (
              <button onClick={() => setEditingTarget(true)} className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                {targetM ? `Daily target · ${fmtM(targetM)}` : "Set a daily target"}
              </button>
            )}
            {targetM != null && !editingTarget && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}
                role="progressbar" aria-valuenow={Math.round(Math.min(100, (todayM / targetM) * 100))} aria-valuemin={0} aria-valuemax={100} aria-label="Daily target progress">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (todayM / targetM) * 100)}%`, background: "var(--color-accent)" }} />
              </div>
            )}
            {paceM != null && (
              <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                On pace for ≈{fmtM(paceM)} by midnight{targetM != null ? (paceM > targetM ? " — over your target" : " — under your target") : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Time of day */}
      <Section icon={<Clock className="h-4 w-4" />} title="When you scroll" sub={peakHour >= 0 && Math.max(...hourAvg) > 0 ? `peak around ${fmtT(peakHour * 60)}` : undefined}>
        <div className="flex h-20 items-end gap-[3px]" role="img"
          aria-label={Math.max(...hourAvg) > 0 ? `Average swipes by hour of day; peak around ${fmtT(peakHour * 60)}` : "No hourly data yet"}>
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
                  <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {a.m != null ? `${fmtM(a.m)} · ` : ""}{a.n}{a.sec > 0 ? ` · ${fmtSec(a.sec)}` : ""}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <div className="h-full rounded-full" style={{ width: `${((a.m ?? a.n) / appMax) * 100}%`, background: "var(--color-accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Longest session */}
      {longest && (
        <Section icon={<Ruler className="h-4 w-4" />} title="Longest session" sub="today">
          <p className="text-sm"><b className="tabular-nums">{fmtSec(longest.d)}</b> on {name(longest.p)} — {longest.c} cards passed, started {fmtT(longest.t)}</p>
        </Section>
      )}

      {/* History — metres where available, swipe counts on older days */}
      {days.length > 0 && (
        <Section title={`History${anyDist ? ` · ${fmtM(allTimeM)} all time` : ""}`}>
          <div className="flex h-16 items-end gap-1">
            {days.slice(0, 14).reverse().map((d) => {
              const m = meters(d);
              return (
                <div key={d.date} className="flex-1 rounded-sm" title={`${d.date}: ${m != null ? fmtM(m) : `${d.total} swipes`}`}
                  style={{ height: `${Math.max(4, ((m ?? 0) / maxDayM) * 100)}%`, background: "var(--color-accent)", opacity: d.date === today?.date ? 1 : 0.5 }} />
              );
            })}
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {days.slice(0, 30).map((d) => {
              const m = meters(d);
              const top = Object.entries(d.apps).sort((a, b) => b[1] - a[1])[0];
              return (
                <div key={d.date} className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--color-ink-muted)" }}>{d.date}</span>
                  <span className="tabular-nums">{m != null ? fmtM(m) : `${d.total} swipes`}{top ? ` · ${name(top[0])}` : ""}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <p className="mt-6 text-center text-[10px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Real scroll distance measured by the accessibility service — short-form feeds only.<br />Synced to your account for history; nothing is shared.
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

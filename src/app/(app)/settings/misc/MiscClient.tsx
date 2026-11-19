"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Download, Lightbulb, RefreshCw, Shield, UserRound } from "lucide-react";
import { setCachedPrayerSettings, getCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { getAudioCacheCount, getAudioCacheSize, getDownloadLimitMB, setDownloadLimitMB } from "@/components/audio-player-context";
import { FunFactToggle, FunFactCountdown, PrayerPersonalization, type PrayerSettings } from "../SettingsClient";
import { shieldNativeAvailable, getShieldStatus, setShieldArmed, isShieldArmed, isShieldPausedToday, setShieldPausedToday, openShieldSetting, getScrollStats, isScrollCounterEnabled, setScrollCounterEnabled, type ScrollDayStats } from "@/lib/salah-shield-native";

type Tab = "planner" | "cards" | "downloads" | "personal" | "guard";

const TABS: { id: Tab; label: string }[] = [
  { id: "planner", label: "Planner" },
  { id: "cards", label: "Cards" },
  { id: "downloads", label: "Downloads" },
  { id: "personal", label: "Personal" },
  { id: "guard", label: "Guard" },
];

interface MiscSettings {
  studyStartMin: number;
  studyEndMin: number;
  studyShowGapChips: boolean;
}

export default function MiscClient() {
  const [tab, setTab] = useState<Tab>("planner");
  const [settings, setSettings] = useState<MiscSettings | null>(null);
  // Full prayer-settings payload — the Personal tab seeds from it.
  const [full, setFull] = useState<PrayerSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Seed from the local mirror first — the toggles/sliders work offline
    // instead of staying disabled until the fetch resolves. Deferred so the
    // mount effect doesn't setState synchronously.
    Promise.resolve().then(() => {
      const cached = getCachedPrayerSettings();
      if (!cached) return;
      setSettings({
        studyStartMin: cached.studyStartMin ?? 420,
        studyEndMin: cached.studyEndMin ?? 1320,
        studyShowGapChips: cached.studyShowGapChips === true,
      });
      if (cached.latitude != null && cached.longitude != null && cached.timezone) {
        setFull({
          latitude: String(cached.latitude),
          longitude: String(cached.longitude),
          timezone: cached.timezone,
          calculationMethod: Number(cached.calculationMethod) || 0,
          madhab: cached.madhab ?? null,
          studyStartMin: cached.studyStartMin,
          studyEndMin: cached.studyEndMin,
        });
      }
    });
    fetch("/api/settings/prayer-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setFull(d);
          setSettings({
            studyStartMin: d.studyStartMin ?? 420,
            studyEndMin: d.studyEndMin ?? 1320,
            studyShowGapChips: d.studyShowGapChips === true,
          });
        }
      })
      .catch(() => null);
  }, []);

  async function patch(updates: Record<string, unknown>, local: Partial<MiscSettings>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/prayer-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const next = { ...settings!, ...local };
        setSettings(next);
        // Keep the offline cache warm — the day view reads the window from it.
        try {
          const raw = localStorage.getItem("waqt-prayer-settings");
          const cached = raw ? JSON.parse(raw) : {};
          setCachedPrayerSettings({ ...cached, ...local });
        } catch { /* non-critical */ }
        setMsg("Saved.");
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || "Couldn't save.");
      }
    } catch {
      setMsg("Offline — will retry when you're back.");
    } finally {
      setBusy(false);
    }
  }

  const hourLabel = (m: number) =>
    m === 1440 ? "12:00 AM" : `${Math.floor(m / 60) % 12 || 12}:00 ${m < 720 ? "AM" : "PM"}`;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-5 sm:max-w-2xl sm:px-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)" }}
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Miscellaneous</h1>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Optional tweaks — nothing here needs fixing</p>
        </div>
      </div>

      {/* Tab bar — sections grow here as more misc settings land */}
      <div
        className="mb-5 flex gap-1 overflow-x-auto rounded-xl border p-1"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", scrollbarWidth: "none" }}
        role="tablist"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{
              backgroundColor: tab === id ? "var(--color-paper)" : "transparent",
              color: tab === id ? "var(--color-ink)" : "var(--color-ink-muted)",
              minHeight: 40,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "planner" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Study blocks</p>
          </div>

          {/* Gap chips toggle */}
          <div
            className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3"
            style={{ borderColor: "var(--color-paper-3)" }}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>Free-time chips on the calendar</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                Show &ldquo;+ plan · Nh free&rdquo; in empty gaps on the day timeline.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={settings?.studyShowGapChips ?? false}
              disabled={!settings || busy}
              onClick={() =>
                patch(
                  { studyShowGapChips: !settings!.studyShowGapChips },
                  { studyShowGapChips: !settings!.studyShowGapChips },
                )
              }
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
              style={{
                backgroundColor: settings?.studyShowGapChips === true ? "var(--color-accent)" : "var(--color-paper-3)",
              }}
              aria-label="Toggle free-time chips"
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                style={{
                  backgroundColor: "var(--color-paper)",
                  left: settings?.studyShowGapChips === true ? "22px" : "2px",
                }}
              />
            </button>
          </div>

          {/* Study window */}
          <div
            className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3"
            style={{ borderColor: "var(--color-paper-3)" }}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>Planning window</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                Free gaps are only offered inside these hours — always around salah, never over it.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <select
                value={settings?.studyStartMin ?? 420}
                disabled={!settings || busy}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  patch({ studyStartMin: v }, { studyStartMin: v });
                }}
                className="rounded-md border px-2 py-1.5 text-xs disabled:opacity-50"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                aria-label="Study window start"
              >
                {Array.from({ length: 17 }, (_, i) => (i + 5) * 60).map((m) => (
                  <option key={m} value={m}>{hourLabel(m)}</option>
                ))}
              </select>
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>–</span>
              <select
                value={settings?.studyEndMin ?? 1320}
                disabled={!settings || busy}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  patch({ studyEndMin: v }, { studyEndMin: v });
                }}
                className="rounded-md border px-2 py-1.5 text-xs disabled:opacity-50"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                aria-label="Study window end"
              >
                {Array.from({ length: 13 }, (_, i) => (i + 12) * 60).map((m) => (
                  <option key={m} value={m}>{hourLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>

          {msg && (
            <p className="text-[11px]" style={{ color: msg === "Saved." ? "var(--color-success)" : "var(--color-warmth)" }}>
              {msg}
            </p>
          )}
        </div>
      )}

      {tab === "cards" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Knowledge cards</p>
          </div>
          <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            A new knowledge card appears every 3 hours. Closing with the X lets the card reappear later.
            Tapping &ldquo;Got it&rdquo; marks it as read so it won&rsquo;t appear again.
          </p>
          <FunFactToggle />
          <FunFactCountdown />
        </div>
      )}

      {tab === "downloads" && <OfflineTalksPanel />}

      {tab === "guard" && <SalahGuardPanel />}
      {tab === "guard" && <ScrollCounterPanel />}

      {tab === "personal" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <UserRound className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Personalization</p>
          </div>
          {full ? (
            <PrayerPersonalization initialSettings={full} />
          ) : (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Offline talks storage — moved here from Settings so all downloads live
 *  under Miscellaneous. Refreshes on the audio-cache-changed event + pageshow. */
function OfflineTalksPanel() {
  const [info, setInfo] = useState<{ count: number; sizeBytes: number } | null>(null);
  const [limitMB, setLimitMB] = useState<number>(500);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [count, sizeBytes] = await Promise.all([getAudioCacheCount(), getAudioCacheSize()]);
        if (!cancelled) setInfo({ count, sizeBytes });
      } catch { /* non-critical */ }
      if (!cancelled) setLimitMB(getDownloadLimitMB());
    };
    void refresh();
    window.addEventListener("waqt:audio-cache-changed", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("waqt:audio-cache-changed", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Download className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Offline talks</p>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Downloaded talks are stored on your device for offline listening. When the limit is
        reached, the oldest-played talks are automatically removed.
      </p>

      {info ? (
        <>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Downloaded talks</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{info.count}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Total storage used</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
              {info.sizeBytes > 0 ? `${(info.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "0 MB"}
            </span>
          </div>

          {limitMB > 0 && (
            <div className="mt-1">
              <div className="mb-1 flex items-center justify-between text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                <span>0 MB</span>
                <span>{limitMB >= 1024 ? `${(limitMB / 1024).toFixed(0)} GB` : `${limitMB} MB`} limit</span>
              </div>
              <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.min(100, (info.sizeBytes / (limitMB * 1024 * 1024)) * 100)}%`,
                    backgroundColor: info.sizeBytes > limitMB * 1024 * 1024 * 0.9
                      ? "var(--color-error)"
                      : "var(--color-accent)",
                  }}
                />
              </div>
            </div>
          )}
          {info.count === 0 && (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              No talks downloaded yet. Tap the download icon next to any talk to save it for offline listening.
            </p>
          )}

          <div className="mt-2 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
            <p className="mb-2 text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Download limit</p>
            <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              When the limit is reached, the oldest-played talks are automatically removed to make space.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "500 MB", value: 500 },
                { label: "1 GB", value: 1024 },
                { label: "2 GB", value: 2048 },
                { label: "3 GB", value: 3072 },
                { label: "Unlimited", value: 0 },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => { setDownloadLimitMB(option.value); setLimitMB(option.value); }}
                  className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    borderColor: limitMB === option.value ? "var(--color-accent)" : "var(--color-paper-3)",
                    backgroundColor: limitMB === option.value
                      ? "color-mix(in oklab, var(--color-accent) 10%, transparent)"
                      : "transparent",
                    color: limitMB === option.value ? "var(--color-accent)" : "var(--color-ink-soft)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Loading…</span>
        </div>
      )}
    </div>
  );
}

function SalahGuardPanel() {
  const [armed, setArmed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [accOn, setAccOn] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);
  const [grantFailed, setGrantFailed] = useState(false);
  // Read on mount AND on a short retry — the Capacitor bridge injects after
  // first paint, so a render-time check can freeze "not native" forever
  // (which is why the buttons looked dead).
  const [native, setNative] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const refresh = async () => {
      const ok = shieldNativeAvailable();
      setNative(ok);
      if (ok) {
        setArmed(isShieldArmed());
        setPaused(isShieldPausedToday());
        const s = await getShieldStatus();
        if (s) setAccOn(s.accessibility);
      }
    };
    Promise.resolve().then(refresh).then(() => setMounted(true));
    const t = setInterval(() => {
      attempts++;
      if (!shieldNativeAvailable() && attempts > 12) return;
      void refresh();
    }, 2500);
    return () => clearInterval(t);
  }, []);

  const grantAccessibility = async () => {
    setGrantFailed(false);
    const ok = await openShieldSetting("accessibility");
    if (!ok) {
      // The bridge rejected — usually means the installed APK predates the
      // plugin. Fall back to the app's own details page (generic intent is
      // more widely supported) and show the manual path either way.
      await openShieldSetting("appDetails").catch(() => false);
      setGrantFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Shield className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Salah Guard</p>
      </div>
      <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
        While a prayer window is open and unmarked, every app on this phone is
        covered by the guard — not just Waqt. The only way through is marking
        the prayer (or the small bypass link). Android app only.
      </p>

      {!native && (
        <p className="rounded-xl border px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
          Available in the Waqt Android app.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>Enable Salah Guard</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Blocks all apps until the prayer is marked.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={armed}
          disabled={!mounted || !native}
          onClick={() => {
            const next = !armed;
            setShieldArmed(next);
            setArmed(next);
            if (next && !accOn) void grantAccessibility();
          }}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
          style={{ backgroundColor: armed ? "var(--color-accent)" : "var(--color-paper-3)" }}
          aria-label="Toggle Salah Guard"
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full transition-all" style={{ backgroundColor: "var(--color-paper)", left: armed ? "22px" : "2px" }} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>Accessibility access</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            {accOn ? "Granted — the guard can cover other apps." : "Required — tap to open the system setting and allow Waqt."}
          </p>
        </div>
        {!accOn && native && (
          <button
            onClick={() => void grantAccessibility()}
            className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
          >
            Grant
          </button>
        )}
      </div>
      {grantFailed && (
        <p className="rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed" style={{ borderColor: "#c96b45", color: "#c96b45" }}>
          Couldn&rsquo;t open the setting automatically — open it by hand:
          Settings → Accessibility → Installed apps → Waqt → On.
          If Waqt isn&rsquo;t listed there, this build is older than the guard —
          reinstall the app.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>Pause for today</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Suspends the guard until midnight — an honest escape, not a silent off-switch.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={paused}
          disabled={!mounted || !native}
          onClick={() => { const next = !paused; setShieldPausedToday(next); setPaused(next); }}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
          style={{ backgroundColor: paused ? "var(--color-accent)" : "var(--color-paper-3)" }}
          aria-label="Pause Salah Guard for today"
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full transition-all" style={{ backgroundColor: "var(--color-paper)", left: paused ? "22px" : "2px" }} />
        </button>
      </div>
    </div>
  );
}

const SCROLL_APP_NAMES: Record<string, string> = {
  "com.instagram.android": "Instagram",
  "com.zhiliaoapp.musically": "TikTok",
  "com.ss.android.ugc.trill": "TikTok",
  "com.google.android.youtube": "YouTube",
  "com.snapchat.android": "Snapchat",
  "com.facebook.katana": "Facebook",
  "com.twitter.android": "X",
  "com.x.android": "X",
  "com.threads.android": "Threads",
  "com.reddit.frontpage": "Reddit",
  "com.pinterest": "Pinterest",
};

function ScrollCounterPanel() {
  const [native, setNative] = useState(false);
  const [on, setOn] = useState(true);
  const [today, setToday] = useState<ScrollDayStats | null>(null);
  const [history, setHistory] = useState<Record<string, ScrollDayStats>>({});

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const ok = shieldNativeAvailable();
      if (!live) return;
      setNative(ok);
      setOn(isScrollCounterEnabled());
      if (!ok) return;
      const s = await getScrollStats();
      if (!live || !s) return;
      setToday(s.today);
      setHistory(s.history);
    };
    void refresh();
    const t = setInterval(refresh, 15_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const week = useMemo(() => {
    const days: { label: string; total: number }[] = [];
    const map = { ...history };
    if (today) map[today.date] = today;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "narrow" }), total: map[key]?.total ?? 0 });
    }
    return days;
  }, [today, history]);

  const maxDay = Math.max(1, ...week.map((d) => d.total));
  const appRows = useMemo(() => Object.entries(today?.apps ?? {})
    .map(([pkg, n]) => ({ name: SCROLL_APP_NAMES[pkg] ?? pkg, n, sec: today?.sec?.[pkg] ?? 0 }))
    .sort((a, b) => b.n - a.n), [today]);
  const totalSec = Object.values(today?.sec ?? {}).reduce((s, v) => s + v, 0);
  const fmtSec = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`;

  const stage = (today?.total ?? 0) < 30 ? { t: "fresh", c: "#7fbf6b" } : (today?.total ?? 0) < 100 ? { t: "deep in it", c: "#d4a843" } : { t: "brain rot", c: "#c96b45" };

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Scroll counter</p>
      </div>
      <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
        Counts every feed scroll inside Instagram, TikTok, YouTube, and the rest —
        with a small counter floating over the app. Everything stays on this phone.
      </p>

      {!native && (
        <p className="rounded-xl border px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
          Available in the Waqt Android app.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>Count my scrolls</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Local only — no account, no upload.
          </p>
        </div>
        <button
          role="switch" aria-checked={on} disabled={!native}
          onClick={() => { const next = !on; setScrollCounterEnabled(next); setOn(next); }}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
          style={{ backgroundColor: on ? "var(--color-accent)" : "var(--color-paper-3)" }}
          aria-label="Toggle scroll counter"
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full transition-all" style={{ backgroundColor: "var(--color-paper)", left: on ? "22px" : "2px" }} />
        </button>
      </div>

      {native && (
        <div className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-semibold tabular-nums" style={{ color: stage.c }}>
              {today?.total ?? 0}
            </p>
            <p className="text-[11px]" style={{ color: stage.c }}>{stage.t}</p>
          </div>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            scrolls today{totalSec > 0 ? ` · ${fmtSec(totalSec)} in feed apps` : ""}
          </p>

          {appRows.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {appRows.map((a) => (
                <div key={a.name} className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--color-ink)" }}>{a.name}</span>
                  <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {a.n}{a.sec > 0 ? ` · ${fmtSec(a.sec)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-end gap-1.5" style={{ height: 44 }}>
            {week.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="w-full rounded-sm" title={`${d.total}`}
                  style={{ height: Math.max(3, (d.total / maxDay) * 30), background: d.total ? "var(--color-accent)" : "var(--color-paper-3)", opacity: 0.85 }} />
                <span className="text-[9px]" style={{ color: "var(--color-ink-muted)" }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

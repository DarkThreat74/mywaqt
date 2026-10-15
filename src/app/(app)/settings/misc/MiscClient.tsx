"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Download, Lightbulb, RefreshCw, UserRound } from "lucide-react";
import { setCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { getAudioCacheCount, getAudioCacheSize, getDownloadLimitMB, setDownloadLimitMB } from "@/components/audio-player-context";
import { FunFactToggle, FunFactCountdown, PrayerPersonalization, type PrayerSettings } from "../SettingsClient";

type Tab = "planner" | "cards" | "downloads" | "personal";

const TABS: { id: Tab; label: string }[] = [
  { id: "planner", label: "Planner" },
  { id: "cards", label: "Cards" },
  { id: "downloads", label: "Downloads" },
  { id: "personal", label: "Personal" },
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
        className="mb-5 flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        role="tablist"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
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

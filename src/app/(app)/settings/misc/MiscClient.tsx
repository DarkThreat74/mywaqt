"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, LayoutGrid, Lightbulb } from "lucide-react";
import { setCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { NavTabsEditor, FunFactToggle, FunFactCountdown } from "../SettingsClient";

type Tab = "planner" | "navigation" | "cards";

const TABS: { id: Tab; label: string }[] = [
  { id: "planner", label: "Planner" },
  { id: "navigation", label: "Navigation" },
  { id: "cards", label: "Cards" },
];

interface MiscSettings {
  studyStartMin: number;
  studyEndMin: number;
  studyShowGapChips: boolean;
}

export default function MiscClient() {
  const [tab, setTab] = useState<Tab>("planner");
  const [settings, setSettings] = useState<MiscSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/prayer-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setSettings({
            studyStartMin: d.studyStartMin ?? 420,
            studyEndMin: d.studyEndMin ?? 1320,
            studyShowGapChips: d.studyShowGapChips !== false,
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
              aria-checked={settings?.studyShowGapChips ?? true}
              disabled={!settings || busy}
              onClick={() =>
                patch(
                  { studyShowGapChips: !settings!.studyShowGapChips },
                  { studyShowGapChips: !settings!.studyShowGapChips },
                )
              }
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
              style={{
                backgroundColor: settings?.studyShowGapChips !== false ? "var(--color-accent)" : "var(--color-paper-3)",
              }}
              aria-label="Toggle free-time chips"
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                style={{
                  backgroundColor: "var(--color-paper)",
                  left: settings?.studyShowGapChips !== false ? "22px" : "2px",
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

      {tab === "navigation" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <LayoutGrid className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Navigation tabs</p>
          </div>
          <NavTabsEditor />
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
    </div>
  );
}

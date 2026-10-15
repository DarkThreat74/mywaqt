"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, MoonStar, Pause, Play } from "lucide-react";
import {
  getShieldStatus,
  openShieldSetting,
  getShieldBlockedApps,
  setShieldBlockedApps,
  isShieldArmed,
  setShieldArmed,
  isShieldPausedToday,
  setShieldPausedToday,
  getShieldPrayers,
  setShieldPrayers,
  shieldNativeAvailable,
  SHIELD_BLOCKABLE_APPS,
  SHIELD_PRAYERS,
  type ShieldPermissionKey,
  type ShieldStatus,
} from "@/lib/salah-shield-native";
import { onAppStateChange } from "@/lib/native-bridge";

/**
 * Salah Shield — the settings home. Reachable after onboarding via the
 * Apps drawer (Store → Prayer). The gate + prompt live in
 * components/salah-shield.tsx; this page owns arming, pause, per-prayer
 * selection, permissions, and the blocked-app list.
 * Android-only feature — on web it renders an explainer card.
 */

const PERMS: { key: ShieldPermissionKey; title: string; why: string; hint: string; required?: boolean }[] = [
  {
    key: "accessibility",
    title: "Accessibility service",
    why: "Lets Waqt see which app you opened so the shield can cover it during salah. Detection stays on your device.",
    required: true,
    hint: "Find \"Waqt\" under Downloaded services → turn it on → allow.",
  },
  {
    key: "battery",
    title: "Unrestricted battery",
    why: "Stops Android sleeping Waqt between prayer windows — without it the shield may wake late.",
    hint: "Tap \"Allow\" on the dialog.",
  },
  {
    key: "usageAccess",
    title: "Usage access",
    why: "Reads per-app screen time so the shield can show what it saved you.",
    hint: "Find \"Waqt\" → enable \"Permit usage access\".",
  },
  {
    key: "notifications",
    title: "Notifications",
    why: "Prayer-window alerts.",
    hint: "Toggle notifications on for Waqt.",
  },
];

export default function ShieldClient() {
  const [native] = useState(() => shieldNativeAvailable());
  const [status, setStatus] = useState<ShieldStatus | null>(null);
  const [armed, setArmedState] = useState(() => isShieldArmed());
  const [paused, setPaused] = useState(() => isShieldPausedToday());
  const [prayers, setPrayers] = useState<Set<string>>(() => getShieldPrayers());
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set(getShieldBlockedApps() ?? SHIELD_BLOCKABLE_APPS.map((a) => a.pkg)));
  const [opening, setOpening] = useState<ShieldPermissionKey | null>(null);

  const refresh = useCallback(async () => {
    const s = await getShieldStatus();
    if (s) setStatus(s);
  }, []);

  useEffect(() => {
    if (!native) return;
    const t = setTimeout(refresh, 0);
    let off = () => {};
    void onAppStateChange((active) => { if (active) void refresh(); }).then((f) => { off = f; });
    const onVis = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); off(); document.removeEventListener("visibilitychange", onVis); };
  }, [native, refresh]);

  // The gate component re-evaluates on this event — arming/pausing here
  // takes effect immediately, not on the next 45s tick.
  const ping = () => window.dispatchEvent(new CustomEvent("waqt:prayer-updated"));

  function toggleArmed() {
    const next = !armed;
    setShieldArmed(next);
    setArmedState(next);
    if (next && !status?.accessibility) void openShieldSetting("accessibility");
    ping();
  }
  function togglePause() {
    const next = !paused;
    setShieldPausedToday(next);
    setPaused(next);
    ping();
  }
  function togglePrayer(p: string) {
    setPrayers((prev) => {
      const next = new Set(prev);
      if (next.has(p) && next.size > 1) next.delete(p); else next.add(p);
      setShieldPrayers(next);
      ping();
      return next;
    });
  }
  function toggleApp(pkg: string) {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg); else next.add(pkg);
      const all = SHIELD_BLOCKABLE_APPS.map((a) => a.pkg);
      setShieldBlockedApps(all.every((p) => next.has(p)) ? null : [...next]);
      ping();
      return next;
    });
  }

  async function grant(key: ShieldPermissionKey) {
    setOpening(key);
    await openShieldSetting(key);
    setTimeout(() => { void refresh(); setOpening(null); }, 1200);
  }

  if (!native) {
    return (
      <div className="mx-auto max-w-md px-4 pt-14 text-center">
        <MoonStar className="mx-auto h-10 w-10" style={{ color: "var(--color-accent)" }} />
        <h1 className="mt-4 text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Salah Shield</h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          While a prayer window is open and unmarked, Salah Shield covers the apps that pull you away —
          marking the prayer is the only key. Your choices never leave the device.
        </p>
        <p className="mt-4 rounded-xl border px-4 py-3 text-xs leading-relaxed" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>
          Blocking other apps needs the Android app (Accessibility service). Open Waqt in the app and
          you&apos;ll find Shield here — it&apos;s also offered during onboarding.
        </p>
      </div>
    );
  }

  const ready = status?.accessibility === true;

  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-6">
      <div className="flex items-center gap-3">
        <MoonStar className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Salah Shield</h1>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {ready ? (paused ? "Paused for today" : armed ? "On — covering your apps during prayer windows" : "Ready — turn it on to start") : "Needs the accessibility switch to work"}
          </p>
        </div>
        {/* Master toggle */}
        <button
          onClick={toggleArmed}
          aria-pressed={armed}
          aria-label="Toggle Salah Shield"
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ backgroundColor: armed ? "var(--color-accent)" : "var(--color-paper-3)" }}
        >
          <span className="absolute top-1 h-4 w-4 rounded-full bg-white transition-transform" style={{ left: armed ? 24 : 4 }} />
        </button>
      </div>

      {/* Pause for today — the competitor feature; a pause never becomes a
          forgotten week since it expires at midnight. */}
      {armed && (
        <button
          onClick={togglePause}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
          style={{
            borderColor: paused ? "var(--color-accent)" : "var(--color-paper-3)",
            backgroundColor: paused ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "var(--color-paper-2)",
            color: paused ? "var(--color-accent)" : "var(--color-ink-soft)",
          }}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {paused ? "Resume shield" : "Pause for today"}
        </button>
      )}

      {/* Which prayers */}
      <p className="mb-1.5 mt-6 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
        Windows covered
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SHIELD_PRAYERS.map((p) => {
          const on = prayers.has(p);
          return (
            <button
              key={p}
              onClick={() => togglePrayer(p)}
              aria-pressed={on}
              className="rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: on ? "color-mix(in oklab, var(--color-accent) 12%, transparent)" : "transparent",
                color: on ? "var(--color-ink)" : "var(--color-ink-muted)",
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Permissions */}
      <p className="mb-1.5 mt-6 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
        Permissions
      </p>
      <div className="flex flex-col gap-2">
        {PERMS.map((row) => {
          const done = status?.[row.key] === true;
          return (
            <div
              key={row.key}
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: done ? "var(--color-accent)" : "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: done ? "var(--color-accent)" : "var(--color-paper-3)",
                    backgroundColor: done ? "var(--color-accent)" : "transparent",
                    color: done ? "var(--color-paper)" : "transparent",
                  }}
                  aria-hidden
                >
                  <Check className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {row.title}
                    {row.required && !done && (
                      <span className="ml-2 text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-warmth)" }}>required</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{row.why}</p>
                  {!done && opening === row.key && (
                    <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{row.hint}</p>
                  )}
                </div>
                {!done && (
                  <button
                    onClick={() => void grant(row.key)}
                    className="flex shrink-0 items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                  >
                    {opening === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Open<ChevronRight className="h-3.5 w-3.5" /></>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Blocked apps */}
      <p className="mb-1.5 mt-6 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
        Apps covered ({blocked.size})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SHIELD_BLOCKABLE_APPS.map((a) => {
          const on = blocked.has(a.pkg);
          return (
            <button
              key={a.pkg}
              onClick={() => toggleApp(a.pkg)}
              aria-pressed={on}
              className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
              style={{
                borderColor: on ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: on ? "color-mix(in oklab, var(--color-accent) 12%, transparent)" : "transparent",
                color: on ? "var(--color-ink)" : "var(--color-ink-muted)",
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[10px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Everything stays on this device — Waqt never learns which apps you chose.
      </p>
    </div>
  );
}

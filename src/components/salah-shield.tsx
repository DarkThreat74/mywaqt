"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MoonStar } from "lucide-react";
import { openPrayer, prayerDisplayName, getPrayerWindowStart, getPrayerWindowEnd, type PrayerKey, type PrayerTimings } from "@/lib/prayer/checkin";
import { shieldNativeAvailable, syncShieldSchedule, shieldMarkPrayed, openShieldSetting, consumeShieldPrayer, getShieldBlockedApps, isShieldPausedToday, setShieldPausedToday, getShieldPrayers, SHIELD_PRAYERS } from "@/lib/salah-shield-native";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { upsertPrayerLogToCache } from "@/lib/offline/cache-writers";
import { useUISFX } from "@/components/uisfx-provider";
import { hapticNotification } from "@/lib/native-bridge";

/**
 * Salah Shield — the in-app half of Falah-style distraction blocking.
 *
 * When a prayer window is open and the prayer is unmarked, the app locks
 * behind this screen. The only release is marking the prayer (the check-in
 * endpoint rejects hayd days with `excused`, which also releases — the
 * obligation is lifted, not failed).
 *
 * A PWA can't block OTHER apps — that needs the native entitlement
 * (Android Accessibility/overlay, iOS ManagedSettings). This component is
 * the portable core; when the Capacitor shell ships, the native bridge
 * drives the same gate while this handles in-app enforcement.
 *
 * Opt-in per device: localStorage `waqt:salah-shield`
 *   unset    → one soft prompt the first time an unmarked window is seen
 *   "1"      → armed
 *   "0"      → off (quiet link on the gate + the prompt re-arms after 14d)
 */

const LS_KEY = "waqt:salah-shield";
const REASK_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Due {
  prayer: PrayerKey;
  /** The prayer_log date this window belongs to — post-midnight Isha is yesterday's. */
  logDate: string;
}

export default function SalahShield() {
  const { play } = useUISFX();
  // Opt-in read once at mount — "ask" re-arms 14 days after a decline.
  const [armed, setArmed] = useState<"on" | "off" | "ask">(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw === "1") return "on";
      if (raw === "0") return "off";
      if (raw?.startsWith("0:") && Date.now() - Number(raw.slice(2)) < REASK_AFTER_MS) return "off";
      return "ask";
    } catch {
      return "ask";
    }
  });
  const [due, setDue] = useState<Due | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    // Salah Shield is a native feature — the blocking half lives in the
    // Android accessibility service. On web/PWA there's nothing real to
    // arm, so no prompt, no gate, no interval work.
    if (!shieldNativeAvailable()) { setDue(null); return; }
    // Paused for today → gate down, native side disarmed too.
    const paused = isShieldPausedToday();
    try {
      const { getOfflineDB } = await import("@/lib/offline/db");
      const db = getOfflineDB();
      const now = new Date();
      const today = localDateStr(now);
      const timings = (await db.prayerTimes.get(today)) as (PrayerTimings & { fajr: string }) | undefined;
      if (!timings) { setDue(null); return; }

      const minutes = now.getHours() * 60 + now.getMinutes();
      const enabledPrayers = getShieldPrayers();

      // Push the schedule to the native side every cycle — today AND
      // tomorrow, as absolute epoch ms. The accessibility service reads
      // SharedPreferences, never the network, so blocking stays correct
      // through offline, restarts, and even a full day without opening the
      // app. Windows that have all ended are inert — stale data can't fire.
      {
        const enabled = !paused && (() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } })();
        const logs = await db.prayerLogs.where("date").equals(today).toArray();
        const marked = new Set(logs.filter((l) => l.status !== "pending").map((l) => l.prayerName));
        const windows: import("@/lib/salah-shield-native").ShieldWindow[] = [];
        for (let dayOff = 0; dayOff <= 1; dayOff++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOff);
          const dayStr = localDateStr(d);
          const t = dayOff === 0
            ? timings
            : ((await db.prayerTimes.get(dayStr)) as PrayerTimings | undefined);
          if (!t) continue;
          const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          for (const p of SHIELD_PRAYERS) {
            if (!enabledPrayers.has(p)) continue;
            windows.push({
              name: p,
              startMs: midnight + getPrayerWindowStart(p, t) * 60_000,
              endMs: midnight + getPrayerWindowEnd(p, t) * 60_000,
              marked: dayOff === 0 && marked.has(p),
            });
          }
        }
        void syncShieldSchedule({
          enabled,
          windows,
          blockedApps: getShieldBlockedApps() ?? undefined,
        });
        // Landed here from the shield overlay's button — consume the
        // deep-link prayer once and nudge any open check-in UI toward it.
        const launchedPrayer = await consumeShieldPrayer();
        if (launchedPrayer) {
          window.dispatchEvent(new CustomEvent("waqt:prayer-updated", { detail: { prayerName: launchedPrayer } }));
        }
      }

      if (paused) { setDue(null); return; }
      const prayer = openPrayer(minutes, timings);
      if (!prayer || !enabledPrayers.has(prayer)) { setDue(null); return; }

      // Post-midnight Isha belongs to yesterday's log (same convention as
      // the prayer dashboard — the night stays whole past midnight).
      const logDate =
        prayer === "isha" && minutes < (Number(timings.fajr?.split(":")[0]) || 0) * 60
          ? localDateStr(new Date(now.getTime() - 86400e3))
          : today;

      const log = await db.prayerLogs.get(`${logDate}_${prayer}`);
      const resolved = log && log.status !== "pending";
      setDue(resolved ? null : { prayer, logDate });
    } catch {
      // Dexie empty / unavailable — shield stays down rather than trapping
      // the user on bad data.
      setDue(null);
    }
  }, []);

  useEffect(() => {
    // First check is deferred a tick — evaluate() sets state, and calling it
    // synchronously in the effect body trips cascading-render rules.
    const first = setTimeout(evaluate, 0);
    const t = setInterval(evaluate, 45_000);
    const onVis = () => { if (!document.hidden) void evaluate(); };
    const onUpdated = () => void evaluate();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("waqt:prayer-updated", onUpdated);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("waqt:prayer-updated", onUpdated);
    };
  }, [evaluate]);

  function decline() {
    try { localStorage.setItem(LS_KEY, `0:${Date.now()}`); } catch { /* ignore */ }
    setArmed("off");
  }

  function arm() {
    try { localStorage.setItem(LS_KEY, "1"); } catch { /* ignore */ }
    setArmed("on");
    // On Android, arming alone blocks nothing — take them straight to the
    // accessibility toggle (the only permission the gate can't work without).
    if (shieldNativeAvailable()) void openShieldSetting("accessibility");
  }

  async function markPrayed() {
    if (!due || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/prayer-log/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: due.logDate, prayerName: due.prayer, status: "prayed" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const status = "prayed";
        upsertPrayerLogToCache(due.logDate, due.prayer, status, null);
        invalidateApiCache("/api/prayer-log");
        play("check");
        void hapticNotification("success");
        void shieldMarkPrayed(due.prayer);
        window.dispatchEvent(new CustomEvent("waqt:prayer-updated", {
          detail: { date: due.logDate, prayerName: due.prayer },
        }));
        setDue(null);
      } else if (data.excused) {
        // Hayd-covered day — obligation lifted, release the gate.
        upsertPrayerLogToCache(due.logDate, due.prayer, "excused", null);
        setDue(null);
      } else {
        setError(data.error || "Couldn't mark it — try again.");
      }
    } catch {
      setError("You're offline — it'll save when you're back.");
      // The SW queues the write; reflect it locally so the gate still releases.
      upsertPrayerLogToCache(due.logDate, due.prayer, "prayed", null);
      setDue(null);
    } finally {
      setBusy(false);
    }
  }

  if (!due) return null;
  const name = prayerDisplayName(due.prayer, due.logDate);

  // First unmarked window with no preference — soft prompt, not a lock.
  if (armed === "ask") {
    return (
      <div
        className="fixed inset-x-4 bottom-24 z-[90] mx-auto max-w-sm rounded-2xl border p-4 shadow-lg lg:bottom-8"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
        role="dialog"
        aria-label="Salah Shield"
      >
        <div className="flex items-start gap-3">
          <MoonStar className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--color-accent)" }} />
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              Salah Shield — hold the app while {name} is due
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
              When a prayer window opens, the app stays locked until you mark it prayed. Nothing else unlocks it.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={arm}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
              >
                Turn it on
              </button>
              <button
                onClick={decline}
                className="rounded-lg px-3 py-1.5 text-xs"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (armed !== "on") return null;

  // The gate. Full-screen, topmost, no snooze — marking prayed is the exit.
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "var(--color-paper)" }}
      role="alertdialog"
      aria-modal="true"
      aria-label={`${name} is due`}
    >
      <MoonStar className="h-10 w-10" style={{ color: "var(--color-accent)" }} />
      <p className="mt-6 text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
        {name} is due
      </p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
        Salah Shield is on. The window is open — mark it prayed to continue.
      </p>
      <button
        onClick={markPrayed}
        disabled={busy}
        className="mt-8 flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 48 }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        I prayed {name}
      </button>
      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--color-error)" }} role="alert">{error}</p>
      )}
      <div className="mt-10 flex items-center gap-4 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
        <Link href="/settings" className="underline underline-offset-2">
          Prayer times look off?
        </Link>
        <button
          onClick={() => { setShieldPausedToday(true); setDue(null); }}
          className="underline underline-offset-2"
        >
          Pause for today
        </button>
        <Link href="/shield" className="underline underline-offset-2">
          Shield settings
        </Link>
      </div>
    </div>
  );
}

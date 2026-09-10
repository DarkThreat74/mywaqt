"use client";

import { useState, useEffect } from "react";
import { Check, X, Loader2, MapPin } from "lucide-react";
import { shouldShowMasjidQuestion, getPrayerWindowState, getPrayerWindowStart, type PrayerKey, type PrayerTimings } from "@/lib/prayer/checkin";
import { getSunnahsForFard, type SunnahDefinition } from "@/lib/prayer/sunnahs";
import { useUISFX } from "@/components/uisfx-provider";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { hapticNotification, hapticImpact } from "@/lib/native-bridge";
import { upsertSunnahLogToCache } from "@/lib/offline/cache-writers";

interface PrayerCheckinPopup {
  prayer: PrayerKey;
  prayerLabel: string;
  date: string;
  timezone: string;
  madhab?: string;
  timings: PrayerTimings;
  onClose: () => void;
  onCheckedIn: (result: { status: string; wentToMasjid: boolean | null }) => void;
  existingStatus?: string;
}

export default function PrayerCheckinPopup({
  prayer,
  prayerLabel,
  date,
  timezone,
  madhab = "standard",
  timings,
  onClose,
  onCheckedIn,
  existingStatus,
}: PrayerCheckinPopup) {
  const { play } = useUISFX();
  const [step, setStep] = useState<"main" | "masjid" | "sunnah">("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sunnahLogs, setSunnahLogs] = useState<Record<string, boolean>>({});
  const [sunnahLoading, setSunnahLoading] = useState<string | null>(null);
  // Track whether this is a late log (window ended) to skip sunnahs
  const [isLateLog, setIsLateLog] = useState(false);

  // Get current time in user's timezone
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: timezone, hour12: false });
  const timeMatch = localStr.match(/(\d+):(\d+)/);
  const currentMinutes = timeMatch ? parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]) : now.getHours() * 60 + now.getMinutes();

  // Today's date in the user's timezone (YYYY-MM-DD)
  const todayInTz = now.toLocaleDateString("en-CA", { timeZone: timezone });
  // If viewing a past day, the prayer window has already ended — never "before"
  const isPastDay = date < todayInTz;
  // If viewing a future day, the prayer window hasn't started yet — never "ended" or "open"
  const isFutureDay = date > todayInTz;

  const showMasjidDuringWindow = shouldShowMasjidQuestion(prayer, currentMinutes, timings);
  const rawWindowState = getPrayerWindowState(prayer, currentMinutes, timings);
  // For past days, "before" is impossible — treat as "ended" so logging is allowed
  // For future days, "open"/"ended" is impossible — treat as "before" so logging is blocked
  const windowState = isFutureDay
    ? "before"
    : isPastDay && rawWindowState === "before"
      ? "ended"
      : rawWindowState;
  const windowOpen = windowState === "open";
  const windowEnded = windowState === "ended";
  // Treat both "prayed" and "assumed_prayed" as already prayed (benefit of the doubt)
  const alreadyPrayed = existingStatus === "prayed" || existingStatus === "assumed_prayed";

  // Sunnah definitions for this prayer
  const sunnahDefs = getSunnahsForFard(prayer, madhab);

  // Format the start time for the "hasn't started yet" message
  let startTimeStr = "";
  if (windowState === "before") {
    const startMinutes = getPrayerWindowStart(prayer, timings);
    const startH = Math.floor(startMinutes / 60);
    const startM = startMinutes % 60;
    const period = startH >= 12 ? "PM" : "AM";
    const displayH = startH === 0 ? 12 : startH > 12 ? startH - 12 : startH;
    startTimeStr = `${displayH}:${String(startM).padStart(2, "0")} ${period}`;
  }

  // Fetch existing sunnah logs when popup opens
  useEffect(() => {
    if (sunnahDefs.length === 0) return;
    (async () => {
      try {
        const res = await fetch(`/api/prayer-log/sunnah?date=${date}`);
        if (res.ok) {
          const data = await res.json().catch(() => []);
          if (!Array.isArray(data)) return;
          const map: Record<string, boolean> = {};
          for (const log of data) {
            if (log.prayed) map[log.sunnahKey] = true;
          }
          setSunnahLogs(map);
        }
      } catch {
        // ignore
      }
    })();
  }, [date, sunnahDefs.length]);

  async function checkIn(wentToMasjid: boolean | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prayer-log/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          prayerName: prayer,
          status: "prayed",
          wentToMasjid: wentToMasjid,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        invalidateApiCache("/api/prayer-log");
        // Only show sunnah step if:
        // 1. There are sunnahs for this prayer
        // 2. This is NOT a late log (window was open when user confirmed)
        if (sunnahDefs.length > 0 && !isLateLog) {
          setStep("sunnah");
          setLoading(false);
        } else {
          play("check");
          void hapticNotification("success");
          onCheckedIn({ status: data.status, wentToMasjid: data.wentToMasjid });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to check in.");
        play("error");
        void hapticNotification("error");
        setLoading(false);
      }
    } catch {
      setError("Network error.");
      play("error");
      void hapticNotification("error");
      setLoading(false);
    }
  }

  async function handleToggleSunnah(sunnah: SunnahDefinition) {
    const isLogged = sunnahLogs[sunnah.key] === true;
    setSunnahLoading(sunnah.key);
    try {
      const res = await fetch("/api/prayer-log/sunnah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, sunnahKey: sunnah.key, prayed: !isLogged }),
      });
      if (res.ok) {
        invalidateApiCache("/api/prayer-log");
        setSunnahLogs((prev) => ({ ...prev, [sunnah.key]: !isLogged }));
        upsertSunnahLogToCache(date, sunnah.key, !isLogged);
        void hapticImpact("light");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update sunnah.");
        setTimeout(() => setError(null), 4000);
      }
    } catch {
      setError("Network error.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setSunnahLoading(null);
    }
  }

  // During the active window: "Did you pray?" → masjid (if in masjid window) → sunnahs
  function handlePrayedYesDuringWindow() {
    if (showMasjidDuringWindow) {
      setStep("masjid");
    } else {
      checkIn(null);
    }
  }

  // After the window ended: "Did you forget to log?" → always ask masjid → no sunnahs
  function handleForgotToLogYes() {
    setIsLateLog(true);
    setStep("masjid");
  }

  function handleUndo() {
    setLoading(true);
    setError(null);
    fetch("/api/prayer-log/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        prayerName: prayer,
        status: "pending",
        wentToMasjid: false,
      }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then(() => {
        invalidateApiCache("/api/prayer-log");
        play("undo");
        void hapticImpact("light");
        onCheckedIn({ status: "pending", wentToMasjid: null });
      })
      .catch(() => {
        setError("Network error.");
        play("error");
        setLoading(false);
      });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={prayerLabel}
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-paper-3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
            {prayerLabel}
          </h2>
          <button
            onClick={() => { play("close"); onClose(); }}
            className="min-h-11 min-w-11 rounded-lg p-2 transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div
            className="mb-3 rounded-lg border p-2.5 text-xs"
            style={{
              borderColor: "var(--color-warmth)",
              backgroundColor: "color-mix(in oklab, var(--color-warmth) 10%, transparent)",
              color: "var(--color-warmth)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── State: prayer hasn't started yet — NO logging allowed ── */}
        {step === "main" && !alreadyPrayed && windowState === "before" && (
          <div className="text-center">
            <p className="mb-3 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              {prayerLabel} hasn&apos;t started yet.
            </p>
            <p className="mb-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              It begins at {startTimeStr}. Check back then, in sha&apos; Allah.
            </p>
            <button
              onClick={onClose}
              className="min-h-11 w-full rounded-lg border py-2.5 text-sm font-medium transition-colors"
              style={{
                borderColor: "var(--color-paper-3)",
                color: "var(--color-ink-muted)",
              }}
            >
              Close
            </button>
          </div>
        )}

        {/* ── State: window open — "Did you pray?" ── */}
        {step === "main" && !alreadyPrayed && windowOpen && (
          <>
            <p className="mb-4 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              Did you pray {prayerLabel}?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePrayedYesDuringWindow}
                disabled={loading}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-success)",
                  backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)",
                  color: "var(--color-success)",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Yes, I prayed
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="min-h-11 flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-paper-3)",
                  color: "var(--color-ink-muted)",
                }}
              >
                Not yet
              </button>
            </div>
          </>
        )}

        {/* ── State: window ended — "Did you forget to log?" ── */}
        {step === "main" && !alreadyPrayed && windowEnded && (
          <div className="text-center">
            <p className="mb-3 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              The {prayerLabel} window has ended.
            </p>
            <p className="mb-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Did you forget to log it?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleForgotToLogYes}
                disabled={loading}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-success)",
                  backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)",
                  color: "var(--color-success)",
                }}
              >
                <Check className="h-4 w-4" />
                Yes, I forgot to log
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="min-h-11 flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-paper-3)",
                  color: "var(--color-ink-muted)",
                }}
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* ── State: already prayed (or assumed_prayed) — show confirmation + undo ── */}
        {step === "main" && alreadyPrayed && (
          <>
            <div
              className="mb-4 flex items-center gap-2 rounded-lg border p-3"
              style={{
                borderColor: "var(--color-success)",
                backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)",
              }}
            >
              <Check className="h-4 w-4 shrink-0" style={{ color: "var(--color-success)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-success)" }}>
                You prayed {prayerLabel}. In sha&apos; Allah.
              </span>
            </div>
            {/* Only show sunnah logging if the window is still open */}
            {sunnahDefs.length > 0 && windowOpen && (
              <button
                onClick={() => setStep("sunnah")}
                className="mb-2 min-h-11 w-full rounded-lg border py-2.5 text-sm font-medium transition-colors"
                style={{
                  borderColor: "var(--color-accent)",
                  color: "var(--color-accent)",
                }}
              >
                Log sunnah prayers
              </button>
            )}
            <button
              onClick={handleUndo}
              disabled={loading}
              className="min-h-11 w-full rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                borderColor: "var(--color-paper-3)",
                color: "var(--color-ink-muted)",
              }}
            >
              {loading ? "Undoing..." : "Undo"}
            </button>
          </>
        )}

        {/* ── Step: masjid question ── */}
        {step === "masjid" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
              <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                Did you pray in the masjid?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => checkIn(true)}
                disabled={loading}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-accent)",
                  backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
                  color: "var(--color-accent)",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Yes, at the masjid
              </button>
              <button
                onClick={() => checkIn(false)}
                disabled={loading}
                className="min-h-11 flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--color-paper-3)",
                  color: "var(--color-ink-soft)",
                }}
              >
                Prayed at home
              </button>
            </div>
            <button
              onClick={() => setStep("main")}
              disabled={loading}
              className="mt-2 min-h-11 w-full text-center text-xs font-medium transition-colors"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Back
            </button>
          </>
        )}

        {/* ── Step: sunnah logging (only shown for in-window logs) ── */}
        {step === "sunnah" && (
          <>
            <div
              className="mb-4 flex items-center gap-2 rounded-lg border p-3"
              style={{
                borderColor: "var(--color-success)",
                backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)",
              }}
            >
              <Check className="h-4 w-4 shrink-0" style={{ color: "var(--color-success)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-success)" }}>
                {prayerLabel} logged. Did you pray any sunnahs?
              </span>
            </div>

            <div className="mb-4 space-y-2">
              {sunnahDefs.map((sunnah) => {
                const isLogged = sunnahLogs[sunnah.key] === true;
                const isLoading = sunnahLoading === sunnah.key;
                return (
                  <button
                    key={sunnah.key}
                    onClick={() => handleToggleSunnah(sunnah)}
                    disabled={isLoading}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
                    style={{
                      borderColor: isLogged ? "var(--color-success)" : "var(--color-paper-3)",
                      backgroundColor: isLogged ? "color-mix(in oklab, var(--color-success) 8%, transparent)" : "transparent",
                    }}
                  >
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: isLogged ? "var(--color-success)" : "var(--color-paper-3)",
                        backgroundColor: isLogged ? "var(--color-success)" : "transparent",
                      }}
                    >
                      {isLogged && <Check className="h-3.5 w-3.5" style={{ color: "var(--color-paper)" }} />}
                      {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                        {sunnah.label}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        {sunnah.position === "before" ? "Before fard" : sunnah.position === "after" ? "After fard" : "Standalone"}
                        {" · "}
                        {sunnah.category === "muakkadah" ? "Confirmed Sunnah" :
                         sunnah.category === "ghayr_muakkadah" ? "Non-confirmed" :
                         sunnah.category === "wajib" ? "Wajib" :
                         sunnah.category === "raghibah" ? "Raghibah" : "Recommended"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => onCheckedIn({ status: "prayed", wentToMasjid: null })}
              className="min-h-11 w-full rounded-lg border py-2.5 text-sm font-medium transition-colors"
              style={{
                borderColor: "var(--color-paper-3)",
                color: "var(--color-ink-soft)",
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

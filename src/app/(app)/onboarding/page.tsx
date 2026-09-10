"use client";

import { useState } from "react";
import Link from "next/link";

import { MapPin, Bell, ArrowRight, Check, Loader2, User, Shield } from "lucide-react";

type Step = "terms" | "name" | "location" | "madhab" | "notifications" | "done";

export default function OnboardingWizard() {
  const [step, setStep] = useState<Step>("terms");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // router removed — using window.location.href for reliable hard navigation

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Name state
  const [displayName, setDisplayName] = useState("");

  // Location state
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [timezone, setTimezone] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "getting" | "done">("idle");

  // Madhab state
  const [madhab, setMadhab] = useState<string>("standard");

  // Notification state
  const [earlyMid, setEarlyMid] = useState("push");
  const [finalReminder, setFinalReminder] = useState("push");
  const [otherReminders, setOtherReminders] = useState("push");

  function handleGetLocation() {
    setLocationStatus("getting");
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLocationStatus("idle");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latVal = position.coords.latitude;
        const lngVal = position.coords.longitude;
        setLat(latVal);
        setLng(lngVal);
        // Look up timezone from coordinates for accuracy (handles VPN/misconfigured system tz)
        try {
          const tzRes = await fetch(
            `https://api.latlng.work/v1/timezone?lat=${latVal}&lng=${lngVal}`,
          );
          if (tzRes.ok) {
            const tzData = await tzRes.json();
            if (tzData.timezone) {
              setTimezone(tzData.timezone);
              setLocationStatus("done");
              return;
            }
          }
        } catch {
          // Fall back to browser timezone
        }
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
        setLocationStatus("done");
      },
      (err) => {
        setError(err.message || "Failed to get location.");
        setLocationStatus("idle");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  async function saveLocation() {
    if (lat === null || lng === null) return;
    setPending(true);
    setError(null);
    try {
      // Save prayer settings (with default madhab — will be updated in madhab step)
      const res = await fetch("/api/onboarding/save-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: lat.toString(),
          longitude: lng.toString(),
          timezone,
          madhab,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save location.");
        setPending(false);
        return;
      }

      // Trigger prayer times sync (non-blocking)
      fetch("/api/prayer-times/sync", { method: "POST" }).catch(() => {});

      setStep("madhab");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  async function saveMadhab() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/save-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: lat!.toString(),
          longitude: lng!.toString(),
          timezone,
          madhab,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save madhab.");
        setPending(false);
        return;
      }

      // Re-sync prayer times with the new madhab (affects Asr time)
      fetch("/api/prayer-times/sync", { method: "POST" }).catch(() => {});

      setStep("notifications");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  async function saveNotifications() {
    setPending(true);
    setError(null);
    try {
      const notifRes = await fetch("/api/onboarding/save-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prayerEarlyMid: earlyMid,
          prayerFinal: finalReminder,
          otherReminders,
        }),
      });
      if (!notifRes.ok) {
        const data = await notifRes.json().catch(() => ({}));
        setError(data.error || "Failed to save notification preferences.");
        setPending(false);
        return;
      }

      // Mark onboarding complete (and save display name)
      const completeRes = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!completeRes.ok) {
        const data = await completeRes.json().catch(() => ({}));
        setError(data.error || "Failed to complete onboarding.");
        setPending(false);
        return;
      }

      setStep("done");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  const steps: Step[] = ["terms", "name", "location", "madhab", "notifications", "done"];
  const currentIdx = steps.indexOf(step);

  return (
    <div className="mx-auto flex w-full min-h-[calc(100dvh-140px)] max-w-lg flex-col justify-center overflow-x-hidden px-4 py-8 sm:px-6">
      {/* Progress dots */}
      {step !== "done" && (
        <div className="mb-10 flex items-center justify-center gap-2">
          {steps.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className="h-1.5 rounded-full transition-[background-color] duration-300"
              style={{
                width: i === currentIdx ? 24 : 6,
                backgroundColor: i <= currentIdx ? "var(--color-accent)" : "var(--color-paper-3)",
              }}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="mb-6 text-center text-sm" style={{ color: "var(--color-error)" }}>
          {error}
        </p>
      )}

      {/* ── Step 0: Terms acceptance ── */}
      {step === "terms" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <Shield className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Before you begin
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Waqt is a prayer-centered life tracker. Please review and accept our
            terms to continue.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-3 text-left">
            <label
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors"
              style={{
                borderColor: acceptedTerms ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: acceptedTerms ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
              />
              <span className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                I have read and agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  Terms of Service
                </Link>
                {" "}and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-4 text-sm" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
          )}

          <button
            onClick={() => {
              if (!acceptedTerms) {
                setError("Please accept the Terms of Service and Privacy Policy to continue.");
                return;
              }
              setError(null);
              setStep("name");
            }}
            disabled={pending}
            className="mt-6 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Step 1: Name ── */}
      {step === "name" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <User className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            What should we call you?
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Your name appears on your shared calendar so friends and family know whose schedule they&apos;re looking at.
          </p>

          <div className="mt-8 w-full max-w-sm">
            <input
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
              maxLength={50}
              className="w-full rounded-xl border px-4 py-3.5 text-center text-base outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 48 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && displayName.trim()) {
                  setStep("location");
                }
              }}
            />
            <button
              onClick={() => {
                if (!displayName.trim()) {
                  setError("Please enter your name to continue.");
                  return;
                }
                setError(null);
                setStep("location");
              }}
              disabled={pending}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Location ── */}
      {step === "location" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <MapPin className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Set your location
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            We need your location to fetch accurate prayer times from AlAdhan.
            Your coordinates are stored in your account and never shared.
          </p>

          <div className="mt-8 w-full max-w-sm">
            {locationStatus === "idle" && (
              <button
                onClick={handleGetLocation}
                className="w-full rounded-full px-6 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                Get my location
              </button>
            )}

            {locationStatus === "getting" && (
              <div className="flex items-center justify-center gap-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting location...
              </div>
            )}

            {locationStatus === "done" && lat !== null && lng !== null && (
              <div className="flex flex-col items-center gap-4">
                <div
                  className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--color-success)", backgroundColor: "var(--color-accent-faint)", color: "var(--color-ink)" }}
                >
                  <Check className="h-4 w-4" style={{ color: "var(--color-success)" }} />
                  Location captured: {lat.toFixed(2)}, {lng.toFixed(2)}
                </div>
                <button
                  onClick={saveLocation}
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                >
                  {pending ? "Saving..." : "Continue"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setError("Location is required to fetch prayer times. Please capture your location to continue.");
            }}
            className="mt-6 text-sm font-medium transition-opacity hover:opacity-60"
            style={{ color: "var(--color-ink-muted)" }}
          >
            Skip for now
          </button>
        </div>
      )}

      {/* ── Step 3: Madhab ── */}
      {step === "madhab" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)" }}
          >
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-accent)" }}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>

          <h2 className="mb-2 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
            Which school do you follow?
          </h2>
          <p className="mb-6 max-w-sm text-sm" style={{ color: "var(--color-ink-muted)" }}>
            This determines how your Asr prayer time is calculated and which sunnah prayers are tracked.
          </p>

          <div className="mb-6 w-full max-w-sm space-y-3">
            <button
              onClick={() => setMadhab("standard")}
              className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors"
              style={{
                borderColor: madhab === "standard" ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: madhab === "standard" ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : "transparent",
              }}
            >
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: madhab === "standard" ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: madhab === "standard" ? "var(--color-accent)" : "transparent",
                }}
              >
                {madhab === "standard" && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-paper)" }} />}
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                  Standard (Shafi&apos;i, Maliki, Hanbali)
                </div>
                <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  Asr begins when shadow length equals object length
                </div>
              </div>
            </button>

            <button
              onClick={() => setMadhab("hanafi")}
              className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors"
              style={{
                borderColor: madhab === "hanafi" ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: madhab === "hanafi" ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : "transparent",
              }}
            >
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: madhab === "hanafi" ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: madhab === "hanafi" ? "var(--color-accent)" : "transparent",
                }}
              >
                {madhab === "hanafi" && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-paper)" }} />}
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                  Hanafi
                </div>
                <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  Asr begins when shadow length is twice the object length (later Asr)
                </div>
              </div>
            </button>
          </div>

          {error && (
            <div className="mb-4 text-xs font-medium" style={{ color: "var(--color-warmth)" }}>
              {error}
            </div>
          )}

          <button
            onClick={saveMadhab}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            {pending ? "Saving..." : "Continue"}
          </button>
        </div>
      )}

      {/* ── Step 4: Notifications ── */}
      {step === "notifications" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <Bell className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Notification preferences
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Three independent settings. SMS is opt-in only and disabled by default.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-4">
            <NotificationSelect
              label="Early & mid reminders"
              value={earlyMid}
              onChange={setEarlyMid}
            />
            <NotificationSelect
              label="Final escalation"
              value={finalReminder}
              onChange={setFinalReminder}
            />
            <NotificationSelect
              label="Other reminders"
              value={otherReminders}
              onChange={setOtherReminders}
              allowSms={false}
            />

            <button
              onClick={saveNotifications}
              disabled={pending}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              {pending ? "Saving..." : "Complete setup"}
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === "done" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <Check className="h-10 w-10" style={{ color: "var(--color-success)" }} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            You&apos;re all set
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Your account is ready. Prayer times are being fetched for your
            location. Open the calendar to see your day with prayer bands.
          </p>
          <button
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onClick={() => { window.location.href = "/calendar/day"; }}
            className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            Open calendar
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationSelect({
  label,
  value,
  onChange,
  allowSms = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowSms?: boolean;
}) {
  const options = allowSms
    ? [
        { value: "push", label: "Push only" },
        { value: "push_sms", label: "Push + SMS" },
        { value: "sms", label: "SMS only" },
      ]
    : [
        { value: "push", label: "Push" },
        { value: "none", label: "Off" },
      ];

  return (
    <div className="text-left">
      <label className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

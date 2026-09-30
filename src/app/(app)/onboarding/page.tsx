"use client";

import { useState, useRef } from "react";
import Link from "next/link";

import { MapPin, Bell, ArrowRight, Check, Loader2, User, Shield, Camera } from "lucide-react";
import { readAvatarFile, presetAvatarDataUrl, AVATAR_PRESETS } from "@/lib/avatar";

type Step = "terms" | "name" | "avatar" | "gender" | "hayd" | "location" | "madhab" | "hifidh" | "notifications" | "tour" | "done";

interface TourSlide {
  icon: string;
  title: string;
  points: string[];
}

const TOUR_SLIDES: TourSlide[] = [
  {
    icon: "🕌",
    title: "Prayer comes first",
    points: [
      "Tap a prayer dot to check in — streaks, masjid %, and weekly stats build automatically",
      "Unmarked prayers resolve as assumed prayed at day's end — no silent penalties",
      "Qadaa tracking for missed prayers, iqamah times from your masjid, and hayd-paused tracking",
    ],
  },
  {
    icon: "🤝",
    title: "Pray with friends",
    points: [
      "Add friends to see today's salah dots on their card — you control exactly what's shared",
      "Nudge a friend during the live salah window (3 per prayer, 2min apart)",
      "When they pray after your nudge, they send you a dua back 🤲",
      "Shared streaks and complete-day badges keep each other honest",
    ],
  },
  {
    icon: "⚔️",
    title: "Quran games",
    points: [
      "AyaTrace: name the surah an ayah belongs to — solo or ranked Elite",
      "Mutashabihat: tell apart the look-alike verses every hifidh mixes up",
      "Challenge friends to 1v1 best-of matches — first correct takes the round",
      "One shared leaderboard, full match history with question-by-question replay",
    ],
  },
  {
    icon: "🧰",
    title: "Tools & more",
    points: [
      "Dhikr counter, Qibla compass, 99 Names, Hijri converter, and a talks library",
      "Goals, habits, notes, and homework live around your prayer times",
      "Installs as an app — works offline and syncs when you're back",
    ],
  },
];

export default function OnboardingWizard() {
  const [step, setStep] = useState<Step>("terms");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // router removed — using window.location.href for reliable hard navigation

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Name state
  const [displayName, setDisplayName] = useState("");

  // Avatar state — a data URL staged locally, saved on Continue
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Gender state — 'male' | 'female'; gates the hayd step
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [haydTracking, setHaydTracking] = useState(true);

  // Location state
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [timezone, setTimezone] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "getting" | "done">("idle");

  // Madhab state
  const [madhab, setMadhab] = useState<string>("hanafi");

  // Notification state
  const [earlyMid, setEarlyMid] = useState("push");
  const [finalReminder, setFinalReminder] = useState("push");
  const [otherReminders, setOtherReminders] = useState("push");

  // Feature tour slide index
  const [tourIdx, setTourIdx] = useState(0);

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
          gender,
          haydTracking: gender === "female" ? haydTracking : false,
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
          gender,
          haydTracking: gender === "female" ? haydTracking : false,
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

      setStep("hifidh");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  async function saveHifidh(isHifidh: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/prayer-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHifidh }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save.");
        setPending(false);
        return;
      }
      setStep("notifications");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  async function onPickAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    try {
      setAvatar(await readAvatarFile(file));
    } catch {
      setError("Couldn't read that image — try another.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveAvatarAndNext() {
    if (!avatar) { setStep("gender"); return; }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't save the photo.");
        setPending(false);
        return;
      }
      setStep("gender");
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

      setStep("tour");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  // Progress dots: hayd step only exists for girls — count it conditionally
  const steps: Step[] = gender === "female"
    ? ["terms", "name", "avatar", "gender", "hayd", "location", "madhab", "hifidh", "notifications", "tour", "done"]
    : ["terms", "name", "avatar", "gender", "location", "madhab", "hifidh", "notifications", "tour", "done"];
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
                  setStep("avatar");
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
                setStep("avatar");
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

      {/* ── Step 1b: Avatar ── */}
      {step === "avatar" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Add a photo
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            This is how friends spot you in their list and on the leaderboard. Optional — you can change it anytime.
          </p>

          <div className="mt-8 w-full max-w-sm">
            {/* Preview */}
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL preview
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8" style={{ color: "var(--color-ink-muted)" }} />
              )}
            </div>

            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickAvatarFile}
            />
            <button
              onClick={() => avatarFileRef.current?.click()}
              disabled={avatarBusy || pending}
              className="mt-4 inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
            >
              <Camera className="h-4 w-4" />
              {avatarBusy ? "Loading…" : avatar ? "Change photo" : "Upload a photo"}
            </button>

            {/* Preset avatars */}
            <p className="mt-6 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Or pick one
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2.5">
              {AVATAR_PRESETS.map((p) => {
                const url = presetAvatarDataUrl(p.emoji, p.bg);
                const selected = avatar === url;
                return (
                  <button
                    key={p.emoji + p.bg}
                    onClick={() => setAvatar(url)}
                    aria-label={`Avatar ${p.emoji}`}
                    className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl transition-transform"
                    style={{
                      backgroundColor: p.bg,
                      borderColor: selected ? "var(--color-accent)" : "transparent",
                      transform: selected ? "scale(1.08)" : undefined,
                    }}
                  >
                    {p.emoji}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => void saveAvatarAndNext()}
              disabled={pending || avatarBusy}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              {pending ? "Saving…" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setStep("gender")}
              className="mt-3 text-sm font-medium transition-opacity hover:opacity-60"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Gender ── */}
      {step === "gender" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Are you a boy or a girl?
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Prayer obligations differ — this keeps your tracking accurate.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-3">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGender(g);
                  setError(null);
                  setStep(g === "female" ? "hayd" : "location");
                }}
                className="flex w-full items-center justify-center rounded-xl border p-4 text-sm font-semibold transition-colors"
                style={{
                  borderColor: gender === g ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: gender === g ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : "transparent",
                  color: "var(--color-ink)",
                }}
              >
                {g === "male" ? "Boy" : "Girl"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2b: Hayd tracking (girls only) ── */}
      {step === "hayd" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Hayd days
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            During your period the obligation to pray is lifted. When you mark hayd
            days in the app, check-ins pause, reminders stay quiet, those days show
            as excused instead of missed, and your streak stays safe.
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            This is private — friends never see it.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-3">
            <button
              onClick={() => {
                setHaydTracking(true);
                setStep("location");
              }}
              className="w-full rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Enable hayd tracking
              <ArrowRight className="ml-2 inline h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setHaydTracking(false);
                setStep("location");
              }}
              className="w-full text-sm font-medium transition-opacity hover:opacity-60"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Location ── */}
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

      {/* ── Step: Hifidh ── */}
      {step === "hifidh" && (
        <div className="flex flex-col items-center text-center">
          <p className="mb-4 text-4xl leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }} aria-hidden="true">
            حَافِظ
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Have you memorized the Quran?
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Huffadh get a badge and can compete with other huffadh in the Quran
            Challenge — who recognizes an ayah&rsquo;s surah fastest.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-3">
            <button
              onClick={() => void saveHifidh(true)}
              disabled={pending}
              className="w-full rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Yes, I&rsquo;m a hafidh
              <ArrowRight className="ml-2 inline h-4 w-4" />
            </button>
            <button
              onClick={() => void saveHifidh(false)}
              disabled={pending}
              className="w-full text-sm font-medium transition-opacity hover:opacity-60 disabled:opacity-50"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Not yet
            </button>
          </div>
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

      {/* ── Feature tour — what Waqt can do ── */}
      {step === "tour" && (() => {
        const slide = TOUR_SLIDES[tourIdx];
        const last = tourIdx === TOUR_SLIDES.length - 1;
        return (
          <div className="flex flex-col items-center text-center">
            <p className="text-5xl leading-none" aria-hidden>{slide.icon}</p>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
              {slide.title}
            </h1>

            <ul className="mt-6 w-full max-w-md space-y-2.5 text-left">
              {slide.points.map((pt) => (
                <li key={pt} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>

            {/* Slide dots */}
            <div className="mt-8 flex items-center gap-2">
              {TOUR_SLIDES.map((s, i) => (
                <button
                  key={s.title}
                  onClick={() => setTourIdx(i)}
                  aria-label={`Slide ${i + 1}: ${s.title}`}
                  className="h-1.5 rounded-full transition-[background-color,width] duration-300"
                  style={{
                    width: i === tourIdx ? 24 : 6,
                    backgroundColor: i === tourIdx ? "var(--color-accent)" : "var(--color-paper-3)",
                  }}
                />
              ))}
            </div>

            <div className="mt-6 flex w-full max-w-sm items-center justify-between gap-3">
              {tourIdx > 0 ? (
                <button
                  onClick={() => setTourIdx((i) => i - 1)}
                  className="text-sm font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  Back
                </button>
              ) : (
                <button
                  onClick={() => setStep("done")}
                  className="text-sm font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  Skip tour
                </button>
              )}
              <button
                onClick={() => (last ? setStep("done") : setTourIdx((i) => i + 1))}
                className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                {last ? "Finish" : "Next"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })()}

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

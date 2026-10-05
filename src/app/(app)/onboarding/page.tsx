"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

import { MapPin, Bell, ArrowRight, ArrowLeft, Check, CheckCircle2, Loader2, User, Shield, Camera, Users, NotebookPen, BookOpen, Compass, CloudOff, type LucideIcon } from "lucide-react";
import { readAvatarFile, presetAvatarDataUrl, AVATAR_PRESETS } from "@/lib/avatar";
import { GuideGate } from "./guide-gate";

type Step = "terms" | "name" | "avatar" | "gender" | "hayd" | "location" | "madhab" | "hifidh" | "notifications" | "tour" | "guide" | "done";

type TourVisualKind = "dots" | "league" | "planner" | "quran" | "tools" | "offline";

interface TourSlide {
  icon: LucideIcon;
  kicker: string;
  title: string;
  points: string[];
  visual: TourVisualKind;
}

const TOUR_SLIDES: TourSlide[] = [
  {
    icon: CheckCircle2,
    kicker: "The core",
    title: "Prayer comes first",
    visual: "dots",
    points: [
      "On Prayer → Overview, tap a prayer circle to check in — masjid and sunnah included",
      "Unmarked prayers resolve as assumed prayed at day's end — no silent penalties",
      "Missed prayers go to your Qadaa tracker; make-ups bring the count down",
    ],
  },
  {
    icon: Users,
    kicker: "Together",
    title: "Friends & the League",
    visual: "league",
    points: [
      "The League ranks you and friends weekly — sunnah muakkadah + witr break the tie",
      "Nudge a friend while their salah window is open; they can send a dua back",
      "Shared streaks (🔥) build on days you both complete all five — privacy toggles in Settings",
    ],
  },
  {
    icon: NotebookPen,
    kicker: "Organize",
    title: "Planner",
    visual: "planner",
    points: [
      "Today: a vertical agenda anchored to the prayers — events, homework, goals",
      "Goals by horizon — week, month, year, all-time, and rules to live by",
      "Habits with their own streaks; finished work lands in Done",
    ],
  },
  {
    icon: BookOpen,
    kicker: "Play & learn",
    title: "Quran games",
    visual: "quran",
    points: [
      "AyaTrace: name the surah an ayah belongs to — solo or ranked Elite",
      "Mutashabihat: tell apart the look-alike verses every hifidh mixes up",
      "Challenge friends to 1v1 matches — first correct takes the round",
    ],
  },
  {
    icon: Compass,
    kicker: "The toolkit",
    title: "Tools & more",
    visual: "tools",
    points: [
      "Center button opens the toolkit: Qibla, dhikr, masjids, 99 Names, talks",
      "Study timer and Learn lessons for prayer knowledge",
      "Hide what you don't use in Settings → Navigation",
    ],
  },
  {
    icon: CloudOff,
    kicker: "Anywhere",
    title: "Install & offline",
    visual: "offline",
    points: [
      "Installs like a native app — iPhone: Share → Add to Home Screen",
      "Check-ins made offline queue and sync when you're back",
      "The full guide lives at Tools → Guide whenever you need a refresher",
    ],
  },
];

/** Miniature UI mock rendered inside each tour slide. */
function TourVisual({ kind }: { kind: TourVisualKind }) {
  const paper = "var(--color-paper)";
  const line = "var(--color-paper-3)";
  const accent = "var(--color-accent)";
  const accentFaint = "var(--color-accent-faint)";
  const warmth = "var(--color-warmth)";
  const muted = "var(--color-ink-muted)";

  if (kind === "dots") {
    const labels = ["F", "D", "A", "M", "I"];
    return (
      <div className="flex items-end justify-center gap-3 sm:gap-4" aria-hidden>
        {labels.map((l, i) => {
          const done = i < 3;
          return (
            <div key={l} className="flex flex-col items-center gap-1.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 sm:h-10 sm:w-10"
                style={{
                  borderColor: done ? accent : line,
                  backgroundColor: done ? accent : paper,
                }}
              >
                {done && <Check className="h-4 w-4" style={{ color: paper }} />}
              </div>
              <span className="text-[10px] font-medium" style={{ color: muted }}>{l}</span>
            </div>
          );
        })}
        <div className="mb-5 ml-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: warmth, color: paper }}>
          tap →
        </div>
      </div>
    );
  }

  if (kind === "league") {
    const rows = [
      { rank: "1", name: "You", dots: 5, accentRow: true, badge: "🔥12" },
      { rank: "2", name: "Omar", dots: 4, accentRow: false, badge: "🔥12" },
      { rank: "3", name: "Aisha", dots: 3, accentRow: false, badge: "" },
    ];
    return (
      <div className="mx-auto w-full max-w-xs space-y-1.5" aria-hidden>
        {rows.map((r) => (
          <div
            key={r.rank}
            className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
            style={{
              borderColor: r.accentRow ? accent : line,
              backgroundColor: r.accentRow ? accentFaint : paper,
            }}
          >
            <span className="w-4 text-xs font-semibold" style={{ color: r.accentRow ? accent : muted }}>{r.rank}</span>
            <span className="min-w-0 flex-1 truncate text-left text-xs font-medium" style={{ color: "var(--color-ink)" }}>{r.name}</span>
            {r.badge && <span className="text-[10px]">{r.badge}</span>}
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: i < r.dots ? accent : line }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "planner") {
    const items = [
      { time: "Fajr", band: true, label: "" },
      { time: "9:00", band: false, label: "Homework due" },
      { time: "Dhuhr", band: true, label: "" },
      { time: "16:30", band: false, label: "Study block" },
    ];
    return (
      <div className="mx-auto w-full max-w-xs space-y-1.5" aria-hidden>
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-12 text-right text-[10px] font-medium" style={{ color: muted }}>{it.time}</span>
            <div
              className="h-6 flex-1 rounded-md"
              style={
                it.band
                  ? { backgroundColor: accentFaint, borderLeft: `3px solid ${accent}` }
                  : { backgroundColor: paper, border: `1px solid ${line}` }
              }
            >
              {it.label && (
                <span className="px-2 text-[10px] leading-6" style={{ color: "var(--color-ink-soft)" }}>{it.label}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "quran") {
    return (
      <div className="mx-auto w-full max-w-xs" aria-hidden>
        <div className="rounded-lg border px-4 py-3" style={{ borderColor: line, backgroundColor: paper }}>
          <p dir="rtl" className="text-center text-lg leading-relaxed" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink)" }}>
            ﴾ ۝ ﴿
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {["Al-Fatiha", "Ya-Sin", "Al-Mulk", "Al-Kahf"].map((s, i) => (
              <div
                key={s}
                className="rounded-md border px-2 py-1.5 text-center text-[10px] font-medium"
                style={{
                  borderColor: i === 2 ? accent : line,
                  backgroundColor: i === 2 ? accentFaint : paper,
                  color: i === 2 ? accent : "var(--color-ink-soft)",
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (kind === "tools") {
    return (
      <div className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-2" aria-hidden>
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-xl border"
            style={{ borderColor: line, backgroundColor: i === 4 ? accentFaint : paper }}
          >
            <div
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: i === 4 ? accent : line }}
            />
          </div>
        ))}
      </div>
    );
  }

  // offline
  return (
    <div className="flex items-center justify-center gap-4" aria-hidden>
      <div className="h-20 w-11 rounded-xl border-2 p-1" style={{ borderColor: "var(--color-ink)", backgroundColor: paper }}>
        <div className="h-full w-full rounded-lg" style={{ backgroundColor: accentFaint }} />
      </div>
      <CloudOff className="h-6 w-6" style={{ color: muted }} />
      <div className="rounded-full border px-3 py-1.5 text-[10px] font-medium" style={{ borderColor: line, backgroundColor: paper, color: "var(--color-ink-soft)" }}>
        Syncs when back
      </div>
    </div>
  );
}

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
  const tourTouchX = useRef<number | null>(null);

  // Arrow-key navigation while the tour step is shown
  useEffect(() => {
    if (step !== "tour") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setTourIdx((i) => Math.min(i + 1, TOUR_SLIDES.length - 1));
      if (e.key === "ArrowLeft") setTourIdx((i) => Math.max(i - 1, 0));
      if (e.key === "Escape") setStep("guide");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step]);

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
    ? ["terms", "name", "avatar", "gender", "hayd", "location", "madhab", "hifidh", "notifications", "tour", "guide", "done"]
    : ["terms", "name", "avatar", "gender", "location", "madhab", "hifidh", "notifications", "tour", "guide", "done"];
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
        const Icon = slide.icon;
        return (
          <div
            className="flex flex-col items-center text-center"
            onTouchStart={(e) => {
              tourTouchX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const start = tourTouchX.current;
              tourTouchX.current = null;
              if (start === null) return;
              const dx = e.changedTouches[0].clientX - start;
              if (Math.abs(dx) < 48) return;
              if (dx < 0 && !last) setTourIdx((i) => i + 1);
              if (dx > 0 && tourIdx > 0) setTourIdx((i) => i - 1);
            }}
          >
            {/* Icon medallion */}
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl sm:h-[72px] sm:w-[72px]"
              style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
            >
              <Icon className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
            </div>
            <p
              className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em]"
              style={{ color: "var(--color-ink-muted)" }}
            >
              {slide.kicker}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
              {slide.title}
            </h1>

            {/* Mini visual */}
            <div
              key={tourIdx}
              className="mt-6 w-full max-w-md rounded-2xl border px-4 py-5"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
            >
              <TourVisual kind={slide.visual} />
            </div>

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
                  className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <button
                  onClick={() => setStep("guide")}
                  className="text-sm font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  Skip tour
                </button>
              )}
              <button
                onClick={() => (last ? setStep("guide") : setTourIdx((i) => i + 1))}
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

      {/* ── Guide gate: read → quiz → pass ── */}
      {step === "guide" && <GuideGate onPass={() => setStep("done")} />}

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

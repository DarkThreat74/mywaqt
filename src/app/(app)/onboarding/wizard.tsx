"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

import { MapPin, ArrowRight, ArrowLeft, Check, Loader2, User, Camera, CloudOff } from "lucide-react";
import { readAvatarFile, presetAvatarDataUrl, AVATAR_PRESETS } from "@/lib/avatar";
import { GuideGate } from "./guide-gate";
import { ONBOARDING_DONE_KEY } from "@/components/onboarding-guard";

type Step = "terms" | "name" | "avatar" | "gender" | "hayd" | "theme" | "location" | "madhab" | "hifidh" | "notifications" | "install" | "tour" | "guide" | "done";

const VALID_STEPS = new Set<Step>([
  "terms", "name", "avatar", "gender", "hayd", "theme", "location",
  "madhab", "hifidh", "notifications", "install", "tour", "guide", "done",
]);

/** Resume point — the layout's guard redirects here with ?s=<step>. */
function initialStep(): Step {
  if (typeof window === "undefined") return "terms";
  const s = new URLSearchParams(window.location.search).get("s") as Step | null;
  return s && VALID_STEPS.has(s) ? s : "terms";
}

type TourVisualKind = "dots" | "league" | "planner" | "quran" | "tools" | "offline";

interface TourSlide {
  kicker: string;
  title: string;
  points: string[];
  visual: TourVisualKind;
}

const TOUR_SLIDES: TourSlide[] = [
  {
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

const DRAFT_KEY = "waqt:onboarding-draft";

export default function OnboardingWizard({ userId }: { userId?: string }) {
  // The resume step comes from ?s= — a client-only read. Rendering before
  // mount would SSR "terms" then hydrate a different step (mismatch error),
  // so the wizard paints nothing until it's running client-side.
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>(initialStep);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Legacy users (account older than a day but onboarding flag unset) get a
  // "we know you" banner instead of the new-user framing.
  const [legacyUser, setLegacyUser] = useState(false);
  // router removed — using window.location.href for reliable hard navigation

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Name state — first/last(+optional middle initial) power the friends-view
  // disambiguation; displayName stays the friendly shown name.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [nameHint, setNameHint] = useState<string | null>(null);
  const displayName = [firstName, lastName].filter(Boolean).join(" ");

  // Persist the wizard position + typed fields to the DB — debounced so a
  // keystroke storm doesn't spam the endpoint; the last write always wins.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Names ride along — the server saves them with the step, so progress
        // lives in the database, not just localStorage.
        body: JSON.stringify({ step, firstName, lastName, middleInitial }),
      }).catch(() => null);
    }, 500);
    return () => clearTimeout(t);
  }, [step, firstName, lastName, middleInitial]);

  // Theme state — mirrors the settings toggle (localStorage + data-theme).
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  // PWA install — the deferred prompt only exists when the browser offers it.
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallPrompt(e as unknown as { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

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
  // Manual entry — geocoded place search for users who deny geolocation.
  const [manualEntry, setManualEntry] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [locSearching, setLocSearching] = useState(false);
  const [locLabel, setLocLabel] = useState("");

  // Madhab state
  const [madhab, setMadhab] = useState<string>("hanafi");

  // Notification state
  const [earlyMid, setEarlyMid] = useState("push");
  const [finalReminder, setFinalReminder] = useState("push");
  const [otherReminders, setOtherReminders] = useState("push");

  // Feature tour slide index
  const [tourIdx, setTourIdx] = useState(0);
  const tourTouchX = useRef<number | null>(null);

  // ── Draft persistence — every field the user has touched so far rides in
  // localStorage. Reload, sign-out, device sleep mid-flow: the wizard comes
  // back with everything filled in. Cleared on completion.
  const hydratedRef = useRef(false);
  // The server passes the session id as a prop — a failed /api/profile fetch
  // can never leave this null and break the done-key guard.
  const userIdRef = useRef<string | null>(userId ?? null);
  useEffect(() => {
    // Deferred — a synchronous setState in the effect body trips the
    // cascading-render lint; a microtask still lands before user input.
    Promise.resolve().then(() => setMounted(true));
    // Draft restore waits on /api/profile so a draft left by a *different*
    // account on this device is never applied (shared-device leak).
    const applyDraft = (knownUid: string | null) => {
      let draft: Record<string, unknown> | null = null;
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"); } catch { /* corrupt */ }
      // Fail closed: a draft carrying a uid only applies to that account. A
      // failed profile fetch (knownUid null) must not apply another user's
      // draft on a shared device — but it must also not DELETE the draft:
      // one flaky request would otherwise destroy the owner's saved input.
      if (draft && typeof draft.uid === "string" && knownUid !== null && draft.uid !== knownUid) {
        draft = null;
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      } else if (draft && typeof draft.uid === "string" && knownUid === null) {
        draft = null; // can't prove ownership — don't apply, don't destroy
      }
      // Deferred — hydration setStates must not run synchronously in the effect.
      // Every restore is a functional update that keeps the current value when
      // the user already typed past the default, so a fast typist can't lose
      // a field to the profile-fetch window.
      Promise.resolve().then(() => {
        const d = draft;
        if (d) {
          if (typeof d.acceptedTerms === "boolean") setAcceptedTerms((v) => v || d.acceptedTerms === true);
          if (typeof d.firstName === "string") setFirstName((v) => v || (d.firstName as string));
          if (typeof d.lastName === "string") setLastName((v) => v || (d.lastName as string));
          if (typeof d.middleInitial === "string") setMiddleInitial((v) => v || (d.middleInitial as string));
          if (d.theme === "light" || d.theme === "dark" || d.theme === "system") setTheme((v) => (v === "system" ? (d.theme as "light" | "dark" | "system") : v));
          if (d.gender === "male" || d.gender === "female") setGender((v) => v ?? (d.gender as "male" | "female"));
          if (typeof d.haydTracking === "boolean") setHaydTracking((v) => (v ? (d.haydTracking as boolean) : v));
          if (typeof d.lat === "number") setLat((v) => v ?? (d.lat as number));
          if (typeof d.lng === "number") setLng((v) => v ?? (d.lng as number));
          if (typeof d.timezone === "string" && d.timezone) {
            setTimezone((v) => v || (d.timezone as string));
            if (typeof d.lat === "number") setLocationStatus((s) => (s === "idle" ? "done" : s));
          }
          if (typeof d.madhab === "string") setMadhab((v) => (v === "hanafi" ? (d.madhab as string) : v));
          if (typeof d.earlyMid === "string") setEarlyMid((v) => (v === "push" ? (d.earlyMid as string) : v));
          if (typeof d.finalReminder === "string") setFinalReminder((v) => (v === "push" ? (d.finalReminder as string) : v));
          if (typeof d.otherReminders === "string") setOtherReminders((v) => (v === "push" ? (d.otherReminders as string) : v));
          if (typeof d.avatar === "string") setAvatar((v) => v ?? (d.avatar as string));
        }
        hydratedRef.current = true;
      });
    };
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.id) userIdRef.current = d.id;
        if (d?.joinedAt && Date.now() - new Date(d.joinedAt).getTime() > 24 * 60 * 60 * 1000) {
          setLegacyUser(true);
        }
        applyDraft(userIdRef.current);
      })
      .catch(() => applyDraft(null));
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || step === "done") return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        uid: userIdRef.current,
        acceptedTerms, firstName, lastName, middleInitial, theme, gender,
        haydTracking, lat, lng, timezone, madhab, earlyMid, finalReminder,
        otherReminders, avatar,
      }));
    } catch { /* storage full (big avatar) — draft just stops updating */ }
  }, [step, acceptedTerms, firstName, lastName, middleInitial, theme, gender, haydTracking, lat, lng, timezone, madhab, earlyMid, finalReminder, otherReminders, avatar]);

  useEffect(() => {
    if (step === "done") {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* non-critical */ }
    }
  }, [step]);

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

  // Timezone from coordinates (accurate; falls back to the device tz).
  async function resolveTimezone(latVal: number, lngVal: number): Promise<string> {
    try {
      const res = await fetch(`https://api.latlng.work/v1/timezone?lat=${latVal}&lng=${lngVal}`);
      if (res.ok) {
        const d = await res.json();
        if (d.timezone) return d.timezone;
      }
    } catch { /* fall through */ }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  // Debounced place search — OpenStreetMap Nominatim, light client-side use.
  useEffect(() => {
    if (!manualEntry || locQuery.trim().length < 3) return;
    const t = setTimeout(async () => {
      setLocSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(locQuery.trim())}`,
        );
        if (res.ok) setLocResults(await res.json());
      } catch { /* leave results as-is */ }
      setLocSearching(false);
    }, 600);
    return () => clearTimeout(t);
  }, [manualEntry, locQuery]);

  async function pickManualLocation(r: { display_name: string; lat: string; lon: string }) {
    const latVal = parseFloat(r.lat);
    const lngVal = parseFloat(r.lon);
    if (!Number.isFinite(latVal) || !Number.isFinite(lngVal)) return;
    setLocationStatus("getting");
    setLat(latVal);
    setLng(lngVal);
    setLocLabel(r.display_name.split(",").slice(0, 2).join(","));
    setTimezone(await resolveTimezone(latVal, lngVal));
    setLocationStatus("done");
  }

  function handleGetLocation() {
    setLocationStatus("getting");
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser — enter your area below.");
      setManualEntry(true);
      setLocationStatus("idle");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latVal = position.coords.latitude;
        const lngVal = position.coords.longitude;
        setLat(latVal);
        setLng(lngVal);
        setLocLabel("");
        setTimezone(await resolveTimezone(latVal, lngVal));
        setLocationStatus("done");
      },
      (err) => {
        setError(err.message || "Failed to get location.");
        setManualEntry(true);
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
    // Resuming on a different device leaves lat/lng null (the draft lives in
    // localStorage on the first device). Send the user back to location
    // instead of crashing on the non-null assertion below.
    if (lat === null || lng === null) {
      setStep("location");
      setError("Pick your location first — it didn't carry over from your other device.");
      return;
    }
    setPending(true);
    setError(null);
    try {
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

      setStep("install");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  // Completion only happens once the guide quiz passes — quitting before that
  // leaves onboardingCompleted false and the guard resumes the wizard.
  async function finishOnboarding() {
    setPending(true);
    setError(null);
    try {
      const completeRes = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, firstName, lastName, middleInitial }),
      });
      if (!completeRes.ok) {
        const data = await completeRes.json().catch(() => ({}));
        setError(data.error || "Failed to complete onboarding.");
        setPending(false);
        return;
      }
      // Client-side completion flag — the guard consults this so a stale
      // cached gate can never loop the user back into the wizard. Stored as
      // the account id so another account on this device can't inherit it.
      try { localStorage.setItem(ONBOARDING_DONE_KEY, userIdRef.current ?? ""); } catch { /* non-critical */ }
      setStep("done");
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  // Progress dots: hayd step only exists for girls — count it conditionally
  const steps: Step[] = gender === "female"
    ? ["terms", "name", "avatar", "gender", "hayd", "theme", "location", "madhab", "hifidh", "notifications", "install", "tour", "guide", "done"]
    : ["terms", "name", "avatar", "gender", "theme", "location", "madhab", "hifidh", "notifications", "install", "tour", "guide", "done"];
  const currentIdx = steps.indexOf(step);

  if (!mounted) {
    return <div className="min-h-dvh" style={{ backgroundColor: "var(--color-paper)" }} aria-hidden />;
  }

  return (
    <div className="mx-auto flex w-full min-h-dvh max-w-lg flex-col justify-center overflow-x-hidden px-4 py-10 sm:px-6">
      {/* Progress dots */}
      {step !== "done" && (
        <div className="mb-10 flex items-center justify-center gap-2">
          {steps.slice(0, -1).map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              // Backward only — jumping ahead skips required saves (location,
              // name) and could complete onboarding with nothing persisted.
              disabled={i > currentIdx}
              aria-label={`Go to step ${i + 1}: ${s}`}
              className="h-1.5 rounded-full transition-[background-color] duration-300 disabled:cursor-default"
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
          {legacyUser && (
            <p
              className="mb-6 w-full max-w-sm rounded-xl border px-4 py-3 text-left text-xs leading-relaxed"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}
            >
              We know you&apos;re already a Waqt user — our updated policy asks every
              account to complete setup once. Takes about 3 minutes, and your
              answers save automatically.
            </p>
          )}
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

      {/* ── Step 1: Name — first/last(+middle) with collision escalation ── */}
      {step === "name" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            What should we call you?
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Friends see your first name — the rest only helps when two people share it.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-3">
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setNameHint(null); }}
              autoFocus
              maxLength={50}
              className="w-full rounded-xl border px-4 py-3.5 text-center text-base outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 48 }}
            />
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setNameHint(null); }}
              maxLength={50}
              className="w-full rounded-xl border px-4 py-3.5 text-center text-base outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 48 }}
            />
            <input
              type="text"
              placeholder="Middle initial (optional)"
              value={middleInitial}
              onChange={(e) => setMiddleInitial(e.target.value.slice(0, 1))}
              maxLength={1}
              className="w-full rounded-xl border px-4 py-3.5 text-center text-base outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 48 }}
            />
            {nameHint && (
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-warmth)" }}>{nameHint}</p>
            )}
            <button
              onClick={async () => {
                if (!firstName.trim()) {
                  setError("Please enter your first name to continue.");
                  return;
                }
                setError(null);
                // Collision check — escalates politely rather than rejecting.
                try {
                  const res = await fetch("/api/onboarding/name-check", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ first: firstName.trim(), last: lastName.trim(), middle: middleInitial.trim() }),
                  });
                  if (res.ok) {
                    const d = await res.json();
                    if (!lastName.trim() && d.firstTaken) {
                      setNameHint("Someone already shares that first name — add your last name so friends can tell you apart.");
                      return;
                    }
                    if (d.fullTaken && !middleInitial.trim() && !nameHint) {
                      setNameHint("That exact name is taken — a middle initial separates you (or press Continue again and we'll add digits).");
                      return;
                    }
                    if (d.fullTaken && d.suggested) {
                      // Second Continue (or a middle initial that still
                      // collides) — auto-append the suggested digits and go.
                      setLastName((v) => `${v.trim()} ${d.suggested}`.trim());
                    }
                  }
                } catch { /* proceed without the check */ }
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
                  setStep(g === "female" ? "hayd" : "theme");
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
                setStep("theme");
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
                setStep("theme");
              }}
              className="w-full text-sm font-medium transition-opacity hover:opacity-60"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2c: Theme — light/dark, mirrors the settings toggle ── */}
      {step === "theme" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Pick your look
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            You can change this anytime in Settings.
          </p>
          <div className="mt-8 flex w-full max-w-sm gap-3">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTheme(t);
                  try {
                    if (t === "system") localStorage.removeItem("waqt:theme");
                    else localStorage.setItem("waqt:theme", t);
                    document.documentElement.setAttribute(
                      "data-theme",
                      t === "system"
                        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
                        : t,
                    );
                  } catch { /* private mode — theme just won't persist */ }
                  setStep("location");
                }}
                className="flex-1 rounded-xl border p-4 text-sm font-semibold capitalize transition-colors"
                style={{
                  borderColor: theme === t ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: theme === t ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : "transparent",
                  color: "var(--color-ink)",
                }}
              >
                {t === "system" ? "Auto" : t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3: Location ── */}
      {step === "location" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Set your location
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            We need your location to fetch accurate prayer times from AlAdhan.
            Your coordinates are stored in your account and never shared.
          </p>

          <div className="mt-8 w-full max-w-sm">
            {locationStatus === "idle" && !manualEntry && (
              <>
                <button
                  onClick={handleGetLocation}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                >
                  <MapPin className="h-4 w-4" />
                  Get my location
                </button>
                <button
                  onClick={() => setManualEntry(true)}
                  className="mt-3 w-full text-sm font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  Enter manually
                </button>
              </>
            )}

            {locationStatus === "idle" && manualEntry && (
              <div className="text-left">
                <input
                  type="search"
                  placeholder="City, area, or ZIP"
                  value={locQuery}
                  onChange={(e) => {
                    setLocQuery(e.target.value);
                    if (e.target.value.trim().length < 3) setLocResults([]);
                  }}
                  autoFocus
                  className="w-full rounded-xl border px-4 py-3.5 text-base outline-none focus:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 48 }}
                />
                {locSearching && (
                  <p className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </p>
                )}
                <ul className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-paper-3)" }}>
                  {locResults.map((r, i) => (
                    <li key={`${r.display_name}|${r.lat}|${r.lon}`} style={i > 0 ? { borderTop: "1px solid var(--color-paper-3)" } : undefined}>
                      <button
                        onClick={() => void pickManualLocation(r)}
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-paper-2)]"
                        style={{ color: "var(--color-ink)" }}
                      >
                        <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                        <span className="min-w-0 flex-1 truncate">{r.display_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!locSearching && locQuery.trim().length >= 3 && locResults.length === 0 && (
                  <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    No matches — try a nearby city or a different spelling.
                  </p>
                )}
                <button
                  onClick={() => { setManualEntry(false); setLocQuery(""); setLocResults([]); }}
                  className="mt-3 text-sm font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  Use my device location instead
                </button>
              </div>
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
                  <Check className="h-4 w-4 shrink-0" style={{ color: "var(--color-success)" }} />
                  <span className="min-w-0 truncate">
                    {locLabel || `Location captured: ${lat.toFixed(2)}, ${lng.toFixed(2)}`}
                  </span>
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
        </div>
      )}

      {/* ── Step 3: Madhab ── */}
      {step === "madhab" && (
        <div className="flex flex-col items-center text-center">
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

      {/* ── Install — the app behaves like a native app from the home screen ── */}
      {step === "install" && (
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
            Keep Waqt on your home screen
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            Works offline, opens full-screen, and prayer reminders arrive even
            when the tab is closed. Highly recommended.
          </p>
          <div className="mt-8 w-full max-w-sm space-y-3">
            {installPrompt ? (
              <button
                onClick={() => { void installPrompt.prompt(); setStep("tour"); }}
                className="w-full rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                Install the app
                <ArrowRight className="ml-2 inline h-4 w-4" />
              </button>
            ) : (
              <p className="rounded-xl border px-4 py-3 text-sm leading-relaxed" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                On iPhone: Share → <strong>Add to Home Screen</strong>. On Android:
                browser menu → <strong>Install app</strong>.
              </p>
            )}
            <button
              onClick={() => setStep("tour")}
              className="w-full text-sm font-medium transition-opacity hover:opacity-60"
              style={{ color: "var(--color-ink-muted)" }}
            >
              {installPrompt ? "Skip for now" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* ── Feature tour — what Waqt can do ── */}
      {step === "tour" && (() => {
        const slide = TOUR_SLIDES[tourIdx];
        const last = tourIdx === TOUR_SLIDES.length - 1;
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
            <p
              className="text-[11px] font-medium uppercase tracking-[0.2em]"
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
      {step === "guide" && <GuideGate onPass={() => void finishOnboarding()} />}

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

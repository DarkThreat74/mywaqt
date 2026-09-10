"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, RefreshCw, Check, AlertCircle, LogOut, Link2, Copy, ExternalLink, Trash2, User, Bell, BellOff, Send, Sun, Moon, Monitor, Fingerprint, Smartphone, ChevronDown, ChevronUp, Pencil, Lightbulb, Settings2, Headphones } from "lucide-react";
import { invalidateApiCache, clearApiCache } from "@/lib/sw-helpers";
import { isNativeApp } from "@/lib/native-bridge";
import { clearOfflineCache } from "@/lib/offline/db";
import { getAudioCacheCount, getAudioCacheSize, getDownloadLimitMB, setDownloadLimitMB } from "@/components/audio-player-context";
import { HTTP_USER_AGENT } from "@/lib/site-config";
import { clearCachedPrayerSettings, setCachedPrayerSettings } from "@/lib/offline/settings-cache";

interface PrayerSettings {
  latitude: string;
  longitude: string;
  timezone: string;
  calculationMethod: number;
  madhab: string | null;
}

interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

const PRAYER_LABELS: Array<{ key: keyof PrayerTimes; label: string }> = [
  { key: "fajr", label: "Fajr" },
  { key: "sunrise", label: "Sunrise" },
  { key: "dhuhr", label: "Dhuhr" },
  { key: "asr", label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha", label: "Isha" },
];

const METHOD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 2, label: "ISNA (North America)" },
  { value: 3, label: "Muslim World League" },
  { value: 4, label: "Umm Al-Qura, Makkah" },
  { value: 1, label: "University of Islamic Sciences, Karachi" },
  { value: 5, label: "Egyptian General Authority" },
  { value: 7, label: "University of Tehran" },
  { value: 8, label: "Gulf Region" },
  { value: 9, label: "Kuwait" },
  { value: 10, label: "Qatar" },
  { value: 16, label: "Dubai" },
  { value: 11, label: "Singapore" },
  { value: 12, label: "France" },
  { value: 13, label: "Turkey" },
  { value: 14, label: "Russia" },
  { value: 15, label: "Moonsighting Committee Worldwide" },
  { value: 17, label: "JAKIM (Malaysia)" },
  { value: 18, label: "Tunisia" },
  { value: 19, label: "Algeria" },
  { value: 20, label: "KEMENAG (Indonesia)" },
  { value: 21, label: "Morocco" },
  { value: 22, label: "Communauté Islamique de Genève" },
  { value: 23, label: "Spiritual Administration of Muslims of Russia" },
];

function methodLabel(value: number): string {
  return METHOD_OPTIONS.find((m) => m.value === value)?.label || `Method ${value}`;
}

// Red dot — shows next to required fields that aren't filled
function RedDot() {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: "#dc2626" }}
      aria-label="Required — please fill in this field"
    />
  );
}

// Fun fact countdown component
function FunFactCountdown() {
  const [countdown, setCountdown] = useState<string>("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function update() {
      if (typeof window === "undefined") return;
      const nextShowStr = localStorage.getItem("waqt:funfact:nextShow");
      if (!nextShowStr) {
        setCountdown("Not scheduled yet");
        setPending(false);
        return;
      }
      const nextShow = parseInt(nextShowStr, 10);
      const diff = nextShow - Date.now();
      if (diff <= 0) {
        setCountdown("Due now — will appear shortly");
        setPending(true);
        return;
      }
      setPending(false);
      const hours = Math.floor(diff / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((diff % (60 * 1000)) / 1000);
      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
      <Lightbulb className="h-4 w-4 shrink-0" style={{ color: pending ? "var(--color-accent)" : "var(--color-ink-muted)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>
          Next knowledge card
        </p>
        <p className="text-xs" style={{ color: pending ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
          {countdown}
        </p>
      </div>
    </div>
  );
}

// Collapsible section wrapper
function CollapsibleSection({
  icon,
  title,
  badge,
  badgeColor,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <div className="p-4 sm:p-6">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{title}</h2>
            {badge && (
              <span className="text-xs" style={{ color: badgeColor || "var(--color-ink-muted)" }}>{badge}</span>
            )}
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          )}
        </button>
        {open && <div className="mt-4">{children}</div>}
      </div>
      <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />
    </>
  );
}

// ── Custom Dropdown ──
// Replaces native <select> with a styled, touch-friendly dropdown that
// matches Waqt's design tokens. Closes on outside click or escape.
function SettingsDropdown<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (val: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label || String(value);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm transition-colors disabled:opacity-50"
        style={{
          borderColor: open ? "var(--color-accent)" : "var(--color-paper-3)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink)",
          minHeight: 46,
        }}
      >
        <span className="truncate text-left font-medium" style={{ color: "var(--color-ink)" }}>
          {selectedLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--color-ink-muted)" }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border py-1.5 shadow-lg"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-paper-2)]"
                style={{
                  color: isSelected ? "var(--color-accent)" : "var(--color-ink)",
                  fontWeight: isSelected ? 600 : 400,
                  minHeight: 44,
                }}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SettingsClient({
  displayName: initialDisplayName,
  prayerSettings: initialSettings,
  todayPrayerTimes: initialTimes,
}: {
  displayName: string | null;
  prayerSettings: PrayerSettings | null;
  todayPrayerTimes: PrayerTimes | null;
}) {
  const [prayerSettings, setPrayerSettings] = useState<PrayerSettings | null>(initialSettings);
  const [todayPrayerTimes, setTodayPrayerTimes] = useState<PrayerTimes | null>(initialTimes);

  // Ref to always have the latest prayerSettings inside async closures
  // (prevents stale-closure race conditions when location + method/madhab saves overlap)
  const prayerSettingsRef = useRef<PrayerSettings | null>(initialSettings);
  useEffect(() => {
    prayerSettingsRef.current = prayerSettings;
  }, [prayerSettings]);

  // Auto-sync localStorage cache whenever prayerSettings changes
  useEffect(() => {
    if (!prayerSettings) return;
    setCachedPrayerSettings({
      timezone: prayerSettings.timezone,
      calculationMethod: prayerSettings.calculationMethod,
      madhab: prayerSettings.madhab ?? "standard",
      latitude: String(prayerSettings.latitude),
      longitude: String(prayerSettings.longitude),
    });
  }, [prayerSettings]);

  // Theme state — initialize to "system" to avoid SSR hydration mismatch.
  // The inline script in layout.tsx sets data-theme before paint, so colors
  // are correct immediately; we just sync the selected-button state after mount.
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  useEffect(() => {
    const stored = localStorage.getItem("waqt:theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage after mount to avoid hydration mismatch
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function handleThemeChange(next: "light" | "dark" | "system") {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem("waqt:theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      localStorage.setItem("waqt:theme", next);
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  // Display name state
  const [displayName, setDisplayName] = useState(initialDisplayName || "");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(initialDisplayName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Location search state
  const [cityQuery, setCityQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [locationResult, setLocationResult] = useState<{
    lat: string;
    lng: string;
    timezone: string;
    displayName: string;
  } | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMsg, setLocationMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);

  // Calculation method state
  const [selectedMethod, setSelectedMethod] = useState<number>(initialSettings?.calculationMethod || 2);
  const [savingMethod, setSavingMethod] = useState(false);
  const [methodMsg, setMethodMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Madhab state
  const [selectedMadhab, setSelectedMadhab] = useState<string>(initialSettings?.madhab || "standard");
  const [savingMadhab, setSavingMadhab] = useState(false);
  const [madhabMsg, setMadhabMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Prayer times sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Share link state
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(true);
  const [shareGenerating, setShareGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Prayer code state
  const [prayerCode, setPrayerCode] = useState<string | null>(null);
  const [prayerCodeCopied, setPrayerCodeCopied] = useState(false);

  // Notification state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [notifEnabling, setNotifEnabling] = useState(false);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);
  const [swStatus, setSwStatus] = useState<string>("checking...");
  const [pushStatus, setPushStatus] = useState<string>("checking...");

  // Offline audio storage state
  const [audioCacheInfo, setAudioCacheInfo] = useState<{ count: number; sizeBytes: number } | null>(null);
  const [downloadLimitMB, setDownloadLimitMBState] = useState<number>(500);

  // Load audio cache info + download limit on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [count, sizeBytes] = await Promise.all([getAudioCacheCount(), getAudioCacheSize()]);
        if (!cancelled) setAudioCacheInfo({ count, sizeBytes });
      } catch { /* non-critical */ }
      // Defer to avoid cascading renders (react-hooks/set-state-in-effect)
      if (!cancelled) setDownloadLimitMBState(getDownloadLimitMB());
    })();
    return () => { cancelled = true; };
  }, []);

  // Handle download limit change
  const handleDownloadLimitChange = useCallback((mb: number) => {
    setDownloadLimitMB(mb);
    setDownloadLimitMBState(mb);
  }, []);

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Trusted devices state
  interface TrustedDevice {
    id: string;
    label: string | null;
    createdAt: string;
    lastUsedAt: string;
  }
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchTrustedDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch("/api/auth/trusted-devices", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTrustedDevices(data.devices || []);
      }
    } catch {
      // non-critical
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => fetchTrustedDevices());
  }, [fetchTrustedDevices]);

  async function handleRevokeDevice(deviceId: string) {
    setRevokingId(deviceId);
    try {
      const res = await fetch(`/api/auth/trusted-devices?id=${deviceId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setTrustedDevices((prev) => prev.filter((d) => d.id !== deviceId));
      }
    } catch {
      // non-critical
    } finally {
      setRevokingId(null);
    }
  }

  // Load share link status on mount
  useEffect(() => {
    if (isNativeApp()) {
      requestAnimationFrame(() => setNotifPermission("default"));
    } else if ("Notification" in window) {
      const perm = Notification.permission;
      requestAnimationFrame(() => setNotifPermission(perm));
    } else {
      requestAnimationFrame(() => setNotifPermission("denied"));
    }

    if (isNativeApp()) {
      requestAnimationFrame(() => {
        setSwStatus("Disabled (native app)");
        setPushStatus("Native push (APNs/FCM)");
      });
    } else if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          setSwStatus("Registered (scope: " + reg.scope + ")");
          if ("PushManager" in window && reg.pushManager) {
            reg.pushManager.getSubscription().then((sub) => {
              if (sub) {
                setPushStatus("Subscribed to push");
              } else {
                setPushStatus("Not subscribed to push");
              }
            }).catch(() => setPushStatus("Push check failed"));
          } else {
            setPushStatus("Push not supported");
          }
        } else {
          setSwStatus("Not registered");
          setPushStatus("No SW — push unavailable");
        }
      }).catch(() => setSwStatus("SW check failed"));
    } else {
      requestAnimationFrame(() => {
        setSwStatus("Not supported");
        setPushStatus("Not supported");
      });
    }

    fetch("/api/share/generate")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setShareError(data.error);
        } else {
          setShareEnabled(data.enabled);
          if (data.url) {
            setShareUrl(`${window.location.origin}${data.url}`);
          }
        }
      })
      .catch(() => setShareError("Failed to load share status."))
      .finally(() => setShareLoading(false));

    fetch("/api/prayer-friends/my-code")
      .then((r) => r.json())
      .then((data) => { if (data.prayerCode) setPrayerCode(data.prayerCode); })
      .catch(() => {});
  }, []);

  async function handleCitySearch(e: React.FormEvent) {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    setSearching(true);
    setLocationResult(null);
    setLocationMsg(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=1`,
        { headers: { Accept: "application/json", "User-Agent": HTTP_USER_AGENT } },
      );
      if (res.ok) {
        const results = await res.json().catch(() => []);
        if (Array.isArray(results) && results.length > 0) {
          const result = results[0];
          let timezone = "UTC";
          try {
            const tzRes = await fetch(
              `https://api.latlng.work/v1/timezone?lat=${result.lat}&lng=${result.lon}`,
            );
            if (tzRes.ok) {
              const tzData = await tzRes.json();
              if (tzData.timezone) timezone = tzData.timezone;
            }
          } catch {
            // Fall back to UTC
          }
          setLocationResult({
            lat: result.lat,
            lng: result.lon,
            timezone,
            displayName: result.display_name,
          });
        } else {
          setLocationMsg({ ok: false, text: "No results found. Try a different search." });
        }
      } else {
        setLocationMsg({ ok: false, text: "Search failed. Try again." });
      }
    } catch {
      setLocationMsg({ ok: false, text: "Network error. Try again." });
    } finally {
      setSearching(false);
    }
  }

  async function handleSaveLocation() {
    if (!locationResult) return;
    setSavingLocation(true);
    setLocationMsg(null);
    try {
      const res = await fetch("/api/onboarding/save-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: locationResult.lat,
          longitude: locationResult.lng,
          timezone: locationResult.timezone,
          calculationMethod: selectedMethod,
          madhab: selectedMadhab,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        invalidateApiCache("/api/prayer-times");
        invalidateApiCache("/api/settings");
        // Use functional setState to avoid overwriting concurrent method/madhab updates
        setPrayerSettings((prev) => ({
          latitude: locationResult.lat,
          longitude: locationResult.lng,
          timezone: locationResult.timezone,
          calculationMethod: data.calculationMethod || (prev?.calculationMethod ?? selectedMethod),
          madhab: data.madhab || (prev?.madhab ?? selectedMadhab),
        }));
        setLocationMsg({ ok: true, text: "Location saved. Syncing prayer times..." });
        setEditingLocation(false);
        const syncRes = await fetch("/api/prayer-times/sync", { method: "POST" });
        if (syncRes.ok) {
          const syncData = await syncRes.json().catch(() => ({}));
          setLocationMsg({ ok: true, text: `Location saved. Prayer times synced (${syncData.daysCached ?? 0} days).` });
          await refreshPrayerTimes();
        } else {
          setLocationMsg({ ok: true, text: "Location saved. Click Sync to fetch prayer times." });
        }
      } else {
        const data = await res.json();
        setLocationMsg({ ok: false, text: data.error || "Failed to save location." });
      }
    } catch {
      setLocationMsg({ ok: false, text: "Network error." });
    } finally {
      setSavingLocation(false);
    }
  }

  // Unified save function for method + madhab — auto-called on dropdown change
  // Uses prayerSettingsRef to avoid stale closure race conditions when
  // location/method/madhab saves overlap.
  async function savePrayerSettings(field: "method" | "madhab", methodVal?: number, madhabVal?: string) {
    const current = prayerSettingsRef.current;
    if (!current) return;
    const method = methodVal ?? selectedMethod;
    const madhab = madhabVal ?? selectedMadhab;
    const setSaving = field === "method" ? setSavingMethod : setSavingMadhab;
    const setMsg = field === "method" ? setMethodMsg : setMadhabMsg;

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/onboarding/save-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: current.latitude,
          longitude: current.longitude,
          timezone: current.timezone,
          calculationMethod: method,
          madhab,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        invalidateApiCache("/api/prayer-times");
        invalidateApiCache("/api/settings");
        // Use functional setState to avoid overwriting concurrent updates
        setPrayerSettings((prev) =>
          prev ? {
            ...prev,
            calculationMethod: data.calculationMethod || method,
            madhab: data.madhab || madhab,
          } : prev
        );
        setMsg({ ok: true, text: "Saved. Re-syncing prayer times..." });
        const syncRes = await fetch("/api/prayer-times/sync", { method: "POST" });
        if (syncRes.ok) {
          const syncData = await syncRes.json().catch(() => ({}));
          setMsg({ ok: true, text: `Updated. Prayer times re-synced (${syncData.daysCached ?? 0} days).` });
          await refreshPrayerTimes();
        } else {
          setMsg({ ok: true, text: "Saved. Click Sync to update prayer times." });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setMsg({ ok: false, text: data.error || "Failed to save." });
        // Revert dropdown to the saved value on failure
        if (field === "method") setSelectedMethod(current.calculationMethod);
        else setSelectedMadhab(current.madhab || "standard");
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
      // Revert dropdown to the saved value on failure
      if (field === "method") setSelectedMethod(current.calculationMethod);
      else setSelectedMadhab(current.madhab || "standard");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  async function refreshPrayerTimes() {
    // Compute "today" in the user's prayer timezone, not browser local time
    const tz = prayerSettingsRef.current?.timezone;
    const today = tz
      ? new Date().toLocaleDateString("en-CA", { timeZone: tz })
      : new Date().toLocaleDateString("en-CA");
    try {
      const res = await fetch(`/api/prayer-times?date=${today}`);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (!data) return;
        const fmt = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          const hour = h % 12 || 12;
          const period = h < 12 ? "AM" : "PM";
          return `${hour}:${String(m).padStart(2, "0")} ${period}`;
        };
        setTodayPrayerTimes({
          fajr: fmt(data.fajr),
          sunrise: fmt(data.sunrise),
          dhuhr: fmt(data.dhuhr),
          asr: fmt(data.asr),
          maghrib: fmt(data.maghrib),
          isha: fmt(data.isha),
        });
      }
    } catch {
      // ignore
    }
  }

  async function handleSyncPrayerTimes() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/prayer-times/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        invalidateApiCache("/api/prayer-times");
        setSyncMsg({ ok: true, text: `Synced ${data.daysCached ?? 0} days of prayer times.` });
        await refreshPrayerTimes();
      } else {
        setSyncMsg({ ok: false, text: data.error || "Sync failed." });
      }
    } catch {
      setSyncMsg({ ok: false, text: "Network error." });
    } finally {
      setSyncing(false);
    }
  }

  async function handleGenerateShare() {
    setShareGenerating(true);
    setShareError(null);
    try {
      const res = await fetch("/api/share/generate", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        invalidateApiCache("/api/share");
        setShareEnabled(true);
        setShareUrl(`${window.location.origin}${data.url}`);
      } else {
        setShareError(data.error || "Failed to generate link.");
      }
    } catch {
      setShareError("Network error.");
    } finally {
      setShareGenerating(false);
    }
  }

  async function handleDisableShare() {
    setShareError(null);
    try {
      const res = await fetch("/api/share/generate", { method: "DELETE" });
      if (res.ok) {
        invalidateApiCache("/api/share");
        setShareEnabled(false);
        setShareUrl(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setShareError(data.error || "Failed to disable sharing.");
      }
    } catch {
      setShareError("Network error.");
    }
  }

  async function handleCopyPrayerCode() {
    if (!prayerCode) return;
    try {
      await navigator.clipboard.writeText(prayerCode);
      setPrayerCodeCopied(true);
      setTimeout(() => setPrayerCodeCopied(false), 2000);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = prayerCode;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setPrayerCodeCopied(true);
        setTimeout(() => setPrayerCodeCopied(false), 2000);
      } catch {
        // ignore
      }
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const input = document.getElementById("share-url-input") as HTMLInputElement | null;
        if (input) input.select();
      }
    }
  }

  async function handleEnableNotifications() {
    setNotifEnabling(true);
    setNotifMsg(null);
    try {
      if (isNativeApp()) {
        const { requestPushPermission, getPushToken, getPlatform } = await import("@/lib/native-bridge");
        const granted = await requestPushPermission();
        if (granted) {
          const token = await getPushToken();
          if (token) {
            await fetch("/api/notifications/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ platform: getPlatform(), token, native: true }),
            }).catch(() => {});
          }
          setNotifPermission("granted");
          setNotifMsg("Notifications enabled! You'll get alerts at each prayer time.");
          window.dispatchEvent(new CustomEvent("waqt:notifications-enabled"));
        } else {
          setNotifMsg("Notification permission was not granted.");
        }
        return;
      }
      if (!("Notification" in window)) {
        setNotifMsg("Notifications are not supported on this device.");
        return;
      }

      // iOS Safari requires requestPermission() to be called synchronously
      // inside the user gesture — any await before it consumes the gesture
      // and the prompt is silently suppressed. So we ask FIRST.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (isIOS && !isStandalone) {
        setNotifMsg("On iOS, add Waqt to your Home Screen first, then open it from the icon to enable push notifications.");
        return;
      }

      const perm = await Notification.requestPermission();
      setNotifPermission(perm);

      if (perm !== "granted") {
        if (perm === "denied") {
          setNotifMsg("Notifications were blocked. Enable them in your browser settings to receive prayer alerts.");
        } else {
          setNotifMsg("Notification permission was dismissed. Tap the button again to enable.");
        }
        return;
      }

      // Permission granted — now register SW and subscribe to push
      let reg: ServiceWorkerRegistration | undefined;
      if ("serviceWorker" in navigator) {
        reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          try {
            reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            await navigator.serviceWorker.ready;
          } catch {
            // SW registration failed
          }
        }
      }

      let pushSubscribed = false;
      try {
        if (reg && "PushManager" in window) {
          let subscription = await reg.pushManager.getSubscription();
          if (!subscription) {
            const keyRes = await fetch("/api/notifications/vapid-public-key");
            if (keyRes.ok) {
              const { publicKey } = await keyRes.json();
              if (publicKey) {
                subscription = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
                });
              }
            }
          }
          if (subscription) {
            const subRes = await fetch("/api/notifications/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(subscription),
            });
            pushSubscribed = subRes.ok;
          }
        }
      } catch (err) {
        console.warn("[Waqt] Push subscription failed:", err);
      }

      try {
        if (reg) {
          reg.showNotification("Waqt notifications are on", {
            body: pushSubscribed
              ? "You'll be notified at each prayer time and before reminders — even in the background."
              : "You'll be notified at each prayer time and before reminders while the app is open.",
            tag: "waqt-test",
            data: { url: "/calendar/day" },
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            requireInteraction: false,
            ...({ vibrate: [200, 100, 200], renotify: true } as NotificationOptions),
          });
        }
      } catch (notifErr) {
        console.warn("[Waqt] Test notification failed:", notifErr);
      }

      setNotifMsg(pushSubscribed
        ? "Notifications enabled with background push! You'll get alerts at each prayer time."
        : "Notifications enabled! You'll get alerts at each prayer time while the app is open."
      );
      setPushStatus(pushSubscribed ? "Subscribed to push" : "Not subscribed to push");
      window.dispatchEvent(new CustomEvent("waqt:notifications-enabled"));
    } catch (err) {
      console.error("[Waqt] Enable notifications failed:", err);
      setNotifMsg("Could not request notification permission. Try again.");
    } finally {
      setNotifEnabling(false);
      setTimeout(() => setNotifMsg(null), 6000);
    }
  }

  async function handleResetSW() {
    setNotifMsg("Resetting service worker...");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      setNotifMsg("Service worker reset. Reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setNotifMsg("Reset failed. Try closing all tabs and reopening.");
      setTimeout(() => setNotifMsg(null), 4000);
    }
  }

  async function handleServerPushTest() {
    setNotifMsg(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sent > 0) {
        setNotifMsg(`Server push test sent (${data.sent} delivered). Check your notifications.`);
      } else if (res.ok && data.sent === 0) {
        setNotifMsg("No push subscriptions found. Tap Enable notifications first.");
      } else {
        setNotifMsg(data.error || "Failed to send server push test.");
      }
    } catch {
      setNotifMsg("Network error sending push test.");
    }
    setTimeout(() => setNotifMsg(null), 5000);
  }

  async function handleTestNotification() {
    setNotifMsg(null);
    try {
      if (isNativeApp()) {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Date.now(),
              title: "Test notification from Waqt",
              body: "If you can see this, notifications are working correctly.",
              smallIcon: "icon",
            },
          ],
        });
        setNotifMsg("Test notification sent. Check your notifications.");
        setTimeout(() => setNotifMsg(null), 4000);
        return;
      }
      if (!("Notification" in window) || Notification.permission !== "granted") {
        setNotifMsg("Enable notifications first.");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.showNotification("Test notification from Waqt", {
          body: "If you can see this, notifications are working correctly.",
          tag: "waqt-test",
          data: { url: "/calendar/day" },
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          requireInteraction: false,
          ...({ vibrate: [200, 100, 200], renotify: true } as NotificationOptions),
        });
        setNotifMsg("Test notification sent. Check your notifications.");
      } else {
        new Notification("Test notification from Waqt", {
          body: "If you can see this, notifications are working correctly.",
          tag: "waqt-test",
        });
        setNotifMsg("Test notification sent.");
      }
    } catch {
      setNotifMsg("Failed to send test notification.");
    }
    setTimeout(() => setNotifMsg(null), 4000);
  }

  async function handleLogout() {
    setLoggingOut(true);
    // Unsubscribe push before logout so the old user doesn't get stale notifications
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await fetch("/api/notifications/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    } catch { /* non-critical */ }
    try { await clearOfflineCache(); } catch { /* non-critical */ }
    try { clearCachedPrayerSettings(); } catch { /* non-critical */ }
    try { clearApiCache(); } catch { /* non-critical */ }
    // Clear all waqt-* localStorage keys (theme, prayer settings, etc.)
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("waqt")) localStorage.removeItem(key);
      }
    } catch { /* non-critical */ }
    // Direct cache deletion fallback (in case SW controller is null)
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch { /* non-critical */ }
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_OUTBOX" });
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_USER_CACHE" });
      }
    } catch { /* non-critical */ }
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (res.ok) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete account. Please try again.");
        setDeleteConfirm(false);
      }
    } catch {
      alert("Network error. Please try again.");
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveName() {
    if (!nameInput.trim()) {
      setNameMsg({ ok: false, text: "Name is required." });
      return;
    }
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await fetch("/api/settings/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameInput }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        invalidateApiCache("/api/settings");
        setDisplayName(data.displayName);
        setEditingName(false);
        setNameMsg({ ok: true, text: "Name updated." });
        if (shareEnabled) {
          const shareRes = await fetch("/api/share/generate");
          if (shareRes.ok) {
            const shareData = await shareRes.json().catch(() => ({}));
            if (shareData.url) {
              setShareUrl(`${window.location.origin}${shareData.url}`);
            }
          }
        }
        setTimeout(() => setNameMsg(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setNameMsg({ ok: false, text: data.error || "Failed to save name." });
      }
    } catch {
      setNameMsg({ ok: false, text: "Network error." });
    } finally {
      setSavingName(false);
    }
  }

  const needsName = !displayName;
  const needsLocation = !prayerSettings?.latitude || !prayerSettings?.longitude;
  const needsMethod = !prayerSettings?.calculationMethod;
  const needsMadhab = !prayerSettings?.madhab;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-xl font-semibold tracking-tight sm:mb-8 sm:text-2xl" style={{ color: "var(--color-ink)" }}>
        Settings
      </h1>

      {/* ── Single unified settings card ── */}
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        {/* ── Appearance: Theme ── */}
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sun className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Appearance</h2>
          </div>

          <div className="mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Theme
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleThemeChange("light")}
              className="flex min-h-11 flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-2.5 transition-colors"
              style={{
                borderColor: theme === "light" ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: theme === "light" ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
              }}
            >
              <Sun className="h-4 w-4" style={{ color: theme === "light" ? "var(--color-accent)" : "var(--color-ink-muted)" }} />
              <span className="text-xs font-medium" style={{ color: theme === "light" ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                Light
              </span>
            </button>
            <button
              onClick={() => handleThemeChange("dark")}
              className="flex min-h-11 flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-2.5 transition-colors"
              style={{
                borderColor: theme === "dark" ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: theme === "dark" ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
              }}
            >
              <Moon className="h-4 w-4" style={{ color: theme === "dark" ? "var(--color-accent)" : "var(--color-ink-muted)" }} />
              <span className="text-xs font-medium" style={{ color: theme === "dark" ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                Dark
              </span>
            </button>
            <button
              onClick={() => handleThemeChange("system")}
              className="flex min-h-11 flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-2.5 transition-colors"
              style={{
                borderColor: theme === "system" ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: theme === "system" ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
              }}
            >
              <Monitor className="h-4 w-4" style={{ color: theme === "system" ? "var(--color-accent)" : "var(--color-ink-muted)" }} />
              <span className="text-xs font-medium" style={{ color: theme === "system" ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                System
              </span>
            </button>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />

        {/* ── Profile: Name + Prayer Code ── */}
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Profile</h2>
          </div>

          {/* Name */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Display Name
              </span>
              {needsName && <RedDot />}
            </div>
            {!editingName ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium" style={{ color: needsName ? "var(--color-ink-muted)" : "var(--color-ink)" }}>
                  {displayName || "Not set"}
                </span>
                <button
                  onClick={() => { setNameInput(displayName); setEditingName(true); setNameMsg(null); }}
                  className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  autoFocus
                  maxLength={50}
                  placeholder="Your name"
                  aria-label="Display name"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 44 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !nameInput.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
                  >
                    {savingName ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameMsg(null); }}
                    className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {nameMsg && (
              <p aria-live="polite" className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: nameMsg.ok ? "var(--color-success)" : "var(--color-error)" }}>
                {nameMsg.ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {nameMsg.text}
              </p>
            )}
          </div>

          {/* Prayer Code */}
          <div className="mt-4">
            <div className="mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Prayer Code
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 overflow-hidden rounded-lg border px-3 py-2 text-center text-base font-bold tracking-[0.3em]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              >
                {prayerCode || "------"}
              </div>
              <button
                onClick={handleCopyPrayerCode}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
              >
                {prayerCodeCopied ? (
                  <><Check className="h-3.5 w-3.5" style={{ color: "var(--color-success)" }} /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy</>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />

        {/* ── Prayer Settings: Location + Method + Madhab + Times ── */}
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Prayer Settings</h2>
          </div>

          {/* Location — compact display when saved, search bar only when editing/not set */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Location
              </span>
              {needsLocation && <RedDot />}
            </div>

            {prayerSettings?.latitude && !editingLocation ? (
              /* Compact display when location is saved */
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {prayerSettings.timezone}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {prayerSettings.latitude}, {prayerSettings.longitude}
                  </p>
                </div>
                <button
                  onClick={() => { setEditingLocation(true); setLocationResult(null); setLocationMsg(null); }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-3)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  <Pencil className="h-3 w-3" />
                  Change
                </button>
              </div>
            ) : (
              /* Search bar — only shown when no location or user clicked "Change" */
              <>
                {prayerSettings?.latitude && editingLocation && (
                  <p className="mb-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    Current: {prayerSettings.latitude}, {prayerSettings.longitude} · {prayerSettings.timezone}
                  </p>
                )}
                {!prayerSettings?.latitude && (
                  <p className="mb-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    No location set. Search for your city.
                  </p>
                )}
                <form onSubmit={handleCitySearch} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder="Search for your city..."
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    aria-label="Search location"
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 44 }}
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="shrink-0 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                  >
                    {searching ? "..." : "Search"}
                  </button>
                </form>
                {editingLocation && prayerSettings?.latitude && (
                  <button
                    onClick={() => { setEditingLocation(false); setLocationResult(null); setLocationMsg(null); }}
                    className="mt-2 text-xs font-medium"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    Cancel
                  </button>
                )}
              </>
            )}
            {locationResult && (
              <div className="mt-2 rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <p className="break-words text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  {locationResult.displayName}
                </p>
                <p className="mt-1 break-all text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {locationResult.lat}, {locationResult.lng} · {locationResult.timezone}
                </p>
                <button
                  onClick={handleSaveLocation}
                  disabled={savingLocation}
                  className="mt-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
                >
                  {savingLocation ? "Saving..." : "Save this location"}
                </button>
              </div>
            )}
            {locationMsg && (
              <p aria-live="polite" className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: locationMsg.ok ? "var(--color-success)" : "var(--color-error)" }}>
                {locationMsg.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                <span>{locationMsg.text}</span>
              </p>
            )}
          </div>

          {/* Calculation Method — auto-save on change */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Calculation Method
              </span>
              {needsMethod && <RedDot />}
              {savingMethod && <RefreshCw className="h-3 w-3 animate-spin" style={{ color: "var(--color-ink-muted)" }} />}
            </div>
            <SettingsDropdown
              value={selectedMethod}
              options={METHOD_OPTIONS}
              onChange={(newMethod) => {
                setSelectedMethod(newMethod);
                // Always save on change — don't rely on comparison with prayerSettings
                // which may be null or stale
                if (prayerSettings) {
                  savePrayerSettings("method", newMethod, undefined);
                }
              }}
              disabled={savingMethod || !prayerSettings}
              ariaLabel="Calculation method"
            />
            {prayerSettings && (
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                Current: {methodLabel(prayerSettings.calculationMethod)}
              </p>
            )}
            {methodMsg && (
              <p aria-live="polite" className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: methodMsg.ok ? "var(--color-success)" : "var(--color-error)" }}>
                {methodMsg.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                <span>{methodMsg.text}</span>
              </p>
            )}
          </div>

          {/* Madhab — auto-save on change */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Madhab (School of Thought)
              </span>
              {needsMadhab && <RedDot />}
              {savingMadhab && <RefreshCw className="h-3 w-3 animate-spin" style={{ color: "var(--color-ink-muted)" }} />}
            </div>
            <SettingsDropdown
              value={selectedMadhab}
              options={[
                { value: "standard", label: "Standard (Shafi'i, Maliki, Hanbali)" },
                { value: "hanafi", label: "Hanafi" },
              ]}
              onChange={(newMadhab) => {
                setSelectedMadhab(newMadhab);
                // Always save on change — the old comparison (newMadhab !== prayerSettings.madhab)
                // failed when prayerSettings.madhab was null in the DB, preventing saves
                if (prayerSettings) {
                  savePrayerSettings("madhab", undefined, newMadhab);
                }
              }}
              disabled={savingMadhab || !prayerSettings}
              ariaLabel="Madhab"
            />
            {madhabMsg && (
              <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: madhabMsg.ok ? "var(--color-success)" : "var(--color-error)" }}>
                {madhabMsg.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                <span>{madhabMsg.text}</span>
              </p>
            )}
          </div>

          {/* Today's Prayer Times */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                Today&apos;s Prayer Times
              </span>
              <button
                onClick={handleSyncPrayerTimes}
                disabled={syncing || !prayerSettings}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
              >
                <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "..." : "Sync"}
              </button>
            </div>
            {todayPrayerTimes ? (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {PRAYER_LABELS.map((prayer) => (
                  <div
                    key={prayer.key}
                    className="flex flex-col items-center gap-0.5 rounded-lg border py-2"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
                  >
                    <span className="text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                      {prayer.label}
                    </span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                      {todayPrayerTimes[prayer.key]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {prayerSettings ? "No prayer times cached. Click Sync." : "Set your location to get prayer times."}
              </p>
            )}
            {syncMsg && (
              <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: syncMsg.ok ? "var(--color-success)" : "var(--color-error)" }}>
                {syncMsg.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                <span>{syncMsg.text}</span>
              </p>
            )}
          </div>
        </div>

        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />

        {/* ── Sharing ── */}
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Sharing</h2>
          </div>
          {shareLoading ? (
            <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading...</p>
          ) : shareEnabled && shareUrl ? (
            <div className="flex flex-col gap-3">
              <div
                className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
              >
                <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--color-ink-soft)", wordBreak: "break-all", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {shareUrl}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-3)]"
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  {copied ? (
                    <><Check className="h-3 w-3" style={{ color: "var(--color-success)" }} /> Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copy</>
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
                <button
                  onClick={handleGenerateShare}
                  disabled={shareGenerating}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  <Link2 className="h-3 w-3" />
                  {shareGenerating ? "..." : "Regenerate"}
                </button>
                <button
                  onClick={handleDisableShare}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:opacity-80"
                  style={{ color: "var(--color-error)" }}
                >
                  <Trash2 className="h-3 w-3" />
                  Disable
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGenerateShare}
              disabled={shareGenerating}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              <Link2 className="h-4 w-4" />
              {shareGenerating ? "Creating link..." : "Create public link"}
            </button>
          )}
          {shareError && (
            <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{shareError}</p>
          )}
        </div>

        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />

        {/* ── Notifications — collapsible ── */}
        <CollapsibleSection
          icon={
            notifPermission === "granted" ? (
              <Bell className="h-4 w-4 shrink-0" style={{ color: "var(--color-success)" }} />
            ) : (
              <BellOff className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
            )
          }
          title="Notifications"
          badge={notifPermission === "granted" ? "Enabled" : notifPermission === "denied" ? "Blocked" : "Not set up"}
          badgeColor={notifPermission === "granted" ? "var(--color-success)" : notifPermission === "denied" ? "var(--color-warmth)" : "var(--color-ink-muted)"}
          defaultOpen={false}
        >
          {notifPermission === "denied" && (
            <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Notifications are blocked. Enable them in your browser site settings.
            </p>
          )}
          {notifPermission === "granted" && (
            <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              You&apos;ll receive a notification at each prayer time and 15 minutes before events.
            </p>
          )}
          {notifMsg && (
            <div className="mb-3 text-xs font-medium" style={{ color: notifMsg.includes("enabled") || notifMsg.includes("working") || notifMsg.includes("sent") ? "var(--color-success)" : "var(--color-warmth)" }}>
              {notifMsg}
            </div>
          )}
          <div className="mb-3 rounded-lg border p-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            <div className="space-y-0.5 text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
              <p><span style={{ color: "var(--color-ink-muted)" }}>SW:</span> {swStatus}</p>
              <p><span style={{ color: "var(--color-ink-muted)" }}>Push:</span> {pushStatus}</p>
              <p><span style={{ color: "var(--color-ink-muted)" }}>Platform:</span> {isNativeApp() ? "Native app" : typeof navigator !== "undefined" ? (navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad") ? "iOS Web" : "Desktop/Android Web") : "unknown"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {notifPermission !== "granted" && (
              <button
                onClick={handleEnableNotifications}
                disabled={notifEnabling || notifPermission === "denied"}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
              >
                {notifEnabling ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Enabling...</>
                ) : (
                  <><Bell className="h-4 w-4" /> Enable notifications</>
                )}
              </button>
            )}
            {notifPermission === "granted" && (
              <>
                <button
                  onClick={handleTestNotification}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                >
                  <Send className="h-4 w-4" />
                  Test local
                </button>
                {!isNativeApp() && (
                  <button
                    onClick={handleServerPushTest}
                    className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", minHeight: 44 }}
                  >
                    <Send className="h-4 w-4" />
                    Test background push
                  </button>
                )}
              </>
            )}
          </div>
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
            {!isNativeApp() && (
              <button
                onClick={handleResetSW}
                className="text-xs font-medium underline underline-offset-2"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Reset service worker & reload
              </button>
            )}
          </div>
        </CollapsibleSection>

        {/* ── Offline Audio Storage — collapsible ── */}
        <CollapsibleSection
          icon={<Headphones className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />}
          title="Offline talks"
          badge={audioCacheInfo?.count ? `${audioCacheInfo.count}` : undefined}
          defaultOpen={false}
        >
          <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            Downloaded talks are stored on your device for offline listening. When the limit is
            reached, the oldest-played talks are automatically removed.
          </p>
          {audioCacheInfo ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Downloaded talks</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{audioCacheInfo.count}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Total storage used</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
                  {audioCacheInfo.sizeBytes > 0
                    ? `${(audioCacheInfo.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                    : "0 MB"}
                </span>
              </div>
              {/* Progress bar showing usage toward download limit */}
              {downloadLimitMB > 0 && (
                <div className="mt-1">
                  <div className="mb-1 flex items-center justify-between text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    <span>0 MB</span>
                    <span>{downloadLimitMB >= 1024 ? `${(downloadLimitMB / 1024).toFixed(0)} GB` : `${downloadLimitMB} MB`} limit</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, (audioCacheInfo.sizeBytes / (downloadLimitMB * 1024 * 1024)) * 100)}%`,
                      backgroundColor: audioCacheInfo.sizeBytes > downloadLimitMB * 1024 * 1024 * 0.9
                        ? "var(--color-error)"
                        : "var(--color-accent)",
                    }} />
                  </div>
                </div>
              )}
              {audioCacheInfo.count === 0 && (
                <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  No talks downloaded yet. Tap the download icon next to any talk to save it for offline listening.
                </p>
              )}

              {/* Download limit selector */}
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
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
                      onClick={() => handleDownloadLimitChange(option.value)}
                      className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                      style={{
                        borderColor: downloadLimitMB === option.value
                          ? "var(--color-accent)"
                          : "var(--color-paper-3)",
                        backgroundColor: downloadLimitMB === option.value
                          ? "color-mix(in oklab, var(--color-accent) 10%, transparent)"
                          : "transparent",
                        color: downloadLimitMB === option.value
                          ? "var(--color-accent)"
                          : "var(--color-ink-soft)",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Loading…</span>
            </div>
          )}
        </CollapsibleSection>

        {/* ── Trusted Devices — collapsible ── */}
        <CollapsibleSection
          icon={<Fingerprint className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />}
          title="Trusted devices"
          badge={trustedDevices.length > 0 ? `${trustedDevices.length}` : undefined}
          defaultOpen={false}
        >
          <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            Devices you&apos;ve logged in from can sign in without a password.
            Revoke any you don&apos;t recognize.
          </p>

          {devicesLoading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Loading devices…</span>
            </div>
          ) : trustedDevices.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              No trusted devices yet. Your device becomes trusted after you log in with a password.
            </p>
          ) : (
            <div className="space-y-2">
              {trustedDevices.map((device) => {
                const lastUsed = new Date(device.lastUsedAt);
                const created = new Date(device.createdAt);
                const daysAgo = Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));
                const isMobile = device.label?.includes("iPhone") || device.label?.includes("Android") || device.label?.includes("iPad");
                const DeviceIcon = isMobile ? Smartphone : Monitor;
                return (
                  <div
                    key={device.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    style={{ borderColor: "var(--color-paper-3)" }}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <DeviceIcon className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                          {device.label || "Trusted device"}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          Added {created.toLocaleDateString()} · Last used {daysAgo === 0 ? "today" : `${daysAgo}d ago`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeDevice(device.id)}
                      disabled={revokingId === device.id}
                      className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                      style={{ minHeight: 44, minWidth: 44 }}
                      aria-label="Revoke trusted device"
                      title="Revoke"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--color-error)" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* ── Learn / Knowledge cards — collapsible ── */}
        <CollapsibleSection
          icon={<Lightbulb className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />}
          title="Knowledge cards"
          defaultOpen={false}
        >
          <p className="mb-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            A new knowledge card appears every 3 hours. Closing with the X lets the card reappear later.
            Tapping &ldquo;Got it&rdquo; marks it as read so it won&rsquo;t appear again.
          </p>
          <FunFactCountdown />
        </CollapsibleSection>

        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />

        {/* ── Advanced settings (delete account) — collapsible ── */}
        <CollapsibleSection
          icon={<Settings2 className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />}
          title="Advanced"
          defaultOpen={false}
        >
          <p className="mb-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Advanced account settings. Deleting your account permanently removes all personal information.
            Your prayer logs and calendar events will be anonymized but retained
            for aggregate analytics. This action cannot be undone.
          </p>
          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}
            >
              <Trash2 className="h-4 w-4" />
              Delete my account
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="text-sm font-medium" style={{ color: "var(--color-error)" }}>
                Are you sure? This is permanent.
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)", minHeight: 44 }}
                >
                  {deleting ? "Deleting..." : "Yes, delete forever"}
                </button>
              </div>
            </div>
          )}
        </CollapsibleSection>

        <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }} />

        {/* ── Reload app — useful in PWA standalone mode where pull-to-refresh is disabled ── */}
        <div className="p-4 sm:p-6">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
          >
            <RefreshCw className="h-4 w-4" />
            Reload app
          </button>
          <p className="mt-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Refreshes the page and checks for updates. Use this if the app feels stale.
          </p>
        </div>

        {/* ── Logout — at the very bottom ── */}
        <div className="p-4 sm:p-6">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-error)" }}
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

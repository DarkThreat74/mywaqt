"use client";

import { useState, useEffect, useCallback } from "react";
import { Flame, MapPin, Users, UserPlus, Copy, Check, Calendar, X, WifiOff, Trophy, TrendingUp, Target } from "lucide-react";
import { getSunnahsForMadhab, type SunnahDefinition } from "@/lib/prayer/sunnahs";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { shareNative, hapticNotification } from "@/lib/native-bridge";
import { getOfflineDB } from "@/lib/offline/db";
import { upsertSunnahLogToCache, cacheBlob } from "@/lib/offline/cache-writers";

interface PerPrayerStats {
  prayer: string;
  totalPrayed: number;
  masjidCount: number;
  masjidPct: number;
  avgWindowPct: number | null;
  consistencyPct: number;
  onTimeCount: number;
  lateCount: number;
  onTimePct: number;
}

interface DayOfWeekStat {
  day: string;
  dayIndex: number;
  totalPrayed: number;
  activeDays: number;
  consistencyPct: number;
}

interface TodayPrayerTimes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

interface Analytics {
  streak: number;
  bestStreak: number;
  range: string;
  rangeStart: string;
  totalCompleteDays: number;
  totalPrayed: number;
  totalMasjid: number;
  masjidPct: number;
  perPrayer: PerPrayerStats[];
  timezone: string;
  madhab?: string;
  thisWeekPrayed: number;
  thisMonthPrayed: number;
  lastPrayedDate: string | null;
  totalPrayedAllTime: number;
  avgPrayersPerDay: number;
  mostConsistentPrayer: string | null;
  mostMissedPrayer: string | null;
  dayOfWeekStats: DayOfWeekStat[];
  heatmapData: Record<string, number>;
  todayPrayerTimes: TodayPrayerTimes | null;
}

interface Friend {
  id: string;
  firstName: string | null;
  displayName: string | null;
  streak: number | null;
  totalCompleteDays: number | null;
  totalPrayed: number | null;
  masjidPct: number | null;
  thisWeekPrayed: number | null;
  lastPrayedDate: string | null;
  todayLogs: Array<{ prayerName: string; status: string }>;
  todaySunnahs: string[];
  timezone: string;
}

interface QadaaInfo {
  fajrOwed: number;
  dhuhrOwed: number;
  asrOwed: number;
  maghribOwed: number;
  ishaOwed: number;
  setupCompleted: boolean;
}

interface TodayLog {
  prayerName: string;
  status: string;
}

interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

const PRAYER_LABELS: Record<string, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const PRAYER_COLORS: Record<string, string> = {
  fajr: "#1e40af",
  dhuhr: "#c2410c",
  asr: "#7c3aed",
  maghrib: "#be185d",
  isha: "#0e7490",
};

const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

// Format 24-hour time string ("20:59" or "20:59:00") to 12-hour AM/PM ("8:59 PM")
function format12h(time: string | undefined): string {
  if (!time) return "—";
  const cleaned = time.split(" ")[0].trim();
  const [h, m] = cleaned.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "—";
  const hour = h % 12 || 12;
  const period = h < 12 ? "AM" : "PM";
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// Format minutes-from-midnight to 12-hour AM/PM string
function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  const hour = h % 12 || 12;
  const period = h < 12 ? "AM" : "PM";
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// Given a prayer name, an average window percentage, and today's prayer times
// (in minutes from midnight), compute the equivalent clock time for today.
// E.g., if avgWindowPct=67% and today's Fajr window is 5:15→6:45 (90 min),
// the equivalent time is 5:15 + 0.67*90 = 5:15 + 60min = 6:15 AM.
function computeEquivTime(
  prayer: string,
  avgWindowPct: number | null,
  todayTimes: { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } | null,
): string | null {
  if (avgWindowPct === null || !todayTimes) return null;

  const prayerStart = todayTimes[prayer as keyof typeof todayTimes];
  if (prayerStart === undefined || prayerStart < 0) return null;

  // Determine today's window end for this prayer
  let windowEnd: number;
  switch (prayer) {
    case "fajr":
      windowEnd = todayTimes.sunrise >= 0 ? todayTimes.sunrise : prayerStart + 120;
      break;
    case "dhuhr":
      windowEnd = todayTimes.asr >= 0 ? todayTimes.asr : prayerStart + 300;
      break;
    case "asr":
      windowEnd = todayTimes.maghrib >= 0 ? todayTimes.maghrib : prayerStart + 240;
      break;
    case "maghrib":
      windowEnd = todayTimes.isha >= 0 ? todayTimes.isha : prayerStart + 90;
      break;
    case "isha":
      windowEnd = 24 * 60;
      break;
    default:
      return null;
  }

  // The API uses a 15-min grace before start, so match that
  const windowStart = prayerStart - 15;
  const windowDuration = windowEnd - windowStart;
  if (windowDuration <= 0) return null;

  const equivMinutes = windowStart + (avgWindowPct / 100) * windowDuration;
  return formatMinutesToTime(equivMinutes);
}

type Tab = "comparison" | "stats" | "qadaa" | "friends";

type StatsRange = "weekly" | "monthly" | "yearly" | "all-time";

export default function PrayerDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("comparison");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [prayerCode, setPrayerCode] = useState<string | null>(null);
  const [qadaa, setQadaa] = useState<QadaaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsRange, setStatsRange] = useState<StatsRange>("weekly");
  const [addFriendCode, setAddFriendCode] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendSuccess, setFriendSuccess] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Array<{
    id: string;
    createdAt: string;
    requester: { id: string; firstName: string | null; displayName: string | null };
  }>>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<{
    friendsSeeStreak: boolean;
    friendsSeeTodayStatus: boolean;
    friendsSeeSunnah: boolean;
    friendsSeeMasjidPct: boolean;
  }>({ friendsSeeStreak: true, friendsSeeTodayStatus: false, friendsSeeSunnah: false, friendsSeeMasjidPct: true });
  const [qadaaMsg, setQadaaMsg] = useState<string | null>(null);
  const [setupFajr, setSetupFajr] = useState(0);
  const [setupDhuhr, setSetupDhuhr] = useState(0);
  const [setupAsr, setSetupAsr] = useState(0);
  const [setupMaghrib, setSetupMaghrib] = useState(0);
  const [setupIsha, setSetupIsha] = useState(0);
  const [qadaaSetting, setQadaaSetting] = useState(false);
  const [adjustPrayer, setAdjustPrayer] = useState<string>("fajr");
  const [adjustAmount, setAdjustAmount] = useState(1);

  // Today's data for comparison tab
  const [todayLogs, setTodayLogs] = useState<TodayLog[]>([]);
  const [todaySunnahs, setTodaySunnahs] = useState<string[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [madhab, setMadhab] = useState<string>("standard");
  const [sunnahError, setSunnahError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Track online/offline status + initialize time on client only (avoids hydration mismatch)
  useEffect(() => {
    // Defer setState outside the effect body to avoid cascading renders
    Promise.resolve().then(() => {
      setCurrentTime(new Date());
      setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    });
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const todayStr = currentTime
    ? currentTime.toLocaleDateString("en-CA")
    : null; // null until client mounts — prevents fetching with 1970-01-01

  const fetchTodayData = useCallback(async () => {
    if (!todayStr) return;
    try {
      const [logsRes, sunnahRes, timesRes] = await Promise.all([
        fetch(`/api/prayer-log?date=${todayStr}`).catch(() => null),
        fetch(`/api/prayer-log/sunnah?date=${todayStr}`).catch(() => null),
        fetch(`/api/prayer-times?date=${todayStr}`).catch(() => null),
      ]);
      if (logsRes?.ok) {
        const data = await logsRes.json().catch(() => null);
        if (data) setTodayLogs(Array.isArray(data) ? data : data.logs || []);
      }
      if (sunnahRes?.ok) {
        const data = await sunnahRes.json().catch(() => []);
        if (Array.isArray(data)) setTodaySunnahs(data.filter((l: { prayed: boolean }) => l.prayed).map((l: { sunnahKey: string }) => l.sunnahKey));
      }
      if (timesRes?.ok) {
        const data = await timesRes.json().catch(() => null);
        if (data) setPrayerTimes({
          fajr: data.fajr,
          sunrise: data.sunrise,
          dhuhr: data.dhuhr,
          asr: data.asr,
          maghrib: data.maghrib,
          isha: data.isha,
        });
      }
    } catch {
      // ignore
    }
  }, [todayStr]);

  useEffect(() => {
    // Skip fetching until todayStr is resolved (prevents 1970-01-01 double-fetch)
    if (!todayStr) return;

    let cancelled = false;

    (async () => {
      // ── Step 1: Read from IndexedDB instantly (if cached) ──
      // Render immediately with cached data — no spinner
      try {
        const db = getOfflineDB();
        const [cachedAnalytics, cachedFriends, cachedQadaa, cachedLogs, cachedSunnah, cachedTimes] = await Promise.all([
          db.analytics.get("current"),
          db.friends.get("current"),
          db.qadaa.get("current"),
          db.prayerLogs.where("date").equals(todayStr).toArray(),
          db.sunnahLogs.where("date").equals(todayStr).toArray(),
          db.prayerTimes.get(todayStr),
        ]);

        if (cancelled) return;

        let hasAnyCached = false;

        if (cachedAnalytics?.data) {
          setAnalytics(cachedAnalytics.data as typeof analytics);
          if ((cachedAnalytics.data as { madhab?: string }).madhab) setMadhab((cachedAnalytics.data as { madhab?: string }).madhab as string);
          hasAnyCached = true;
        }
        if (cachedFriends?.data && Array.isArray(cachedFriends.data)) {
          setFriends(cachedFriends.data as typeof friends);
          hasAnyCached = true;
        }
        if (cachedQadaa?.data) {
          setQadaa(cachedQadaa.data as typeof qadaa);
          hasAnyCached = true;
        }
        if (cachedLogs.length > 0) {
          setTodayLogs(cachedLogs.map((l) => ({
            prayerName: l.prayerName,
            status: l.status,
            wentToMasjid: l.wentToMasjid,
          })));
          hasAnyCached = true;
        }
        if (cachedSunnah.length > 0) {
          setTodaySunnahs(cachedSunnah.filter((l) => l.prayed).map((l) => l.sunnahKey));
          hasAnyCached = true;
        }
        if (cachedTimes) {
          setPrayerTimes({
            fajr: cachedTimes.fajr,
            sunrise: cachedTimes.sunrise,
            dhuhr: cachedTimes.dhuhr,
            asr: cachedTimes.asr,
            maghrib: cachedTimes.maghrib,
            isha: cachedTimes.isha,
          });
          hasAnyCached = true;
        }

        // If we have ANY cached data, stop showing the loading spinner
        if (hasAnyCached) {
          if (!cancelled) setLoading(false);
        }
      } catch {
        // IndexedDB read failed — continue to API fetch
      }

      // ── Step 2: Fetch from API in background ──
      try {
        const [analyticsRes, friendsRes, codeRes, qadaaRes, logsRes, sunnahRes, timesRes, pendingRes, visibilityRes] = await Promise.all([
          fetch(`/api/prayer-log/analytics?range=${statsRange}`).catch(() => null),
          fetch("/api/prayer-friends").catch(() => null),
          fetch("/api/prayer-friends/my-code").catch(() => null),
          fetch("/api/qadaa").catch(() => null),
          fetch(`/api/prayer-log?date=${todayStr}`).catch(() => null),
          fetch(`/api/prayer-log/sunnah?date=${todayStr}`).catch(() => null),
          fetch(`/api/prayer-times?date=${todayStr}`).catch(() => null),
          fetch("/api/prayer-friends/pending").catch(() => null),
          fetch("/api/settings/prayer-settings").catch(() => null),
        ]);

        if (cancelled) return;

        if (analyticsRes?.ok) {
          const data = await analyticsRes.json().catch(() => null);
          if (data) {
            setAnalytics(data);
            if (data.madhab) setMadhab(data.madhab);
            try { await getOfflineDB().analytics.put({ id: "current", data, _cachedAt: Date.now() }); } catch { /* non-critical */ }
          }
        }
        if (friendsRes?.ok) {
          const data = await friendsRes.json().catch(() => []);
          if (Array.isArray(data)) setFriends(data);
          try { await getOfflineDB().friends.put({ id: "current", data, _cachedAt: Date.now() }); } catch { /* non-critical */ }
        }
        if (codeRes?.ok) {
          const data = await codeRes.json().catch(() => ({}));
          if (data.prayerCode) setPrayerCode(data.prayerCode);
        }
        if (pendingRes?.ok) {
          const data = await pendingRes.json().catch(() => ({ requests: [] }));
          if (data?.requests && Array.isArray(data.requests)) setPendingRequests(data.requests);
        }
        if (visibilityRes?.ok) {
          const data = await visibilityRes.json().catch(() => null);
          if (data && typeof data.friendsSeeStreak === "boolean") {
            setVisibility({
              friendsSeeStreak: data.friendsSeeStreak,
              friendsSeeTodayStatus: data.friendsSeeTodayStatus,
              friendsSeeSunnah: data.friendsSeeSunnah,
              friendsSeeMasjidPct: data.friendsSeeMasjidPct,
            });
          }
        }
        if (qadaaRes?.ok) {
          const data = await qadaaRes.json().catch(() => null);
          if (data) {
            setQadaa(data);
            try { await getOfflineDB().qadaa.put({ id: "current", data, _cachedAt: Date.now() }); } catch { /* non-critical */ }
          }
        }
        if (logsRes?.ok) {
          const data = await logsRes.json().catch(() => null);
          if (data) {
            const logsArray = Array.isArray(data) ? data : data.logs || [];
            setTodayLogs(logsArray);
            // Cache in IndexedDB
            try {
              const db = getOfflineDB();
              await db.prayerLogs.where("date").equals(todayStr).delete();
              await db.prayerLogs.bulkPut(logsArray.map((l: { prayerName: string; status: string; wentToMasjid: boolean | null; id?: string }) => ({
                id: l.id || `${todayStr}_${l.prayerName}`,
                userId: "",
                date: todayStr,
                prayerName: l.prayerName,
                status: l.status,
                wentToMasjid: l.wentToMasjid,
                lastCheckinAt: null,
                _cachedAt: Date.now(),
              })));
            } catch { /* non-critical */ }
          }
        }
        if (sunnahRes?.ok) {
          const data = await sunnahRes.json().catch(() => []);
          if (Array.isArray(data)) {
            setTodaySunnahs(data.filter((l: { prayed: boolean }) => l.prayed).map((l: { sunnahKey: string }) => l.sunnahKey));
            // Cache in IndexedDB
            try {
              const db = getOfflineDB();
              await db.sunnahLogs.where("date").equals(todayStr).delete();
              await db.sunnahLogs.bulkPut(data.map((l: { sunnahKey: string; prayed: boolean; id?: string }) => ({
                id: l.id || `${todayStr}_${l.sunnahKey}`,
                date: todayStr,
                sunnahKey: l.sunnahKey,
                prayed: l.prayed,
                _cachedAt: Date.now(),
              })));
            } catch { /* non-critical */ }
          }
        }
        if (timesRes?.ok) {
          const data = await timesRes.json().catch(() => null);
          if (data) {
            setPrayerTimes({
              fajr: data.fajr,
              sunrise: data.sunrise,
              dhuhr: data.dhuhr,
              asr: data.asr,
              maghrib: data.maghrib,
              isha: data.isha,
            });
            try {
              await getOfflineDB().prayerTimes.put({
                date: todayStr,
                fajr: data.fajr,
                sunrise: data.sunrise,
                dhuhr: data.dhuhr,
                asr: data.asr,
                maghrib: data.maghrib,
                isha: data.isha,
                madhab: data.madhab || null,
                locationSet: data.locationSet !== false,
                _cachedAt: Date.now(),
              });
            } catch { /* non-critical */ }
          }
        }
      } catch {
        // ignore — cached data is already showing
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [todayStr, statsRange]);

  // Update current time every minute for the progress bar
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Note: statsRange is in the main data-load effect's deps, so changing
  // the range triggers a refetch of analytics with the new range automatically.

  useEffect(() => {
    const handleSynced = () => {
      (async () => {
        try {
          const [analyticsRes, friendsRes, qadaaRes] = await Promise.all([
            fetch(`/api/prayer-log/analytics?range=${statsRange}`).catch(() => null),
            fetch("/api/prayer-friends").catch(() => null),
            fetch("/api/qadaa").catch(() => null),
          ]);
          if (analyticsRes?.ok) {
            const data = await analyticsRes.json().catch(() => null);
            if (data) setAnalytics(data);
          }
          if (friendsRes?.ok) {
            const data = await friendsRes.json().catch(() => []);
            if (Array.isArray(data)) setFriends(data);
          }
          if (qadaaRes?.ok) {
            const data = await qadaaRes.json().catch(() => null);
            if (data) setQadaa(data);
          }
          await fetchTodayData();
        } catch {
          // ignore
        }
      })();
    };
    window.addEventListener("waqt:events-synced", handleSynced);
    return () => window.removeEventListener("waqt:events-synced", handleSynced);
  }, [fetchTodayData, statsRange]);

  async function handleCopyCode() {
    if (!prayerCode) return;
    // Try native share sheet first (native app), then web share, then clipboard
    const shared = await shareNative({
      title: "My Waqt Prayer Code",
      text: `Add me on Waqt! My prayer code is: ${prayerCode}`,
    });
    if (shared) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(prayerCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleAddFriend() {
    if (!addFriendCode.trim()) return;
    setFriendError(null);
    setFriendSuccess(null);
    setAddingFriend(true);
    try {
      const res = await fetch("/api/prayer-friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: addFriendCode.trim().toUpperCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.pending) {
        setFriendSuccess(data.message || "Friend request sent! They'll need to accept it.");
        setAddFriendCode("");
        setTimeout(() => setFriendSuccess(null), 5000);
      } else if (res.ok && !data.offline && data.friend && !data.pending) {
        // Auto-accepted (e.g. they had already sent us a request)
        invalidateApiCache("/api/prayer-friends");
        setFriends((prev) => {
          const updated = [...prev, data.friend];
          cacheBlob("friends", updated);
          return updated;
        });
        setPendingRequests((prev) => prev.filter((r) => r.requester.id !== data.friend.id));
        setFriendSuccess(`You are now friends with ${data.friend.firstName || data.friend.displayName || "friend"}!`);
        setAddFriendCode("");
        setTimeout(() => setFriendSuccess(null), 4000);
      } else if (data.offline) {
        setFriendSuccess("Saved offline — will sync when online.");
        setAddFriendCode("");
        setTimeout(() => setFriendSuccess(null), 3000);
      } else {
        setFriendError(data.error || "Failed to add friend.");
      }
    } catch {
      setFriendError("Network error.");
    } finally {
      setAddingFriend(false);
    }
  }

  async function handleRespondRequest(requestId: string, action: "accept" | "reject") {
    setRespondingId(requestId);
    try {
      const res = await fetch("/api/prayer-friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) {
        await res.json().catch(() => ({}));
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (action === "accept") {
          // Refresh friends list to include the new friend
          const friendsRes = await fetch("/api/prayer-friends");
          if (friendsRes.ok) {
            const friendsData = await friendsRes.json().catch(() => null);
            if (Array.isArray(friendsData)) {
              setFriends(friendsData);
              cacheBlob("friends", friendsData);
            }
          }
          setFriendSuccess("Friend request accepted!");
          setTimeout(() => setFriendSuccess(null), 3000);
        }
      }
    } catch {
      // ignore
    } finally {
      setRespondingId(null);
    }
  }

  async function handleRemoveFriend(friendId: string) {
    try {
      const res = await fetch(`/api/prayer-friends/remove?friendId=${friendId}`, { method: "DELETE" });
      if (res.ok) {
        invalidateApiCache("/api/prayer-friends");
        setFriends((prev) => {
          const updated = prev.filter((f) => f.id !== friendId);
          cacheBlob("friends", updated);
          return updated;
        });
      }
    } catch {
      // ignore
    }
  }

  async function handleToggleVisibility(
    key: keyof typeof visibility,
    value: boolean,
  ) {
    const next = { ...visibility, [key]: value };
    setVisibility(next);
    try {
      await fetch("/api/settings/prayer-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      // revert on failure
      setVisibility(visibility);
    }
  }

  async function handleToggleSunnah(sunnahKey: string) {
    if (!todayStr) return; // Not ready yet
    const isLogged = todaySunnahs.includes(sunnahKey);
    setSunnahError(null);
    try {
      const res = await fetch("/api/prayer-log/sunnah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayStr, sunnahKey, prayed: !isLogged }),
      });
      if (res.ok) {
        invalidateApiCache("/api/prayer-log");
        setTodaySunnahs((prev) =>
          !isLogged ? [...prev, sunnahKey] : prev.filter((k) => k !== sunnahKey),
        );
        upsertSunnahLogToCache(todayStr, sunnahKey, !isLogged);
      } else {
        const data = await res.json().catch(() => ({}));
        setSunnahError(data.error || "Failed to update sunnah.");
        setTimeout(() => setSunnahError(null), 4000);
      }
    } catch {
      setSunnahError("Network error.");
      setTimeout(() => setSunnahError(null), 4000);
    }
  }

  async function handleQadaaSetup() {
    setQadaaSetting(true);
    setQadaaMsg(null);
    try {
      const res = await fetch("/api/qadaa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fajr: setupFajr,
          dhuhr: setupDhuhr,
          asr: setupAsr,
          maghrib: setupMaghrib,
          isha: setupIsha,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && !data.offline) {
        invalidateApiCache("/api/prayer-log");
        setQadaa(data);
        cacheBlob("qadaa", data);
        setQadaaMsg("Qadaa set up successfully.");
        setTimeout(() => setQadaaMsg(null), 3000);
      } else if (data.offline) {
        const offlineQadaa = {
          fajrOwed: setupFajr,
          dhuhrOwed: setupDhuhr,
          asrOwed: setupAsr,
          maghribOwed: setupMaghrib,
          ishaOwed: setupIsha,
          setupCompleted: true,
        };
        setQadaa(offlineQadaa);
        cacheBlob("qadaa", offlineQadaa);
        setQadaaMsg("Saved offline — will sync when online.");
        setTimeout(() => setQadaaMsg(null), 3000);
      } else {
        setQadaaMsg(data.error || "Failed to set up qadaa.");
      }
    } catch {
      setQadaaMsg("Network error.");
    } finally {
      setQadaaSetting(false);
    }
  }

  async function handleQadaaAdjust(delta: number) {
    setQadaaMsg(null);
    try {
      const res = await fetch("/api/qadaa/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prayer: adjustPrayer, amount: delta }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        invalidateApiCache("/api/qadaa");
        void hapticNotification("success");
        if (data.offline) {
          if (qadaa) {
            const colMap: Record<string, keyof typeof qadaa> = {
              fajr: "fajrOwed", dhuhr: "dhuhrOwed", asr: "asrOwed",
              maghrib: "maghribOwed", isha: "ishaOwed",
            };
            const col = colMap[adjustPrayer];
            if (col) {
              const updated = { ...qadaa, [col]: Math.max(0, (qadaa[col] as number) + delta) };
              setQadaa(updated);
              cacheBlob("qadaa", updated);
            }
          }
          setQadaaMsg("Saved offline — will sync when online.");
        } else if (data && typeof data.fajrOwed === "number") {
          // Server returned updated ledger — update local state + cache
          setQadaa(data);
          cacheBlob("qadaa", data);
          setQadaaMsg(delta > 0
            ? `Added ${delta} to ${PRAYER_LABELS[adjustPrayer]} qadaa.`
            : `Logged ${Math.abs(delta)} ${PRAYER_LABELS[adjustPrayer]} qadaa as prayed.`);
        } else if (qadaa) {
          // Server responded ok but didn't return expected shape — optimistically update
          const colMap: Record<string, keyof typeof qadaa> = {
            fajr: "fajrOwed", dhuhr: "dhuhrOwed", asr: "asrOwed",
            maghrib: "maghribOwed", isha: "ishaOwed",
          };
          const col = colMap[adjustPrayer];
          if (col) {
            setQadaa({ ...qadaa, [col]: Math.max(0, (qadaa[col] as number) + delta) });
          }
          setQadaaMsg(delta > 0
            ? `Added ${delta} to ${PRAYER_LABELS[adjustPrayer]} qadaa.`
            : `Logged ${Math.abs(delta)} ${PRAYER_LABELS[adjustPrayer]} qadaa as prayed.`);
        }
        setTimeout(() => setQadaaMsg(null), 3000);
      } else {
        setQadaaMsg(data.error || "Failed to update qadaa.");
        setTimeout(() => setQadaaMsg(null), 4000);
      }
    } catch {
      setQadaaMsg("Network error. Please try again.");
      setTimeout(() => setQadaaMsg(null), 4000);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  const myStreak = analytics?.streak || 0;
  const myWeekPrayed = analytics?.thisWeekPrayed || 0;
  const myComplete = analytics?.totalCompleteDays || 0;
  const myMasjidPct = analytics?.masjidPct || 0;

  // Get prayer status for today
  const getPrayerStatus = (prayer: string): string => {
    const log = todayLogs.find((l) => l.prayerName === prayer);
    return log?.status || "pending";
  };

  const isPrayed = (prayer: string) => {
    const status = getPrayerStatus(prayer);
    return status === "prayed" || status === "assumed_prayed";
  };

  const sunnahDefinitions = getSunnahsForMadhab(madhab);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: "var(--color-ink)" }}>
        Prayer
      </h1>

      {/* Offline indicator */}
      {!isOnline && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--color-warmth)",
            backgroundColor: "color-mix(in oklab, var(--color-warmth) 8%, transparent)",
            color: "var(--color-warmth)",
          }}
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>You&apos;re offline. Prayer logs and sunnahs will sync when you reconnect.</span>
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div className="mb-6 grid grid-cols-4 gap-1 rounded-xl border p-1" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
        {([
          { key: "comparison" as Tab, label: "Today" },
          { key: "stats" as Tab, label: "Stats" },
          { key: "qadaa" as Tab, label: "Qadaa" },
          { key: "friends" as Tab, label: "Friends" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="min-h-11 truncate rounded-lg px-1 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm"
            style={{
              backgroundColor: activeTab === tab.key ? "var(--color-paper)" : "transparent",
              color: activeTab === tab.key ? "var(--color-ink)" : "var(--color-ink-muted)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB: COMPARISON (Today's progress + friends comparison)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "comparison" && (
        <div className="space-y-6">
          {/* ── Today's Progress — Vertical Timeline ── */}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Today&apos;s Progress</h2>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    {currentTime?.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
                  {/* Hijri date — computed client-side via Intl.DateTimeFormat (islamic calendar) */}
                  {currentTime && (
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--color-accent)", fontFamily: "var(--font-amiri, serif)" }}
                    >
                      {(() => {
                        try {
                          return new Intl.DateTimeFormat("en-US-u-ca-islamic", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }).format(currentTime) + " AH";
                        } catch {
                          return null;
                        }
                      })()}
                    </p>
                  )}
                </div>
                {prayerTimes && (
                  <div className="text-right">
                    <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>
                      {PRAYER_ORDER.filter(isPrayed).length}
                    </span>
                    <span className="text-sm" style={{ color: "var(--color-ink-muted)" }}>/5</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Next Prayer Countdown ── */}
            {prayerTimes && currentTime && (() => {
              const PRAYER_LABELS: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
              const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60;
              let next: { name: string; minutes: number } | null = null;
              for (const p of PRAYER_ORDER) {
                const [h, m] = prayerTimes[p].split(" ")[0].split(":").map(Number);
                const t = h * 60 + m;
                if (t > nowMin) { next = { name: p, minutes: t }; break; }
              }
              // If all prayers passed, next is tomorrow's Fajr
              if (!next) {
                const [fh, fm] = prayerTimes.fajr.split(" ")[0].split(":").map(Number);
                next = { name: "fajr", minutes: fh * 60 + fm + 1440 };
              }
              const diff = next.minutes - nowMin;
              const hrs = Math.floor(diff / 60);
              const mins = Math.floor(diff % 60);
              const secs = Math.floor((diff * 60) % 60);
              return (
                <div
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 sm:px-5"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, var(--color-paper))" }}
                >
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                      Next prayer
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                      {PRAYER_LABELS[next.name]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>in</p>
                    <p className="text-lg font-bold tabular-nums sm:text-xl" style={{ color: "var(--color-accent)" }}>
                      {hrs > 0 ? `${hrs}h ` : ""}{mins}m {secs}s
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── Vertical Timeline ── */}
            {prayerTimes ? (
              <div className="px-4 py-2 sm:px-5">
                {/* ── Day progress bar: Fajr → Isha ── */}
                {(() => {
                  const [fh, fm] = prayerTimes.fajr.split(" ")[0].split(":").map(Number);
                  const [ih, im] = prayerTimes.isha.split(" ")[0].split(":").map(Number);
                  const fajrMin = fh * 60 + fm;
                  const ishaMin = ih * 60 + im;
                  const curMin = (currentTime ?? new Date(0)).getHours() * 60 + (currentTime ?? new Date(0)).getMinutes();
                  const dayDuration = ishaMin - fajrMin;
                  const dayElapsed = Math.min(Math.max(curMin - fajrMin, 0), dayDuration);
                  const dayPct = dayDuration > 0 ? (dayElapsed / dayDuration) * 100 : 0;
                  const beforeDay = curMin < fajrMin;

                  return (
                    <div className="mb-3 mt-1">
                      <div className="mb-1 flex items-center justify-between gap-1 text-[11px] tabular-nums sm:text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        <span className="shrink-0">Fajr {format12h(prayerTimes.fajr)}</span>
                        <span className="min-w-0 truncate text-center" style={{ color: beforeDay ? "var(--color-ink-muted)" : "var(--color-accent)" }}>
                          {beforeDay ? "Day hasn't started" : `${Math.floor(dayPct)}% through`}
                        </span>
                        <span className="shrink-0">Isha {format12h(prayerTimes.isha)}</span>
                      </div>
                      <div
                        className="relative h-2 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: "var(--color-paper-2)" }}
                      >
                        {/* Prayer markers on the bar */}
                        {PRAYER_ORDER.map((p) => {
                          const [ph, pm] = prayerTimes[p].split(" ")[0].split(":").map(Number);
                          const pMin = ph * 60 + pm;
                          const pct = ((pMin - fajrMin) / dayDuration) * 100;
                          if (pct < 0 || pct > 100) return null;
                          return (
                            <div
                              key={p}
                              className="absolute top-0 h-full w-px"
                              style={{
                                left: `${pct}%`,
                                backgroundColor: isPrayed(p) ? PRAYER_COLORS[p] : "var(--color-paper-3)",
                              }}
                            />
                          );
                        })}
                        {/* Progress fill */}
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${dayPct}%`,
                            backgroundColor: "var(--color-accent)",
                            opacity: beforeDay ? 0.3 : 0.6,
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {PRAYER_ORDER.map((prayer, idx) => {
                  const prayed = isPrayed(prayer);
                  const color = PRAYER_COLORS[prayer];
                  const time = prayerTimes[prayer];
                  const isLast = idx === PRAYER_ORDER.length - 1;
                  const prayerSunnahs = sunnahDefinitions.filter((s) => s.associatedFard === prayer);
                  const beforeSunnahs = prayerSunnahs.filter((s) => s.position === "before");
                  const afterSunnahs = prayerSunnahs.filter((s) => s.position === "after");
                  const standaloneSunnahs = prayerSunnahs.filter((s) => s.position === "standalone");

                  // Parse prayer start time
                  const [h, m] = time.split(" ")[0].split(":").map(Number);
                  const prayerMinutes = h * 60 + m;
                  const currentMinutes = (currentTime ?? new Date(0)).getHours() * 60 + (currentTime ?? new Date(0)).getMinutes();

                  // ── Determine window END ──
                  // Fajr's window ends at Sunrise (not Dhuhr)
                  // Other prayers' windows end at the next prayer's start
                  // Isha's window extends to next day's Fajr (crosses midnight)
                  let windowEndMinutes: number;
                  let windowEndLabel: string;
                  if (prayer === "fajr") {
                    const [sh, sm] = prayerTimes.sunrise.split(" ")[0].split(":").map(Number);
                    windowEndMinutes = sh * 60 + sm;
                    windowEndLabel = format12h(prayerTimes.sunrise);
                  } else if (idx < PRAYER_ORDER.length - 1) {
                    const nextPrayer = PRAYER_ORDER[idx + 1];
                    const [nh, nm] = prayerTimes[nextPrayer].split(" ")[0].split(":").map(Number);
                    windowEndMinutes = nh * 60 + nm;
                    windowEndLabel = format12h(prayerTimes[nextPrayer]);
                  } else {
                    // Isha — window goes to next day's Fajr (crosses midnight)
                    const [fh, fm] = prayerTimes.fajr.split(" ")[0].split(":").map(Number);
                    const fajrMinutes = fh * 60 + fm;
                    windowEndMinutes = fajrMinutes + 1440; // next day
                    windowEndLabel = `Fajr ${format12h(prayerTimes.fajr)}`;
                  }

                  const timeStarted = currentMinutes >= prayerMinutes;
                  // For Isha, the window crosses midnight. If currentMinutes < fajrStart,
                  // it's after midnight and still within yesterday's Isha window.
                  const isIshaAfterMidnight = prayer === "isha" && currentMinutes < prayerMinutes;
                  const effectiveCurrent = isIshaAfterMidnight ? currentMinutes + 1440 : currentMinutes;
                  const inWindow = timeStarted && effectiveCurrent < windowEndMinutes;
                  const isCurrent = inWindow && !prayed;

                  // Progress within window (0-100%)
                  const windowDuration = windowEndMinutes - prayerMinutes;
                  const elapsedInWindow = effectiveCurrent - prayerMinutes;
                  const windowProgress = inWindow
                    ? Math.min(100, Math.max(0, (elapsedInWindow / windowDuration) * 100))
                    : timeStarted ? 100 : 0;

                  return (
                    <div key={prayer} className="relative flex gap-3 pb-4 sm:gap-4">
                      {/* Timeline line + node */}
                      <div className="flex flex-col items-center">
                        {/* Node */}
                        <div
                          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:h-10 sm:w-10"
                          style={{
                            borderColor: prayed ? color : isCurrent ? color : "var(--color-paper-3)",
                            backgroundColor: prayed ? color : isCurrent ? "color-mix(in oklab, " + color + " 10%, transparent)" : "transparent",
                            ...(isCurrent && !prayed ? { boxShadow: "0 0 0 3px color-mix(in oklab, " + color + " 25%, transparent)" } : {}),
                          }}
                        >
                          {prayed ? (
                            <Check className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--color-paper)" }} />
                          ) : (
                            <span className="text-[11px] font-bold uppercase sm:text-xs" style={{ color: isCurrent ? color : "var(--color-ink-muted)" }}>
                              {prayer.charAt(0).toUpperCase()}
                            </span>
                          )}
                          {/* Pulsing dot — only when in the active window */}
                          {isCurrent && (
                            <span
                              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: color,
                                animation: "pulse 2s ease-in-out infinite",
                              }}
                            />
                          )}
                        </div>
                        {/* Connecting line */}
                        {!isLast && (
                          <div
                            className="mt-1 w-0.5 flex-1"
                            style={{
                              backgroundColor: prayed ? "color-mix(in oklab, " + color + " 30%, var(--color-paper-3))" : "var(--color-paper-3)",
                              minHeight: "1.5rem",
                            }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
                        {/* Prayer header */}
                        <div className="flex items-center justify-between gap-2 pt-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                                {PRAYER_LABELS[prayer]}
                              </span>
                              {/* Status badge */}
                              {prayed ? (
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: "color-mix(in oklab, " + color + " 15%, transparent)",
                                    color: color,
                                  }}
                                >
                                  Prayed
                                </span>
                              ) : isCurrent ? (
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: "color-mix(in oklab, " + color + " 12%, transparent)",
                                    color: color,
                                  }}
                                >
                                  Now
                                </span>
                              ) : timeStarted ? (
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: "var(--color-paper-2)",
                                    color: "var(--color-ink-muted)",
                                  }}
                                >
                                  Missed
                                </span>
                              ) : (
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: "var(--color-paper-2)",
                                    color: "var(--color-ink-muted)",
                                  }}
                                >
                                  Upcoming
                                </span>
                              )}
                            </div>
                            {/* Time frame: start — end */}
                            <div className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                              <span style={{ color: timeStarted ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
                                {format12h(time)}
                              </span>
                              <span className="mx-1" style={{ color: "var(--color-paper-3)" }}>—</span>
                              <span>{windowEndLabel}</span>
                              {inWindow && (() => {
                                const remaining = windowEndMinutes - effectiveCurrent;
                                return (
                                  <span className="ml-1.5" style={{ color: prayed ? "var(--color-ink-muted)" : "var(--color-warmth)" }}>
                                    {Math.floor(remaining / 60)}h {remaining % 60}m left
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Window progress bar — only show when in the active window */}
                        {inWindow && !prayed && (
                          <div className="mt-1.5 mb-0.5">
                            <div
                              className="h-1 w-full overflow-hidden rounded-full"
                              style={{ backgroundColor: "var(--color-paper-2)" }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${windowProgress}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Sunnah / Nafl pills */}
                        {prayerSunnahs.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {/* Before sunnahs */}
                            {beforeSunnahs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {beforeSunnahs.map((s) => {
                                  const sunnahPrayed = todaySunnahs.includes(s.key);
                                  const windowPassed = effectiveCurrent >= windowEndMinutes;
                                  // Grey out when window passed (allow un-logging if already prayed)
                                  // Duha is exempt from lock — it can be logged late
                                  const disabled = sunnahPrayed
                                    ? false // allow un-logging
                                    : !timeStarted || windowPassed;
                                  const reason = !timeStarted
                                    ? `${PRAYER_LABELS[prayer]} hasn't started yet`
                                    : windowPassed
                                      ? `${PRAYER_LABELS[prayer]} window has ended`
                                      : "";
                                  return (
                                    <SunnahPill
                                      key={s.key}
                                      sunnah={s}
                                      prayed={sunnahPrayed}
                                      onToggle={() => handleToggleSunnah(s.key)}
                                      disabled={disabled}
                                      disabledReason={reason}
                                    />
                                  );
                                })}
                              </div>
                            )}
                            {/* After sunnahs */}
                            {afterSunnahs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {afterSunnahs.map((s) => {
                                  const sunnahPrayed = todaySunnahs.includes(s.key);
                                  const windowPassed = effectiveCurrent >= windowEndMinutes;
                                  const disabled = sunnahPrayed
                                    ? false
                                    : !prayed || windowPassed;
                                  const reason = !prayed
                                    ? `Log ${PRAYER_LABELS[prayer]} as prayed first`
                                    : windowPassed
                                      ? `${PRAYER_LABELS[prayer]} window has ended`
                                      : "";
                                  return (
                                    <SunnahPill
                                      key={s.key}
                                      sunnah={s}
                                      prayed={sunnahPrayed}
                                      onToggle={() => handleToggleSunnah(s.key)}
                                      disabled={disabled}
                                      disabledReason={reason}
                                    />
                                  );
                                })}
                              </div>
                            )}
                            {/* Standalone (Witr, Duha) */}
                            {standaloneSunnahs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {standaloneSunnahs.map((s) => {
                                  const sunnahPrayed = todaySunnahs.includes(s.key);
                                  let standaloneDisabled = false;
                                  let standaloneReason = "";

                                  if (s.key === "witr") {
                                    // Witr requires Isha to be prayed
                                    // Witr locks at Fajr (Isha window ends when Fajr starts)
                                    const [fh, fm] = prayerTimes.fajr.split(" ")[0].split(":").map(Number);
                                    const fajrMin = fh * 60 + fm;
                                    const [ih, im] = prayerTimes.isha.split(" ")[0].split(":").map(Number);
                                    const ishaMin = ih * 60 + im;
                                    // Witr is locked when Fajr starts AND current time is before Isha
                                    // (after Isha, we're in the next night's Witr window)
                                    const witrLocked = currentMinutes >= fajrMin && currentMinutes < ishaMin;
                                    standaloneDisabled = sunnahPrayed
                                      ? false // allow un-logging
                                      : !isPrayed("isha") || witrLocked;
                                    standaloneReason = witrLocked
                                      ? "Witr window has ended — Fajr has started"
                                      : "Log Isha as prayed first";
                                  } else if (s.key === "duha") {
                                    // Duha: only disabled before Fajr starts
                                    // After Dhuhr, grey out but STILL allow logging (user's request)
                                    const [dh, dm] = prayerTimes.dhuhr.split(" ")[0].split(":").map(Number);
                                    const dhuhrMin = dh * 60 + dm;
                                    const afterDhuhr = currentMinutes >= dhuhrMin;
                                    standaloneDisabled = !timeStarted; // only disabled before Fajr starts
                                    standaloneReason = afterDhuhr
                                      ? "Duha time has passed — logging late"
                                      : `${PRAYER_LABELS[prayer]} hasn't started yet`;
                                  } else {
                                    standaloneDisabled = !timeStarted;
                                    standaloneReason = `${PRAYER_LABELS[prayer]} hasn't started yet`;
                                  }

                                  return (
                                    <SunnahPill
                                      key={s.key}
                                      sunnah={s}
                                      prayed={sunnahPrayed}
                                      onToggle={() => handleToggleSunnah(s.key)}
                                      disabled={standaloneDisabled}
                                      disabledReason={standaloneReason}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  Prayer times not loaded. Sync in Settings.
                </p>
              </div>
            )}

            {sunnahError && (
              <div className="border-t px-4 py-2 text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-warmth)" }}>
                {sunnahError}
              </div>
            )}
          </div>

          {/* ── Friends comparison ── */}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <Users className="h-4 w-4" /> Competition
              </h2>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                See who&apos;s prayed today. Hold each other accountable.
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
              {/* You */}
              <ComparisonRow
                name="You"
                isMe
                streak={myStreak}
                todayLogs={todayLogs}
                todaySunnahs={todaySunnahs}
                prayerTimes={prayerTimes}
                currentTime={currentTime}
                madhab={madhab}
                timezone={analytics?.timezone || null}
              />
              {/* Friends */}
              {friends.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Users className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
                  <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    No friends yet. Add friends in the Friends tab to start competing.
                  </p>
                </div>
              ) : (
                friends.map((friend) => (
                  <ComparisonRow
                    key={friend.id}
                    name={friend.firstName || friend.displayName || "Friend"}
                    isMe={false}
                    streak={friend.streak ?? 0}
                    todayLogs={friend.todayLogs}
                    todaySunnahs={friend.todaySunnahs}
                    prayerTimes={prayerTimes}
                    currentTime={currentTime}
                    madhab={madhab}
                    timezone={friend.timezone}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: STATS
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "stats" && (
        <div className="space-y-6">
          {/* Overview metrics — row 1 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <StatCard
              icon={<Flame className="h-4 w-4" />}
              label="Current Streak"
              value={`${myStreak}`}
              sub="days"
              color="var(--color-warmth)"
            />
            <StatCard
              icon={<Trophy className="h-4 w-4" />}
              label="Best Streak"
              value={`${analytics?.bestStreak || 0}`}
              sub="days"
              color="var(--color-accent)"
            />
            <StatCard
              icon={<Check className="h-4 w-4" />}
              label="Complete Days"
              value={`${myComplete}`}
              sub="all 5 prayed"
              color="var(--color-success)"
            />
            <StatCard
              icon={<MapPin className="h-4 w-4" />}
              label="Masjid Rate"
              value={`${myMasjidPct}%`}
              sub={`${analytics?.totalMasjid || 0} times`}
              color="var(--color-ink-soft)"
            />
          </div>

          {/* Overview metrics — row 2 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <StatCard
              icon={<Calendar className="h-4 w-4" />}
              label="This Week"
              value={`${myWeekPrayed}`}
              sub="prayers"
              color="var(--color-accent)"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Avg / Day"
              value={`${analytics?.avgPrayersPerDay || 0}`}
              sub={`of 5`}
              color="var(--color-ink-soft)"
            />
            <StatCard
              icon={<Check className="h-4 w-4" />}
              label="Total Prayed"
              value={`${analytics?.totalPrayedAllTime || 0}`}
              sub="all-time"
              color="var(--color-success)"
            />
            <StatCard
              icon={<Target className="h-4 w-4" />}
              label="Top Prayer"
              value={analytics?.mostConsistentPrayer ? PRAYER_LABELS[analytics.mostConsistentPrayer] || "—" : "—"}
              sub={analytics?.mostMissedPrayer ? `Work on: ${PRAYER_LABELS[analytics.mostMissedPrayer] || ""}` : ""}
              color="var(--color-warmth)"
            />
          </div>

          {/* Per-prayer breakdown */}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Per-Prayer Breakdown</h2>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  {statsRange === "weekly" && "This week (from Sunday)"}
                  {statsRange === "monthly" && "This month"}
                  {statsRange === "yearly" && "This year"}
                  {statsRange === "all-time" && "All time"}
                </p>
              </div>
              <div className="relative shrink-0">
                <select
                  value={statsRange}
                  onChange={(e) => setStatsRange(e.target.value as StatsRange)}
                  disabled={loading}
                  className="cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors disabled:opacity-50"
                  style={{
                    borderColor: "var(--color-paper-3)",
                    backgroundColor: "var(--color-paper-2)",
                    color: "var(--color-ink)",
                    minHeight: 36,
                  }}
                  aria-label="Stats time range"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="all-time">All-time</option>
                </select>
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
              {(analytics?.perPrayer || []).map((stat) => {
                const color = PRAYER_COLORS[stat.prayer] || "var(--color-accent)";
                const equivTime = computeEquivTime(stat.prayer, stat.avgWindowPct, analytics?.todayPrayerTimes || null);
                return (
                  <div key={stat.prayer} className="px-4 py-3 sm:px-5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {PRAYER_LABELS[stat.prayer] || stat.prayer}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-center sm:gap-2">
                      <Metric label="Prayed" value={`${stat.totalPrayed}`} />
                      <Metric label="Consist." value={`${stat.consistencyPct}%`} />
                      <Metric label="Masjid" value={`${stat.masjidPct}%`} />
                      <Metric label="On-Time" value={`${stat.onTimePct}%`} />
                      <div>
                        <div className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
                          {stat.avgWindowPct !== null ? `${stat.avgWindowPct}%` : "—"}
                        </div>
                        {equivTime && (
                          <div className="text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                            ~{equivTime}
                          </div>
                        )}
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Avg Time</div>
                      </div>
                    </div>
                    {/* Prayer time bar with makruh zones + goal line */}
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                        <span>Prayer window: early → late</span>
                        <span>{stat.avgWindowPct !== null ? `Avg: ${stat.avgWindowPct}%` : "—"}</span>
                      </div>
                      <div className="relative h-3 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                        {/* Makruh zones: green (0-33%), amber (33-66%), red (66-100%) */}
                        <div className="absolute inset-0 flex">
                          <div className="h-full" style={{ width: "33%", backgroundColor: "color-mix(in oklab, var(--color-success) 25%, transparent)" }} />
                          <div className="h-full" style={{ width: "34%", backgroundColor: "color-mix(in oklab, var(--color-warmth) 25%, transparent)" }} />
                          <div className="h-full" style={{ width: "33%", backgroundColor: "color-mix(in oklab, var(--color-error) 20%, transparent)" }} />
                        </div>
                        {/* Goal line at 33% (end of ideal zone) */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5"
                          style={{
                            left: "33%",
                            backgroundColor: "var(--color-success)",
                            opacity: 0.7,
                          }}
                        >
                          <div
                            className="absolute -top-0.5 -translate-x-1/2 whitespace-nowrap text-[8px] font-semibold"
                            style={{ color: "var(--color-success)", left: "50%" }}
                          >
                            ▼
                          </div>
                        </div>
                        {/* Average position marker */}
                        {stat.avgWindowPct !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-1 rounded-full transition-[left] duration-700 ease-out"
                            style={{
                              left: `calc(${stat.avgWindowPct}% - 2px)`,
                              backgroundColor: color,
                              boxShadow: "0 0 0 1px var(--color-paper)",
                            }}
                          />
                        )}
                      </div>
                      {/* Zone labels */}
                      <div className="mt-1 flex justify-between text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                        <span style={{ color: "var(--color-success)" }}>Ideal</span>
                        <span style={{ color: "var(--color-warmth)" }}>Acceptable</span>
                        <span style={{ color: "var(--color-error)" }}>Makruh</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day-of-week breakdown */}
          {analytics?.dayOfWeekStats && analytics.dayOfWeekStats.length > 0 && (
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Day-of-Week Consistency</h2>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  Which days you pray most consistently
                </p>
              </div>
              <div className="space-y-2 px-4 py-3 sm:px-5">
                {analytics.dayOfWeekStats.map((dow) => {
                  const maxConsistency = Math.max(...analytics.dayOfWeekStats.map((d) => d.consistencyPct), 1);
                  const barWidth = maxConsistency > 0 ? (dow.consistencyPct / maxConsistency) * 100 : 0;
                  const isBest = dow.consistencyPct === Math.max(...analytics.dayOfWeekStats.map((d) => d.consistencyPct)) && dow.consistencyPct > 0;
                  const isWorst = dow.consistencyPct === Math.min(...analytics.dayOfWeekStats.map((d) => d.consistencyPct)) && dow.activeDays > 0;
                  return (
                    <div key={dow.dayIndex} className="flex items-center gap-3">
                      <span
                        className="w-8 shrink-0 text-xs font-medium tabular-nums"
                        style={{ color: isBest ? "var(--color-success)" : isWorst ? "var(--color-error)" : "var(--color-ink-soft)" }}
                      >
                        {dow.day}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: isBest ? "var(--color-success)" : isWorst ? "var(--color-error)" : "var(--color-accent)",
                          }}
                        />
                      </div>
                      <span
                        className="w-10 shrink-0 text-right text-xs font-medium tabular-nums"
                        style={{ color: "var(--color-ink)" }}
                      >
                        {dow.consistencyPct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prayer consistency heatmap (GitHub-style, last 365 days) */}
          {analytics?.heatmapData && (
            <PrayerHeatmap heatmapData={analytics.heatmapData} />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: QADAA
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "qadaa" && (
        <div className="space-y-6">
          {qadaa && !qadaa.setupCompleted && (
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Set Up Qadaa</h2>
              </div>
              <div className="px-4 py-4 sm:px-5">
                <p className="mb-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  Enter how many of each prayer you need to make up. This is a one-time setup — after this, you can log prayed qadaa from here.
                </p>
                <div className="mb-4 space-y-2">
                  {([
                    { key: "fajr", label: "Fajr", val: setupFajr, set: setSetupFajr },
                    { key: "dhuhr", label: "Dhuhr", val: setupDhuhr, set: setSetupDhuhr },
                    { key: "asr", label: "Asr", val: setupAsr, set: setSetupAsr },
                    { key: "maghrib", label: "Maghrib", val: setupMaghrib, set: setSetupMaghrib },
                    { key: "isha", label: "Isha", val: setupIsha, set: setSetupIsha },
                  ] as const).map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{p.label}</span>
                      <input
                        type="number"
                        min="0"
                        max="100000"
                        value={p.val}
                        onChange={(e) => p.set(Math.max(0, Math.min(100000, parseInt(e.target.value) || 0)))}
                        className="w-24 rounded-lg border px-3 py-1.5 text-center text-sm tabular-nums"
                        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mb-3 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
                  Total: {setupFajr + setupDhuhr + setupAsr + setupMaghrib + setupIsha} prayers
                </div>
                {qadaaMsg && (
                  <div aria-live="polite" className="mb-3 text-xs font-medium" style={{ color: qadaaMsg.includes("successfully") ? "var(--color-success)" : "var(--color-warmth)" }}>
                    {qadaaMsg}
                  </div>
                )}
                <button
                  onClick={handleQadaaSetup}
                  disabled={qadaaSetting || (setupFajr + setupDhuhr + setupAsr + setupMaghrib + setupIsha) === 0}
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
                >
                  {qadaaSetting ? "Setting up..." : "Set Qadaa"}
                </button>
              </div>
            </div>
          )}

          {qadaa && qadaa.setupCompleted && (
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Qadaa Tracker</h2>
              </div>
              <div className="px-4 py-4 sm:px-5">
                <div className="mb-4 grid grid-cols-5 gap-1.5 sm:gap-2">
                  {([
                    { key: "fajr", label: "Fajr", val: qadaa.fajrOwed },
                    { key: "dhuhr", label: "Dhuhr", val: qadaa.dhuhrOwed },
                    { key: "asr", label: "Asr", val: qadaa.asrOwed },
                    { key: "maghrib", label: "Magh", val: qadaa.maghribOwed },
                    { key: "isha", label: "Isha", val: qadaa.ishaOwed },
                  ] as const).map((p) => (
                    <div key={p.key} className="flex flex-col items-center rounded-lg border py-2" style={{ borderColor: "var(--color-paper-3)" }}>
                      <span className="text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>{p.label}</span>
                      <span className="text-base font-bold tabular-nums" style={{ color: p.val > 0 ? "var(--color-warmth)" : "var(--color-success)" }}>
                        {p.val}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mb-3 flex items-baseline justify-between border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
                  <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Total owed</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: "var(--color-warmth)" }}>
                    {qadaa.fajrOwed + qadaa.dhuhrOwed + qadaa.asrOwed + qadaa.maghribOwed + qadaa.ishaOwed}
                  </span>
                </div>

                {qadaaMsg && (
                  <div aria-live="polite" className="mb-3 text-xs font-medium" style={{ color: "var(--color-success)" }}>
                    {qadaaMsg}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={adjustPrayer}
                    onChange={(e) => setAdjustPrayer(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                  >
                    <option value="fajr">Fajr</option>
                    <option value="dhuhr">Dhuhr</option>
                    <option value="asr">Asr</option>
                    <option value="maghrib">Maghrib</option>
                    <option value="isha">Isha</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAdjustAmount(Math.max(1, adjustAmount - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border text-sm"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                      className="w-14 rounded-lg border px-2 py-1.5 text-center text-sm tabular-nums"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                    />
                    <button
                      onClick={() => setAdjustAmount(Math.min(20, adjustAmount + 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border text-sm"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => handleQadaaAdjust(-adjustAmount)}
                    className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
                  >
                    Log prayed
                  </button>
                  <button
                    onClick={() => handleQadaaAdjust(adjustAmount)}
                    className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}
                  >
                    Add to backlog
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: FRIENDS
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "friends" && (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              <Users className="h-4 w-4" /> Friends Competition
            </h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Share your code to compete. When someone adds you, you&apos;ll get a notification to accept or reject. You can only see each other&apos;s stats after both sides accept.
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  Your code
                </label>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 rounded-lg border px-3 py-2 text-center text-base font-bold tracking-widest sm:text-lg"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                  >
                    {prayerCode || "—"}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 40 }}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" style={{ color: "var(--color-success)" }} /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  Add friend
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addFriendCode}
                    onChange={(e) => setAddFriendCode(e.target.value)}
                    placeholder="Enter code"
                    maxLength={6}
                    className="flex-1 rounded-lg border px-3 py-2 text-sm uppercase tracking-widest"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 40 }}
                  />
                  <button
                    onClick={handleAddFriend}
                    disabled={addingFriend || !addFriendCode.trim()}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", minHeight: 40 }}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> {addingFriend ? "Adding..." : "Add"}
                  </button>
                </div>
              </div>
            </div>

            {friendError && <p className="mb-3 text-xs" style={{ color: "var(--color-warmth)" }}>{friendError}</p>}
            {friendSuccess && <p className="mb-3 text-xs" style={{ color: "var(--color-success)" }}>{friendSuccess}</p>}

            {/* ── Visibility controls ── */}
            <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                What friends can see
              </p>
              <div className="flex flex-col gap-2">
                {([
                  { key: "friendsSeeStreak", label: "My streak & complete days" },
                  { key: "friendsSeeTodayStatus", label: "Today's per-prayer status" },
                  { key: "friendsSeeSunnah", label: "Today's sunnah prayers" },
                  { key: "friendsSeeMasjidPct", label: "My masjid percentage" },
                ] as const).map((item) => (
                  <label key={item.key} className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--color-ink-soft)" }}>{item.label}</span>
                    <button
                      onClick={() => handleToggleVisibility(item.key, !visibility[item.key])}
                      className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                      style={{ backgroundColor: visibility[item.key] ? "var(--color-accent)" : "var(--color-paper-3)" }}
                      aria-label={`Toggle ${item.label}`}
                      aria-pressed={visibility[item.key]}
                    >
                      <span
                        className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                        style={{ left: visibility[item.key] ? "18px" : "2px" }}
                      />
                    </button>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Pending friend requests ── */}
            {pendingRequests.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  Friend requests ({pendingRequests.length})
                </p>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 rounded-xl border p-3"
                    style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 5%, transparent)" }}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                      {(req.requester.firstName || req.requester.displayName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {req.requester.firstName || req.requester.displayName || "Someone"}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                        wants to connect with you
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handleRespondRequest(req.id, "accept")}
                        disabled={respondingId === req.id}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ backgroundColor: "var(--color-success)", color: "var(--color-paper)", minHeight: 32 }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespondRequest(req.id, "reject")}
                        disabled={respondingId === req.id}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 32 }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {friends.length === 0 ? (
              <div className="rounded-lg border border-dashed py-6 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
                <Users className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
                <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  No friends yet. Share your code above and add a friend to start competing.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div
                  className="flex items-center gap-3 rounded-xl border p-3"
                  style={{
                    borderColor: "var(--color-accent)",
                    backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, transparent)",
                  }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                    You
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>You</div>
                    <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                      {myWeekPrayed} this week · {myComplete} complete days
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-lg font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>
                      <Flame className="h-4 w-4" /> {myStreak}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>day streak</div>
                  </div>
                </div>

                {friends.map((friend, idx) => {
                  const streakVal = friend.streak ?? null;
                  const imWinning = streakVal !== null && myStreak >= streakVal;
                  const streakLabel = streakVal !== null ? streakVal : "—";
                  const subStats: string[] = [];
                  if (friend.thisWeekPrayed !== null) subStats.push(`${friend.thisWeekPrayed} this week`);
                  if (friend.totalCompleteDays !== null) subStats.push(`${friend.totalCompleteDays} complete`);
                  if (friend.masjidPct !== null) subStats.push(`${friend.masjidPct}% masjid`);
                  return (
                    <div
                      key={friend.id}
                      className="group relative flex items-center gap-3 rounded-xl border p-3"
                      style={{ borderColor: "var(--color-paper-3)" }}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: idx === 0 ? "color-mix(in oklab, var(--color-warmth) 20%, transparent)" : "var(--color-paper-2)",
                          color: idx === 0 ? "var(--color-warmth)" : "var(--color-ink-muted)",
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                          {friend.firstName || friend.displayName || "Friend"}
                        </div>
                        <div className="truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          {subStats.length > 0 ? subStats.join(" · ") : "Stats private"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-lg font-bold tabular-nums" style={{ color: imWinning ? "var(--color-ink-soft)" : "var(--color-warmth)" }}>
                          <Flame className="h-4 w-4" /> {streakLabel}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>day streak</div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${friend.firstName || friend.displayName || "this friend"}? They won't be able to see your stats anymore.`)) {
                            handleRemoveFriend(friend.id);
                          }
                        }}
                        className="absolute right-1.5 top-1.5 rounded-full p-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
                        aria-label="Remove friend"
                        style={{ color: "var(--color-ink-muted)", backgroundColor: "var(--color-paper)" }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comparison row component ──
function ComparisonRow({
  name,
  isMe,
  streak,
  todayLogs,
  todaySunnahs,
  prayerTimes,
  currentTime,
  madhab,
  timezone,
}: {
  name: string;
  isMe: boolean;
  streak: number;
  todayLogs: Array<{ prayerName: string; status: string }>;
  todaySunnahs: string[];
  prayerTimes: PrayerTimes | null;
  currentTime: Date | null;
  madhab: string;
  timezone: string | null;
}) {
  const sunnahDefs = getSunnahsForMadhab(madhab);
  const prayedCount = PRAYER_ORDER.filter((p) => {
    const log = todayLogs.find((l) => l.prayerName === p);
    return log?.status === "prayed" || log?.status === "assumed_prayed";
  }).length;

  // Determine which prayer time we're currently at.
  // For the viewer (isMe), use their local time + their prayer times.
  // For friends, use the friend's timezone to get their current local time,
  // but compare against the viewer's prayer times as an approximation
  // (since we don't fetch each friend's prayer times individually).
  const currentPrayerIdx = (() => {
    if (!prayerTimes) return -1;
    let currentMinutes: number;
    if (isMe || !timezone) {
      // Use viewer's local time
      currentMinutes = (currentTime ?? new Date(0)).getHours() * 60 + (currentTime ?? new Date(0)).getMinutes();
    } else {
      // Use friend's timezone to get their current local time
      try {
        const friendTimeStr = new Date().toLocaleTimeString("en-US", {
          timeZone: timezone,
          hour12: false,
        });
        const [h, m] = friendTimeStr.split(":").map(Number);
        currentMinutes = h * 60 + m;
      } catch {
        currentMinutes = (currentTime ?? new Date(0)).getHours() * 60 + (currentTime ?? new Date(0)).getMinutes();
      }
    }
    for (let i = PRAYER_ORDER.length - 1; i >= 0; i--) {
      const timeStr = prayerTimes[PRAYER_ORDER[i]];
      if (!timeStr) continue;
      const [h, m] = timeStr.split(" ")[0].split(":").map(Number);
      if (!isNaN(h) && !isNaN(m) && currentMinutes >= h * 60 + m) return i;
    }
    return -1;
  })();

  return (
    <div
      className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5"
      style={isMe ? { backgroundColor: "color-mix(in oklab, var(--color-accent) 4%, transparent)" } : undefined}
    >
      {/* Name + streak */}
      <div className="min-w-20 shrink-0 sm:min-w-32">
        <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {isMe ? "You" : name}
        </div>
        <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          <Flame className="h-3 w-3" style={{ color: "var(--color-warmth)" }} />
          <span className="tabular-nums">{streak}d</span>
          {!isMe && timezone && (
            <span className="ml-1 tabular-nums" title={timezone}>
              {(() => {
                try {
                  return new Date().toLocaleTimeString("en-US", {
                    timeZone: timezone,
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                } catch {
                  return "";
                }
              })()}
            </span>
          )}
        </div>
      </div>

      {/* Prayer dots */}
      <div className="flex flex-1 items-center justify-center gap-1 sm:gap-2">
        {PRAYER_ORDER.map((prayer, idx) => {
          const log = todayLogs.find((l) => l.prayerName === prayer);
          const prayed = log?.status === "prayed" || log?.status === "assumed_prayed";
          const isCurrent = idx === currentPrayerIdx;
          const color = PRAYER_COLORS[prayer];

          return (
            <div key={prayer} className="flex flex-col items-center gap-0.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors sm:h-8 sm:w-8"
                style={{
                  borderColor: prayed ? color : isCurrent ? color : "var(--color-paper-3)",
                  backgroundColor: prayed ? color : "transparent",
                  ...(isCurrent && !prayed ? { boxShadow: `0 0 0 2px color-mix(in oklab, ${color} 30%, transparent)` } : {}),
                }}
              >
                {prayed ? (
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: "var(--color-paper)" }} />
                ) : (
                  <span className="text-[11px] font-bold uppercase" style={{ color: "var(--color-ink-muted)" }}>
                    {prayer.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {/* Sunnah count badge */}
              {(() => {
                const sunnahCount = sunnahDefs.filter(
                  (s) => s.associatedFard === prayer && todaySunnahs.includes(s.key),
                ).length;
                const totalSunnahs = sunnahDefs.filter((s) => s.associatedFard === prayer).length;
                if (totalSunnahs === 0) return null;
                return (
                  <span
                    className="text-[11px] font-medium tabular-nums"
                    style={{ color: sunnahCount > 0 ? "var(--color-success)" : "var(--color-ink-muted)" }}
                  >
                    {sunnahCount}/{totalSunnahs}
                  </span>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Progress count */}
      <div className="w-12 shrink-0 text-right sm:w-16">
        <span className="text-sm font-bold tabular-nums" style={{ color: prayedCount === 5 ? "var(--color-success)" : "var(--color-ink)" }}>
          {prayedCount}/5
        </span>
      </div>
    </div>
  );
}

// ── Sunnah / Nafl pill button ──
const SUNNAH_CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  muakkadah: { bg: "color-mix(in oklab, var(--color-accent) 8%, transparent)", border: "var(--color-accent)", text: "var(--color-accent)", label: "Sunnah" },
  ghayr_muakkadah: { bg: "color-mix(in oklab, var(--color-ink-soft) 8%, transparent)", border: "var(--color-ink-soft)", text: "var(--color-ink-soft)", label: "Sunnah" },
  wajib: { bg: "color-mix(in oklab, var(--color-warmth) 8%, transparent)", border: "var(--color-warmth)", text: "var(--color-warmth)", label: "Wajib" },
  raghibah: { bg: "color-mix(in oklab, var(--color-success) 8%, transparent)", border: "var(--color-success)", text: "var(--color-success)", label: "Sunnah" },
  nafl_muakkadah: { bg: "color-mix(in oklab, var(--color-accent) 8%, transparent)", border: "var(--color-accent)", text: "var(--color-accent)", label: "Nafl" },
  nafl: { bg: "color-mix(in oklab, var(--color-success) 6%, transparent)", border: "var(--color-success)", text: "var(--color-success)", label: "Nafl" },
};

function SunnahPill({
  sunnah,
  prayed,
  onToggle,
  disabled = false,
  disabledReason = "",
}: {
  sunnah: SunnahDefinition;
  prayed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const cat = SUNNAH_CATEGORY_STYLES[sunnah.category] || SUNNAH_CATEGORY_STYLES.nafl;

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:text-[11px]"
      style={{
        borderColor: prayed ? cat.border : "var(--color-paper-3)",
        color: prayed ? cat.text : "var(--color-ink-muted)",
        backgroundColor: prayed ? cat.bg : "transparent",
        minHeight: 44,
      }}
      title={disabled ? disabledReason : `${cat.label} — ${sunnah.label}`}
    >
      {prayed ? (
        <Check className="h-3 w-3 shrink-0" />
      ) : (
        <div className="h-3 w-3 shrink-0 rounded-full border" style={{ borderColor: "var(--color-paper-3)" }} />
      )}
      <span className="whitespace-nowrap">
        {sunnah.label}
      </span>
    </button>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div
      className="rounded-xl border p-3 sm:p-4"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="mb-1.5 flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide sm:text-[11px]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums sm:text-xl" style={{ color: "var(--color-ink)" }}>
          {value}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{sub}</span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{label}</div>
    </div>
  );
}

// ── Prayer Heatmap (GitHub-style, last 365 days) ──
// Shows daily prayer completion: green = all 5, amber = partial, red = none.
function PrayerHeatmap({ heatmapData }: { heatmapData: Record<string, number> }) {
  // Build the last 365 days, grouped into weeks (columns of 7 days)
  const today = new Date();
  const days: { date: string; count: number; dayOfWeek: number }[] = [];

  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({
      date: dateStr,
      count: heatmapData[dateStr] || 0,
      dayOfWeek: d.getDay(),
    });
  }

  // Group into weeks (columns). Align so the first column starts on Sunday.
  const weeks: typeof days[] = [];
  let currentWeek: typeof days = [];

  // Pad the start so the first day aligns to the correct day-of-week
  const firstDow = days[0].dayOfWeek;
  for (let p = 0; p < firstDow; p++) {
    currentWeek.push({ date: "", count: -1, dayOfWeek: p }); // -1 = padding (no cell)
  }

  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  function cellColor(count: number): string {
    if (count < 0) return "transparent"; // padding
    if (count === 0) return "var(--color-paper-3)"; // no prayers
    if (count <= 2) return "color-mix(in oklab, var(--color-error) 35%, var(--color-paper-3))"; // 1-2 prayers
    if (count <= 4) return "color-mix(in oklab, var(--color-warmth) 50%, var(--color-paper-3))"; // 3-4 prayers
    return "var(--color-success)"; // all 5
  }

  function cellLabel(day: { date: string; count: number }): string {
    if (!day.date) return "";
    if (day.count === 0) return "No prayers";
    if (day.count === 5) return "All 5 prayed";
    return `${day.count}/5 prayed`;
  }

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Determine which weeks have a month boundary for labels
  const monthBoundaries: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstRealDay = week.find((d) => d.date);
    if (firstRealDay) {
      const month = parseInt(firstRealDay.date.split("-")[1]) - 1;
      if (month !== lastMonth) {
        monthBoundaries.push({ weekIndex: wi, label: monthLabels[month] });
        lastMonth = month;
      }
    }
  });

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Prayer Consistency</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          Last 365 days — each cell is one day
        </p>
      </div>
      <div className="overflow-x-auto px-4 py-4 sm:px-5">
        <div className="inline-block">
          {/* Month labels row */}
          <div className="mb-1 flex gap-[3px] pl-[20px]">
            {weeks.map((_, wi) => {
              const boundary = monthBoundaries.find((b) => b.weekIndex === wi);
              return (
                <div
                  key={wi}
                  className="w-[11px] text-[8px]"
                  style={{ color: "var(--color-ink-muted)", minWidth: boundary ? 24 : 11 }}
                >
                  {boundary?.label || ""}
                </div>
              );
            })}
          </div>

          {/* Heatmap grid: day labels + weeks */}
          <div className="flex gap-[3px]">
            {/* Day labels (Mon, Wed, Fri) */}
            <div className="flex flex-col gap-[3px] pr-1">
              {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
                <div key={i} className="h-[11px] text-[8px] leading-[11px]" style={{ color: "var(--color-ink-muted)", width: 20 }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks (columns) */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className="h-[11px] w-[11px] rounded-[2px] transition-colors"
                    style={{
                      backgroundColor: cellColor(day.count),
                      outline: day.count >= 0 ? "0.5px solid color-mix(in oklab, var(--color-ink) 8%, transparent)" : "none",
                    }}
                    title={day.date ? `${day.date}: ${cellLabel(day)}` : ""}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-1.5 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
            <span>Less</span>
            <div className="h-[11px] w-[11px] rounded-[2px]" style={{ backgroundColor: "var(--color-paper-3)" }} />
            <div className="h-[11px] w-[11px] rounded-[2px]" style={{ backgroundColor: "color-mix(in oklab, var(--color-error) 35%, var(--color-paper-3))" }} />
            <div className="h-[11px] w-[11px] rounded-[2px]" style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 50%, var(--color-paper-3))" }} />
            <div className="h-[11px] w-[11px] rounded-[2px]" style={{ backgroundColor: "var(--color-success)" }} />
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

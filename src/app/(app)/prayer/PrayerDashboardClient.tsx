"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Flame, MapPin, Users, User, UserPlus, Copy, Check, Calendar, WifiOff, Trophy, TrendingUp, Target, Bell, Link2, ChevronDown, MessageCircle, Pencil } from "lucide-react";
import { getSunnahsForMadhab, type SunnahDefinition } from "@/lib/prayer/sunnahs";
import { getCurrentMinutesInTimezonePrecise, todayInTimezone, prayerDisplayName, openPrayer } from "@/lib/prayer/checkin";
import { getCachedPrayerSettings, getCachedHaydPeriods, setCachedHaydPeriods, setCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { shareNative, hapticNotification } from "@/lib/native-bridge";
import { useUISFX } from "@/components/uisfx-provider";
import { getOfflineDB } from "@/lib/offline/db";
import { upsertSunnahLogToCache, cacheBlob } from "@/lib/offline/cache-writers";
import PrayerCheckinPopup from "@/components/prayer-checkin-popup";
import type { PrayerKey } from "@/lib/prayer/checkin";

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
  weekCompleteDays?: number;
  weekMasjidPct?: number;
  weekSunnah?: number;
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
  /** Server-resolved label: nickname → first → collision-suffixed name. */
  shownName?: string;
  nickname?: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  streak: number | null;
  weekCompleteDays: number | null;
  totalPrayed: number | null;
  masjidPct: number | null;
  thisWeekPrayed: number | null;
  lastPrayedDate: string | null;
  todayLogs: Array<{ prayerName: string; status: string }>;
  todaySunnahs: string[];
  todayVisible: boolean;
  remindedAt: Record<string, string>;
  cheeredToday?: boolean;
  sharedStreak?: { streak: number; bestStreak: number; lastDate: string | null } | null;
  timezone: string;
  weekSunnah?: number;
  times?: PrayerTimes | null;
}

interface QadaaInfo {
  fajrOwed: number;
  dhuhrOwed: number;
  asrOwed: number;
  maghribOwed: number;
  ishaOwed: number;
  setupCompleted: boolean;
  unloggedMissed?: number;
  unloggedByPrayer?: Record<string, number>;
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
// Mirrors the server: a nudge can repeat once the 2-minute cooldown passes.
const REMIND_COOLDOWN_MS = 2 * 60 * 1000;

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
      // Isha runs until next day's Fajr — same convention as the API (>1440).
      windowEnd = todayTimes.fajr >= 0 ? todayTimes.fajr + 1440 : prayerStart + 360;
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

type Tab = "overview" | "friends" | "stats";

type StatsRange = "weekly" | "monthly" | "yearly" | "all-time";

export default function PrayerDashboard() {
  // Deep links: ?tab=friends → friends mgmt, ?tab=stats|qadaa → stats.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "friends") return "friends";
    if (t === "stats" || t === "qadaa") return "stats";
    return "overview";
  });
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  // Check-in popup — the league's primary action; which salah is being logged.
  const [checkinPrayer, setCheckinPrayer] = useState<PrayerKey | null>(null);
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
    requester: { id: string; firstName: string | null; displayName: string | null; avatarUrl: string | null };
  }>>([]);
  const [sentRequests, setSentRequests] = useState<Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    status: "pending" | "accepted" | "rejected" | "expired";
    createdAt: string;
    expiresAt: string | null;
  }>>([]);
  const [friendsView, setFriendsView] = useState<"mine" | "add">("mine");
  // Nickname editing — id of the friend whose field is open.
  const [nickEditing, setNickEditing] = useState<string | null>(null);
  const [nickValue, setNickValue] = useState("");

  async function saveNickname(friendId: string) {
    const res = await fetch("/api/prayer-friends/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId, nickname: nickValue }),
    }).catch(() => null);
    if (res?.ok) {
      setNickEditing(null);
      void refreshFriends();
    }
  }
  const [visOpen, setVisOpen] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<{
    friendsSeeStreak: boolean;
    friendsSeeTodayStatus: boolean;
    friendsSeeSunnah: boolean;
    friendsSeeMasjidPct: boolean;
    friendsNotifyComplete: boolean;
    friendsSearchable: boolean;
  }>({ friendsSeeStreak: true, friendsSeeTodayStatus: true, friendsSeeSunnah: false, friendsSeeMasjidPct: true, friendsNotifyComplete: false, friendsSearchable: true });
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<{ name: string; code: string; relation: string | null; avatarUrl: string | null }[] | null>(null);
  const [raceSort, setRaceSort] = useState<"streak" | "week">("week");
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [qadaaMsg, setQadaaMsg] = useState<string | null>(null);
  const [setupFajr, setSetupFajr] = useState(0);
  const [setupDhuhr, setSetupDhuhr] = useState(0);
  const [setupAsr, setSetupAsr] = useState(0);
  const [setupMaghrib, setSetupMaghrib] = useState(0);
  const [setupIsha, setSetupIsha] = useState(0);
  const [qadaaSetting, setQadaaSetting] = useState(false);
  const [unloggedBusy, setUnloggedBusy] = useState(false);
  const [adjustPrayer, setAdjustPrayer] = useState<string>("fajr");
  const [adjustAmount, setAdjustAmount] = useState(1);
  // Hayd tracking — only meaningful when gender==='female' && haydTracking
  const [gender, setGender] = useState<string | null>(null);
  const [haydTracking, setHaydTracking] = useState(false);
  const [haydPeriods, setHaydPeriods] = useState<Array<{ id: string; startDate: string; endDate: string | null }>>(() => getCachedHaydPeriods());
  const [haydBusy, setHaydBusy] = useState(false);

  // Today's data for comparison tab
  const [todayLogs, setTodayLogs] = useState<TodayLog[]>([]);
  const [todaySunnahs, setTodaySunnahs] = useState<string[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [madhab, setMadhab] = useState<string>("hanafi");
  const [sunnahError, setSunnahError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  // Configured prayer timezone — seeded from localStorage so first render is
  // correct; analytics.timezone takes over once loaded (derived, no effect).
  const cachedTimezone = getCachedPrayerSettings()?.timezone ?? null;
  const userTimezone = analytics?.timezone ?? cachedTimezone;
  // Current wall-clock minutes in the configured timezone — device-local
  // getHours() is wrong whenever the device is in a different timezone.
  const nowMinutesInTz = currentTime
    ? (userTimezone
        ? getCurrentMinutesInTimezonePrecise(userTimezone)
        : currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60)
    : 0;

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
    ? todayInTimezone(userTimezone)
    : null; // null until client mounts — prevents fetching with 1970-01-01

  // Dhuhr displays as Jumu'ah on Fridays — same log row, just a label.
  // Qadaa/analytics keep "Dhuhr" since they aggregate across all days.
  const prayerLabel = useCallback((key: string) => prayerDisplayName(key, todayStr ?? undefined), [todayStr]);

  const fetchTodayData = useCallback(async () => {
    if (!todayStr) return;
    try {
      const [logsRes, sunnahRes, timesRes, analyticsRes] = await Promise.all([
        fetch(`/api/prayer-log?date=${todayStr}`).catch(() => null),
        fetch(`/api/prayer-log/sunnah?date=${todayStr}`).catch(() => null),
        fetch(`/api/prayer-times?date=${todayStr}`).catch(() => null),
        // League row must reflect a check-in immediately — the "You" card's
        // week/streak numbers come from analytics, not todayLogs.
        fetch(`/api/prayer-log/analytics?range=${statsRange}`).catch(() => null),
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
      if (analyticsRes?.ok) {
        const data = await analyticsRes.json().catch(() => null);
        if (data) setAnalytics(data);
      }
    } catch {
      // ignore
    }
  }, [todayStr, statsRange, setTodayLogs]);

  const refreshFriends = useCallback(async () => {
    const res = await fetch("/api/prayer-friends").catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) {
        setFriends(data);
        cacheBlob("friends", data);
      }
    }
  }, []);

  // ── Refresh data when coming back online ──
  useEffect(() => {
    const onOnline = () => void fetchTodayData();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [fetchTodayData]);

  // ── Live status propagation ──
  // Local check-ins broadcast "waqt:prayer-updated" (fired by the check-in
  // popup app-wide). Remote friends' updates arrive via a 15s poll while a
  // status-bearing tab is open, plus an immediate refresh on tab return.
  useEffect(() => {
    const onUpdated = () => { void fetchTodayData(); void refreshFriends(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") onUpdated();
    };
    window.addEventListener("waqt:prayer-updated", onUpdated);
    window.addEventListener("waqt:dua-due", onUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("waqt:prayer-updated", onUpdated);
      window.removeEventListener("waqt:dua-due", onUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchTodayData, refreshFriends]);

  useEffect(() => {
    if (activeTab === "stats") return;
    const t = setInterval(() => void refreshFriends(), 15_000);
    return () => clearInterval(t);
  }, [activeTab, refreshFriends]);

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
        const [analyticsRes, friendsRes, codeRes, qadaaRes, logsRes, sunnahRes, timesRes, pendingRes, outgoingRes, visibilityRes, profileRes, haydRes] = await Promise.all([
          fetch(`/api/prayer-log/analytics?range=${statsRange}`).catch(() => null),
          fetch("/api/prayer-friends").catch(() => null),
          fetch("/api/prayer-friends/my-code").catch(() => null),
          fetch("/api/qadaa").catch(() => null),
          fetch(`/api/prayer-log?date=${todayStr}`).catch(() => null),
          fetch(`/api/prayer-log/sunnah?date=${todayStr}`).catch(() => null),
          fetch(`/api/prayer-times?date=${todayStr}`).catch(() => null),
          fetch("/api/prayer-friends/pending").catch(() => null),
          fetch("/api/prayer-friends/outgoing").catch(() => null),
          fetch("/api/settings/prayer-settings").catch(() => null),
          fetch("/api/profile").catch(() => null),
          fetch("/api/hayd").catch(() => null),
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
        if (outgoingRes?.ok) {
          const data = await outgoingRes.json().catch(() => ({ requests: [] }));
          if (data?.requests && Array.isArray(data.requests)) setSentRequests(data.requests);
        }
        if (profileRes?.ok) {
          const data = await profileRes.json().catch(() => null);
          if (data?.avatarUrl) setMyAvatar(data.avatarUrl);
        }
        if (visibilityRes?.ok) {
          const data = await visibilityRes.json().catch(() => null);
          if (data) {
            // Seed the offline settings cache so location-dependent UI
            // (masjid finder, hayd, day view) works on first render.
            if (data.latitude && data.longitude) {
              setCachedPrayerSettings({
                timezone: data.timezone ?? "UTC",
                calculationMethod: data.calculationMethod ?? 2,
                madhab: data.madhab ?? null,
                latitude: data.latitude,
                longitude: data.longitude,
              });
            }
          }
          if (data && typeof data.friendsSeeStreak === "boolean") {
            setVisibility({
              friendsSeeStreak: data.friendsSeeStreak,
              friendsSeeTodayStatus: data.friendsSeeTodayStatus,
              friendsSeeSunnah: data.friendsSeeSunnah,
              friendsSeeMasjidPct: data.friendsSeeMasjidPct,
              friendsNotifyComplete: data.friendsNotifyComplete === true,
              friendsSearchable: data.friendsSearchable !== false,
            });
            setGender(data.gender ?? null);
            setHaydTracking(data.haydTracking === true);
          }
        }
        if (haydRes?.ok) {
          const data = await haydRes.json().catch(() => null);
          if (data?.periods) {
            setHaydPeriods(data.periods);
            setCachedHaydPeriods(data.periods);
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

  // Update current time every second for the countdown (shows seconds)
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
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

  async function handleInviteLink() {
    setFriendError(null);
    try {
      const res = await fetch("/api/prayer-friends/invite", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setFriendError(data.error || "Couldn't create invite link.");
        setTimeout(() => setFriendError(null), 4000);
        return;
      }
      const shared = await shareNative({
        title: "Be my prayer buddy on Waqt",
        text: `Add me as a prayer buddy on Waqt — open this link: ${data.url}`,
        url: data.url,
      });
      if (!shared) {
        try {
          await navigator.clipboard.writeText(data.url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
      }
    } catch {
      setFriendError("Network error.");
      setTimeout(() => setFriendError(null), 4000);
    }
  }


  // Debounced "find by name" — prefix match server-side, 300ms quiet period
  useEffect(() => {
    const t = setTimeout(() => {
      const q = nameQuery.trim();
      if (q.length < 2) { setNameResults(null); return; }
      fetch(`/api/prayer-friends/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => setNameResults(Array.isArray(d.results) ? d.results : []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  async function handleAddFriend(codeArg?: string) {
    const code = (codeArg ?? addFriendCode).trim().toUpperCase();
    if (!code) return;
    setFriendError(null);
    setFriendSuccess(null);
    setAddingFriend(true);
    try {
      const res = await fetch("/api/prayer-friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.pending) {
        setFriendSuccess(data.message || "Friend request sent! They'll need to accept it.");
        setAddFriendCode("");
        setNameQuery("");
        setNameResults(null);
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
        setNameQuery("");
        setNameResults(null);
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

  const [reminding, setReminding] = useState<Set<string>>(new Set());
  const [nudgeToast, setNudgeToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const { play: playSfx } = useUISFX();

  function showNudgeToast(msg: string, ok: boolean) {
    setNudgeToast({ msg, ok });
    setTimeout(() => setNudgeToast(null), 2600);
  }

  async function handleRemindFriend(friendId: string, prayerName: string) {
    const key = `${friendId}:${prayerName}`;
    if (reminding.has(key)) return;
    setReminding((prev) => new Set(prev).add(key));
    playSfx("send"); // same cue family as the fidget/learn sounds
    const label = prayerName.charAt(0).toUpperCase() + prayerName.slice(1);
    const friendName = friends.find((f) => f.id === friendId)?.shownName || friends.find((f) => f.id === friendId)?.displayName || friends.find((f) => f.id === friendId)?.firstName || "your friend";
    try {
      const res = await fetch("/api/prayer-friends/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId, prayerName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFriends((prev) => {
          const updated = prev.map((f) =>
            f.id === friendId
              ? { ...f, remindedAt: { ...(f.remindedAt ?? {}), [prayerName]: data.remindedAt ?? new Date().toISOString() } }
              : f,
          );
          cacheBlob("friends", updated);
          return updated;
        });
        showNudgeToast(`Nudged ${friendName} to pray ${label}`, true);
      } else {
        showNudgeToast(data.error || "Couldn't send the nudge.", false);
      }
    } catch {
      showNudgeToast("Network error — try again.", false);
    } finally {
      setReminding((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleToggleVisibility(
    key: keyof typeof visibility,
    value: boolean,
  ) {
    const prev = visibility;
    const next = { ...visibility, [key]: value };
    setVisibility(next);
    try {
      const res = await fetch("/api/settings/prayer-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Server rejected the change");
    } catch {
      // revert on failure (network error or non-OK response)
      setVisibility(prev);
    }
  }

  async function handleToggleSunnah(sunnahKey: string) {
    if (!todayStr) return; // Not ready yet
    const isLogged = todaySunnahs.includes(sunnahKey);
    setSunnahError(null);
    // Optimistic update for immediate feedback
    const prevSunnahs = todaySunnahs;
    setTodaySunnahs(!isLogged ? [...prevSunnahs, sunnahKey] : prevSunnahs.filter((k) => k !== sunnahKey));
    upsertSunnahLogToCache(todayStr, sunnahKey, !isLogged);
    try {
      const res = await fetch("/api/prayer-log/sunnah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayStr, sunnahKey, prayed: !isLogged }),
      });
      if (res.ok) {
        invalidateApiCache("/api/prayer-log");
      } else {
        // Revert optimistic update on server rejection
        setTodaySunnahs(prevSunnahs);
        upsertSunnahLogToCache(todayStr, sunnahKey, isLogged);
        const data = await res.json().catch(() => ({}));
        setSunnahError(data.error || "Failed to update sunnah.");
        setTimeout(() => setSunnahError(null), 4000);
      }
    } catch {
      // Network error — keep optimistic state (SW will queue the write)
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

  async function handleUnlogged(action: "absorb" | "dismiss") {
    setUnloggedBusy(true);
    try {
      const res = await fetch("/api/qadaa/unlogged", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setQadaa(data);
        cacheBlob("qadaa", data);
        invalidateApiCache("/api/qadaa");
        setQadaaMsg(action === "absorb" ? "Missed prayers added to qadaa." : "Dismissed.");
        setTimeout(() => setQadaaMsg(null), 3000);
      } else {
        setQadaaMsg(data?.error || "Something went wrong.");
        setTimeout(() => setQadaaMsg(null), 4000);
      }
    } catch {
      setQadaaMsg("Network error. Please try again.");
      setTimeout(() => setQadaaMsg(null), 4000);
    } finally {
      setUnloggedBusy(false);
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
  // League rows all use the same Sunday→today window — never the selectable
  // stats range, or changing the stats filter would silently shift the race.
  const myComplete = analytics?.weekCompleteDays || 0;
  const myMasjidPct = analytics?.weekMasjidPct || 0;

  // Hayd: does any recorded period cover today? Open-ended counts.
  const haydToday = !!todayStr && haydPeriods.some(
    (p) => todayStr >= p.startDate && (!p.endDate || todayStr <= p.endDate),
  );
  const haydActive = haydPeriods.some((p) => !p.endDate);

  // Get prayer status for today — a hayd-covered day reads as excused when
  // nothing was logged yet (server writes 'excused' at day close).
  const getPrayerStatus = (prayer: string): string => {
    const log = todayLogs.find((l) => l.prayerName === prayer);
    const status = log?.status || "pending";
    return haydToday && status === "pending" ? "excused" : status;
  };

  async function toggleHayd() {
    setHaydBusy(true);
    try {
      const res = await fetch("/api/hayd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: haydActive ? "end" : "start" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok || data?.offline) {
        const list = await fetch("/api/hayd").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (list?.periods) {
          setHaydPeriods(list.periods);
          setCachedHaydPeriods(list.periods);
        } else if (data?.offline && todayStr) {
          // Offline: the SW queued the write — apply it to the local periods
          // so the UI reflects the change without a server round-trip.
          const next = haydActive
            ? haydPeriods.map((p) => (p.endDate ? p : { ...p, endDate: todayStr }))
            : [...haydPeriods, { id: `local-${Date.now()}`, startDate: todayStr, endDate: null }];
          setHaydPeriods(next);
          setCachedHaydPeriods(next);
        }
      }
    } finally {
      setHaydBusy(false);
    }
  }

  const isPrayed = (prayer: string) => {
    const status = getPrayerStatus(prayer);
    return status === "prayed" || status === "assumed_prayed";
  };

  const sunnahDefinitions = getSunnahsForMadhab(madhab);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="sr-only">Prayer</h1>

      {/* Nudge toast — quick floating confirmation, self-dismisses ~2.6s */}
      {nudgeToast && (
        <div
          role="status"
          className="waqt-fade-up fixed left-1/2 top-[calc(env(safe-area-inset-top)+3.75rem)] z-[86] flex w-full max-w-sm -translate-x-1/2 items-center gap-2.5 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md lg:top-4"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "color-mix(in oklab, var(--color-paper) 96%, transparent)",
            width: "calc(100% - 1.5rem - env(safe-area-inset-left) - env(safe-area-inset-right))",
          }}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: nudgeToast.ok
                ? "color-mix(in oklab, var(--color-success) 14%, transparent)"
                : "color-mix(in oklab, #b42318 12%, transparent)",
              color: nudgeToast.ok ? "var(--color-success)" : "#b42318",
            }}
          >
            {nudgeToast.ok ? <Bell className="h-3.5 w-3.5 waqt-bell-ring" /> : <span className="text-xs font-bold">!</span>}
          </span>
          <p className="min-w-0 flex-1 text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            {nudgeToast.msg}
          </p>
        </div>
      )}

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

      {/* Hayd control — female accounts with tracking enabled only */}
      {gender === "female" && haydTracking && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: haydActive ? "var(--color-accent)" : "var(--color-paper-3)",
            backgroundColor: haydActive ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
          }}
        >
          <span style={{ color: haydActive ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
            {haydActive
              ? "Hayd active — prayers are excused and your streak is safe."
              : "On your period? Mark hayd days to pause check-ins."}
          </span>
          <button
            onClick={toggleHayd}
            disabled={haydBusy}
            className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: haydActive ? "var(--color-accent)" : "var(--color-ink)",
              color: "var(--color-paper)",
            }}
          >
            {haydBusy ? "..." : haydActive ? "End hayd" : "Start hayd"}
          </button>
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-xl border p-1" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
        {([
          { key: "overview" as Tab, label: "Overview" },
          { key: "friends" as Tab, label: "Friends" },
          { key: "stats" as Tab, label: "Stats" },
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
      {activeTab === "overview" && (
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
              const nowMin = nowMinutesInTz;
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
                      {prayerLabel(next.name)}
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
                  const curMin = nowMinutesInTz;
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
                  const excused = getPrayerStatus(prayer) === "excused";
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
                  const currentMinutes = nowMinutesInTz;

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
                        {/* Node — tap to log this prayer */}
                        <button
                          onClick={() => setCheckinPrayer(prayer)}
                          aria-label={`Log ${prayerLabel(prayer)}`}
                          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors hover:bg-[var(--color-paper-2)] active:scale-90 sm:h-10 sm:w-10"
                          style={{
                            borderColor: prayed ? color : excused ? "var(--color-accent)" : isCurrent ? color : "var(--color-paper-3)",
                            backgroundColor: prayed ? color : excused ? "color-mix(in oklab, var(--color-accent) 12%, transparent)" : isCurrent ? "color-mix(in oklab, " + color + " 10%, transparent)" : "transparent",
                            ...(isCurrent && !prayed && !excused ? { boxShadow: "0 0 0 3px color-mix(in oklab, " + color + " 25%, transparent)" } : {}),
                          }}
                        >
                          {prayed ? (
                            <Check className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--color-paper)" }} />
                          ) : excused ? (
                            <span className="text-[10px] font-bold" style={{ color: "var(--color-accent)" }}>E</span>
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
                        </button>
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
                                {prayerLabel(prayer)}
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
                              ) : excused ? (
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)",
                                    color: "var(--color-accent)",
                                  }}
                                >
                                  Excused
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
                                // effectiveCurrent is fractional minutes —
                                // work in whole seconds so nothing decimals.
                                const totalSec = Math.max(0, Math.floor((windowEndMinutes - effectiveCurrent) * 60));
                                const hrs = Math.floor(totalSec / 3600);
                                const mins = Math.floor((totalSec % 3600) / 60);
                                const secs = totalSec % 60;
                                const label = totalSec < 1800
                                  ? `${mins}m ${secs}s left`
                                  : `${hrs > 0 ? `${hrs}h ` : ""}${mins}m left`;
                                return (
                                  <span className="ml-1.5" style={{ color: prayed ? "var(--color-ink-muted)" : "var(--color-warmth)" }}>
                                    {label}
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
                                    ? `${prayerLabel(prayer)} hasn't started yet`
                                    : windowPassed
                                      ? `${prayerLabel(prayer)} window has ended`
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
                                    ? `Log ${prayerLabel(prayer)} as prayed first`
                                    : windowPassed
                                      ? `${prayerLabel(prayer)} window has ended`
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
                                      : `${prayerLabel(prayer)} hasn't started yet`;
                                  } else {
                                    standaloneDisabled = !timeStarted;
                                    standaloneReason = `${prayerLabel(prayer)} hasn't started yet`;
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

          {/* ── League — this week's standing. Fard count ranks; confirmed
              sunnah (muakkadah + witr) breaks the tie. ── */}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <Trophy className="h-4 w-4" /> League
              </h2>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                Ranked on this week&apos;s fard — sunnah &amp; witr break the tie. 🔥 is your shared streak.
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
              {(() => {
                const myScore = { week: myWeekPrayed, sunnah: analytics?.weekSunnah ?? 0 };
                const entries: Array<{ key: string; friend?: Friend }> = [
                  { key: "me" },
                  ...friends.map((f) => ({ key: f.id, friend: f })),
                ];
                entries.sort((a, b) => {
                  const aw = a.friend ? (a.friend.thisWeekPrayed ?? -1) : myScore.week;
                  const bw = b.friend ? (b.friend.thisWeekPrayed ?? -1) : myScore.week;
                  if (bw !== aw) return bw - aw;
                  const as = a.friend?.weekSunnah ?? (a.friend ? 0 : myScore.sunnah);
                  const bs = b.friend?.weekSunnah ?? (b.friend ? 0 : myScore.sunnah);
                  return bs - as;
                });
                return entries.map((entry, idx) => {
                  const rank = idx + 1;
                  if (!entry.friend) {
                    return (
                      <ComparisonRow
                        key="me"
                        rank={rank}
                        name="You"
                        isMe
                        streak={myStreak}
                        weekSunnah={myScore.sunnah}
                        todayLogs={todayLogs}
                        todaySunnahs={todaySunnahs}
                        prayerTimes={prayerTimes}
                        currentTime={currentTime}
                        madhab={madhab}
                        timezone={userTimezone}
                        onCheckIn={setCheckinPrayer}
                      />
                    );
                  }
                  const friend = entry.friend;
                  return (
                    <ComparisonRow
                      key={friend.id}
                      rank={rank}
                      name={friend.shownName || friend.firstName || friend.displayName || "Friend"}
                      isMe={false}
                      streak={friend.streak ?? 0}
                      sharedStreak={friend.sharedStreak?.streak ?? 0}
                      weekSunnah={friend.weekSunnah ?? 0}
                      todayLogs={friend.todayLogs}
                      todaySunnahs={friend.todaySunnahs}
                      // Their own cached times decide the open salah — never
                      // fall back to the viewer's times, or "now" in their
                      // timezone gets compared against OUR salah schedule and
                      // highlights the wrong dot (zuhr-vs-asr bug).
                      prayerTimes={friend.times ?? null}
                      currentTime={currentTime}
                      madhab={madhab}
                      timezone={friend.timezone}
                      todayVisible={friend.todayVisible}
                      remindedAt={friend.remindedAt}
                      reminding={new Set([...reminding].filter((k) => k.startsWith(`${friend.id}:`)).map((k) => k.split(":")[1]))}
                      onRemind={(prayer) => handleRemindFriend(friend.id, prayer)}
                    />
                  );
                });
              })()}
              {friends.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <Users className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
                  <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    Add friends below to start competing.
                  </p>
                </div>
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
          TAB: QADAA (inside Stats)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "stats" && (
        <div className="mt-6 space-y-6">
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

                {(qadaa.unloggedMissed ?? 0) > 0 && (
                  <div
                    className="mb-3 flex flex-col gap-2.5 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    style={{
                      borderColor: "var(--color-warmth)",
                      backgroundColor: "color-mix(in oklab, var(--color-warmth) 7%, transparent)",
                    }}
                    role="status"
                  >
                    <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                      {qadaa.unloggedMissed} {qadaa.unloggedMissed === 1 ? "prayer was" : "prayers were"} not logged
                      and marked as missed
                      {(() => {
                        const labels: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
                        const parts = (["fajr", "dhuhr", "asr", "maghrib", "isha"] as const)
                          .filter((k) => (qadaa.unloggedByPrayer?.[k] ?? 0) > 0)
                          .map((k) => `${qadaa.unloggedByPrayer![k]} ${labels[k]}`);
                        return parts.length > 0 ? ` (${parts.join(", ")})` : "";
                      })()}
                      {" "}since the last time you updated the qadaa tracker.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handleUnlogged("absorb")}
                        disabled={unloggedBusy}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}
                      >
                        Add to qadaa
                      </button>
                      <button
                        onClick={() => handleUnlogged("dismiss")}
                        disabled={unloggedBusy}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

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
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <Users className="h-4 w-4" /> Friends
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFriendsView("mine")}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: friendsView === "mine" ? "var(--color-accent)" : "transparent",
                    color: friendsView === "mine" ? "var(--color-paper)" : "var(--color-ink-muted)",
                    border: "1px solid var(--color-paper-3)",
                  }}
                >
                  Friends{friends.length > 0 ? ` (${friends.length})` : ""}
                </button>
                <button
                  onClick={() => setFriendsView("add")}
                  aria-label={`Add friends${pendingRequests.length > 0 ? ` — ${pendingRequests.length} pending request${pendingRequests.length === 1 ? "" : "s"}` : ""}`}
                  title="Add friends"
                  className="relative flex h-7 w-7 items-center justify-center rounded-lg border transition-colors"
                  style={{
                    borderColor: "var(--color-paper-3)",
                    backgroundColor: friendsView === "add" ? "var(--color-accent)" : "transparent",
                    color: friendsView === "add" ? "var(--color-paper)" : "var(--color-ink-muted)",
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {pendingRequests.length > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                      style={{ backgroundColor: "var(--color-warmth)", color: "var(--color-paper)" }}
                    >
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              You only see each other&apos;s stats after both sides accept — and only what each person shares.
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            {friendsView === "add" && (<>
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
                  <button
                    onClick={handleInviteLink}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", minHeight: 40 }}
                    title="Share a one-time invite link — no code entry needed"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Link
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
                    onClick={() => handleAddFriend()}
                    disabled={addingFriend || !addFriendCode.trim()}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", minHeight: 40 }}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> {addingFriend ? "Adding..." : "Add"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Find by name ── */}
            <div className="relative mb-4">
              <input
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Search by name — e.g. “Saad”"
                maxLength={40}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 40 }}
                aria-label="Search friends by name"
              />
              {nameResults !== null && nameQuery.trim().length >= 2 && (
                <div className="mt-1 space-y-1 rounded-xl border p-1.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                  {nameResults.length === 0 && (
                    <p className="px-2 py-1.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>No one by that name — they may have hidden themselves in settings.</p>
                  )}
                  {nameResults.map((r) => (
                    <div key={r.code} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {r.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data URL avatar
                          <img src={r.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" style={{ outline: "1px solid var(--color-paper-3)" }} />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>
                            {r.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                        <span className="block truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>{r.name}</span>
                        <span className="text-[11px] tracking-wider" style={{ color: "var(--color-ink-muted)" }}>{r.code}</span>
                        </div>
                      </div>
                      {r.relation === "accepted" ? (
                        <span className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>Friends ✓</span>
                      ) : r.relation === "pending" ? (
                        <span className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>Pending</span>
                      ) : (
                        <button
                          onClick={() => handleAddFriend(r.code)}
                          disabled={addingFriend}
                          className="rounded-lg border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                          style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {friendError && <p className="mb-3 text-xs" style={{ color: "var(--color-warmth)" }}>{friendError}</p>}
            {friendSuccess && <p className="mb-3 text-xs" style={{ color: "var(--color-success)" }}>{friendSuccess}</p>}

            {/* ── Visibility controls — collapsed by default ── */}
            <div className="mb-4 rounded-xl border" style={{ borderColor: "var(--color-paper-3)" }}>
              <button
                onClick={() => setVisOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                aria-expanded={visOpen}
                aria-controls="friend-visibility-panel"
              >
                <span>
                  <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                    What friends can see
                  </span>
                  <span className="mt-0.5 block text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    Your privacy settings — apply to every friend, current and future.
                  </span>
                </span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform"
                  style={{ color: "var(--color-ink-muted)", transform: visOpen ? "rotate(180deg)" : undefined }}
                />
              </button>
              {visOpen && (
                <div id="friend-visibility-panel" className="flex flex-col gap-3 border-t px-3 pb-3 pt-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
                  {([
                    { key: "friendsSeeStreak", label: "My streak & complete days", help: "Friends see your current streak and how many fully-complete days you've had." },
                    { key: "friendsSeeTodayStatus", label: "Today's per-prayer status", help: "Friends see which of today's five prayers you've logged — the dots under their name." },
                    { key: "friendsSeeSunnah", label: "Today's sunnah prayers", help: "Friends see which sunnahs you've logged today, alongside the fard dots." },
                    { key: "friendsSeeMasjidPct", label: "My masjid percentage", help: "Friends see what share of your logged prayers were at the masjid." },
                    { key: "friendsNotifyComplete", label: "Notify me when a friend completes all 5", help: "You get a push when a friend finishes their day — it does not share anything extra about you." },
                    { key: "friendsSearchable", label: "Let others find me by name", help: "People who aren't your friend can find you in name search. They still need to send a request you accept." },
                  ] as const).map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>{item.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: "var(--color-ink-muted)" }}>{item.help}</span>
                      </div>
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
                    </div>
                  ))}
                  <p className="border-t pt-2.5 text-[10px] leading-snug" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                    Changes apply to <b>all existing friends</b> immediately — these are account-level settings, not per-friend. People who haven&apos;t accepted you (or you them) never see these stats regardless.
                  </p>
                </div>
              )}
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
                    {req.requester.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL avatar
                      <img src={req.requester.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ outline: "1px solid var(--color-paper-3)" }} />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                        {(req.requester.firstName || req.requester.displayName || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
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

            {/* ── Requests I've sent — status is server-authoritative;
                pending lapses to "expired" 72h after sending ── */}
            {sentRequests.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  Requests you&rsquo;ve sent
                </p>
                {sentRequests.map((req) => {
                  const chip = {
                    pending: { label: "Pending", color: "var(--color-accent)" },
                    accepted: { label: "Accepted", color: "var(--color-success)" },
                    rejected: { label: "Declined", color: "var(--color-ink-muted)" },
                    expired: { label: "Expired", color: "var(--color-ink-muted)" },
                  }[req.status];
                  return (
                    <div
                      key={req.id}
                      className="flex items-center gap-3 rounded-xl border p-3"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                    >
                      {req.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL avatar
                        <img src={req.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ outline: "1px solid var(--color-paper-3)" }} />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}>
                          {req.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{req.name}</div>
                        <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          sent {new Date(req.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          {req.expiresAt && ` · expires ${new Date(req.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${new Date(req.expiresAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          color: chip.color,
                          backgroundColor: `color-mix(in oklab, ${chip.color} 10%, transparent)`,
                        }}
                      >
                        {chip.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            </>)}

            {friendsView === "mine" && (<>
            {friends.length === 0 ? (
              <div className="rounded-lg border border-dashed py-6 text-center" style={{ borderColor: "var(--color-paper-3)" }}>
                <Users className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
                <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  No friends yet — add one in the <b>Add friends</b> tab, then compete here.
                </p>
                <button
                  onClick={() => setFriendsView("add")}
                  className="mt-3 rounded-lg border px-3 py-1.5 text-xs font-medium"
                  style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                >
                  Add friends
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Weekly race vs all-time streak — a fresh race every week so
                    newer friends can actually win (Duolingo league model) */}
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                    Leaderboard
                  </p>
                  <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--color-paper-3)" }}>
                    {([
                      { key: "week", label: "This week" },
                      { key: "streak", label: "Streak" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setRaceSort(opt.key)}
                        className="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: raceSort === opt.key ? "var(--color-accent)" : "transparent",
                          color: raceSort === opt.key ? "var(--color-paper)" : "var(--color-ink-muted)",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="flex items-center gap-3 rounded-xl border p-3"
                  style={{
                    borderColor: "var(--color-accent)",
                    backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, transparent)",
                  }}
                >
                  {myAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL avatar
                    <img src={myAvatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ outline: "1px solid var(--color-paper-3)" }} />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                      You
                    </div>
                  )}
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

                {[...friends]
                  .sort((a, b) => raceSort === "week"
                    ? (b.thisWeekPrayed ?? -1) - (a.thisWeekPrayed ?? -1) || (b.streak ?? -1) - (a.streak ?? -1)
                    : (b.streak ?? -1) - (a.streak ?? -1) || (b.thisWeekPrayed ?? -1) - (a.thisWeekPrayed ?? -1))
                  .map((friend, idx) => {
                  const streakVal = friend.streak ?? null;
                  const imWinning = streakVal !== null && myStreak >= streakVal;
                  const streakLabel = streakVal !== null ? streakVal : "—";
                  const subStats: string[] = [];
                  if (friend.thisWeekPrayed !== null) subStats.push(`${friend.thisWeekPrayed} this week`);
                  if (friend.weekCompleteDays !== null) subStats.push(`${friend.weekCompleteDays} complete`);
                  if (friend.masjidPct !== null) subStats.push(`${friend.masjidPct}% masjid`);
                  return (
                    <div
                      key={friend.id}
                      className="relative rounded-xl border p-3"
                      style={{ borderColor: "var(--color-paper-3)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          {friend.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- data URL avatar
                            <img
                              src={friend.avatarUrl}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                              style={{ outline: "1px solid var(--color-paper-3)" }}
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                              style={{
                                backgroundColor: idx === 0 ? "color-mix(in oklab, var(--color-warmth) 20%, transparent)" : "var(--color-paper-2)",
                                color: idx === 0 ? "var(--color-warmth)" : "var(--color-ink-muted)",
                              }}
                            >
                              {(friend.shownName || friend.firstName || friend.displayName || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
                            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                          >
                            {idx + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                            <span className="truncate">{friend.shownName || friend.firstName || friend.displayName || "Friend"}</span>
                            <button
                              onClick={() => { setNickEditing(friend.id); setNickValue(friend.nickname ?? ""); }}
                              className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70"
                              style={{ color: "var(--color-ink-muted)" }}
                              aria-label={`Set a nickname for ${friend.shownName || "friend"}`}
                              title="Set nickname — only you see it"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                          {friend.nickname && (
                            <div className="truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                              {friend.firstName || friend.displayName}
                            </div>
                          )}
                          {nickEditing === friend.id && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={nickValue}
                                onChange={(e) => setNickValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") void saveNickname(friend.id); if (e.key === "Escape") setNickEditing(null); }}
                                placeholder="Nickname — only you see it"
                                maxLength={40}
                                className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
                                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                              />
                              <button
                                onClick={() => void saveNickname(friend.id)}
                                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium"
                                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                              >
                                Save
                              </button>
                            </div>
                          )}
                          <div className="truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                            {subStats.length > 0 ? subStats.join(" · ") : "Stats private"}
                          </div>
                          {friend.sharedStreak && friend.sharedStreak.streak > 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
                              <Link2 className="h-3 w-3" />
                              {friend.sharedStreak.streak}-day chain together
                              {friend.sharedStreak.bestStreak > friend.sharedStreak.streak && (
                                <span style={{ color: "var(--color-ink-muted)" }}>(best {friend.sharedStreak.bestStreak})</span>
                              )}
                            </div>
                          )}
                        </div>
                        <Link
                          href={`/messages/${friend.id}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors"
                          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                          aria-label={`Message ${friend.shownName || friend.firstName || friend.displayName || "friend"}`}
                          title="Message"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href={`/profile/${friend.id}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors"
                          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                          aria-label={`View ${friend.shownName || friend.firstName || friend.displayName || "friend"}'s profile`}
                          title="View profile"
                        >
                          <User className="h-3.5 w-3.5" />
                        </Link>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-lg font-bold tabular-nums" style={{ color: imWinning ? "var(--color-ink-soft)" : "var(--color-warmth)" }}>
                            <Flame className="h-4 w-4" /> {streakLabel}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>day streak</div>
                        </div>
                      </div>
                      {/* Today's prayers — tap an open dot to send a reminder */}
                      <div className="mt-2.5 flex items-center justify-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
                        <PrayerDots
                          name={friend.shownName || friend.firstName || friend.displayName || "Friend"}
                          isMe={false}
                          todayLogs={friend.todayLogs}
                          todaySunnahs={friend.todaySunnahs}
                          sunnahDefs={getSunnahsForMadhab(madhab)}
                          prayerTimes={friend.times ?? null}
                          currentTime={currentTime}
                          todayVisible={friend.todayVisible}
                          remindedAt={friend.remindedAt}
                          reminding={new Set([...reminding].filter((k) => k.startsWith(`${friend.id}:`)).map((k) => k.split(":")[1]))}
                          onRemind={(prayer) => handleRemindFriend(friend.id, prayer)}
                          timezone={friend.timezone}
                          compact
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            </>)}
          </div>
        </div>
      )}

      {/* Check-in popup — the league's "Log" button is the primary action. */}
      {checkinPrayer && prayerTimes && todayStr && userTimezone && (
        <PrayerCheckinPopup
          prayer={checkinPrayer}
          prayerLabel={prayerLabel(checkinPrayer)}
          date={todayStr}
          timezone={userTimezone}
          madhab={madhab}
          timings={prayerTimes}
          existingStatus={todayLogs.find((l) => l.prayerName === checkinPrayer)?.status}
          onClose={() => setCheckinPrayer(null)}
          onCheckedIn={(result) => {
            setTodayLogs((prev) => [
              ...prev.filter((l) => l.prayerName !== checkinPrayer),
              { prayerName: checkinPrayer, status: result.status },
            ]);
            setCheckinPrayer(null);
          }}
        />
      )}
    </div>
  );
}

// ── Comparison row component ──
// Prayer name for today's dots — Jumu'ah on Fridays, in the row's timezone.
function dotLabel(prayer: string, timezone: string | null): string {
  let today: string;
  try {
    today = timezone
      ? new Date().toLocaleDateString("en-CA", { timeZone: timezone })
      : new Date().toLocaleDateString("en-CA");
  } catch {
    today = new Date().toLocaleDateString("en-CA");
  }
  return prayerDisplayName(prayer, today);
}

function ComparisonRow({
  name,
  isMe,
  streak,
  sharedStreak = 0,
  weekSunnah = 0,
  rank,
  todayLogs,
  todaySunnahs,
  prayerTimes,
  currentTime,
  madhab,
  timezone,
  todayVisible = false,
  remindedAt = {},
  reminding,
  onRemind,
  onCheckIn,
}: {
  name: string;
  isMe: boolean;
  streak: number;
  sharedStreak?: number;
  weekSunnah?: number;
  rank?: number;
  todayLogs: Array<{ prayerName: string; status: string }>;
  todaySunnahs: string[];
  prayerTimes: PrayerTimes | null;
  currentTime: Date | null;
  madhab: string;
  timezone: string | null;
  todayVisible?: boolean;
  remindedAt?: Record<string, string>;
  reminding?: Set<string>;
  onRemind?: (prayerName: string) => void;
  onCheckIn?: (prayer: PrayerKey) => void;
}) {
  const sunnahDefs = getSunnahsForMadhab(madhab);
  const prayedCount = PRAYER_ORDER.filter((p) => {
    const log = todayLogs.find((l) => l.prayerName === p);
    return log?.status === "prayed" || log?.status === "assumed_prayed";
  }).length;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5"
      style={isMe ? { backgroundColor: "color-mix(in oklab, var(--color-accent) 4%, transparent)" } : undefined}
    >
      {/* Rank + name + streaks */}
      {rank !== undefined && (
        <div className="w-5 shrink-0 text-center text-xs font-bold tabular-nums" style={{ color: rank === 1 ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
          {rank}
        </div>
      )}
      <div className="min-w-16 shrink-0 sm:min-w-28">
        <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {isMe ? "You" : name}
        </div>
        <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          <Flame className="h-3 w-3" style={{ color: "var(--color-warmth)" }} />
          <span className="tabular-nums">{streak}d</span>
          {sharedStreak > 0 && (
            <span className="tabular-nums" title={`${sharedStreak}-day shared streak`}>
              🔥{sharedStreak}
            </span>
          )}
          {weekSunnah > 0 && (
            <span className="tabular-nums" style={{ color: "var(--color-accent)" }} title={`${weekSunnah} confirmed sunnah & witr this week`}>
              +{weekSunnah}
            </span>
          )}
          {!isMe && timezone && (
            <span className="ml-1 hidden tabular-nums sm:inline" title={timezone}>
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

      {/* Prayer dots — or a "private" note when the friend doesn't share today */}
      <div className="flex flex-1 items-center justify-center gap-1 sm:gap-2">
        <PrayerDots
          name={name}
          isMe={isMe}
          todayLogs={todayLogs}
          todaySunnahs={todaySunnahs}
          sunnahDefs={sunnahDefs}
          prayerTimes={prayerTimes}
          currentTime={currentTime}
          todayVisible={todayVisible}
          remindedAt={remindedAt}
          reminding={reminding}
          onRemind={onRemind}
          onCheckIn={onCheckIn}
          timezone={timezone}
        />
      </div>

      {/* Progress count / own check-in */}
      <div className="flex w-12 shrink-0 flex-col items-end gap-1 text-right sm:w-16">
        {(isMe || todayVisible) && (
          <span className="text-sm font-bold tabular-nums" style={{ color: prayedCount === 5 ? "var(--color-success)" : "var(--color-ink)" }}>
            {prayedCount}/5
          </span>
        )}
        {isMe && onCheckIn && (() => {
          const nextPending = PRAYER_ORDER.find((p) => {
            const log = todayLogs.find((l) => l.prayerName === p);
            return !log || log.status === "pending" || log.status === "missed";
          });
          return nextPending ? (
            <button
              onClick={() => onCheckIn(nextPending)}
              className="rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors"
              style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
            >
              Log
            </button>
          ) : null;
        })()}
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

/**
 * The five prayer dots — shared between the comparison row and friend cards.
 * `compact` renders smaller dots for embedding inside a card.
 */
function PrayerDots({
  name,
  isMe,
  todayLogs,
  todaySunnahs,
  sunnahDefs,
  prayerTimes,
  currentTime,
  todayVisible,
  remindedAt = {},
  reminding,
  onRemind,
  onCheckIn,
  timezone,
  compact = false,
}: {
  name: string;
  isMe: boolean;
  todayLogs: Array<{ prayerName: string; status: string }>;
  todaySunnahs: string[];
  sunnahDefs: Array<{ key: string; associatedFard: string }>;
  prayerTimes: PrayerTimes | null;
  currentTime: Date | null;
  todayVisible: boolean;
  remindedAt?: Record<string, string>;
  reminding?: Set<string>;
  onRemind?: (prayerName: string) => void;
  onCheckIn?: (prayer: PrayerKey) => void;
  timezone: string | null;
  compact?: boolean;
}) {
  // Re-render on a timer while any cooldown is live so the dots unlock
  // the moment the 2-minute window passes. Clock = currentTime prop plus
  // a state-fed tick (Date.now() is banned in render by the purity rule).
  const [tickNow, setTickNow] = useState(0);
  const now = tickNow || (currentTime ? currentTime.getTime() : 0);
  const coolingActive = Object.values(remindedAt).some(
    (t) => !!now && now - Date.parse(t) < REMIND_COOLDOWN_MS,
  );
  useEffect(() => {
    if (!coolingActive) return;
    const t = setInterval(() => setTickNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [coolingActive]);

  if (!isMe && !todayVisible) {
    return (
      <span className="text-[11px] italic" style={{ color: "var(--color-ink-muted)" }}>
        Today&apos;s status is private
      </span>
    );
  }

  // Which prayer window we're in — viewer's clock for "You", the friend's
  // local time (their timezone vs their prayer times) for friends. Same
  // openPrayer() the check-in windows use — Fajr ends at sunrise, Isha
  // crosses midnight, and nothing is "current" between sunrise and Dhuhr.
  const currentPrayerIdx = (() => {
    if (!prayerTimes) return -1;
    let currentMinutes: number;
    const fallback = currentTime ?? new Date(0);
    if (!isMe && timezone) {
      // Friend's clock — the helper normalizes the "24:xx" midnight quirk
      // and falls back to device time on an unparseable zone.
      currentMinutes = getCurrentMinutesInTimezonePrecise(timezone);
    } else {
      currentMinutes = fallback.getHours() * 60 + fallback.getMinutes() + fallback.getSeconds() / 60;
    }
    const open = openPrayer(currentMinutes, {
      fajr: prayerTimes.fajr, sunrise: prayerTimes.sunrise, dhuhr: prayerTimes.dhuhr,
      asr: prayerTimes.asr, maghrib: prayerTimes.maghrib, isha: prayerTimes.isha,
    });
    return open ? PRAYER_ORDER.indexOf(open) : -1;
  })();

  const dotSize = compact ? "h-6 w-6" : "h-7 w-7 sm:h-8 sm:w-8";
  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5 sm:h-4 sm:w-4";
  const bellSize = compact ? "h-2.5 w-2.5" : "h-3 w-3 sm:h-3.5 sm:w-3.5";

  return (
    <>
      {PRAYER_ORDER.map((prayer, idx) => {
        const log = todayLogs.find((l) => l.prayerName === prayer);
        const prayed = log?.status === "prayed" || log?.status === "assumed_prayed";
        const excused = log?.status === "excused";
        const isCurrent = idx === currentPrayerIdx;
        const color = PRAYER_COLORS[prayer];
        // Only the salah whose window is open RIGHT NOW is nudgeable — the
        // server enforces the same rule against the friend's local clock.
        const remindable =
          isCurrent && !isMe && todayVisible && !prayed && !excused && (!log || log.status === "pending") && !!onRemind;
        const lastRemind = remindedAt[prayer] ? Date.parse(remindedAt[prayer]) : 0;
        const cdLeftMs = lastRemind && now ? REMIND_COOLDOWN_MS - (now - lastRemind) : 0;
        const cooling = cdLeftMs > 0;
        const wasReminded = lastRemind > 0;
        const pending = reminding?.has(prayer) ?? false;

        const dotStyle = {
          borderColor: prayed ? color : excused ? "var(--color-accent)" : isCurrent ? color : "var(--color-paper-3)",
          backgroundColor: prayed ? color : excused ? "color-mix(in oklab, var(--color-accent) 12%, transparent)" : "transparent",
          ...(isCurrent && !prayed && !excused ? { boxShadow: `0 0 0 2px color-mix(in oklab, ${color} 30%, transparent)` } : {}),
        };
        const dotInner = prayed ? (
          <Check className={iconSize} style={{ color: "var(--color-paper)" }} />
        ) : excused ? (
          <span className="text-[10px] font-bold" style={{ color: "var(--color-accent)" }} title="Excused">E</span>
        ) : wasReminded ? (
          <Bell className={`${bellSize} ${pending || cooling ? "waqt-bell-ring" : ""}`} style={{ color: cooling ? "var(--color-ink-muted)" : "var(--color-accent)" }} />
        ) : (
          <span className="text-[10px] font-bold uppercase" style={{ color: "var(--color-ink-muted)" }}>
            {prayer.charAt(0).toUpperCase()}
          </span>
        );

        const cdLabel = `${Math.floor(cdLeftMs / 60000)}:${String(Math.ceil((cdLeftMs % 60000) / 1000)).padStart(2, "0")}`;
        return (
          <div key={prayer} className="flex flex-col items-center gap-0.5">
            {remindable ? (
              <button
                onClick={() => onRemind!(prayer)}
                disabled={cooling || pending}
                className={`flex ${dotSize} items-center justify-center rounded-full border-2 transition-colors hover:bg-[var(--color-paper-2)] active:scale-90 disabled:opacity-60 ${pending ? "waqt-remind-pop" : ""}`}
                style={dotStyle}
                aria-label={cooling ? `Nudge again in ${cdLabel}` : `Nudge ${name} to pray ${dotLabel(prayer, timezone)}`}
                title={cooling ? `Nudge again in ${cdLabel}` : wasReminded ? `Nudge ${name} again` : `Nudge ${name} to pray ${dotLabel(prayer, timezone)}`}
              >
                {dotInner}
              </button>
            ) : isMe && onCheckIn ? (
              <button
                onClick={() => onCheckIn(prayer)}
                className={`flex ${dotSize} items-center justify-center rounded-full border-2 transition-colors hover:bg-[var(--color-paper-2)] active:scale-90`}
                style={dotStyle}
                aria-label={`Log ${dotLabel(prayer, timezone)}`}
                title={`Log ${dotLabel(prayer, timezone)}`}
              >
                {dotInner}
              </button>
            ) : (
              <div className={`flex ${dotSize} items-center justify-center rounded-full border-2 transition-colors`} style={dotStyle}>
                {dotInner}
              </div>
            )}
            {!compact && (() => {
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
    </>
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

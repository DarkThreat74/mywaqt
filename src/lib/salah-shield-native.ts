// Native Salah Shield bridge — talks to the SalahShieldPlugin registered in
// the Android shell. On web/PWA every call is a safe no-op so the same code
// paths can run everywhere.
//
// The web layer owns the schedule (prayer windows + marked state from Dexie)
// and pushes it into native SharedPreferences via syncShieldSchedule(). The
// accessibility service reads those prefs on every foreground-app event, so
// blocking needs zero network at runtime.

import { isNativeApp, getPlatform } from "./native-bridge";

export interface ShieldStatus {
  accessibility: boolean;
  /** Android 13+: sideloaded apps need App info → ⋮ → "Allow restricted
   *  settings" before the accessibility toggle unlocks. True when already
   *  allowed or not restricted (pre-13 / Play install). */
  restrictedAllowed?: boolean;
  usageAccess: boolean;
  battery: boolean;
  notifications: boolean;
  overlay: boolean;
}

export interface ShieldWindow {
  name: string;
  /** Absolute epoch ms — native does no timezone math, so post-midnight
   *  Isha and travel all just work. */
  startMs: number;
  endMs: number;
  marked: boolean;
}

interface SalahShieldPluginHandle {
  getStatus(): Promise<ShieldStatus>;
  openPermissionSettings(opts: { key: string }): Promise<void>;
  syncSchedule(data: Record<string, unknown>): Promise<void>;
  markPrayed(opts: { prayer: string }): Promise<void>;
  consumeLaunchPrayer(): Promise<{ prayer: string | null }>;
  getScrollStats(): Promise<{ today: string | null; history: string; enabled: boolean }>;
  pickContacts(opts: { multiple: boolean }): Promise<{ contacts: NativeContact[] }>;
}

let plugin: SalahShieldPluginHandle | null = null;
let tried = false;

async function getPlugin(): Promise<SalahShieldPluginHandle | null> {
  if (!isNativeApp() || getPlatform() !== "android") return null;
  if (plugin || tried) return plugin;
  tried = true;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    plugin = registerPlugin<SalahShieldPluginHandle>("SalahShield");
  } catch {
    plugin = null;
  }
  return plugin;
}

/** Native Android blocking side exists only inside the Capacitor shell. */
export function shieldNativeAvailable(): boolean {
  return isNativeApp() && getPlatform() === "android";
}

export async function getShieldStatus(): Promise<ShieldStatus | null> {
  const p = await getPlugin();
  if (!p) return null;
  try {
    return await p.getStatus();
  } catch {
    return null;
  }
}

export type ShieldPermissionKey =
  | "accessibility"
  | "restrictedAccess"
  | "usageAccess"
  | "overlay"
  | "battery"
  | "notifications"
  | "appDetails";

export async function openShieldSetting(key: ShieldPermissionKey): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    await p.openPermissionSettings({ key });
    return true;
  } catch {
    return false;
  }
}

/** Push the schedule (today + tomorrow's windows in epoch ms) + armed
 *  state + blocked apps into native prefs. */
export async function syncShieldSchedule(payload: {
  enabled: boolean;
  windows: ShieldWindow[];
  blockedApps?: string[];
  scrollCounter?: boolean;
}): Promise<void> {
  const p = await getPlugin();
  if (!p) return;
  try {
    await p.syncSchedule(payload as unknown as Record<string, unknown>);
  } catch {
    /* schedule stays stale — windows are absolute timestamps so stale data
       simply can't fire */
  }
}

/** Instant release for the native overlay when a prayer is marked. */
export async function shieldMarkPrayed(prayer: string): Promise<void> {
  const p = await getPlugin();
  if (!p) return;
  try {
    await p.markPrayed({ prayer });
  } catch { /* next sync clears it anyway */ }
}

/** Which prayer's overlay launched the app, consumed once. Null on web. */
export async function consumeShieldPrayer(): Promise<string | null> {
  const p = await getPlugin();
  if (!p) return null;
  try {
    return (await p.consumeLaunchPrayer()).prayer;
  } catch {
    return null;
  }
}

// ── Shield prefs (localStorage, per-device — the block runs on this phone) ──

export const SHIELD_LS_KEY = "waqt:salah-shield";
const PAUSE_KEY = "waqt:shield-pause"; // "YYYY-MM-DD" — paused that day
const PRAYERS_KEY = "waqt:shield-prayers"; // JSON array, absent = all five

export function isShieldArmed(): boolean {
  try { return localStorage.getItem(SHIELD_LS_KEY) === "1"; } catch { return false; }
}
export function setShieldArmed(on: boolean): void {
  try { localStorage.setItem(SHIELD_LS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

export function isShieldPausedToday(): boolean {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return localStorage.getItem(PAUSE_KEY) === today;
  } catch { return false; }
}
export function setShieldPausedToday(on: boolean): void {
  try {
    if (!on) { localStorage.removeItem(PAUSE_KEY); return; }
    const now = new Date();
    localStorage.setItem(PAUSE_KEY, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  } catch { /* ignore */ }
}

export const SHIELD_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export function getShieldPrayers(): Set<string> {
  try {
    const raw = localStorage.getItem(PRAYERS_KEY);
    if (!raw) return new Set(SHIELD_PRAYERS);
    const arr = JSON.parse(raw);
    const set = new Set((Array.isArray(arr) ? arr : []).filter((s) => (SHIELD_PRAYERS as readonly string[]).includes(s)));
    return set.size ? set : new Set(SHIELD_PRAYERS);
  } catch { return new Set(SHIELD_PRAYERS); }
}
export function setShieldPrayers(set: Set<string>): void {
  try {
    if (set.size === SHIELD_PRAYERS.length) localStorage.removeItem(PRAYERS_KEY);
    else localStorage.setItem(PRAYERS_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

// ── Blocked-app list ──
// Mirrors ShieldAccessibilityService.DEFAULT_BLOCKED — the native side
// falls back to it when no custom list is synced. The picker stores a
// user-edited subset in localStorage; absent means "use defaults".

const BLOCKED_APPS_KEY = "waqt:shield-blocked-apps";

export const SHIELD_BLOCKABLE_APPS: { pkg: string; label: string }[] = [
  { pkg: "com.instagram.android", label: "Instagram" },
  { pkg: "com.zhiliaoapp.musically", label: "TikTok" },
  { pkg: "com.twitter.android", label: "Twitter / X" },
  { pkg: "com.facebook.katana", label: "Facebook" },
  { pkg: "com.snapchat.android", label: "Snapchat" },
  { pkg: "com.reddit.frontpage", label: "Reddit" },
  { pkg: "com.google.android.youtube", label: "YouTube" },
  { pkg: "com.discord", label: "Discord" },
  { pkg: "org.telegram.messenger", label: "Telegram" },
  { pkg: "tv.twitch.android.app", label: "Twitch" },
  { pkg: "com.pinterest", label: "Pinterest" },
  { pkg: "com.linkedin.android", label: "LinkedIn" },
  { pkg: "com.tumblr", label: "Tumblr" },
  { pkg: "com.threads.android", label: "Threads" },
  { pkg: "com.netflix.mediaclient", label: "Netflix" },
  { pkg: "com.spotify.music", label: "Spotify" },
  { pkg: "com.whatsapp", label: "WhatsApp" },
  { pkg: "com.bereal.ft", label: "BeReal" },
];

/** User's chosen blocked apps, or null = the full curated default list. */
export function getShieldBlockedApps(): string[] | null {
  try {
    const raw = localStorage.getItem(BLOCKED_APPS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : null;
  } catch {
    return null;
  }
}

// ── Scroll counter (local — stats never leave the device) ──

const SCROLL_COUNTER_KEY = "waqt:scroll-counter";

export interface ScrollDayStats {
  date: string;
  total: number;
  apps: Record<string, number>;
  sec: Record<string, number>;
  hours?: Record<string, number>;
  sessions?: { p: string; t: number; c: number; d: number }[];
  /** Real scrolled distance in px per app (API 28+ deltas, estimated elsewhere). */
  px?: Record<string, number>;
  pxTotal?: number;
  /** Device density (dpi) — convert px → metres: px / (dpi * 39.3701). */
  dpi?: number;
}

export function isScrollCounterEnabled(): boolean {
  try { return localStorage.getItem(SCROLL_COUNTER_KEY) !== "0"; } catch { return true; }
}
export function setScrollCounterEnabled(on: boolean): void {
  try { localStorage.setItem(SCROLL_COUNTER_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

/** Today's count + 14-day history from the native service. Null on web. */
export async function getScrollStats(): Promise<{ today: ScrollDayStats | null; history: Record<string, ScrollDayStats>; enabled: boolean } | null> {
  const p = await getPlugin();
  if (!p) return null;
  try {
    const r = await p.getScrollStats();
    const parse = (raw: string | null | undefined): ScrollDayStats | null => {
      if (!raw) return null;
      try {
        const d = JSON.parse(raw);
        return {
          date: d.date ?? "", total: d.total ?? 0,
          apps: d.apps ?? {}, sec: d.sec ?? {},
          hours: d.hours ?? undefined,
          sessions: Array.isArray(d.sessions) ? d.sessions : undefined,
          px: d.px ?? undefined,
          pxTotal: typeof d.pxTotal === "number" ? d.pxTotal : undefined,
          dpi: typeof d.dpi === "number" ? d.dpi : undefined,
        };
      } catch { return null; }
    };
    const history: Record<string, ScrollDayStats> = {};
    try {
      const h = JSON.parse(r.history ?? "{}");
      for (const k of Object.keys(h)) {
        const d = h[k];
        if (d && typeof d === "object") history[k] = {
          date: d.date ?? k, total: d.total ?? 0,
          apps: d.apps ?? {}, sec: d.sec ?? {},
          hours: d.hours ?? undefined,
          sessions: Array.isArray(d.sessions) ? d.sessions : undefined,
          px: d.px ?? undefined,
          pxTotal: typeof d.pxTotal === "number" ? d.pxTotal : undefined,
          dpi: typeof d.dpi === "number" ? d.dpi : undefined,
        };
      }
    } catch { /* empty */ }
    return { today: parse(r.today), history, enabled: r.enabled };
  } catch {
    return null;
  }
}

/** Push native local stats into the account DB so history survives
 *  reinstalls and feeds the Scrolls page. Best-effort — failures stay
 *  silent; local data is the source of truth. */
export async function pushScrollStats(): Promise<void> {
  const s = await getScrollStats();
  if (!s) return;
  const days = [...Object.values(s.history), ...(s.today ? [s.today] : [])]
    .filter((d) => d.date && d.total > 0);
  if (days.length === 0) return;
  try {
    await fetch("/api/scroll/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
  } catch { /* offline — next poll retries */ }
}

export interface NativeContact { name?: string | null; phone?: string | null; photo?: string | null }

/**
 * WebView doesn't expose navigator.contacts — the plugin's pickContacts
 * launches the system ACTION_PICK intent instead. Returns the picked
 * contacts in the Contact Picker API shape (name[]/tel[]/icon[] as Blob) so
 * FriendsClient can treat both paths identically. null when the native
 * picker isn't available (browser / non-Android shell).
 */
export async function pickContactsNative(multiple: boolean): Promise<{ name?: string[]; tel?: string[]; icon?: Blob[] }[] | null> {
  const p = await getPlugin();
  if (!p) return null;
  try {
    const { contacts } = await p.pickContacts({ multiple });
    return await Promise.all((contacts ?? []).map(async (c) => ({
      name: c.name ? [c.name] : [],
      tel: c.phone ? [c.phone] : [],
      icon: c.photo ? [await (await fetch(c.photo)).blob()] : undefined,
    })));
  } catch {
    return null;
  }
}

export function setShieldBlockedApps(pkgs: string[] | null): void {
  try {
    if (pkgs === null) localStorage.removeItem(BLOCKED_APPS_KEY);
    else localStorage.setItem(BLOCKED_APPS_KEY, JSON.stringify(pkgs));
  } catch { /* ignore */ }
}

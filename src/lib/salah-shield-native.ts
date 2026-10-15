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
  | "usageAccess"
  | "overlay"
  | "battery"
  | "notifications";

export async function openShieldSetting(key: ShieldPermissionKey): Promise<void> {
  const p = await getPlugin();
  if (!p) return;
  try {
    await p.openPermissionSettings({ key });
  } catch {
    /* user can still navigate manually */
  }
}

/** Push the schedule (today + tomorrow's windows in epoch ms) + armed
 *  state + blocked apps into native prefs. */
export async function syncShieldSchedule(payload: {
  enabled: boolean;
  windows: ShieldWindow[];
  blockedApps?: string[];
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

export function setShieldBlockedApps(pkgs: string[] | null): void {
  try {
    if (pkgs === null) localStorage.removeItem(BLOCKED_APPS_KEY);
    else localStorage.setItem(BLOCKED_APPS_KEY, JSON.stringify(pkgs));
  } catch { /* ignore */ }
}

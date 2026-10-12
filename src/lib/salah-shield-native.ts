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
  startMin: number;
  endMin: number; // may exceed 1440 (Isha crossing midnight)
  marked: boolean;
}

interface SalahShieldPluginHandle {
  getStatus(): Promise<ShieldStatus>;
  openPermissionSettings(opts: { key: string }): Promise<void>;
  syncSchedule(data: Record<string, unknown>): Promise<void>;
  markPrayed(opts: { prayer: string }): Promise<void>;
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

/** Push today's schedule + armed state + blocked apps into native prefs. */
export async function syncShieldSchedule(payload: {
  enabled: boolean;
  date: string; // YYYY-MM-DD
  windows: ShieldWindow[];
  blockedApps?: string[];
}): Promise<void> {
  const p = await getPlugin();
  if (!p) return;
  try {
    await p.syncSchedule(payload as unknown as Record<string, unknown>);
  } catch {
    /* schedule stays stale — the service's date guard prevents false blocks */
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

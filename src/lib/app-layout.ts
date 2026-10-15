"use client";

/**
 * Homescreen layout for the app drawer — grid order + folders, stored
 * per-device in localStorage (like a real launcher, the arrangement is
 * a property of this phone, not the account).
 *
 * Shape: [{ type: "app", key } | { type: "folder", id, name, keys: [] }]
 * Validation on load drops unknown/uninstalled keys; apps missing from
 * the layout (newly installed) append at the end.
 */

import { APP_BY_KEY } from "./app-registry";

export type LayoutItem =
  | { type: "app"; key: string }
  | { type: "folder"; id: string; name: string; keys: string[] };

const LAYOUT_KEY = "waqt:app-layout";

export function loadLayout(installedKeys: string[]): LayoutItem[] {
  const installed = new Set(installedKeys);
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null"); } catch { /* ignore */ }
  const out: LayoutItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object" && item.type === "app" && typeof item.key === "string" && installed.has(item.key) && APP_BY_KEY.has(item.key) && !seen.has(item.key)) {
        seen.add(item.key);
        out.push({ type: "app", key: item.key });
      } else if (item && typeof item === "object" && item.type === "folder" && typeof item.id === "string" && Array.isArray(item.keys)) {
        const keys = (item.keys as unknown[]).filter((k): k is string => typeof k === "string" && installed.has(k) && APP_BY_KEY.has(k) && !seen.has(k));
        keys.forEach((k) => seen.add(k));
        if (keys.length === 1) {
          // A folder holding one app is just an app — dissolve it.
          out.push({ type: "app", key: keys[0] });
        } else if (keys.length > 0) {
          out.push({ type: "folder", id: item.id, name: typeof item.name === "string" ? item.name : "Folder", keys });
        }
      }
    }
  }
  // Apps installed since the layout was saved join at the end.
  for (const k of installedKeys) if (!seen.has(k)) out.push({ type: "app", key: k });
  return out;
}

export function saveLayout(items: LayoutItem[]): void {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

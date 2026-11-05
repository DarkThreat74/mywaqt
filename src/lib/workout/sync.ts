"use client";

import { getOfflineDB } from "@/lib/offline/db";

// Push every locally-held workout draft to the server. Idempotent: the sync
// endpoint upserts by session/set IDs, so retries and concurrent pushes are
// safe. Called on app mount and whenever the browser comes back online.
export async function syncPendingWorkouts(): Promise<void> {
  try {
    const db = getOfflineDB();
    // Push everything pending/error — plus anything touched in the last 7
    // days, which heals sessions falsely marked synced by a stale service
    // worker's synthetic response. Upserts are idempotent, so re-pushing is
    // always safe.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const staleMs = 30 * 60 * 1000;
    const all = await db.workoutSessions
      .filter((s) => s.syncState !== "synced" || s.updatedAt >= cutoff)
      .toArray();
    const pending = [];
    for (const s of all) {
      const sets = await db.workoutSets.where("sessionId").equals(s.id).count();
      // Stale empty drafts (opened a page, never logged) would sync as ghost
      // open sessions and resurrect the pill — purge them instead.
      if (sets === 0 && !s.endedAt && Date.now() - Date.parse(s.startedAt) > staleMs) {
        await db.workoutSessions.delete(s.id);
        continue;
      }
      pending.push(s);
    }
    for (const session of pending) {
      const sets = await db.workoutSets.where("sessionId").equals(session.id).toArray();
      // Legacy drafts stored the raw display-unit value (e.g. "145" typed in
      // lb mode) — convert to canonical kg before pushing or the server treats
      // it as kg and inflates every number ~2.2×.
      let lbMode: boolean | null = null;
      const normalized = await Promise.all(sets.map(async (s) => {
        if (s.wKg || !s.weight) return s;
        if (lbMode === null) {
          const pr = await fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).catch(() => null);
          lbMode = pr?.prefs?.unitWeight === "lb";
        }
        if (!lbMode) return s;
        const w = parseFloat(s.weight);
        if (!(w > 0)) return s;
        return { ...s, weight: String(Math.round((w / 2.205) * 10) / 10), wKg: true as const };
      }));
      if (normalized.some((s, i) => s.wKg !== sets[i].wKg)) {
        await db.workoutSets.bulkPut(normalized);
      }
      const res = await fetch("/workout-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, sets: normalized }),
      }).catch(() => null);
      // Keep the real server error so the UI can show exactly why a draft is
      // stuck instead of silently staying "unsynced" forever.
      let syncError: string | null = null;
      if (!res) syncError = "No network connection.";
      else if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        syncError = body?.error || `Server error (${res.status}).`;
      }
      await db.workoutSessions.update(session.id, {
        syncState: res?.ok ? "synced" : "error",
        syncError,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // IndexedDB unavailable — nothing to sync.
  }
}

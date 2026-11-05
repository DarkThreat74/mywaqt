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
    const pending = await db.workoutSessions
      .filter((s) => s.syncState !== "synced" || s.updatedAt >= cutoff)
      .toArray();
    for (const session of pending) {
      const sets = await db.workoutSets.where("sessionId").equals(session.id).toArray();
      const res = await fetch("/workout-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, sets }),
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

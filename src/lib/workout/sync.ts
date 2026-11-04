"use client";

import { getOfflineDB } from "@/lib/offline/db";

// Push every locally-held workout draft to the server. Idempotent: the sync
// endpoint upserts by session/set IDs, so retries and concurrent pushes are
// safe. Called on app mount and whenever the browser comes back online.
export async function syncPendingWorkouts(): Promise<void> {
  try {
    const db = getOfflineDB();
    const pending = await db.workoutSessions
      .filter((s) => s.syncState !== "synced")
      .toArray();
    for (const session of pending) {
      const sets = await db.workoutSets.where("sessionId").equals(session.id).toArray();
      const res = await fetch("/api/workout/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, sets }),
      }).catch(() => null);
      await db.workoutSessions.update(session.id, {
        syncState: res?.ok ? "synced" : "error",
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // IndexedDB unavailable — nothing to sync.
  }
}

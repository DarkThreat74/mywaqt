import Dexie, { type EntityTable } from "dexie";

/**
 * Confirmed mistakes + logged peeks.
 *
 * IndexedDB is the offline-first local store; every confirmed row is ALSO
 * written through to /api/quran-tester/mistakes (Neon) so the list survives
 * reinstalls and follows the account to other devices. Server writes are
 * best-effort — offline saves reconcile on the next syncMistakes().
 */

export interface Mistake {
  id?: number;
  surah: number;
  ayah: number;
  word: number;
  kind: string;
  confirmedAt: number;
  /** Server rejected this row — retry bounded, then leave it local-only. */
  pushFailed?: number;
}

const db = new Dexie("quran-tester") as Dexie & {
  mistakes: EntityTable<Mistake, "id">;
};

db.version(1).stores({
  mistakes: "++id, [surah+ayah+word], confirmedAt",
});

export async function saveMistake(m: Omit<Mistake, "id">): Promise<void> {
  // Upsert — re-confirming the same word refreshes the row, never duplicates.
  const existing = await db.mistakes
    .where("[surah+ayah+word]")
    .equals([m.surah, m.ayah, m.word])
    .first();
  if (existing) {
    await db.mistakes.update(existing.id!, { confirmedAt: m.confirmedAt, kind: m.kind });
    (m as Mistake).id = existing.id;
  } else {
    (m as Mistake).id = await db.mistakes.add(m as Mistake);
  }
  // Write-through to the durable per-user store; failure just means the
  // next sync pushes it (queued rows reconcile on load).
  void pushRow(m);
}

/** POST one row. 4xx = the server will never accept it — count strikes on
 *  the local row and stop after 3, or every sync retries it forever. */
async function pushRow(m: Omit<Mistake, "id"> & { id?: number }): Promise<void> {
  try {
    const res = await fetch("/api/quran-tester/mistakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surah: m.surah, ayah: m.ayah, word: m.word, kind: m.kind, confirmedAt: m.confirmedAt }),
    });
    if (res.ok) {
      if (m.id != null && m.pushFailed) await db.mistakes.update(m.id, { pushFailed: undefined });
    } else if (res.status >= 400 && res.status < 500 && m.id != null) {
      const n = (m.pushFailed ?? 0) + 1;
      m.pushFailed = n;
      if (n >= 3) await db.mistakes.update(m.id, { pushFailed: n });
    }
  } catch {
    // Offline/network — stays queued for the next sync
  }
}

export async function listMistakes(): Promise<Mistake[]> {
  return db.mistakes.orderBy("confirmedAt").reverse().toArray();
}

/**
 * Pull the server list and reconcile into local — server is authoritative,
 * but rows that were saved while offline (never reached the server) are
 * kept and pushed up.
 */
export async function syncMistakes(): Promise<Mistake[]> {
  try {
    const res = await fetch("/api/quran-tester/mistakes", { cache: "no-store" });
    if (!res.ok) return listMistakes();
    const remote = (await res.json()).mistakes as {
      surah: number; ayah: number; word: number; kind: string; confirmedAt: string;
    }[];
    const local = await listMistakes();
    const remoteKeys = new Set(remote.map((r) => `${r.surah}:${r.ayah}:${r.word}`));
    // Push rows the server doesn't have yet (saved offline); rows that
    // already struck out (pushFailed >= 3) stay local-only.
    for (const m of local) {
      if (!remoteKeys.has(`${m.surah}:${m.ayah}:${m.word}`) && (m.pushFailed ?? 0) < 3) {
        void pushRow(m);
      }
    }
    // Merge remote into local (insert only — never delete local rows; a
    // server-delete race on a stale device would resurrect, which is fine)
    await db.transaction("rw", db.mistakes, async () => {
      for (const r of remote) {
        const key = [r.surah, r.ayah, r.word];
        const ts = new Date(r.confirmedAt).getTime() || Date.now();
        const existing = await db.mistakes.where("[surah+ayah+word]").equals(key).first();
        if (!existing) {
          await db.mistakes.add({ surah: r.surah, ayah: r.ayah, word: r.word, kind: r.kind, confirmedAt: ts });
        }
      }
    });
  } catch {
    // Offline — local list stands
  }
  return listMistakes();
}

export async function removeMistake(id: number): Promise<void> {
  const row = await db.mistakes.get(id);
  await db.mistakes.delete(id);
  if (row) await removeRemote(row);
}

/** Delete by position — rows stored without an id (in-memory confirms,
 *  manual marks) would otherwise only vanish from state and resurrect on
 *  the next load. */
export async function removeMistakeAt(surah: number, ayah: number, word: number): Promise<void> {
  const row = await db.mistakes.where("[surah+ayah+word]").equals([surah, ayah, word]).first();
  if (row) await db.mistakes.delete(row.id!);
  await removeRemote({ surah, ayah, word });
}

async function removeRemote(row: { surah: number; ayah: number; word: number }) {
  void fetch("/api/quran-tester/mistakes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surah: row.surah, ayah: row.ayah, word: row.word }),
  }).catch(() => {});
}

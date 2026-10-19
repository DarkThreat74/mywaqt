"use client";

// Session persistence for the coach — IndexedDB, fully on-device. Each entry
// is a summary (scores + measured stats), never raw audio or frames.

export interface SessionRow {
  ts: number;
  score: number;
  durationSec: number;
  axes: Record<string, number>;
  issues: number;
  maddsShort: number;
  maddsTotal: number;
}

const DB = "recite-coach";
const STORE = "sessions";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { autoIncrement: true });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function saveSession(row: SessionRow): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(row);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

/** Newest-first, capped — the ladder only needs recent history. */
export async function listSessions(limit = 200): Promise<SessionRow[]> {
  const db = await open();
  const rows = await new Promise<SessionRow[]>((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).getAll();
    rq.onsuccess = () => res(rq.result as SessionRow[]);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

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
const REFS = "refs";

export interface RefRow {
  id?: number;
  name: string;
  ts: number;
  sr: number;
  pcm: Float32Array;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 2);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true });
      if (!db.objectStoreNames.contains(REFS)) db.createObjectStore(REFS, { autoIncrement: true });
    };
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

// ---- personal reference clips (recorded in-app, never uploaded) ----

export async function saveRef(row: RefRow): Promise<number> {
  const db = await open();
  const id = await new Promise<number>((res, rej) => {
    const tx = db.transaction(REFS, "readwrite");
    const rq = tx.objectStore(REFS).add(row);
    rq.onsuccess = () => res(rq.result as number);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  return id;
}

export async function listRefs(): Promise<RefRow[]> {
  const db = await open();
  const rows = await new Promise<RefRow[]>((res, rej) => {
    const store = db.transaction(REFS).objectStore(REFS);
    const rq = store.getAll();
    const kq = store.getAllKeys();
    kq.onsuccess = () => {
      (rq.result as RefRow[]).forEach((r, i) => { r.id = kq.result[i] as number; });
      res(rq.result as RefRow[]);
    };
    kq.onerror = () => rej(kq.error);
  });
  db.close();
  return rows.sort((a, b) => b.ts - a.ts);
}

export async function deleteRef(id: number): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(REFS, "readwrite");
    tx.objectStore(REFS).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

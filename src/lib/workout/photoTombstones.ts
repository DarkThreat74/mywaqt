// Photos deleted while offline leave a tombstone so server hydration and
// the sync sweeper can't resurrect them. Capped — ids are uuids, 200 is
// far beyond real usage. Shared by the photos page and workout sync.
const TOMB_KEY = "waqt-photo-tombstones";

export function photoTombstones(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TOMB_KEY) || "[]") as string[]); }
  catch { return new Set(); }
}

export function saveTombstones(s: Set<string>) {
  try { localStorage.setItem(TOMB_KEY, JSON.stringify([...s].slice(-200))); } catch { /* private mode */ }
}

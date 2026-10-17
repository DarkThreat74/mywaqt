import Dexie, { type EntityTable } from "dexie";

/**
 * Confirmed mistakes only — the user reviews each yellow suspect and only
 * then does it land here. Nothing else about a session is persisted; audio
 * is never stored.
 */

export interface Mistake {
  id?: number;
  surah: number;
  ayah: number;
  word: number;
  kind: string;
  confirmedAt: number;
}

const db = new Dexie("quran-tester") as Dexie & {
  mistakes: EntityTable<Mistake, "id">;
};

db.version(1).stores({
  mistakes: "++id, [surah+ayah+word], confirmedAt",
});

export async function saveMistake(m: Omit<Mistake, "id">): Promise<void> {
  await db.mistakes.add(m);
}

export async function listMistakes(): Promise<Mistake[]> {
  return db.mistakes.orderBy("confirmedAt").reverse().toArray();
}

export async function removeMistake(id: number): Promise<void> {
  await db.mistakes.delete(id);
}

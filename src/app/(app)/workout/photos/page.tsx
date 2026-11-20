"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getOfflineDB, type LocalProgressPhoto } from "@/lib/offline/db";
import { syncPendingWorkouts } from "@/lib/workout/sync";
import { DEFAULT_POSES, keyPose, keyPose3D, normalizePose, type KeyPose, type KeyPose3D } from "@/lib/workout/poseGuide";
import { preloadPoseModel } from "@/lib/workout/poseModel";
import type { CaptureResult } from "@/components/workout/GuidedCamera";
import { photoTombstones, saveTombstones } from "@/lib/workout/photoTombstones";
import PhotoPresent from "@/components/workout/PhotoPresent";

const GuidedCamera = dynamic(() => import("@/components/workout/GuidedCamera"), { ssr: false });

const ANGLES = ["front", "side", "back"] as const;
type Angle = (typeof ANGLES)[number];
const ANGLE_LABEL: Record<Angle, string> = { front: "Front", side: "Side", back: "Back" };

interface ServerPhotoMeta {
  id: string; takenAt: string; angle: string; weightKg: string | null;
  note: string | null; photoMime: string; pose: number[][] | null;
  worldPose?: number[][] | null;
  analysis?: { shirtless?: boolean | null; skinRatio?: number | null; matchScore?: number | null } | null;
}

function poseToKeyPose(pose: number[][] | null | undefined): KeyPose | null {
  if (!pose || pose.length < 33) return null;
  const lm = pose.map(([x, y]) => ({ x, y }));
  const k = keyPose(lm);
  return k ? normalizePose(k) : null;
}

// World landmarks are [x,y,z] meters — 3D keypoints need no normalization
// (joint angles are scale/position invariant).
function poseToKeyPose3D(pose: number[][] | null | undefined): KeyPose3D | null {
  if (!pose || pose.length < 33) return null;
  const lm = pose.map(([x, y, z]) => ({ x, y, z: z ?? 0 }));
  return keyPose3D(lm);
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState<LocalProgressPhoto[]>([]);
  const [step, setStep] = useState<number | null>(null); // null = grid, 0..2 = angle
  const [viewing, setViewing] = useState<LocalProgressPhoto | null>(null);
  const [present, setPresent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = getOfflineDB();
      // Render what's on-device first — the label/ghost must never wait on
      // network hydration (and a thrown fetch can't leave a stale "first
      // check-in" state over existing local photos).
      setPhotos(await db.progressPhotos.orderBy("takenAt").reverse().toArray());
      // Pull server metadata, then hydrate any missing photo bodies into IDB —
      // IndexedDB stays the read path so the grid works fully offline.
      const res = await fetch("/api/workout/photos").catch(() => null);
      if (res?.ok) {
        const { photos: metas } = await res.json() as { photos: ServerPhotoMeta[] };
        // Keys only — toArray() would pull every photoData blob into memory.
        const localIds = new Set(await db.progressPhotos.toCollection().primaryKeys() as string[]);
        const tombs = photoTombstones();
        const missing = metas.filter((m) => !localIds.has(m.id) && !tombs.has(m.id));
        // Batch fetch in chunks of 60 — one request per chunk, not per photo.
        for (let i = 0; i < missing.length; i += 60) {
          const chunk = missing.slice(i, i + 60);
          const full = await fetch(`/api/workout/photos?ids=${chunk.map((m) => m.id).join(",")}`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null);
          for (const fp of (full?.photos ?? []) as (ServerPhotoMeta & { photoData: string })[]) {
            await db.progressPhotos.put({
              id: fp.id, takenAt: fp.takenAt, angle: (ANGLES as readonly string[]).includes(fp.angle) ? fp.angle as Angle : "other",
              weightKg: fp.weightKg ? parseFloat(fp.weightKg) : null, note: fp.note,
              photoData: fp.photoData, photoMime: fp.photoMime, pose: fp.pose,
              worldPose: fp.worldPose ?? null, analysis: fp.analysis ?? null,
              syncState: "synced", updatedAt: new Date().toISOString(),
            } satisfies LocalProgressPhoto);
          }
        }
        // Multi-device deletes: a synced local row missing from the server
        // list was deleted on another device — drop the ghost. Skipped when
        // the list is truncated (server caps at 200) and never touches
        // pending/error rows (this device's unsent work).
        if (metas.length < 200) {
          const serverIds = new Set(metas.map((m) => m.id));
          const syncedIds = await db.progressPhotos.where("syncState").equals("synced").primaryKeys();
          for (const id of syncedIds as string[]) {
            if (!serverIds.has(id)) await db.progressPhotos.delete(id);
          }
        }
      }
      await syncPendingWorkouts();
      // Retry server deletes for photos removed while offline.
      const tombs = photoTombstones();
      if (tombs.size) {
        for (const id of [...tombs]) {
          const res = await fetch(`/api/workout/photos?id=${id}`, { method: "DELETE" }).catch(() => null);
          if (res?.ok) tombs.delete(id);
        }
        saveTombstones(tombs);
      }
      const all = await db.progressPhotos.orderBy("takenAt").reverse().toArray();
      setPhotos(all);
    } catch {
      setLoadError("Photos are stored on this device — reload to try syncing again.");
    }
  }, []);

  useEffect(() => { Promise.resolve().then(() => void load()); }, [load]);
  // Warm the pose model on idle so the camera opens with detection ready.
  useEffect(() => { preloadPoseModel(); }, []);

  // Latest prior photo per angle — becomes the pose target + ghost.
  const priorFor = useMemo(() => {
    const map = new Map<Angle, LocalProgressPhoto>();
    for (const p of photos) {
      if ((ANGLES as readonly string[]).includes(p.angle) && !map.has(p.angle as Angle)) {
        map.set(p.angle as Angle, p);
      }
    }
    return map;
  }, [photos]);

  const angle = step !== null ? ANGLES[step] : null;
  const prior = angle ? priorFor.get(angle) : null;
  const priorPose = prior ? poseToKeyPose(prior.pose) : null;
  const priorWorldPose = prior ? poseToKeyPose3D(prior.worldPose) : null;
  const targetPose: KeyPose = priorPose ?? DEFAULT_POSES[angle ?? "front"];
  const ghost = prior?.photoData ?? null;

  const onCapture = useCallback(async (r: CaptureResult) => {
    if (step === null) return;
    setSaving(true);
    const a = ANGLES[step];
    // randomUUID needs a secure context — fall back for LAN/http testing.
    const id = crypto.randomUUID?.() ??
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const n = Math.floor(Math.random() * 16);
        return (c === "x" ? n : (n & 0x3) | 0x8).toString(16);
      });
    const row: LocalProgressPhoto = {
      id, takenAt: new Date().toISOString(), angle: a,
      photoData: r.dataUrl, photoMime: r.photoMime, pose: r.pose.length === 33 ? r.pose : null,
      worldPose: r.worldPose, analysis: r.analysis,
      syncState: "pending", updatedAt: new Date().toISOString(),
    };
    try {
      const db = getOfflineDB();
      await db.progressPhotos.put(row);
      // Try immediate sync; sweeper retries if offline.
      const res = await fetch("/api/workout/photos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, takenAt: row.takenAt, angle: a, photoData: r.dataUrl, photoMime: r.photoMime, pose: row.pose, worldPose: row.worldPose, analysis: row.analysis }),
      }).catch(() => null);
      const fatal = !!res && [400, 409, 413, 422].includes(res.status);
      await db.progressPhotos.update(id, {
        syncState: res?.ok ? "synced" : "error",
        syncError: res?.ok ? null : res ? `${fatal ? "fatal: " : ""}Server error (${res.status}).` : "No network connection.",
        updatedAt: new Date().toISOString(),
      });
      const all = await db.progressPhotos.orderBy("takenAt").reverse().toArray();
      setPhotos(all);
    } catch { /* keep local */ }
    setSaving(false);
    setStep((s) => (s !== null && s < ANGLES.length - 1 ? s + 1 : null));
  }, [step]);

  const remove = async (p: LocalProgressPhoto) => {
    // Tombstone first: if the server delete fails offline, hydration must not
    // resurrect the photo on the next load.
    const tombs = photoTombstones();
    tombs.add(p.id);
    try {
      // Fire the server delete but don't block local removal on it — the
      // tombstone + next load()'s retry loop guarantee the server row goes
      // away, and keeping the local row would let the sync sweeper
      // re-upload a photo the user just deleted.
      void fetch(`/api/workout/photos?id=${p.id}`, { method: "DELETE" }).catch(() => null);
      await getOfflineDB().progressPhotos.delete(p.id);
      saveTombstones(tombs);
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      setViewing(null);
    } catch { /* noop */ }
  };

  const byDate = useMemo(() => {
    const groups = new Map<string, LocalProgressPhoto[]>();
    for (const p of photos) {
      const d = new Date(p.takenAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      (groups.get(d) ?? groups.set(d, []).get(d)!).push(p);
    }
    // Pair each session's angles — front, side, back side by side.
    const order = (a: string) => { const i = (ANGLES as readonly string[]).indexOf(a); return i < 0 ? 99 : i; };
    for (const [, items] of groups) items.sort((a, b) => order(a.angle) - order(b.angle) || a.takenAt.localeCompare(b.takenAt));
    return [...groups.entries()];
  }, [photos]);

  return (
    <div className="page-fade mx-auto w-full px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/workout/profile" className="text-sm" style={{ color: "var(--color-ink-muted)" }}>←</Link>
        <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Progress photos</h1>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        Guided check-in — front, side, back. Match the pose guide to capture; your last photo becomes the guide next time.
      </p>
      {loadError && <p className="mt-2 text-xs" style={{ color: "var(--color-warmth)" }}>{loadError}</p>}

      {angle !== null ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {ANGLE_LABEL[angle]} <span className="text-[10px] font-normal" style={{ color: "var(--color-ink-muted)" }}>· {step! + 1} of {ANGLES.length}</span>
            </p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setStep((s) => (s !== null && s < ANGLES.length - 1 ? s + 1 : null))} className="rounded-full border px-3 py-1 text-[10px]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>Skip angle</button>
              <button type="button" onClick={() => setStep(null)} className="rounded-full border px-3 py-1 text-[10px]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>Cancel</button>
            </div>
          </div>
          {prior && (
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              Guiding you to match your {new Date(prior.takenAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} pose
            </p>
          )}
          <div className="mt-3">
            {saving ? (
              <div className="grid aspect-[3/4] place-items-center rounded-2xl text-xs" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>Saving…</div>
            ) : (
              <GuidedCamera angle={angle} targetPose={targetPose} targetWorldPose={priorWorldPose} personalTarget={!!(priorPose || priorWorldPose)} ghostImage={ghost} onCapture={(r) => void onCapture(r)} />
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setStep(0)}
              className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
              {photos.length ? "New check-in" : "Take your first check-in"}
            </button>
            {photos.length > 0 && (
              <button type="button" onClick={() => setPresent(true)}
                className="rounded-xl border px-4 py-3 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                Present
              </button>
            )}
          </div>
          {photos.length > 0 && (
            <div className="mt-6 space-y-5">
              {byDate.map(([date, items]) => (
                <div key={date}>
                  <p className="text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>{date}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {items.map((p) => (
                      <button key={p.id} type="button" onClick={() => setViewing(p)} className="relative overflow-hidden rounded-xl border"
                        style={{ borderColor: "var(--color-paper-3)", aspectRatio: "3/4" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.photoData} alt={`${p.angle} progress photo`} className="h-full w-full object-cover" />
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-medium capitalize text-white">
                          {p.angle}{p.syncState !== "synced" ? " · unsynced" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {present && (
        <PhotoPresent photos={photos} onClose={() => setPresent(false)} onView={(p) => setViewing(p)} />
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.85)" }} onClick={() => setViewing(null)}>
          <div className="max-h-[90vh] w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewing.photoData} alt="Progress photo" className="max-h-[75vh] w-full rounded-xl object-contain" />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs" style={{ color: "#e8ddc8" }}>
                {viewing.angle} · {new Date(viewing.takenAt).toLocaleDateString()}
                {viewing.analysis?.matchScore != null && ` · ${viewing.analysis.matchScore}% pose match`}
                {viewing.analysis?.shirtless === false && " · shirt on"}
                {viewing.analysis?.shirtless === true && " · bare skin"}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => {
                  const a = document.createElement("a");
                  a.href = viewing.photoData;
                  a.download = `${viewing.angle}-${new Date(viewing.takenAt).toISOString().slice(0, 10)}.${viewing.photoMime?.includes("webp") ? "webp" : "jpg"}`;
                  a.click();
                }} className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: "rgba(255,255,255,0.3)", color: "#e8ddc8" }}>Download</button>
                <button type="button" onClick={() => void remove(viewing)}
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: "rgba(255,255,255,0.3)", color: "#e8ddc8" }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

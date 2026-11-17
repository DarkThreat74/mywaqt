"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LocalProgressPhoto } from "@/lib/offline/db";

type Angle = "front" | "side" | "back";
const ANGLE_ORDER: Angle[] = ["front", "side", "back"];
const ANGLE_LABEL: Record<string, string> = { front: "Front", side: "Side", back: "Back", other: "Other" };

type Scope = "all" | Angle;
type Order = "alternate" | "grouped";
type Stage = "scope" | "order" | "show";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};
const dayKey = (iso: string) => new Date(iso).toDateString();

function buildSlides(photos: LocalProgressPhoto[], scope: Scope, order: Order): LocalProgressPhoto[] {
  const sorted = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (scope !== "all") return sorted.filter((p) => p.angle === scope);
  if (order === "grouped") {
    return [
      ...sorted.filter((p) => p.angle === "front"),
      ...sorted.filter((p) => p.angle === "side"),
      ...sorted.filter((p) => p.angle === "back"),
      ...sorted.filter((p) => !ANGLE_ORDER.includes(p.angle as Angle)),
    ];
  }
  // alternate: per session/day, front → side → back, chronological
  const byDay = new Map<string, LocalProgressPhoto[]>();
  for (const p of sorted) (byDay.get(dayKey(p.takenAt)) ?? byDay.set(dayKey(p.takenAt), []).get(dayKey(p.takenAt))!).push(p);
  const out: LocalProgressPhoto[] = [];
  for (const [, items] of byDay) {
    items.sort((a, b) => ANGLE_ORDER.indexOf(a.angle as Angle) - ANGLE_ORDER.indexOf(b.angle as Angle) || a.takenAt.localeCompare(b.takenAt));
    out.push(...items);
  }
  return out;
}

const SLIDE_MS = 2400;

function pickMime(): { mime: string; ext: string } {
  const mr = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
  for (const m of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (mr?.isTypeSupported(m)) return { mime: m, ext: m.includes("mp4") ? "mp4" : "webm" };
  }
  return { mime: "", ext: "webm" };
}

export default function PhotoPresent({ photos, onClose, onView }: {
  photos: LocalProgressPhoto[];
  onClose: () => void;
  onView: (p: LocalProgressPhoto) => void;
}) {
  const angles = useMemo(() => ANGLE_ORDER.filter((a) => photos.some((p) => p.angle === a)), [photos]);
  const [stage, setStage] = useState<Stage>("scope");
  const [scope, setScope] = useState<Scope>("all");
  const [order, setOrder] = useState<Order>("alternate");
  const slides = useMemo(
    () => (stage === "show" ? buildSlides(photos, scope, order) : []),
    [stage, photos, scope, order],
  );
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [recording, setRecording] = useState(false);
  const cur = slides[idx] ?? null;

  useEffect(() => {
    if (!playing || slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [playing, slides.length]);

  const downloadOne = (p: LocalProgressPhoto) => {
    const a = document.createElement("a");
    a.href = p.photoData;
    a.download = `${p.angle}-${fmtDate(p.takenAt).replaceAll("/", "-")}.${p.photoMime?.includes("webp") ? "webp" : "jpg"}`;
    a.click();
  };

  // Render the slideshow to an offscreen canvas and record it — each slide
  // gets the timestamp burned in, matching the on-screen presentation.
  const recordingRef = useRef(false);
  const recordVideo = async () => {
    if (recordingRef.current || !slides.length) return;
    recordingRef.current = true;
    setRecording(true);
    try {
      const { mime, ext } = pickMime();
      const W = 720, H = 960;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((res) => { rec.onstop = () => res(); });
      const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      });
      rec.start(250);
      for (const p of slides) {
        const img = await load(p.photoData);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        const s = Math.min(W / img.width, H / img.height); // contain — timestamp stays in frame
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(14, 14, 150, 34);
        ctx.fillStyle = "#fff";
        ctx.font = "600 20px system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtDate(p.takenAt), 24, 32);
        ctx.font = "500 14px system-ui, sans-serif";
        ctx.fillText(ANGLE_LABEL[p.angle] ?? p.angle, 24, 60);
        await new Promise((r) => setTimeout(r, 1600));
      }
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: mime || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `progress-${fmtDate(new Date().toISOString()).replaceAll("/", "-")}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      recordingRef.current = false;
      setRecording(false);
    }
  };

  const chip = (label: string, onClick: () => void, primary = false) => (
    <button key={label} type="button" onClick={onClick}
      className="w-full rounded-xl border px-4 py-3 text-sm font-medium"
      style={primary
        ? { backgroundColor: "var(--color-ink)", color: "var(--color-paper)", borderColor: "var(--color-ink)" }
        : { borderColor: "var(--color-paper-3)", color: "var(--color-ink)", background: "var(--color-paper)" }}>
      {label}
    </button>
  );

  if (stage !== "show") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div className="w-full max-w-sm rounded-t-2xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-2xl sm:pb-5"
          style={{ backgroundColor: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
              {stage === "scope" ? "Present progress" : "Play order"}
            </h2>
            <button type="button" onClick={onClose} className="text-lg" style={{ color: "var(--color-ink-muted)" }}>✕</button>
          </div>
          <div className="mt-4 space-y-2">
            {stage === "scope" ? (
              <>
                {chip("All angles", () => setStage("order"), true)}
                {angles.map((a) => chip(ANGLE_LABEL[a], () => { setScope(a); setStage("show"); setIdx(0); }))}
              </>
            ) : (
              <>
                {chip("Alternate — front, side, back each day", () => { setOrder("alternate"); setScope("all"); setIdx(0); setStage("show"); }, true)}
                {chip("By angle — all fronts, then sides, then backs", () => { setOrder("grouped"); setScope("all"); setIdx(0); setStage("show"); })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#000" }}>
      {cur ? (
        <>
          <button type="button" className="relative flex-1" onClick={() => onView(cur)} aria-label="View larger">
            <span className="absolute left-3 top-3 z-10 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
              {fmtDate(cur.takenAt)}
            </span>
            <span className="absolute right-3 top-3 z-10 rounded bg-black/60 px-2 py-1 text-xs capitalize text-white">
              {ANGLE_LABEL[cur.angle] ?? cur.angle} · {idx + 1}/{slides.length}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.photoData} alt={`${cur.angle} progress`} className="h-full w-full object-contain" />
          </button>
          <div className="flex items-center justify-center gap-2 px-4 py-3" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
            <button type="button" onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)}
              className="rounded-lg border px-3 py-1.5 text-xs text-white" style={{ borderColor: "rgba(255,255,255,0.3)" }}>‹ Prev</button>
            <button type="button" onClick={() => setPlaying((v) => !v)}
              className="rounded-lg border px-4 py-1.5 text-xs font-medium text-white" style={{ borderColor: "rgba(255,255,255,0.3)" }}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => setIdx((i) => (i + 1) % slides.length)}
              className="rounded-lg border px-3 py-1.5 text-xs text-white" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Next ›</button>
            <button type="button" onClick={() => downloadOne(cur)}
              className="rounded-lg border px-3 py-1.5 text-xs text-white" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Save</button>
            <button type="button" onClick={() => void recordVideo()} disabled={recording}
              className="rounded-lg border px-3 py-1.5 text-xs text-white disabled:opacity-50" style={{ borderColor: "rgba(255,255,255,0.3)" }}>
              {recording ? "Recording…" : "Video"}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border px-3 py-1.5 text-xs text-white" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Close</button>
          </div>
        </>
      ) : (
        <div className="grid flex-1 place-items-center text-sm text-white">No photos in this view.</div>
      )}
    </div>
  );
}

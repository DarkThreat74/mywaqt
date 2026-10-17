"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Minus, Plus } from "lucide-react";

/**
 * Circle cropper — Android-Messages style. The photo sits draggable under a
 * dimmed overlay; only the circle stays lit. Drag to pan, pinch or use the
 * slider to zoom, then Done exports the visible circle as a square WebP.
 */
export default function PhotoCropper({
  file,
  size = 384,
  quality = 0.85,
  onDone,
  onCancel,
}: {
  file: Blob;
  size?: number;
  quality?: number;
  onDone: (r: { data: string; mime: string; dataUrl: string }) => void;
  onCancel: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1); // display px per natural px
  const [minScale, setMinScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 }); // display-px offset from center
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; scale: number } | null>(null);
  const BOX = 280;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      setMinScale(BOX / Math.min(img.naturalWidth, img.naturalHeight));
      setScale(BOX / Math.min(img.naturalWidth, img.naturalHeight));
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const clamp = (o: { x: number; y: number }, s: number) => {
    if (!dims) return o;
    const mx = Math.max(0, (dims.w * s - BOX) / 2);
    const my = Math.max(0, (dims.h * s - BOX) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  const zoomTo = (s: number) => {
    const ns = Math.min(minScale * 5, Math.max(minScale, s));
    setScale(ns);
    setOff((o) => clamp(o, ns));
  };

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !dims) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo(pinch.current.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
      return;
    }
    setOff((o) => clamp({ x: o.x + e.clientX - prev.x, y: o.y + e.clientY - prev.y }, scale));
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  async function done() {
    if (!dims) return;
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      // The visible BOX×BOX square in display coords maps to a BOX/scale
      // square in the source image, centered on the panned point.
      const side = BOX / scale;
      const sx = bmp.width / 2 - off.x / scale - side / 2;
      const sy = bmp.height / 2 - off.y / scale - side / 2;
      ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
      bmp.close();
      let dataUrl = canvas.toDataURL("image/webp", quality);
      let mime = "image/webp";
      if (!dataUrl.startsWith("data:image/webp")) {
        dataUrl = canvas.toDataURL("image/jpeg", quality);
        mime = "image/jpeg";
      }
      onDone({ data: dataUrl.split(",")[1], mime, dataUrl });
    } finally {
      setBusy(false);
    }
  }

  const w = dims ? dims.w * scale : 0;
  const h = dims ? dims.h * scale : 0;

  return (
    <div
      className="fixed inset-0 z-[140] flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 88%, transparent)", animation: "drawer-app-in 0.18s ease-out" }}
      role="dialog"
      aria-label="Crop photo"
    >
      <p className="mb-4 text-sm font-semibold" style={{ color: "var(--color-paper)" }}>Move and zoom</p>

      {/* Crop window — the circle stays lit, everything outside dims */}
      <div className="relative">
        <div
          ref={boxRef}
          className="relative touch-none select-none overflow-hidden rounded-full"
          style={{ width: BOX, height: BOX, cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => zoomTo(scale * (e.deltaY < 0 ? 1.08 : 0.92))}
        >
          {url && dims && (
            // eslint-disable-next-line @next/next/no-img-element -- raw user file preview
            <img
              src={url}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: BOX / 2 + off.x - w / 2,
                top: BOX / 2 + off.y - h / 2,
                width: w,
                height: h,
                maxWidth: "none",
              }}
            />
          )}
        </div>
        {/* Dim mask — the ring of shadow outside the circle */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--color-ink) 72%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-paper) 55%, transparent)",
          }}
        />
      </div>

      {/* Zoom slider */}
      <div className="mt-6 flex w-full max-w-xs items-center gap-3">
        <Minus className="h-4 w-4 shrink-0" style={{ color: "var(--color-paper)" }} />
        <input
          type="range"
          min={minScale}
          max={minScale * 5}
          step={minScale / 50}
          value={scale}
          onChange={(e) => zoomTo(parseFloat(e.target.value))}
          className="w-full accent-[var(--color-accent)]"
          aria-label="Zoom"
        />
        <Plus className="h-4 w-4 shrink-0" style={{ color: "var(--color-paper)" }} />
      </div>

      <div className="mt-6 flex gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-paper) 14%, transparent)", color: "var(--color-paper)" }}
        >
          <X className="h-4 w-4" /> Cancel
        </button>
        <button
          onClick={done}
          disabled={busy || !dims}
          className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
        >
          <Check className="h-4 w-4" /> {busy ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { X, Download, Share2 } from "lucide-react";

/**
 * Photo lightbox — tap a profile/friend/expense photo, it opens full-screen.
 * Tap the image again to toggle zoom. Actions underneath: Save to device
 * (native share sheet where supported) or Download.
 */
export default function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toFile(): Promise<File | null> {
    try {
      const blob = await (await fetch(src)).blob();
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      return new File([blob], `photo.${ext}`, { type: blob.type || "image/jpeg" });
    } catch {
      return null;
    }
  }

  async function download() {
    const file = await toFile();
    if (!file) { setHint("Couldn't save — try again."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
    setHint("Saved to downloads.");
  }

  async function saveToDevice() {
    setBusy(true);
    setHint(null);
    try {
      const file = await toFile();
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => {});
      } else {
        await download();
      }
    } finally {
      setBusy(false);
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 92%, transparent)", animation: "drawer-app-in 0.18s ease-out" }}
      onClick={onClose}
      role="dialog"
      aria-label="Photo viewer"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex items-center justify-center rounded-full"
        style={{ color: "var(--color-paper)", minHeight: 44, minWidth: 44, paddingTop: "env(safe-area-inset-top)" }}
        aria-label="Close photo"
      >
        <X className="h-6 w-6" />
      </button>

      <div
        className="max-h-[72dvh] max-w-[92vw] overflow-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={() => setZoomed((z) => !z)}
          className="cursor-zoom-in transition-transform duration-200"
          style={{
            display: "block",
            width: zoomed ? "180vw" : "min(92vw, 70dvh)",
            maxWidth: "none",
            transformOrigin: "center",
            cursor: zoomed ? "zoom-out" : "zoom-in",
          }}
        />
      </div>

      <div className="mt-5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={saveToDevice}
          disabled={busy}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
        >
          {canShare ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {busy ? "Saving…" : canShare ? "Save to device" : "Download"}
        </button>
      </div>
      {hint && <p className="mt-2 text-xs" style={{ color: "var(--color-paper)" }}>{hint}</p>}
    </div>
  );
}

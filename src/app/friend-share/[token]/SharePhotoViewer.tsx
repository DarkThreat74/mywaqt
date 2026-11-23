"use client";

import { useState } from "react";
import PhotoLightbox from "@/components/photo-lightbox";

/**
 * Photos on the public friend-share page. The page itself stays a server
 * component — it hands avatar + gallery data URLs here, and this owns the
 * lightbox state. Photos are base64 data URLs, so Save works offline.
 */
export default function SharePhotoViewer({
  name,
  groupLabel,
  metLabel,
  avatar,
  gallery,
}: {
  name: string;
  groupLabel: string | null;
  metLabel: string | null;
  avatar: string | null;
  gallery: string[];
}) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const open = (src: string, alt: string) => setLightbox({ src, alt });

  return (
    <>
      <div className="flex flex-col items-center text-center">
        {avatar ? (
          <button
            type="button"
            onClick={() => open(avatar, `${name}'s profile photo`)}
            aria-label={`View ${name}'s profile photo`}
            className="h-24 w-24 cursor-zoom-in overflow-hidden rounded-full border transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", outlineColor: "var(--color-accent)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from private profile */}
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="h-24 w-24 overflow-hidden rounded-full border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            <span className="flex h-full items-center justify-center text-3xl font-semibold text-[var(--color-accent)]">{name[0]?.toUpperCase()}</span>
          </div>
        )}
        <h1 className="mt-4 text-2xl font-semibold">{name}</h1>
        {groupLabel && <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{groupLabel}</p>}
      </div>

      {metLabel && (
        <p className="mt-6 text-center text-sm text-[var(--color-ink-muted)]">
          Met through <span className="text-[var(--color-ink)]">{metLabel}</span>
        </p>
      )}

      {gallery.length > 0 && (
        <div className="mt-6">
          <b className="text-sm">Photos</b>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {gallery.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => open(src, `${name}'s photo ${i + 1}`)}
                aria-label={`View ${name}'s photo ${i + 1}`}
                className="aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl border p-0 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ borderColor: "var(--color-paper-3)", outlineColor: "var(--color-accent)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- data URLs from private profile */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} saveLabel="Save photo" />
      )}
    </>
  );
}

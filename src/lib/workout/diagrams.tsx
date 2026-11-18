/**
 * Exercise media — Open-GYM pose art or self-hosted technique GIFs.
 * Every catalog exercise has one or the other; the neutral placeholder
 * only renders for custom exercises without media.
 */
"use client";

import React, { useState } from "react";
import { ExerciseArt } from "./exercise-art";
import { EXERCISE_ART } from "./exercise-art-map";
import { EXERCISE_GIFS } from "./exercise-gifs";
import { VARIATION_MEDIA } from "./variation-media";


/** Neutral "no media" tile — replaces the old stick-figure fallback. */
export function MediaPlaceholder({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className={className} style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)", ...style }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }} aria-hidden="true">
        <path d="M2 12h2m16 0h2M7 8v8m10-8v8M7 12h10M4 10v4m16-4v4" />
      </svg>
    </span>
  );
}

/**
 * Exercise visual — Open-GYM pose art preferred, self-hosted technique GIF
 * otherwise (or via the toggle when both exist). pattern is unused by media
 * now but kept in the signature for call-site compatibility.
 */
export function ExerciseMedia({ slug, variation, className, style, showToggle = true }: { slug: string; pattern?: string; variation?: string | null; className?: string; style?: React.CSSProperties; showToggle?: boolean }) {
  // Grip/stance variations whose correct visual is a different catalog
  // exercise (rope pressdown → rope-pressdown) swap the media slug.
  const mediaSlug = (variation && !variation.startsWith("hand:") && VARIATION_MEDIA[`${slug}:${variation}`]) || slug;
  const hasArt = Boolean(EXERCISE_ART[mediaSlug]);
  const hasGif = EXERCISE_GIFS.has(mediaSlug);
  // Prefer the Open-GYM pose art when the exercise is mapped; exercises with
  // only a GIF default straight to it — never the stick-figure diagram.
  const [mode, setMode] = useState<"art" | "gif">(hasArt ? "art" : "gif");
  const [gifFailed, setGifFailed] = useState(false);
  // Variation change = different exercise's media — reset state during render.
  const [prevMedia, setPrevMedia] = useState(mediaSlug);
  if (prevMedia !== mediaSlug) {
    setPrevMedia(mediaSlug);
    setMode(hasArt ? "art" : "gif");
    setGifFailed(false);
  }
  const useGif = !gifFailed && hasGif && (mode === "gif" || !hasArt);
  return (
    <span className={className} style={{ position: "relative", display: "inline-flex", overflow: "hidden", ...style }}>
      {useGif ? (
        // eslint-disable-next-line @next/next/no-img-element -- self-hosted GIF, next/image can't optimize
        <img
          src={`/exercises/${mediaSlug}.gif`} alt="" loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", backgroundColor: "var(--color-paper-2)" }}
          onError={() => setGifFailed(true)}
        />
      ) : EXERCISE_ART[mediaSlug] ? (
        <ExerciseArt slug={mediaSlug} style={{ width: "100%", height: "100%" }} />
      ) : (
        // Neutral tile — only reachable for custom exercises with no media yet.
        <MediaPlaceholder />
      )}
      {showToggle && hasArt && hasGif && (
        <button
          type="button"
          aria-label={useGif ? "Show illustration" : "Show technique GIF"}
          title={useGif ? "Illustration" : "Technique GIF"}
          onClick={(e) => { e.stopPropagation(); setMode((m) => (m === "art" ? "gif" : "art")); }}
          style={{
            position: "absolute", right: 2, bottom: 2, width: 18, height: 18,
            borderRadius: 5, border: "1px solid var(--color-paper-3)",
            background: "var(--color-paper)", color: "var(--color-ink-muted)",
            display: "grid", placeItems: "center", cursor: "pointer", padding: 0,
            opacity: 0.85,
          }}
        >
          {useGif ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 5h16M4 12h10M4 19h7"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none"/></svg>
          )}
        </button>
      )}
    </span>
  );
}

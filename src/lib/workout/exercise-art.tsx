"use client";

import React, { useEffect, useRef, useState } from "react";
import { EXERCISE_ART } from "./exercise-art-map";
import { ExerciseDiagram } from "./diagrams";

// Open-GYM / Workout Guide pose illustrations (CC BY-SA 4.0) — multi-frame
// SVG path data served from /exercise-art/<slug>.txt, tinted via currentColor.
const cache = new Map<string, Promise<string[]>>();

function loadArt(slug: string): Promise<string[]> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`/exercise-art/${slug}.txt`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((t) => t.split("\n").map((s) => s.trim()).filter(Boolean))
      .catch(() => {
        cache.delete(slug);
        return [] as string[];
      });
    cache.set(slug, p);
  }
  return p;
}

const FRAME_MS = 650;

export function ExerciseArt({ slug, pattern, className, style }: { slug: string; pattern: string; className?: string; style?: React.CSSProperties }) {
  const art = EXERCISE_ART[slug];
  const [frames, setFrames] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [viewBox, setViewBox] = useState("0 0 512 512");
  const pathRef = useRef<SVGPathElement>(null);
  const measured = useRef(false);

  useEffect(() => {
    if (!art) return;
    let live = true;
    loadArt(art).then((f) => { if (live) setFrames(f); });
    return () => { live = false; };
  }, [art]);

  // Measure the first frame's real bounds once — frame sources aren't all
  // normalized to the same viewBox.
  useEffect(() => {
    if (!frames?.length || measured.current || !pathRef.current) return;
    measured.current = true;
    try {
      const b = pathRef.current.getBBox();
      const pad = Math.max(b.width, b.height) * 0.04;
      setViewBox(
        `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`,
      );
    } catch {
      /* keep default viewBox */
    }
  }, [frames]);

  useEffect(() => {
    if (!frames || frames.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), FRAME_MS);
    return () => clearInterval(t);
  }, [frames]);

  if (!art || (frames && frames.length === 0)) {
    return <ExerciseDiagram pattern={pattern} className={className} style={style} />;
  }
  if (!frames?.length) return null;

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path ref={pathRef} d={frames[idx]} fillRule="evenodd" />
    </svg>
  );
}

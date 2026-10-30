/**
 * Technique diagrams — self-drawn SVG stick figures keyed by movement
 * pattern. No CDN, always renders (mobile, offline, PWA).
 */
import React from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function fig(bars: React.ReactNode, person: React.ReactNode) {
  return (
    <svg viewBox="0 0 56 56" {...S} aria-hidden="true">
      {bars}
      {person}
    </svg>
  );
}

const PATTERNS: Record<string, React.ReactNode> = {
  horizontal_push: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <rect x="14" y="30" width="26" height="5" rx="2" />
      <circle cx="18" cy="24" r="3.4" />
      <path d="M21 26l10 4M31 30l-6-8M25 22l8-6" />
      <path d="M33 16l9-2" strokeWidth="3.4" />
    </>,
  ),
  incline_push: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <path d="M14 34l20-10v14H14z" opacity="0.3" />
      <circle cx="20" cy="24" r="3.4" />
      <path d="M23 26l9 4M32 30l-6-9M26 21l7-7" />
      <path d="M33 14l9-1" strokeWidth="3.4" />
    </>,
  ),
  vertical_push: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="12" r="3.4" />
      <path d="M28 15v14M28 19l-7 8M28 19l7 8M28 29l-5 12M28 29l5 12" />
      <path d="M16 9h24" strokeWidth="3.2" />
    </>,
  ),
  horizontal_flye: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <rect x="14" y="30" width="26" height="5" rx="2" />
      <circle cx="18" cy="24" r="3.4" />
      <path d="M21 26l10 4" />
      <path d="M31 30l-2-8M32 22l8-4M22 22l-6 6" opacity="0.85" />
    </>,
  ),
  vertical_pull: fig(
    <path d="M12 8v36M44 8v36M12 8h32" opacity="0.35" />,
    <>
      <circle cx="28" cy="16" r="3.2" />
      <path d="M28 19v13M28 22l-8-8M28 22l8-8M28 32l-5 12M28 32l5 12" />
    </>,
  ),
  horizontal_pull: fig(
    <path d="M10 44h36M10 44V24" opacity="0.35" />,
    <>
      <circle cx="24" cy="16" r="3.4" />
      <path d="M24 20v12M24 24l-10 8M24 24l10 6M24 32l-6 12M24 32l6 12" />
    </>,
  ),
  pullover: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <rect x="12" y="32" width="28" height="5" rx="2" />
      <circle cx="16" cy="26" r="3.4" />
      <path d="M19 28l10 4" />
      <path d="M29 32l4-12M33 20l10-4" />
    </>,
  ),
  lateral_raise: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v14M28 22l-9-2M28 22l9-2M28 32l-5 12M28 32l5 12" />
      <circle cx="17" cy="21" r="2" /><circle cx="39" cy="21" r="2" />
    </>,
  ),
  rear_flye: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="24" cy="18" r="3.4" />
      <path d="M24 21l4 12M28 24l-10-4M28 24l10-4M28 33l-5 11M28 33l5 11" />
    </>,
  ),
  elbow_flexion: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v14M28 22l-8 4M20 26l2-8M28 32l-5 12M28 32l5 12" />
      <circle cx="22" cy="17" r="2" />
    </>,
  ),
  elbow_extension: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v14M28 22l4-10M32 12l6 2M28 32l-5 12M28 32l5 12" />
    </>,
  ),
  squat: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <path d="M18 10h20" strokeWidth="3" />
      <circle cx="28" cy="15" r="3.4" />
      <path d="M28 18v10M28 22l-8 6M28 28l-6 8 4 8M28 28l6 8-4 8" />
    </>,
  ),
  lunge: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="26" cy="12" r="3.4" />
      <path d="M26 16v12M26 20l-7 4M26 28l-8 4v12M26 28l8 2v14" />
      <path d="M14 14l-2 8M38 14l2 8" opacity="0.5" />
    </>,
  ),
  hinge: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="18" cy="22" r="3.4" />
      <path d="M21 24l14 8M35 32l-4 12M35 32l8 8M21 24l-6 4" />
      <path d="M14 28l-2 12" strokeWidth="3" />
    </>,
  ),
  knee_flexion: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <rect x="12" y="30" width="24" height="5" rx="2" />
      <circle cx="34" cy="24" r="3.4" />
      <path d="M31 26l-12 4M19 30l-2 8M17 38l-4-2" />
      <path d="M31 26l4-6" />
    </>,
  ),
  knee_extension: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <rect x="14" y="26" width="14" height="5" rx="2" />
      <circle cx="32" cy="16" r="3.4" />
      <path d="M30 20l-4 6M26 26l-4-2M26 26l-2 10 10-4" />
      <path d="M30 20l6 4" />
    </>,
  ),
  plantar_flexion: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v14M28 32l-4 12M28 32l4 12" />
      <path d="M24 44l-2-4M32 44l2-4" strokeWidth="3" />
    </>,
  ),
  spinal_flexion: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <circle cx="30" cy="24" r="3.4" />
      <path d="M28 27l-10 8M18 35h14M18 35l-4 8M32 35l6 8" />
    </>,
  ),
  pelvic_curl: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <circle cx="18" cy="38" r="3.4" />
      <path d="M21 38h12M33 38l8-8M33 38l10-2M41 30v6" />
    </>,
  ),
  spinal_extension: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <circle cx="20" cy="20" r="3.4" />
      <path d="M22 23l10 9M32 32l-6 10M32 32l8 8" />
    </>,
  ),
  anti_extension: fig(
    <path d="M6 44h44" opacity="0.3" />,
    <>
      <circle cx="16" cy="36" r="3.4" />
      <path d="M19 37l12-2M31 35l10-12M31 35l12 2" />
    </>,
  ),
  rotation: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v14M28 22l-10-6M18 16l-4 10M28 32l-5 12M28 32l5 12" />
    </>,
  ),
  lateral_flexion: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="26" cy="14" r="3.4" />
      <path d="M26 18v14M26 22l-8 2 2 8M26 32l-4 12M26 32l6 12" />
    </>,
  ),
  anti_rotation: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v14M28 22l-12 0M28 32l-5 12M28 32l5 12" />
      <path d="M16 22l-6-4" strokeDasharray="3 3" />
    </>,
  ),
  shrug: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="12" r="3.4" />
      <path d="M28 15v14M28 20l-7 6M28 20l7 6M28 29l-5 15M28 29l5 15" />
    </>,
  ),
  carry: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="12" r="3.4" />
      <path d="M28 15v14M28 19l-8 2v8M28 19l8 2v8M28 29l-5 15M28 29l5 15" />
      <rect x="18" y="30" width="5" height="8" rx="1" /><rect x="33" y="30" width="5" height="8" rx="1" />
    </>,
  ),
  wrist_flexion: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <path d="M16 38h20M16 38l4-8M36 38l-4-8" opacity="0.6" />
      <path d="M20 34l8-4M28 30l6 4" strokeWidth="3" />
      <circle cx="36" cy="34" r="2.6" />
    </>,
  ),
  wrist_extension: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <path d="M16 38h20M16 38l4-8M36 38l-4-8" opacity="0.6" />
      <path d="M20 32l8 4M28 36l6-4" strokeWidth="3" />
      <circle cx="36" cy="30" r="2.6" />
    </>,
  ),
  static_grip: fig(
    <path d="M12 8h32" strokeWidth="3" opacity="0.6" />,
    <>
      <circle cx="28" cy="18" r="3.4" />
      <path d="M28 21v14M28 24l-6-12M28 24l6-12M28 35l-4 10M28 35l4 10" />
    </>,
  ),
  neck_flexion: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="16" r="4" />
      <path d="M28 24l6 10M34 34l-4 10M30 14l-8 4" strokeWidth="3" />
      <path d="M26 18l-4 4" strokeDasharray="2 2" />
    </>,
  ),
  neck_extension: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="16" r="4" />
      <path d="M28 24l6 10M34 34l-4 10M30 14l8-2" strokeWidth="3" />
      <path d="M30 18l4 4" strokeDasharray="2 2" />
    </>,
  ),
  neck_lateral: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="16" r="4" />
      <path d="M28 24l6 10M34 34l-4 10M24 14l-8 2" strokeWidth="3" />
    </>,
  ),
  neck_rotation: fig(
    <path d="M8 44h40" opacity="0.3" />,
    <>
      <circle cx="28" cy="16" r="4" />
      <path d="M28 24l6 10M34 34l-4 10" />
      <path d="M20 12a8 8 0 0116 0" strokeDasharray="3 3" />
    </>,
  ),
  abduction: fig(
    <path d="M10 44h36" opacity="0.3" />,
    <>
      <circle cx="28" cy="14" r="3.4" />
      <path d="M28 18v12M28 30l-10 8M28 30l10 8M28 22l-6 4M28 22l6 4" />
    </>,
  ),
};

export function ExerciseDiagram({ pattern, className, style }: { pattern: string; className?: string; style?: React.CSSProperties }) {
  const node = PATTERNS[pattern] ?? PATTERNS.horizontal_push;
  return <span className={className} style={{ display: "inline-flex", color: "var(--color-ink-muted)", ...style }}>{node}</span>;
}

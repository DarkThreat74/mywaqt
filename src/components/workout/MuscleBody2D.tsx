"use client";

import { useState } from "react";
import { fatigueColor, type BodyBucket } from "@/lib/workout/muscleBodyMap";

interface Props {
  fatigue: Partial<Record<BodyBucket, number>>;
  selectedBucket?: BodyBucket | null;
  onSelect?: (bucket: BodyBucket, label: string) => void;
}

const LABEL: Record<BodyBucket, string> = {
  chest: "Chest", front_delts: "Front delts", side_delts: "Side delts", rear_delts: "Rear delts",
  lats: "Lats", mid_back: "Mid back", traps: "Traps", lower_back: "Lower back",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", grip: "Grip",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", adductors: "Adductors",
  calves: "Calves", abs: "Abs", obliques: "Obliques", neck: "Neck",
};

const INK = "var(--color-ink-muted)";
const PAPER = "#EDE5D3";

// Stylized flat figure — capsule/ellipse regions per view. Not anatomical;
// a readable recovery map, used when WebGL is unavailable or fails.
const SELECT = "#d9a441";

function FrontFigure({ fatigue, selected, onPick }: { fatigue: Props["fatigue"]; selected: BodyBucket | null; onPick: Props["onSelect"] }) {
  const R = (bucket: BodyBucket, el: React.ReactNode) => (
    <g key={bucket} onClick={() => onPick?.(bucket, LABEL[bucket])} style={{ cursor: "pointer" }}>
      {el}
    </g>
  );
  const fill = (b: BodyBucket) => (b === selected ? SELECT : fatigueColor(fatigue[b] ?? 0));
  const sw = 1.5;
  const stroke = { stroke: INK, strokeWidth: sw } as const;
  return (
    <g>
      {R("neck", <rect x="91" y="46" width="18" height="20" rx="8" fill={fill("neck")} {...stroke} />)}
      {R("front_delts", <>
        <circle cx="57" cy="80" r="14" fill={fill("front_delts")} {...stroke} />
        <circle cx="143" cy="80" r="14" fill={fill("front_delts")} {...stroke} />
      </>)}
      {R("chest", <>
        <path d="M70 74 Q100 66 130 74 L126 108 Q100 116 74 108 Z" fill={fill("chest")} {...stroke} />
      </>)}
      {R("biceps", <>
        <rect x="36" y="94" width="16" height="52" rx="8" fill={fill("biceps")} {...stroke} />
        <rect x="148" y="94" width="16" height="52" rx="8" fill={fill("biceps")} {...stroke} />
      </>)}
      {R("forearms", <>
        <rect x="38" y="148" width="13" height="46" rx="6.5" fill={fill("forearms")} {...stroke} />
        <rect x="149" y="148" width="13" height="46" rx="6.5" fill={fill("forearms")} {...stroke} />
      </>)}
      {R("obliques", <>
        <path d="M74 112 L70 178 Q100 186 130 178 L126 112 Q100 120 74 112 Z" fill={fill("obliques")} {...stroke} opacity="0.55" />
      </>)}
      {R("abs", <rect x="82" y="118" width="36" height="60" rx="10" fill={fill("abs")} {...stroke} />)}
      {R("adductors", <>
        <rect x="86" y="182" width="13" height="120" rx="6.5" fill={fill("adductors")} {...stroke} opacity="0.6" />
        <rect x="101" y="182" width="13" height="120" rx="6.5" fill={fill("adductors")} {...stroke} opacity="0.6" />
      </>)}
      {R("quads", <>
        <rect x="66" y="184" width="30" height="118" rx="12" fill={fill("quads")} {...stroke} />
        <rect x="104" y="184" width="30" height="118" rx="12" fill={fill("quads")} {...stroke} />
      </>)}
      {R("calves", <>
        <rect x="68" y="306" width="26" height="52" rx="10" fill={fill("calves")} {...stroke} />
        <rect x="106" y="306" width="26" height="52" rx="10" fill={fill("calves")} {...stroke} />
      </>)}
      <circle cx="100" cy="34" r="16" fill={PAPER} {...stroke} />
      <rect x="60" y="94" width="13" height="48" rx="6.5" fill={PAPER} {...stroke} opacity="0.7" />
      <rect x="127" y="94" width="13" height="48" rx="6.5" fill={PAPER} {...stroke} opacity="0.7" />
    </g>
  );
}

function BackFigure({ fatigue, selected, onPick }: { fatigue: Props["fatigue"]; selected: BodyBucket | null; onPick: Props["onSelect"] }) {
  const R = (bucket: BodyBucket, el: React.ReactNode) => (
    <g key={bucket} onClick={() => onPick?.(bucket, LABEL[bucket])} style={{ cursor: "pointer" }}>
      {el}
    </g>
  );
  const fill = (b: BodyBucket) => (b === selected ? SELECT : fatigueColor(fatigue[b] ?? 0));
  const stroke = { stroke: INK, strokeWidth: 1.5 } as const;
  return (
    <g>
      {R("neck", <rect x="91" y="46" width="18" height="20" rx="8" fill={fill("neck")} {...stroke} />)}
      {R("rear_delts", <>
        <circle cx="57" cy="80" r="14" fill={fill("rear_delts")} {...stroke} />
        <circle cx="143" cy="80" r="14" fill={fill("rear_delts")} {...stroke} />
      </>)}
      {R("traps", <path d="M72 70 Q100 56 128 70 L122 104 Q100 112 78 104 Z" fill={fill("traps")} {...stroke} />)}
      {R("mid_back", <path d="M76 104 L124 104 L120 168 Q100 176 80 168 Z" fill={fill("mid_back")} {...stroke} />)}
      {R("lats", <>
        <path d="M78 108 L58 118 L52 176 Q66 184 80 178 Z" fill={fill("lats")} {...stroke} />
        <path d="M122 108 L142 118 L148 176 Q134 184 120 178 Z" fill={fill("lats")} {...stroke} />
      </>)}
      {R("lower_back", <rect x="84" y="164" width="32" height="26" rx="8" fill={fill("lower_back")} {...stroke} />)}
      {R("triceps", <>
        <rect x="36" y="94" width="16" height="52" rx="8" fill={fill("triceps")} {...stroke} />
        <rect x="148" y="94" width="16" height="52" rx="8" fill={fill("triceps")} {...stroke} />
      </>)}
      {R("forearms", <>
        <rect x="38" y="148" width="13" height="46" rx="6.5" fill={fill("forearms")} {...stroke} />
        <rect x="149" y="148" width="13" height="46" rx="6.5" fill={fill("forearms")} {...stroke} />
      </>)}
      {R("glutes", <>
        <ellipse cx="84" cy="184" rx="18" ry="14" fill={fill("glutes")} {...stroke} />
        <ellipse cx="116" cy="184" rx="18" ry="14" fill={fill("glutes")} {...stroke} />
      </>)}
      {R("hamstrings", <>
        <rect x="66" y="194" width="30" height="112" rx="12" fill={fill("hamstrings")} {...stroke} />
        <rect x="104" y="194" width="30" height="112" rx="12" fill={fill("hamstrings")} {...stroke} />
      </>)}
      {R("calves", <>
        <rect x="68" y="306" width="26" height="52" rx="10" fill={fill("calves")} {...stroke} />
        <rect x="106" y="306" width="26" height="52" rx="10" fill={fill("calves")} {...stroke} />
      </>)}
      <circle cx="100" cy="34" r="16" fill={PAPER} {...stroke} />
      <rect x="60" y="94" width="13" height="48" rx="6.5" fill={PAPER} {...stroke} opacity="0.7" />
      <rect x="127" y="94" width="13" height="48" rx="6.5" fill={PAPER} {...stroke} opacity="0.7" />
    </g>
  );
}

export default function MuscleBody2D({ fatigue, selectedBucket, onSelect }: Props) {
  const [view, setView] = useState<"front" | "back">("front");
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center gap-1 pt-2">
        {(["front", "back"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className="rounded-full px-3 py-1 text-[11px] font-medium"
            style={{
              background: view === v ? "var(--color-ink)" : "transparent",
              color: view === v ? "var(--color-paper)" : "var(--color-ink-muted)",
            }}>
            {v === "front" ? "Front" : "Back"}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 200 380" className="min-h-0 w-full flex-1" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Muscle recovery map">
        {view === "front"
          ? <FrontFigure fatigue={fatigue} selected={selectedBucket ?? null} onPick={onSelect} />
          : <BackFigure fatigue={fatigue} selected={selectedBucket ?? null} onPick={onSelect} />}
      </svg>
    </div>
  );
}

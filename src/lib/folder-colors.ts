// Folder color palette — each folder gets a distinct accent color.
// Auto-assigned by folder order; admin can override via the folderColor column.

export interface FolderColorTokens {
  name: string;
  // Main accent (for icon background, progress bar fill)
  accent: string;
  // Soft background (for folder card tint)
  soft: string;
  // Muted text color (for progress text)
  text: string;
}

// 8-color palette using oklch for consistent perceptual lightness.
// Colors are warm and grounded to match the Waqt contemplative aesthetic.
export const FOLDER_COLORS: FolderColorTokens[] = [
  { name: "teal",    accent: "oklch(0.55 0.09 195)", soft: "oklch(0.92 0.03 195)", text: "oklch(0.42 0.07 195)" },
  { name: "amber",   accent: "oklch(0.62 0.08 45)",  soft: "oklch(0.92 0.03 45)",  text: "oklch(0.48 0.06 45)" },
  { name: "rose",    accent: "oklch(0.58 0.10 20)",  soft: "oklch(0.92 0.03 20)",  text: "oklch(0.45 0.08 20)" },
  { name: "indigo",  accent: "oklch(0.52 0.09 270)", soft: "oklch(0.92 0.03 270)", text: "oklch(0.40 0.07 270)" },
  { name: "emerald", accent: "oklch(0.55 0.09 145)", soft: "oklch(0.92 0.03 145)", text: "oklch(0.42 0.07 145)" },
  { name: "violet",  accent: "oklch(0.55 0.09 300)", soft: "oklch(0.92 0.03 300)", text: "oklch(0.42 0.07 300)" },
  { name: "orange",  accent: "oklch(0.62 0.10 65)",  soft: "oklch(0.92 0.03 65)",  text: "oklch(0.48 0.07 65)" },
  { name: "sky",     accent: "oklch(0.55 0.08 230)", soft: "oklch(0.92 0.03 230)", text: "oklch(0.42 0.06 230)" },
];

const COLOR_NAMES = FOLDER_COLORS.map(c => c.name);

/**
 * Get folder color tokens by name, or auto-assign by index.
 * If folderColor is null/undefined, assign by folder order (index % 8).
 */
export function getFolderColor(folderColor: string | null | undefined, index: number): FolderColorTokens {
  if (folderColor && COLOR_NAMES.includes(folderColor)) {
    return FOLDER_COLORS[COLOR_NAMES.indexOf(folderColor)];
  }
  return FOLDER_COLORS[index % FOLDER_COLORS.length];
}

/**
 * Get all available color names (for admin color picker).
 */
export function getFolderColorNames(): string[] {
  return COLOR_NAMES;
}

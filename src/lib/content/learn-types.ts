/**
 * Shared types for curated Learn content.
 *
 * The section data itself lives in `learn-sections.json` and is served
 * via GET /api/learn/sections — importing types from this file is free
 * (type-only imports are erased at build time and never reach the bundle).
 */

export type Hadith = {
  arabic: string;
  english: string;
  source: string;
  /** translator attribution — shown as "tr. X" when known */
  translator?: string;
  grade?: string;
};

export type LearnSection = {
  id: string;
  title: string;
  subtitle: string;
  content: LearnBlock[];
};

export type LearnBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "hadith"; hadith: Hadith }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "callout"; text: string };

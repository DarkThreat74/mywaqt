/**
 * Server-side access to curated Learn content for Waqt.
 *
 * All hadith text is sourced from authenticated collections:
 * - Sahih al-Bukhari
 * - Sahih Muslim
 * - Sunan Abi Dawud
 * - Sunan an-Nasa'i
 * - Musnad Ahmad
 * - Mustadrak al-Hakim
 *
 * No content in this file is AI-generated. All Arabic and English
 * translations are from established hadith databases and scholarly sources.
 * Sources are cited per item for verification.
 *
 * The data lives in `learn-sections.json` so it never ships inside the
 * client JS bundle — the Learn page fetches it from GET /api/learn/sections.
 * Marked server-only as a build-time guard against re-introducing a client
 * import (type imports should come from `./learn-types` instead).
 */

import "server-only";
import data from "./learn-sections.json";
import type { LearnSection } from "./learn-types";

export type { Hadith, LearnSection, LearnBlock } from "./learn-types";

export const learnSections: LearnSection[] = data as LearnSection[];

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Library, ChevronDown } from "lucide-react";
import { learnSections, type LearnBlock, type Hadith } from "@/lib/content/learn";

type Tab = "search" | "library";
type Madhab = "standard" | "hanafi";

interface SearchResult {
  sectionIds: string[];
  matched: boolean;
  method: string;
}

const SUGGESTED_QUERIES = [
  "Teach me about Salah",
  "How do I perform wudu?",
  "What breaks wudu?",
  "How to pray with focus (khushu)",
  "Common mistakes in prayer",
  "How to pray behind an imam",
  "Making up missed prayers (qadaa)",
  "Travel prayer (qasr) rules",
  "Sajdah of forgetfulness",
  "Virtues of Fajr prayer",
  "What is the Awwabin prayer?",
  "How to perform ghusl",
];

// Client-side keyword matching — used as offline fallback when the API is unreachable.
// Mirrors the server-side keywordMatch logic in /api/learn/search/route.ts.
function clientSideKeywordMatch(query: string): string[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/[^a-z]/g, ""));

  const scored = learnSections.map((s) => {
    const haystack = `${s.title} ${s.subtitle}`.toLowerCase();
    // Also search heading texts within the content
    const headings = s.content
      .filter((b) => b.type === "heading")
      .map((b) => (b as { type: "heading"; text: string }).text)
      .join(" ")
      .toLowerCase();
    const fullHaystack = `${haystack} ${headings}`;

    let score = 0;
    for (const word of queryWords) {
      if (fullHaystack.includes(word)) score += 1;
    }
    if (s.title.toLowerCase().includes(queryLower)) score += 5;
    return { id: s.id, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.id);
}

export default function LearnClient({ madhab = "hanafi" }: { madhab?: Madhab }) {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1
          className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: "var(--color-ink)" }}
        >
          Learn
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-ink-muted)" }}
        >
          The virtues of salah, how to pray, and the rulings that strengthen
          your worship.
        </p>
      </div>

      {/* ── Tab switcher ── */}
      <div
        className="mb-6 flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <TabButton
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<Search className="h-4 w-4" />}
          label="Search"
        />
        <TabButton
          active={tab === "library"}
          onClick={() => setTab("library")}
          icon={<Library className="h-4 w-4" />}
          label="Library"
        />
      </div>

      {/* ── Madhab notice for non-Hanafi ── */}
      {madhab !== "hanafi" && (
        <div
          className="mb-6 rounded-lg px-3 py-3 sm:px-4"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-warmth) 6%, transparent)",
            borderLeft: "3px solid var(--color-warmth)",
          }}
        >
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--color-ink-soft)" }}
          >
            The detailed fiqh content below follows the <strong>Hanafi</strong> school.
            Content for the {madhab === "standard" ? "Shafi'i" : madhab} school is coming soon.
            Where rulings differ, the differences are noted within the content. Please consult
            a qualified scholar of your school for specific rulings.
          </p>
        </div>
      )}

      {/* ── Tab content ── */}
      {tab === "search" ? <SearchTab /> : <LibraryTab />}
    </div>
  );
}

// ── Tab button ──

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
      style={{
        backgroundColor: active ? "var(--color-paper)" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Search Tab ──

function SearchTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[] | null>(null);
  const [matched, setMatched] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim();
    if (!q) return;

    setQuery(q);
    setSearching(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/learn/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (res.status === 429) {
        setError("Search limit reached. Please try again in a few minutes.");
        setSearching(false);
        return;
      }

      if (!res.ok) {
        // API failed (e.g. offline, server error) — fall back to client-side matching
        const fallbackIds = clientSideKeywordMatch(q);
        setResults(fallbackIds);
        setMatched(fallbackIds.length > 0);
        if (fallbackIds.length > 0) {
          setOpenSectionId(fallbackIds[0]);
        }
        setSearching(false);
        return;
      }

      const data: SearchResult = await res.json();
      setResults(data.sectionIds);
      setMatched(data.matched);
      // Auto-open the first result
      if (data.sectionIds.length > 0) {
        setOpenSectionId(data.sectionIds[0]);
      }
    } catch {
      // Network error (offline) — fall back to client-side keyword matching
      const fallbackIds = clientSideKeywordMatch(q);
      setResults(fallbackIds);
      setMatched(fallbackIds.length > 0);
      if (fallbackIds.length > 0) {
        setOpenSectionId(fallbackIds[0]);
      }
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSuggestion = useCallback((suggestion: string) => {
    handleSearch(suggestion);
  }, [handleSearch]);

  const resultSections = results
    ?.map((id) => learnSections.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined) ?? [];

  return (
    <div>
      {/* ── Search input ── */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--color-ink-muted)" }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Ask about salah, wudu, khushu, qadaa..."
          maxLength={200}
          className="w-full rounded-xl py-3.5 pl-11 pr-4 text-sm outline-none transition-colors"
          style={{
            backgroundColor: "var(--color-paper)",
            border: "1px solid var(--color-paper-3)",
            color: "var(--color-ink)",
          }}
        />
      </div>

      {/* ── Search button ── */}
      <button
        onClick={() => handleSearch()}
        disabled={searching || !query.trim()}
        className="mb-6 w-full rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-50"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-paper)",
        }}
      >
        {searching ? "Searching..." : "Search"}
      </button>

      {/* ── Suggested queries (shown when no results yet) ── */}
      {!results && !error && (
        <div>
          <p
            className="mb-3 text-xs font-medium"
            style={{ color: "var(--color-ink-muted)" }}
          >
            Suggested
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestion(suggestion)}
                className="rounded-full px-3.5 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-paper-2)",
                  color: "var(--color-ink-soft)",
                  border: "1px solid var(--color-paper-3)",
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-danger) 6%, transparent)",
            color: "var(--color-ink-soft)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── No results ── */}
      {results && !matched && (
        <div
          className="rounded-lg px-4 py-6 text-center"
          style={{
            backgroundColor: "var(--color-paper)",
            border: "1px solid var(--color-paper-3)",
          }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            No matching lesson found
          </p>
          <p
            className="mt-1 text-xs leading-relaxed"
            style={{ color: "var(--color-ink-muted)" }}
          >
            This topic is not yet covered in the library. Try browsing the Library tab
            for all available lessons, or rephrase your question.
          </p>
        </div>
      )}

      {/* ── Results ── */}
      {resultSections.length > 0 && (
        <div className="space-y-3">
          <p
            className="text-xs font-medium"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {resultSections.length} {resultSections.length === 1 ? "lesson" : "lessons"} found
          </p>
          {resultSections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              isOpen={openSectionId === section.id}
              onToggle={() =>
                setOpenSectionId(openSectionId === section.id ? null : section.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Library Tab ──

function LibraryTab() {
  const [openId, setOpenId] = useState<string | null>(null);

  // Group sections into categories for easier browsing
  const categories: { label: string; sectionIds: string[] }[] = [
    {
      label: "Virtues & Spirituality",
      sectionIds: ["virtues-of-salah", "virtues-of-each-prayer", "khushu"],
    },
    {
      label: "How to Pray",
      sectionIds: ["how-to-pray", "witr-prayer", "sunnah-prayers"],
    },
    {
      label: "Purification",
      sectionIds: ["wudu-and-ghusl"],
    },
    {
      label: "Prayer Times",
      sectionIds: ["prayer-times-significance"],
    },
    {
      label: "Corrections & Forgetfulness",
      sectionIds: ["common-mistakes", "sujud-as-sahw", "sajdah-tilawah"],
    },
    {
      label: "Congregation & Travel",
      sectionIds: ["prayer-in-congregation", "qasr-travel-prayer"],
    },
    {
      label: "Making Up Prayers",
      sectionIds: ["qadaa-missed-prayers"],
    },
  ];

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const sections = category.sectionIds
          .map((id) => learnSections.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined);

        if (sections.length === 0) return null;

        return (
          <div key={category.label}>
            <h2
              className="mb-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-ink-muted)" }}
            >
              {category.label}
            </h2>
            <div className="space-y-3">
              {sections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  isOpen={openId === section.id}
                  onToggle={() =>
                    setOpenId(openId === section.id ? null : section.id)
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Footer note ── */}
      <p
        className="pt-4 text-center text-xs leading-relaxed"
        style={{ color: "var(--color-ink-muted)" }}
      >
        All hadith are sourced from authenticated collections. Sources are cited
        for verification. Content follows the Hanafi school of fiqh.
      </p>
    </div>
  );
}

// ── Section Card (shared between Search and Library) ──

function SectionCard({
  section,
  isOpen,
  onToggle,
}: {
  section: typeof learnSections[number];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border transition-colors"
      style={{
        borderColor: isOpen
          ? "color-mix(in oklab, var(--color-accent) 30%, var(--color-paper-3))"
          : "var(--color-paper-3)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Card header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--color-paper-2)] sm:gap-4 sm:px-5"
        aria-expanded={isOpen}
        aria-controls={`section-content-${section.id}`}
        style={{ minHeight: 56 }}
      >
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-semibold leading-tight sm:text-base"
            style={{ color: "var(--color-ink)" }}
          >
            {section.title}
          </h3>
          <p
            className="mt-0.5 truncate text-xs leading-relaxed sm:text-[13px]"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {section.subtitle}
          </p>
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-200"
          style={{
            color: "var(--color-ink-muted)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Card content */}
      {isOpen && (
        <div
          id={`section-content-${section.id}`}
          className="border-t px-4 py-5 sm:px-5"
          style={{ borderColor: "var(--color-paper-3)" }}
        >
          <div className="space-y-4">
            {section.content.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Block renderer ──

function BlockRenderer({ block }: { block: LearnBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-ink-soft)", overflowWrap: "break-word" }}
        >
          {block.text}
        </p>
      );

    case "heading":
      return (
        <h4
          className="pt-2 text-sm font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {block.text}
        </h4>
      );

    case "hadith":
      return <HadithBlock hadith={block.hadith} />;

    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm leading-relaxed"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: "var(--color-accent-soft)" }}
              />
              <span style={{ overflowWrap: "break-word" }}>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="space-y-3">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm leading-relaxed"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                style={{
                  backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
                  color: "var(--color-accent)",
                }}
              >
                {i + 1}
              </span>
              <span className="pt-0.5" style={{ overflowWrap: "break-word" }}>{item}</span>
            </li>
          ))}
        </ol>
      );

    case "callout":
      return (
        <div
          className="rounded-lg px-3 py-3 sm:px-4"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-warmth) 6%, transparent)",
            borderLeft: "3px solid var(--color-warmth)",
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--color-ink-soft)", overflowWrap: "break-word" }}
          >
            {block.text}
          </p>
        </div>
      );

    default:
      return null;
  }
}

// ── Hadith block ──

function HadithBlock({ hadith }: { hadith: Hadith }) {
  return (
    <div
      className="rounded-lg px-3 py-3 sm:px-4 sm:py-4"
      style={{
        backgroundColor: "color-mix(in oklab, var(--color-accent) 4%, var(--color-paper))",
        border: "1px solid color-mix(in oklab, var(--color-accent) 15%, transparent)",
      }}
    >
      <p
        dir="rtl"
        className="mb-3 text-right leading-loose"
        style={{
          fontFamily: "var(--font-amiri), Georgia, serif",
          color: "var(--color-ink)",
          fontSize: "1rem",
          lineHeight: 2,
          wordBreak: "break-word",
          overflowWrap: "break-word",
        }}
      >
        {hadith.arabic}
      </p>

      <div
        className="mb-3 h-px"
        style={{
          backgroundColor: "color-mix(in oklab, var(--color-accent) 15%, transparent)",
        }}
      />

      <p
        className="mb-3 text-sm leading-relaxed"
        style={{ color: "var(--color-ink-soft)", overflowWrap: "break-word" }}
      >
        {hadith.english}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-md px-2 py-1 text-[11px] font-medium"
          style={{
            backgroundColor: "var(--color-paper-2)",
            color: "var(--color-ink-muted)",
          }}
        >
          {hadith.source}
        </span>
        {hadith.grade && (
          <span
            className="rounded-md px-2 py-1 text-[11px] font-medium"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)",
              color: "var(--color-success)",
            }}
          >
            {hadith.grade}
          </span>
        )}
      </div>
    </div>
  );
}

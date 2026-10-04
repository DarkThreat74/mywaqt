"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cake, X } from "lucide-react";
import type { Birthday } from "@/lib/db/schema";
import { birthdayLabel, daysUntilBirthday, turningAge } from "@/lib/birthdays/math";

const SEEN_KEY = "waqt:bday-seen";

interface Match {
  bday: Birthday;
  inDays: number;
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Full-screen birthday reminder — fires once per reminder-offset day per
 * birthday per device. A birthday shows on days that appear in its
 * remindDays list (0 = the day itself). Dismissals are stamped per
 * birthday-id + date, so different accounts on one device can't collide
 * and each configured offset still gets its own alert.
 */
export default function BirthdayAlerter() {
  const [queue, setQueue] = useState<Match[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>(loadSeen);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/birthdays")
      .then((r) => (r.ok ? r.json() : { birthdays: [] }))
      .then((d) => {
        if (cancelled) return;
        const matches: Match[] = (d.birthdays ?? [])
          .map((b: Birthday) => ({ bday: b, inDays: daysUntilBirthday(b) }))
          .filter((m: Match) => m.bday.remindDays.includes(m.inDays))
          .sort((a: Match, b: Match) => a.inDays - b.inDays);
        if (matches.length > 0) setQueue(matches);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape dismisses the frontmost alert
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const m = queue.find((mm) => seen[mm.bday.id] !== todayStr());
      if (!m) return;
      const next = { ...seen, [m.bday.id]: todayStr() };
      setSeen(next);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // session dismissal still applies
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, seen]);

  // Drop already-seen entries from the front of the queue
  const current = queue.find((m) => seen[m.bday.id] !== todayStr());
  if (!current) return null;

  const { bday, inDays } = current;
  const age = turningAge(bday);

  function dismiss() {
    const next = { ...seen, [bday.id]: todayStr() };
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      // storage full/blocked — session dismissal still applies
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Birthday reminder: ${bday.name}`}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "var(--color-paper)" }}
    >
      {/* Decorative rings */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ border: "1.5px solid var(--color-accent-faint)" }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[100vmin] w-[100vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ border: "1px solid var(--color-paper-3)" }}
        />
      </div>

      <button
        onClick={dismiss}
        className="absolute right-4 top-4 rounded-full p-2.5 transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-muted)", top: "max(1rem, env(safe-area-inset-top))" }}
        aria-label="Dismiss reminder"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="flex h-20 w-20 items-center justify-center rounded-3xl"
        style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
      >
        <Cake className="h-9 w-9" aria-hidden />
      </div>

      <p
        className="mt-6 text-[11px] font-medium uppercase tracking-[0.25em]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        {inDays === 0 ? "Today" : `In ${inDays} day${inDays === 1 ? "" : "s"}`}
      </p>

      <h1
        className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-5xl"
        style={{ color: "var(--color-ink)" }}
      >
        {inDays === 0
          ? `${bday.name}'s birthday is today`
          : `${bday.name}'s birthday is coming`}
      </h1>

      <p className="mt-4 text-sm sm:text-base" style={{ color: "var(--color-ink-soft)" }}>
        {birthdayLabel(bday)}
        {age !== null && ` — turning ${age}`}
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={dismiss}
          className="rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          Got it
        </button>
        <Link
          href="/birthdays"
          onClick={dismiss}
          className="rounded-full border px-6 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
        >
          All birthdays
        </Link>
      </div>
    </div>
  );
}

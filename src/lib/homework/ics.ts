export interface ICSEntry {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
}

/** Unfold folded ICS lines (continuation lines start with space/tab). */
function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").replace(/\r/g, "");
}

function parseICSDate(raw: string): { date: string; time?: string } | null {
  // Formats: 20250115, 20250115T143000, 20250115T143000Z, 20250115T143000+0000
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(raw.trim());
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    time: m[4] ? `${m[4]}:${m[5]}` : undefined,
  };
}

/**
 * Minimal ICS importer — extracts VEVENT SUMMARY + DTSTART/DUE as homework
 * entries. Covers what Canvas/Moodle/Google Classroom export for assignment
 * calendars. No dependency, ignores everything else.
 */
export function parseICS(text: string): ICSEntry[] {
  const flat = unfold(text);
  const entries: ICSEntry[] = [];
  for (const block of flat.split("BEGIN:VEVENT").slice(1)) {
    const summary = /^SUMMARY(?:;[^:]*)?:(.+)$/m.exec(block)?.[1];
    const dtstart = /^(?:DTSTART|DUE|DTEND)(?:;[^:]*)?:(.+)$/m.exec(block)?.[1];
    if (!summary || !dtstart) continue;
    const d = parseICSDate(dtstart);
    if (!d) continue;
    const title = summary
      .replace(/\\n/g, " ")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
    if (title) entries.push({ title, date: d.date, time: d.time });
  }
  return entries;
}

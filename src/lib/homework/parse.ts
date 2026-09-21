import type { HomeworkKind } from "./kinds";

export interface ParsedHomework {
  title: string;
  kind?: HomeworkKind;
  classId?: string;
  className?: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:MM
  priority?: "low" | "medium" | "high";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const MONTH_WORDS = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const KIND_WORDS: Array<[RegExp, HomeworkKind]> = [
  [/\b(exams?|midterms?|finals?)\b/i, "exam"],
  [/\b(tests?)\b/i, "test"],
  [/\b(quiz(zes)?|pop quiz)\b/i, "quiz"],
  [/\b(essays?|papers?|reports?|write[- ]?ups?)\b/i, "essay"],
  [/\b(labs?|lab reports?)\b/i, "lab"],
  [/\b(projects?)\b/i, "project"],
  [/\b(presentations?|present|slides?|decks?)\b/i, "presentation"],
  [/\b(worksheets?|problem sets?|psets?|packets?)\b/i, "worksheet"],
  [/\b(readings?|chapters?|pages?)\b/i, "reading"],
  [/\b(study|revise|revision|review)\b/i, "study"],
  [/\b(hw|homework|assignments?)\b/i, "homework"],
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthIndex(word: string): number {
  return MONTHS.split("|").indexOf(word.toLowerCase().slice(0, 3));
}

/** Set the date on the result, rolling to next year if it already passed. */
function futureDate(now: Date, d: Date): string {
  if (d.getTime() < now.getTime() - DAY_MS) d.setFullYear(d.getFullYear() + 1);
  return toDateStr(d);
}

/**
 * Lightweight natural-language homework parser — Schooltraq-style quick add.
 * Extracts kind keywords, "in <class>", dates (today/tomorrow/weekday/month
 * day/numeric), times, and priority markers. Each match removes its span
 * from the title. Pure client-side — no AI, no network, works offline.
 */
export function parseHomeworkTitle(
  input: string,
  classes: Array<{ id: string; name: string }>,
): ParsedHomework {
  const result: ParsedHomework = { title: input };
  let working = ` ${input} `; // padded so \b works at both ends
  const now = new Date();
  const strip = (m: RegExpExecArray) => { working = working.replace(m[0], " "); };

  // Priority: "urgent", "important", "!", "p1/p2/p3", "low priority"
  const prioM = /\b(urgent|important|asap|high priority|priority high|low priority|p[123])\b|(!!+)/i.exec(working);
  if (prioM) {
    const w = prioM[0].toLowerCase();
    result.priority = w.includes("low") || w === "p3" ? "low" : w === "p2" ? "medium" : "high";
    strip(prioM);
  }

  // Class: "in <name>" / "for <name>" / "<name> class" — longest name first
  const sorted = [...classes].sort((a, b) => b.name.length - a.name.length);
  for (const cls of sorted) {
    const esc = cls.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`\\b(?:in|for)\\s+(${esc})\\b`, "i").exec(working)
      ?? new RegExp(`\\b(${esc})\\s+(?:class|course)\\b`, "i").exec(working);
    if (m) {
      result.classId = cls.id;
      result.className = cls.name;
      strip(m);
      break;
    }
  }

  // Time: "at 5pm", "by 14:30", "5:30"
  const timeM = /\b(?:at|by|due)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(working)
    ?? /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i.exec(working);
  if (timeM) {
    let h = Number(timeM[1]);
    const m = timeM[2] ? Number(timeM[2]) : 0;
    const mer = (timeM[3] ?? "").toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    if (h < 24 && m < 60) {
      result.dueTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      strip(timeM);
    }
  }

  // Dates — relative words, "in N days", weekday, month name, numeric
  const relM = /\b(tomorrow|tonight|today|day after tomorrow|next week)\b/i.exec(working);
  if (relM) {
    const d = new Date(now);
    const w = relM[1].toLowerCase();
    if (w === "tomorrow" || w === "tonight") d.setDate(d.getDate() + 1);
    else if (w === "day after tomorrow") d.setDate(d.getDate() + 2);
    else if (w === "next week") d.setDate(d.getDate() + 7);
    result.dueDate = toDateStr(d);
    if (w === "tonight") result.dueTime ??= "23:59";
    strip(relM);
  } else {
    const inDaysM = /\bin\s+(\d{1,2})\s+days?\b/i.exec(working);
    if (inDaysM) {
      result.dueDate = futureDate(now, new Date(now.getTime() + Number(inDaysM[1]) * DAY_MS));
      strip(inDaysM);
    }
  }
  if (!result.dueDate) {
    const isoM = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(working);
    const wdM = new RegExp(`\\b(next\\s+)?(${WEEKDAYS.join("|")}|${WEEKDAYS.map((w) => w.slice(0, 3)).join("|")})\\b`, "i").exec(working);
    const monthM = new RegExp(`\\b(${MONTH_WORDS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i").exec(working)
      ?? new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_WORDS})\\b`, "i").exec(working);
    const numM = /\b(\d{1,2})\/(\d{1,2})\b/.exec(working);
    if (isoM) {
      result.dueDate = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
      strip(isoM);
    } else if (wdM) {
      const name = wdM[2].toLowerCase();
      const target = WEEKDAYS.findIndex((w) => w.startsWith(name.slice(0, 3)));
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // same weekday means next week
      if (wdM[1]) delta += 7;
      d.setDate(d.getDate() + delta);
      result.dueDate = toDateStr(d);
      strip(wdM);
    } else if (monthM) {
      const dayFirst = /^\d+$/.test(monthM[1]);
      const day = Number(dayFirst ? monthM[1] : monthM[2]);
      const month = monthIndex(dayFirst ? monthM[2] : monthM[1]);
      if (day >= 1 && day <= 31 && month >= 0) {
        result.dueDate = futureDate(now, new Date(now.getFullYear(), month, day));
        strip(monthM);
      }
    } else if (numM) {
      let [mm, dd] = [Number(numM[1]), Number(numM[2])];
      if (mm > 12 && dd <= 12) [mm, dd] = [dd, mm];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        result.dueDate = futureDate(now, new Date(now.getFullYear(), mm - 1, dd));
        strip(numM);
      }
    }
  }

  // Kind keywords — first match wins
  for (const [re, k] of KIND_WORDS) {
    const m = re.exec(working);
    if (m) {
      result.kind = k;
      strip(m);
      break;
    }
  }

  result.title = working
    .replace(/\b(due|by|on|at|in|for)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!result.title) result.title = input.trim();

  return result;
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { env } from "@/lib/env";
import { db, schema } from "@/lib/db/client";
import { and, eq, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface Segment {
  kind: "study" | "break";
  minutes: number;
  label: string;
}

interface Assignment {
  title: string;
  estimatedMinutes: number | null;
  homeworkId?: string;
  /** Server-filled from the user's own rows — never trusted from the body. */
  kind?: string;
  grade?: string | null;
  studiedMin?: number;
}

interface StudyProfile {
  sessions?: number;
  avgBreaks?: number;
  avgSwitches?: number;
  finishRate?: number;
  prefMethod?: string;
}

/**
 * POST /api/study-plan — Vox segments a block's usable minutes into
 * study/break intervals. The OpenRouter call is best-effort: if the key is
 * missing or the model fails, a deterministic pomodoro-style planner answers.
 *
 * Body: { minutes: number, assignments: [{ title, estimatedMinutes? }] }
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("study-plan", getClientIp(request.headers), 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: {
    minutes?: number; method?: string; ordered?: boolean;
    assignments?: { title?: string; estimatedMinutes?: number | null; homeworkId?: string }[];
    profile?: { sessions?: number; avgBreaks?: number; avgSwitches?: number; finishRate?: number; prefMethod?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const minutes = Math.min(480, Math.max(10, Math.floor(body.minutes ?? 0)));
  const assignments = (Array.isArray(body.assignments) ? body.assignments : [])
    .slice(0, 10)
    .map((a): Assignment => ({
      title: String(a.title ?? "").slice(0, 120) || "Study",
      estimatedMinutes: typeof a.estimatedMinutes === "number" ? Math.min(480, Math.max(0, a.estimatedMinutes)) : null,
      homeworkId: typeof a.homeworkId === "string" && UUID_RE.test(a.homeworkId) ? a.homeworkId : undefined,
    }));
  if (assignments.length === 0) assignments.push({ title: "Study", estimatedMinutes: null });

  // ── Per-assignment history: kind, grade outcome, and how many minutes of
  // real study this item has already absorbed (worked blocks). This is what
  // makes the plan smart — an exam the user prepped 2h for and failed needs a
  // different shape than one that earned an A after 30m. Scoped to the user.
  const ids = assignments.map((a) => a.homeworkId).filter(Boolean) as string[];
  if (ids.length > 0) {
    const hist = await db
      .select({
        homeworkId: schema.blockAssignments.homeworkId,
        kind: schema.homeworks.kind,
        grade: schema.homeworks.grade,
        workedMin: sql<number>`coalesce(sum((${schema.studyBlocks.endMin} - ${schema.studyBlocks.startMin})) filter (where ${schema.studyBlocks.status} = 'worked'), 0)::int`,
      })
      .from(schema.blockAssignments)
      .innerJoin(schema.studyBlocks, eq(schema.studyBlocks.id, schema.blockAssignments.blockId))
      .innerJoin(schema.homeworks, eq(schema.homeworks.id, schema.blockAssignments.homeworkId))
      .where(and(eq(schema.studyBlocks.userId, session.userId), inArray(schema.blockAssignments.homeworkId, ids)))
      .groupBy(schema.blockAssignments.homeworkId, schema.homeworks.kind, schema.homeworks.grade)
      .catch(() => []);
    // Real focused minutes per homeworkId — the session log records actual
    // used study time per assignment, which beats the scheduled block length
    // (a 2h block where 40m was focused shouldn't count as 2h of prep).
    const sessRows = await db
      .select({ subjects: schema.studySessionHistory.subjects })
      .from(schema.studySessionHistory)
      .where(eq(schema.studySessionHistory.userId, session.userId))
      .limit(400)
      .catch(() => [] as { subjects: { label: string; min: number; hw?: string }[] | null }[]);
    const realMin = new Map<string, number>();
    for (const r of sessRows) {
      for (const s of r.subjects ?? []) {
        if (s.hw) realMin.set(s.hw, (realMin.get(s.hw) ?? 0) + s.min);
      }
    }
    const byId = new Map(hist.map((h) => [h.homeworkId, h]));
    for (const a of assignments) {
      const h = a.homeworkId ? byId.get(a.homeworkId) : undefined;
      const real = a.homeworkId ? realMin.get(a.homeworkId) ?? 0 : 0;
      if (!h && real === 0) continue;
      a.kind = h?.kind;
      a.grade = h?.grade;
      a.studiedMin = Math.max(h?.workedMin ?? 0, real);
      // Under-studied assessments need room to breathe — lift the estimate
      // to at least what's actually been logged so segments aren't starved.
      if (a.studiedMin! > 0 && (!a.estimatedMinutes || a.studiedMin! > a.estimatedMinutes)) {
        a.estimatedMinutes = Math.min(240, a.studiedMin!);
      }
    }
  }
  // Hardest first while focus is fresh — unless the user manually ordered the
  // list, in which case their arrangement is intentional and stays.
  if (body.ordered !== true) {
    assignments.sort((a, b) => (b.estimatedMinutes ?? 15) - (a.estimatedMinutes ?? 15));
  }

  const METHODS = ["pomodoro", "sprint", "deep", "ultradian", "interleave", "flowtime"] as const;
  let method = (METHODS as readonly string[]).includes(body.method ?? "")
    ? (body.method as Method)
    : "auto";

  // Sanitize the client-computed habit profile (numbers only, clamped).
  const p = body.profile;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : undefined);
  const profile: StudyProfile | undefined = p ? {
    sessions: num(p.sessions, 10000),
    avgBreaks: num(p.avgBreaks, 50),
    avgSwitches: num(p.avgSwitches, 50),
    finishRate: num(p.finishRate, 1),
    prefMethod: typeof p.prefMethod === "string" && (METHODS as readonly string[]).includes(p.prefMethod) ? p.prefMethod : undefined,
  } : undefined;

  // "Auto" defers to the method the student actually reaches for.
  if (method === "auto" && profile?.prefMethod) method = profile.prefMethod as Method;

  const segments =
    await planWithVox(minutes, assignments, method, body.ordered === true, profile) ??
    fallbackPlan(minutes, assignments, method, profile);
  return NextResponse.json({ segments });
}

type Method = "auto" | "pomodoro" | "sprint" | "deep" | "ultradian" | "interleave" | "flowtime";

const METHOD_HINTS: Record<Method, string> = {
  auto: "Balanced — focused study segments (10–35 min, longest for heavy subjects, shorter for review) with short breaks (5–10 min).",
  pomodoro: "Pomodoro (systematic long breaks) — ~25 min work, ~5 min rest, a 15 min break after every third study segment. The most-studied rhythm: systematic breaks lower fatigue and raise motivation vs self-paced breaks (Biwer et al. 2023).",
  sprint: "Sprint (systematic short breaks) — ~12 min work, ~3 min rest. For drilling, flashcards and revision — short blocks cut task-switching cost and keep energy high.",
  deep: "Deep work — long uninterrupted stretches (35–60 min) with 10–15 min breaks. For heavy reading, problem sets, writing — the work that needs sustained attention.",
  ultradian: "Ultradian — a single ~90 min deep block per subject matching the brain's basic rest-activity cycle, with 20 min breaks. Best for one big piece of work.",
  interleave: "Interleaving — rotate subjects every ~20 min instead of finishing each in one go. Mixed practice strengthens discrimination and memory vs blocked study, especially for problem-solving subjects.",
  flowtime: "Flowtime — work until focus fades instead of by the clock. Plan generous ~15 min breaks between big chunks; the student takes them when needed.",
};

// ─── Vox (OpenRouter) ───

async function planWithVox(
  minutes: number,
  assignments: Assignment[],
  method: Method,
  ordered: boolean,
  profile?: StudyProfile,
): Promise<Segment[] | null> {
  if (!env.openrouterApiKey) return null;

  const list = assignments
    .map((a) => {
      const bits: string[] = [];
      if (a.estimatedMinutes) bits.push(`~${a.estimatedMinutes} min estimated`);
      if (a.kind && a.kind !== "homework") bits.push(a.kind);
      if (a.studiedMin) bits.push(`already studied ${a.studiedMin}m`);
      if (a.grade) bits.push(`last grade: ${a.grade === "fail" ? "failed" : a.grade}`);
      return `- ${a.title}${bits.length ? ` (${bits.join(", ")})` : ""}`;
    })
    .join("\n");

  const habitLine = profile?.sessions
    ? `Student habits (from ${profile.sessions} logged sessions): finishes ${Math.round((profile.finishRate ?? 0) * 100)}% of sessions, takes ~${(profile.avgBreaks ?? 0).toFixed(1)} breaks and switches assignments ~${(profile.avgSwitches ?? 0).toFixed(1)} times per session. ` +
      "Adjust: frequent switching → shorter segments per subject and rotate them; many breaks → schedule generous breaks rather than starving them; low finish rate → keep segments short. "
    : "";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openrouterApiKey}`,
      },
      body: JSON.stringify({
        model: env.openrouterModel,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are Vox, a study-session planner inside a Muslim prayer app. " +
              "Given a fixed number of minutes and a list of assignments, output a segmented study plan. " +
              `Method: ${METHOD_HINTS[method]} ` +
              (ordered
                ? "The assignment order below is deliberate — the student arranged it themselves; respect it exactly. "
                : "Start with the most demanding subject while focus is fresh. ") +
              habitLine +
              "An item marked 'failed' or graded C needs review-style spacing — shorter segments, revisit it once more near the end. " +
              "The sum of all segment minutes must exactly equal the total minutes given. " +
              "If an assignment has an estimate, prefer a segment near that size — the estimate is what the student believes the work takes. " +
              "Labels must be short imperative phrases naming the subject (e.g. 'Chem lab — outline the procedure'). " +
              "Break labels: 'Break'. Reply with ONLY a JSON array like " +
              '[{"kind":"study","minutes":25,"label":"Chem lab — outline"},{"kind":"break","minutes":5,"label":"Break"}].',
          },
          {
            role: "user",
            content: `Total minutes: ${minutes}\nAssignments:\n${list}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const clean: Segment[] = parsed
      .filter((s): s is Segment =>
        typeof s === "object" && s !== null &&
        (s as Segment).kind !== undefined &&
        ["study", "break"].includes((s as Segment).kind) &&
        typeof (s as Segment).minutes === "number")
      .map((s) => ({
        kind: s.kind,
        minutes: Math.max(1, Math.round(s.minutes)),
        label: String(s.label ?? (s.kind === "break" ? "Break" : "Study")).slice(0, 80),
      }))
      .slice(0, 30);
    if (clean.length === 0) return null;
    return normalizeTotal(clean, minutes);
  } catch {
    return null;
  }
}

// ─── Deterministic fallback (no key / model failure) ───

function fallbackPlan(
  minutes: number,
  assignments: Assignment[],
  method: Method = "auto",
  profile?: StudyProfile,
): Segment[] {
  // Method shapes the default chunk + break lengths; a smaller estimate
  // always wins when it fits inside what's left.
  const shape = {
    auto:       { study: 25, breakLen: 5,  maxStudy: 35 },
    pomodoro:   { study: 25, breakLen: 5,  maxStudy: 30 },
    sprint:     { study: 12, breakLen: 3,  maxStudy: 15 },
    deep:       { study: 50, breakLen: 10, maxStudy: 60 },
    ultradian:  { study: 90, breakLen: 20, maxStudy: 120 },
    interleave: { study: 20, breakLen: 5,  maxStudy: 25 },
    flowtime:   { study: 60, breakLen: 15, maxStudy: 90 },
  }[method];

  // Habit adaptation — heavy switchers get shorter chunks, break-takers get
  // the breaks they're going to take anyway (planned, not stolen).
  const studyLen = profile && (profile.avgSwitches ?? 0) >= 1.5
    ? Math.max(10, Math.round(shape.study * 0.7))
    : shape.study;
  const breakLen = profile && (profile.avgBreaks ?? 0) >= 2
    ? shape.breakLen + 3
    : shape.breakLen;
  // A failed/barely-passed assessment gets interleave-style rotation.
  const struggling = assignments.filter((a) => a.grade === "fail" || a.grade === "C");
  const rotate = struggling.length > 0 && struggling.length < assignments.length;

  const segments: Segment[] = [];
  let remaining = minutes;
  let i = 0;
  let studyCount = 0;
  while (remaining > 0 && i < 40) {
    // Rotate struggling items first so review lands while fresh.
    const pool = rotate ? [...struggling, ...assignments.filter((a) => !struggling.includes(a))] : assignments;
    const a = pool[i % pool.length];
    const target = a.estimatedMinutes && a.estimatedMinutes <= remaining
      ? Math.min(a.estimatedMinutes, shape.maxStudy)
      : studyLen;
    const chunk = Math.min(target, remaining);
    segments.push({ kind: "study", minutes: chunk, label: a.title });
    remaining -= chunk;
    studyCount++;
    if (remaining >= 10) {
      // Pomodoro rhythm earns a longer break every third study segment.
      const brkLen = method === "pomodoro" && studyCount % 3 === 0 ? 15 : breakLen;
      const brk = Math.min(brkLen, remaining);
      segments.push({ kind: "break", minutes: brk, label: "Break" });
      remaining -= brk;
    }
    i++;
  }
  return segments;
}

/** Rebalance so segment minutes sum exactly to the block's minutes. */
function normalizeTotal(segments: Segment[], minutes: number): Segment[] {
  const total = segments.reduce((s, x) => s + x.minutes, 0);
  const diff = minutes - total;
  if (diff === 0) return segments;
  if (diff > 0) {
    // Undershoot — extend the last study segment (or create one).
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].kind === "study") {
        segments[i] = { ...segments[i], minutes: segments[i].minutes + diff };
        return segments;
      }
    }
    return [...segments, { kind: "study", minutes: diff, label: "Study" }];
  }
  // Overshoot — shrink study segments back-to-front (1-min floor each) until
  // balanced. Dumping the whole deficit on one segment could clamp it to 1
  // and still leave the plan minutes over the block.
  let excess = -diff;
  for (let i = segments.length - 1; i >= 0 && excess > 0; i--) {
    if (segments[i].kind !== "study") continue;
    const cut = Math.min(excess, segments[i].minutes - 1);
    segments[i] = { ...segments[i], minutes: segments[i].minutes - cut };
    excess -= cut;
  }
  // ponytail: if every study segment bottoms out at 1 min the plan can still
  // over-run the block — extremely rare (model plan ≫ block); acceptable.
  return segments;
}

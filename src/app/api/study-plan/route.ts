import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

interface Segment {
  kind: "study" | "break";
  minutes: number;
  label: string;
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

  let body: { minutes?: number; method?: string; assignments?: { title?: string; estimatedMinutes?: number | null }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const minutes = Math.min(480, Math.max(10, Math.floor(body.minutes ?? 0)));
  const assignments = (Array.isArray(body.assignments) ? body.assignments : [])
    .slice(0, 10)
    .map((a) => ({
      title: String(a.title ?? "").slice(0, 120) || "Study",
      estimatedMinutes: typeof a.estimatedMinutes === "number" ? Math.min(480, Math.max(0, a.estimatedMinutes)) : null,
    }));
  if (assignments.length === 0) assignments.push({ title: "Study", estimatedMinutes: null });

  const method = (["pomodoro", "deep", "review"] as const).includes(body.method as "pomodoro" | "deep" | "review")
    ? (body.method as Method)
    : "auto";

  const segments = await planWithVox(minutes, assignments, method) ?? fallbackPlan(minutes, assignments, method);
  return NextResponse.json({ segments });
}

type Method = "auto" | "pomodoro" | "deep" | "review";

const METHOD_HINTS: Record<Method, string> = {
  auto: "Alternate focused study segments (10–35 min, longest for heavy/deep subjects, shorter for review or drilling) with short breaks (5–10 min).",
  pomodoro: "Pomodoro style — study segments of about 25 min separated by 5 min breaks; a 15 min break after every third or fourth study segment. Keep to this rhythm but you may merge an assignment into a double pomodoro when its estimate demands it.",
  deep: "Deep work — long uninterrupted study stretches (35–60 min, longest for heavy/deep subjects) separated by longer breaks (10–15 min). Fewer, bigger segments.",
  review: "Quick review — short sprints (10–20 min) separated by tiny breaks (3–5 min). Fast rotation between subjects, good for drilling and revision.",
};

// ─── Vox (OpenRouter) ───

async function planWithVox(
  minutes: number,
  assignments: { title: string; estimatedMinutes: number | null }[],
  method: Method,
): Promise<Segment[] | null> {
  if (!env.openrouterApiKey) return null;

  const list = assignments
    .map((a) => `- ${a.title}${a.estimatedMinutes ? ` (~${a.estimatedMinutes} min estimated)` : ""}`)
    .join("\n");

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
              "Start with the most demanding subject while focus is fresh. " +
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
  assignments: { title: string; estimatedMinutes: number | null }[],
  method: Method = "auto",
): Segment[] {
  // Method shapes the default chunk + break lengths; a smaller estimate
  // always wins when it fits inside what's left.
  const shape = {
    auto:     { study: 25, breakLen: 5,  maxStudy: 35 },
    pomodoro: { study: 25, breakLen: 5,  maxStudy: 30 },
    deep:     { study: 50, breakLen: 10, maxStudy: 60 },
    review:   { study: 15, breakLen: 3,  maxStudy: 20 },
  }[method];

  const segments: Segment[] = [];
  let remaining = minutes;
  let i = 0;
  let studyCount = 0;
  while (remaining > 0 && i < 40) {
    const a = assignments[i % assignments.length];
    const target = a.estimatedMinutes && a.estimatedMinutes <= remaining
      ? Math.min(a.estimatedMinutes, shape.maxStudy)
      : shape.study;
    const chunk = Math.min(target, remaining);
    segments.push({ kind: "study", minutes: chunk, label: a.title });
    remaining -= chunk;
    studyCount++;
    if (remaining >= 10) {
      // Pomodoro rhythm earns a longer break every third study segment.
      const brkLen = method === "pomodoro" && studyCount % 3 === 0 ? 15 : shape.breakLen;
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
  if (total === minutes) return segments;
  const diff = minutes - total;
  // Adjust the last study segment; create a study segment if none exists.
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].kind === "study") {
      segments[i] = { ...segments[i], minutes: Math.max(1, segments[i].minutes + diff) };
      return segments;
    }
  }
  return [...segments, { kind: "study", minutes: Math.max(1, diff), label: "Study" }];
}

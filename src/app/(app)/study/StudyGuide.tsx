"use client";

import { useState } from "react";
import { ChevronDown, BrainCircuit, ShieldAlert, Zap, MoonStar } from "lucide-react";

/** The learning-science guide — every technique ranked by evidence, distilled
 *  from meta-analyses (Dunlosky 2013; Karpicke & Roediger 2008; Cepeda et al.
 *  2006) and field-tested methods (Ultralearning, the surgical-residents spacing
 *  study). Human-written, no generated content. */

type Tier = "S" | "A" | "B" | "C" | "F";

interface Entry {
  name: string;
  tier: Tier;
  what: string;
  why: string;
  how: string[];
  waqt?: string;
}

const TIER_STYLE: Record<Tier, { bg: string; fg: string; label: string }> = {
  S: { bg: "color-mix(in oklab, var(--color-success) 16%, var(--color-paper))", fg: "var(--color-success)", label: "S — elite" },
  A: { bg: "color-mix(in oklab, var(--color-accent) 14%, var(--color-paper))", fg: "var(--color-accent)", label: "A — strong" },
  B: { bg: "var(--color-paper-2)", fg: "var(--color-ink)", label: "B — decent" },
  C: { bg: "var(--color-paper-2)", fg: "var(--color-ink-muted)", label: "C — weak" },
  F: { bg: "color-mix(in oklab, var(--color-error) 10%, var(--color-paper))", fg: "var(--color-error)", label: "F — trap" },
};

const SECTIONS: { id: string; title: string; blurb: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; entries: Entry[] }[] = [
  {
    id: "gold",
    title: "The techniques that actually work",
    blurb: "Everything below is backed by meta-analysis, not vibes. If you only read one section, read this one.",
    icon: BrainCircuit,
    entries: [
      {
        name: "Active recall (test yourself)",
        tier: "S",
        what: "Close the book. Pull the answer out of your own head — flashcards, practice questions, or writing everything you remember on a blank page.",
        why: "Memory strengthens through output, not input. Every effortful retrieval re-fires the neurons that stored it, and struggling to remember — even failing — makes the later correct answer stick harder (Karpicke & Roediger 2008; the 'testing effect').",
        how: [
          "End every study block with 5 min of 'blurting': book closed, write everything you can recall, then check the gaps",
          "Prefer practice questions over summaries — the exam asks questions, so answer questions (directness)",
          "Struggling is the signal it works — if it feels easy, it probably isn't doing much",
        ],
        waqt: "End your Vox session with a self-quiz segment — the time already counts toward your goal's session target.",
      },
      {
        name: "Spaced repetition",
        tier: "S",
        what: "Review the same material at increasing intervals — 1 day, 3–4 days, 1–2 weeks, a month — instead of all in one sitting.",
        why: "The forgetting curve dumps ~70% of new material within 24h. Each review right before fading flattens it. The surgical residents who spread suturing practice over 4 weeks crushed the group that crammed in a day — same hours, dramatically better results.",
        how: [
          "Under 2 weeks to an exam: never let 48h pass without recalling a weak topic",
          "More than 2 weeks: learn day 1 → review day 4 → review day 10–14",
          "Review = recall, not reread. Cover the notes, recite the points, check",
        ],
        waqt: "Schedule review blocks on the planner for a homework item across multiple days — the coverage chip tracks each session.",
      },
      {
        name: "Interleaving (mix it)",
        tier: "A",
        what: "Alternate between subjects — or better, between problem types and angles within a subject — in a single session instead of grinding one topic for hours.",
        why: "Switching forces your brain to forget then re-retrieve, and placing confusable concepts side by side teaches the edges of each (atrial vs ventricular, trig identities A vs B). Exams are chaos — mixed practice trains you for the chaos.",
        how: [
          "30 min bio → 30 min chem beats 60 min bio",
          "Strongest form: same topic, different question types and comparisons",
          "When a segment feels stale, switch — don't push through numb",
        ],
        waqt: "That's literally the 'Lost interest — switch it up' button mid-session.",
      },
      {
        name: "Feynman technique",
        tier: "A",
        what: "Explain the concept out loud to a beginner — or pretend to. Strip the jargon, simplify, teach.",
        why: "Teaching forces you to decide what matters, expose your own gaps, and rebuild the idea in your own words — deeper processing than recall alone. Everything flashcards do, it does better.",
        how: [
          "Say it out loud or write it as if teaching a 10-year-old",
          "Wherever your explanation gets wobbly — that's the gap, re-learn that",
          "Bonus: teach it to an AI and ask for critique — instant expert feedback (raises it to S)",
        ],
      },
      {
        name: "Mind mapping (done right)",
        tier: "S",
        what: "Put a topic in the center and branch out connections — comparing ideas, ranking importance, finding how concepts relate.",
        why: "Memory is stored as connections. Done right it's the deepest schema-builder that exists. Done wrong (just drawing notes in a circle) it's a D-tier waste — the thinking, not the drawing, is the technique.",
        how: [
          "Externalize the confusion: get the messy connections on paper, then organize them",
          "For each branch, ask: how does this connect to what I already know? How is it different from the concept next to it?",
          "Best used after you have some familiarity — not as a first pass in lecture",
        ],
      },
      {
        name: "Directness",
        tier: "A",
        what: "Practice the skill in the same form you'll be tested in. MCQ exam? Do MCQs. Essay exam? Write essays. Speaking fluency? Speak.",
        why: "From Ultralearning (Scott Young): learning transfers best when it matches the context of use. We default to comfortable indirect methods (watching videos about the thing) because the real practice is uncomfortable — that discomfort is the advantage.",
        how: [
          "Before studying, look at real past-paper questions first — learn only what the exam actually tests",
          "If your plan doesn't resemble the exam, change the plan",
        ],
      },
    ],
  },
  {
    id: "traps",
    title: "The traps — feels like studying, isn't",
    blurb: "The two most popular techniques in the world are also the two least effective. Easy ≠ effective.",
    icon: ShieldAlert,
    entries: [
      {
        name: "Highlighting & underlining",
        tier: "F",
        what: "Marking text as you read.",
        why: "Decades of research: near-zero learning benefit. It draws the eye but doesn't engage the brain — passive, effortless, and it creates familiarity that masquerades as knowledge. Only use: flagging keywords you'll come back to during real retrieval.",
        how: ["If you catch yourself highlighting a whole paragraph, close the book and blurt what you just read instead"],
      },
      {
        name: "Rereading",
        tier: "F",
        what: "Going over the same passage or notes repeatedly.",
        why: "Marginal effect, enormous time cost. Each reread feels smoother, and that smoothness is a false sense of competence — you recognize the words but can't produce the ideas. If you need to reread a lot, your first pass wasn't active enough.",
        how: ["One active pass + spaced recalls beats five rereads"],
      },
      {
        name: "Pretty, verbatim notes",
        tier: "F",
        what: "Transcribing every word, or spending lecture time on aesthetics.",
        why: "Hand moving ≠ mind engaged. Transcription is a comfort mechanism; decoration steals attention from the lecture itself. Slides are online anyway — what isn't online is your professor's framing and emphasis.",
        how: [
          "Translate, don't transcribe: listen 10–20s, then write the point in YOUR words",
          "Capture your inner monologue — 'wait, how does that work?' gets a ? in the margin to revisit",
          "Structure first, details later — like pottery, shape before polish",
        ],
      },
      {
        name: "Marathon cramming",
        tier: "C",
        what: "One giant session the night before.",
        why: "Better than nothing — but the residents' experiment is the verdict: same total hours spread over weeks beat crammed hours by a mile. If you must cram, follow the emergency protocol below instead of reading cover to cover.",
        how: ["See the cram protocol section"],
      },
    ],
  },
  {
    id: "engine",
    title: "The engine — focus & habits",
    blurb: "Technique decides how well each minute works. This decides how many good minutes you get.",
    icon: Zap,
    entries: [
      {
        name: "Deep work over long hours",
        tier: "A",
        what: "2 hours fully locked in beats 8 distracted hours. Time studied ≠ knowledge gained.",
        why: "Task-switching destroys up to 40% of productive time. Focus is a muscle — every time you pull yourself back from a distraction, you're training it.",
        how: [
          "52/17 rhythm: 52 min full focus → 17 min real break (matches your brain's ultradian rhythm) — Pomodoro's 25/5 is the lighter version",
          "One tab, one subject, full screen — the 'one tab rule'",
          "Phone in another room. Not silenced — in another room",
          "Tell people you're going into monk mode; get disturbed only for cake or fire",
        ],
        waqt: "Vox sessions are already built on this — timed segments, enforced breaks, distraction logging.",
      },
      {
        name: "Precise targets, not 'study math'",
        tier: "A",
        what: "Before the session: write the exact finish line. 'Finish chapter 3 integration by 5pm' — not 'study some math.'",
        why: "Vague intentions burn the first 20 minutes deciding what to do and never create urgency. A specific target turns you into a guided missile — goal-setting research shows simply writing the target raises completion odds.",
        how: [
          "List 1–3 concrete deliverables for the block, on paper or in the assignment title",
          "“Finish all topic questions and close my gaps in plant reproduction” > “study bio”",
        ],
        waqt: "Pick a specific assignment in the intake — that's your missile lock.",
      },
      {
        name: "Protect your dopamine baseline",
        tier: "B",
        what: "No phone/social media first thing in the morning; study before the scroll.",
        why: "A huge early dopamine spike forces a compensating dip — everything after it feels like a chore. Keep the baseline flat and studying itself becomes the most stimulating thing available. Top students aim for 'natural' dopamine: exercise, outdoors, the work itself.",
        how: [
          "Morning order: wake → (no phone) → prime your intent → study. Breakfast and the phone come after",
          "15 min daily 'boredom detox' — no inputs, let the mind settle. It recalibrates your pleasure scale",
          "Make studying deliver the hits: small checkmarks, countdown timers, session streaks — finite challenges your brain loves",
        ],
        waqt: "Session streaks and the 'finished' counter are exactly this — small wins that make you come back.",
      },
      {
        name: "Small steps daily (Kaizen)",
        tier: "B",
        what: "Bite-sized consistent study beats heroic weekend sessions. 1% better daily compounds.",
        why: "The Kumon method / Atomic Habits principle — small consistent effort builds durable habit without burnout, and daily contact keeps the forgetting curve from ever fully resetting.",
        how: [
          "6-minute floor on hard days: 2 min recall + 2 min review + 2 min practice — never zero",
          "Same time, same place, same ritual object — the ritual tells your brain 'study mode'",
        ],
      },
      {
        name: "Fuel the machine",
        tier: "C",
        what: "Water at the desk, smart snacks, caffeine as a tool not a crutch, sleep as consolidation.",
        why: "Dehydration = tired + cranky. And sleep is when hippocampal memories integrate into the neocortex — all-nighters literally delete the studying you did.",
        how: ["Nuts, dark chocolate, blueberries > sugar crashes", "Sleep is a study technique, not the opposite of one"],
      },
    ],
  },
  {
    id: "cram",
    title: "Emergency protocol — exam in days, nothing done",
    blurb: "The ruthlessly simple cram method: triage → speed-learn → review. Maximum return per hour when hours are scarce.",
    icon: MoonStar,
    entries: [
      {
        name: "Phase 1 — Triage",
        tier: "S",
        what: "Before opening a book: for every topic, ask (1) is it tested frequently? (2) is it a weakness for me? Sort into a priority table.",
        why: "90% of crammers skip this and study whatever they open first. 1–2 hours of triage saves a whole night on things that won't be tested.",
        how: [
          "P1 = common + weak → learn properly. P2 = common + strong → refresh. P3 = uncommon + weak → skim only",
          "Uncommon + strong → ignore completely",
        ],
      },
      {
        name: "Phase 2 — Speed-learn cycle",
        tier: "A",
        what: "Per topic: read past-paper questions first → 10-min skim → layered learning (P1 only) → question session with a 'red list' of mistakes.",
        why: "Questions first reveals exactly how the exam tests the topic (the 'meta game') — you learn only what gets marked. Layered reading (basics → concepts → details) builds a scaffold so hard parts have something to hang on.",
        how: [
          "Read MANY questions, do 5–10, understand what's being tested before learning anything",
          "10-min skim: what is this topic, what are its sections, what links to the questions",
          "For P1 topics learn in three passes: basics → general concepts → details. P2/P3: skim → straight to questions",
          "Every wrong answer goes on a 'red list' — you only care about what you got wrong",
        ],
      },
      {
        name: "Phase 3 — Review & mix",
        tier: "S",
        what: "Under 2 weeks: recall every weak topic within 48h. Daily mixed-question sessions across all weak topics.",
        why: "Without a review system, half of what you crammed is gone by exam day. Mixed-question sessions mimic the exam's chaos and hit multiple weak topics in one sitting.",
        how: [
          "Reviews = recall + red list + more questions — never rereading",
          "20–100 mixed questions from ALL weak topics daily, especially in the final week",
        ],
      },
    ],
  },
];

export default function StudyGuide() {
  const [open, setOpen] = useState<string | null>("gold");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        What the research actually says — every technique ranked by evidence, not popularity.
        The uncomfortable ones work; the comfortable ones mostly don&rsquo;t.
      </p>

      {SECTIONS.map((sec) => {
        const isOpen = open === sec.id;
        return (
          <section
            key={sec.id}
            className="overflow-hidden rounded-xl border transition-colors"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : sec.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
              aria-expanded={isOpen}
            >
              <sec.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>{sec.title}</span>
                <span className="block text-xs" style={{ color: "var(--color-ink-muted)" }}>{sec.blurb}</span>
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform duration-200"
                style={{ color: "var(--color-ink-muted)", transform: isOpen ? "rotate(180deg)" : "none" }}
              />
            </button>

            {isOpen && (
              <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
                {sec.entries.map((e) => {
                  const t = TIER_STYLE[e.tier];
                  return (
                    <article key={e.name} className="rounded-lg p-3" style={{ backgroundColor: "var(--color-paper-2)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-ink)" }}>{e.name}</h3>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                          style={{ backgroundColor: t.bg, color: t.fg }}
                        >
                          {t.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>{e.what}</p>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{e.why}</p>
                      <ul className="mt-2 flex flex-col gap-1">
                        {e.how.map((h) => (
                          <li key={h} className="flex gap-1.5 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
                            {h}
                          </li>
                        ))}
                      </ul>
                      {e.waqt && (
                        <p className="mt-2 rounded-md px-2 py-1.5 text-[11px]" style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}>
                          In Waqt: {e.waqt}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

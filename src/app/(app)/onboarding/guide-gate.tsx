"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Timer } from "lucide-react";
import { SECTIONS } from "../guide/GuideClient";

interface QuizQuestion {
  question: string;
  options: string[]; // exactly 4; `answer` indexes into it
  answer: number;
}

// Pool drawn from the guide. Distractors are all plausible-sounding; only
// someone who actually read the guide knows which is true.
const QUESTION_POOL: QuizQuestion[] = [
  {
    question: "You never mark a prayer and the day ends. What does Waqt do with it?",
    options: [
      "Counts it as missed and resets your streak",
      "Resolves it as assumed prayed — no silent penalty",
      "Sends you a backdated reminder the next morning",
      "Leaves it pending until you mark it manually",
    ],
    answer: 1,
  },
  {
    question: "What does a nudge do?",
    options: [
      "Posts your streak to your friend's profile",
      "Adds the friend to your League board",
      "Sends a friend a reminder while their salah window is open",
      "Pings them after the prayer window has closed",
    ],
    answer: 2,
  },
  {
    question: "How do you log a prayer?",
    options: [
      "Tap the prayer's circle in Prayer → Overview",
      "Long-press the date on the calendar",
      "Swipe the check-in banner left",
      "A friend has to verify it for you",
    ],
    answer: 0,
  },
  {
    question: "Two people tie in the League. What breaks the tie?",
    options: [
      "Whoever checked in earliest that week",
      "Whoever has the longer current streak",
      "Whoever joined the app first",
      "Sunnah muakkadah and witr logged",
    ],
    answer: 3,
  },
  {
    question: "What does the Qadaa tracker count?",
    options: [
      "Days since you signed up",
      "Prayers you marked missed that you still owe",
      "Sunnah prayers you've done this month",
      "Consecutive days all five were logged",
    ],
    answer: 1,
  },
  {
    question: "You check in while offline. What happens to it?",
    options: [
      "It's discarded — check-ins need a connection",
      "It's saved but the streak pauses until you're online",
      "It's marked as assumed prayed instead",
      "It queues locally and syncs when you're back online",
    ],
    answer: 3,
  },
  {
    question: "Where can you re-open this guide later?",
    options: [
      "Tools → Guide",
      "Settings → Account",
      "Prayer → Stats",
      "Planner → Goals",
    ],
    answer: 0,
  },
  {
    question: "With hayd tracking enabled, what happens during a period?",
    options: [
      "Your streak resets since prayers aren't logged",
      "Prayer obligations pause and streaks stay intact",
      "Prayers are auto-marked as prayed at the masjid",
      "The check-in circles turn into a counter",
    ],
    answer: 1,
  },
];

const QUESTIONS_PER_QUIZ = 4;
const PASS_MARK = 3;
const RETRY_SECONDS = 60;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Phase = "read" | "confirm" | "quiz" | "result";

/**
 * Post-questions onboarding gate: scroll the full guide, acknowledge, pass a
 * short quiz. Failing forces a timed re-read before the quiz unlocks again.
 * `onPass` advances onboarding to the final step (which marks it complete).
 */
export function GuideGate({ onPass }: { onPass: () => void }) {
  const [phase, setPhase] = useState<Phase>("read");
  const [needsTimer, setNeedsTimer] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RETRY_SECONDS);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [picked, setPicked] = useState<(number | null)[]>([]);
  const [score, setScore] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolled(true);
  }, []);

  // Three independent ways to unlock, so the button can never get stuck:
  // 1. IntersectionObserver on the end marker, 2. scroll fallback,
  // 3. content-fits check on every layout change.
  useEffect(() => {
    if (phase !== "read" || !endRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setScrolled(true); },
      { root: scrollRef.current, threshold: 0.5 },
    );
    observer.observe(endRef.current);
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolled(true);
    return () => observer.disconnect();
  }, [phase]);

  // Forced re-read timer after a failed quiz.
  useEffect(() => {
    if (phase !== "read" || !needsTimer || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, needsTimer, secondsLeft]);

  const canAcknowledge = scrolled && (!needsTimer || secondsLeft <= 0);

  function startQuiz() {
    setQuestions(shuffle(QUESTION_POOL).slice(0, QUESTIONS_PER_QUIZ).map((q) => {
      const order = shuffle([0, 1, 2, 3]);
      return {
        question: q.question,
        options: order.map((i) => q.options[i]),
        answer: order.indexOf(q.answer),
      };
    }));
    setPicked(Array(QUESTIONS_PER_QUIZ).fill(null));
    setPhase("quiz");
  }

  function submitQuiz() {
    const s = questions.reduce((acc, q, i) => acc + (picked[i] === q.answer ? 1 : 0), 0);
    setScore(s);
    setPhase("result");
  }

  function retry() {
    setNeedsTimer(true);
    setScrolled(false);
    setSecondsLeft(RETRY_SECONDS);
    setPhase("read");
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4">
      {phase === "read" && (
        <>
          <div className="mb-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
              Almost there
            </p>
            <h1 className="mt-1 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
              Read the Waqt guide
            </h1>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {needsTimer
                ? "Read it again — the button unlocks when the timer ends and you've reached the bottom."
                : "Scroll through the whole guide, then acknowledge at the bottom."}
            </p>
          </div>

          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="max-h-[52vh] overflow-y-auto rounded-2xl border p-4"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            {SECTIONS.map((s) => (
              <section key={s.id} className="mb-5 last:mb-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-accent)" }}>
                  {s.kicker}
                </p>
                <h2 className="mt-0.5 inline-block text-sm font-semibold" style={{ color: "var(--color-ink)", borderBottom: "2px solid var(--color-accent)", paddingBottom: 1 }}>
                  {s.title}
                </h2>
                <ul className="mt-1.5 space-y-1.5">
                  {s.items.map((it) => (
                    <li key={it.heading} className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                      <span
                        className="font-medium"
                        style={{ color: "var(--color-ink)", borderBottom: "1px solid var(--color-warmth)", paddingBottom: 0 }}
                      >
                        {it.heading}.
                      </span>{" "}
                      {it.body}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p ref={endRef} className="pt-2 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              — end of the guide —
            </p>
          </div>

          <button
            disabled={!canAcknowledge}
            onClick={() => setPhase("confirm")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            {needsTimer && secondsLeft > 0 ? (
              <>
                <Timer className="h-4 w-4" />
                Read for {secondsLeft}s more
              </>
            ) : !scrolled ? (
              "Scroll to the bottom to continue"
            ) : (
              <>
                I acknowledge that I read this
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </>
      )}

      {phase === "confirm" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <BookOpen className="h-8 w-8" style={{ color: "var(--color-accent)" }} />
          <h1 className="mt-3 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
            Are you sure?
          </h1>
          <p className="mt-2 max-w-xs text-sm" style={{ color: "var(--color-ink-muted)" }}>
            There will be a quick quiz on this. You need {PASS_MARK} out of {QUESTIONS_PER_QUIZ} to pass.
          </p>
          <div className="mt-6 flex w-full gap-3">
            <button
              onClick={() => setPhase("read")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
            >
              <ArrowLeft className="h-4 w-4" /> Go back
            </button>
            <button
              onClick={startQuiz}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {phase === "quiz" && (
        <>
          <div className="mb-3 text-center">
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>Quick quiz</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {PASS_MARK} of {QUESTIONS_PER_QUIZ} to pass — all answers are in the guide.
            </p>
          </div>
          <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
            {questions.map((q, qi) => (
              <div key={qi} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  {qi + 1}. {q.question}
                </p>
                <div className="mt-2.5 space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const sel = picked[qi] === oi;
                    return (
                      <button
                        key={oi}
                        onClick={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                        aria-pressed={sel}
                        className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                        style={{
                          borderColor: sel ? "var(--color-accent)" : "var(--color-paper-3)",
                          backgroundColor: sel ? "var(--color-accent-faint)" : "var(--color-paper)",
                          color: "var(--color-ink)",
                        }}
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                          style={{ borderColor: sel ? "var(--color-accent)" : "var(--color-paper-3)" }}
                        >
                          {sel && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <button
            disabled={picked.some((p) => p === null)}
            onClick={submitQuiz}
            className="mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            {picked.some((p) => p === null)
              ? `Answer all ${QUESTIONS_PER_QUIZ} (${picked.filter((p) => p !== null).length}/${QUESTIONS_PER_QUIZ})`
              : "Submit answers"}
          </button>
        </>
      )}

      {phase === "result" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {score >= PASS_MARK ? (
            <>
              <CheckCircle2 className="h-10 w-10" style={{ color: "var(--color-accent)" }} />
              <h1 className="mt-3 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
                {score}/{QUESTIONS_PER_QUIZ} — you passed
              </h1>
              <p className="mt-2 max-w-xs text-sm" style={{ color: "var(--color-ink-muted)" }}>
                You actually read it. You&apos;re all set.
              </p>
              <button
                onClick={onPass}
                className="mt-6 w-full rounded-xl py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
              >
                Finish setup
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
                {score}/{QUESTIONS_PER_QUIZ} — not quite
              </h1>
              <p className="mt-2 max-w-xs text-sm" style={{ color: "var(--color-ink-muted)" }}>
                Sorry — you&apos;ll have to re-read the guide. This time a one-minute timer keeps you honest.
              </p>
              <button
                onClick={retry}
                className="mt-6 w-full rounded-xl py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
              >
                Re-read the guide
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, BrainCircuit, ShieldAlert, Zap, MoonStar } from "lucide-react";

/** The learning-science guide — written to teach, not to list. Every entry is a
 *  small story: the hook, the mechanism, the protocol, the catch. Tiers come
 *  from the meta-analyses (Dunlosky 2013; Rowland 2014; the 242-study
 *  Frontiers follow-up), not from vibes. Human-written content only. */

type Tier = "S" | "A" | "B" | "C" | "F";

interface Entry {
  name: string;
  tier: Tier;
  /** The story/hook — why you should care, in the transcripts' voice. */
  hook: string;
  /** The mechanism — what's physically happening in your brain. */
  mech: string;
  /** The protocol — numbered, concrete, do-it-tonight steps. */
  protocol: string[];
  /** The catch — where people quit or get it wrong. */
  catch?: string;
  waqt?: string;
}

const TIER_STYLE: Record<Tier, { bg: string; fg: string; ring: string; label: string }> = {
  S: { bg: "color-mix(in oklab, var(--color-success) 16%, var(--color-paper))", fg: "var(--color-success)", ring: "color-mix(in oklab, var(--color-success) 30%, transparent)", label: "S · elite" },
  A: { bg: "color-mix(in oklab, var(--color-accent) 14%, var(--color-paper))", fg: "var(--color-accent)", ring: "color-mix(in oklab, var(--color-accent) 30%, transparent)", label: "A · strong" },
  B: { bg: "var(--color-paper-2)", fg: "var(--color-ink)", ring: "var(--color-paper-3)", label: "B · useful" },
  C: { bg: "var(--color-paper-2)", fg: "var(--color-ink-muted)", ring: "var(--color-paper-3)", label: "C · weak" },
  F: { bg: "color-mix(in oklab, var(--color-error) 10%, var(--color-paper))", fg: "var(--color-error)", ring: "color-mix(in oklab, var(--color-error) 28%, transparent)", label: "F · trap" },
};

interface Section {
  id: string;
  title: string;
  blurb: string;
  accent: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  entries: Entry[];
}

const SECTIONS: Section[] = [
  {
    id: "system",
    title: "First — how your brain actually learns",
    blurb: "Everything else on this page only makes sense once you see the machine underneath. Start here.",
    accent: "var(--color-accent)",
    icon: BrainCircuit,
    entries: [
      {
        name: "The pipeline nobody taught you",
        tier: "S",
        hook: "You think learning works like this: information goes in, repetition hammers it down, memory holds it. That's wrong — and it's why you can reread a chapter five times and blank on the exam. Here's what actually happens. Information hits your brain and gets filtered — your brain asks 'is this relevant? does it connect to anything I already know?' If the answer is no, it's gone within days, no matter how many times you saw it. If yes, it gets processed — organized, simplified, wired into what you know. Then it's stored. And every time you pull it back out, the pulling itself re-strengthens and repackages it.",
        mech: "That means learning has four separate jobs — relevance tagging, processing, storage, retrieval — and most students only feed the first one. Reading and highlighting is pure input. No relevance, no processing, no retrieval. The brain quietly throws it all away, and you call it 'bad memory.' It's not bad memory. It's a pipeline running one stage.",
        protocol: [
          "Before you read anything, give it an address: 'how does this connect to what I know? why do I need it?'",
          "Judge every study minute by which stage it feeds — input only, or processing + retrieval too?",
          "If something keeps not sticking, the fix isn't more input — it's a better process",
        ],
      },
      {
        name: "PERO — the full cycle, as a checklist",
        tier: "S",
        hook: "A learning coach named Justin Sung spent seven years building a system he calls PERO, and it's the cleanest map of the pipeline you'll find: Priming, Encoding, Reference, Retrieval, Interleaving, Overlearning. Here's the insight that makes it useful — a weakness in ANY stage leaks the whole chain. You can retrieve perfectly and still forget, if nothing was ever primed or encoded in the first place.",
        mech: "Priming tells the filter 'this matters' BEFORE the information arrives — a 2-minute skim of headings and end-of-chapter questions makes the same lecture land twice as deep. Encoding is the processing — grouping, analogies, simplifying, the effortful part most people skip. Reference is a parking lot: fine details go to notes/cards so encoding doesn't overload. Retrieval pulls it back out and repackages it. Interleaving attacks it from new angles. Overlearning is polish — and where most people wrongly START, drilling what was never properly encoded.",
        protocol: [
          "P: skim the chapter's headings, diagrams, and questions before reading a word — 2 minutes",
          "E: as you learn, group + simplify + connect — 'what is this like? how is it different from X?'",
          "R: park tiny facts in a card list; keep your head free for structure",
          "R: close the book and pull it back — quiz, blurting, practice problems",
          "I: test it from angles you haven't seen — different question types, mixed topics",
          "O: only for high-stakes exams — extra reps AFTER the other five are working",
        ],
      },
      {
        name: "The confusion compass",
        tier: "S",
        hook: "Here's a reframe that changes how studying feels forever: confusion isn't a sign you're failing — it's the physical sensation of your brain learning. New information arrives with no address. Your brain asking 'where does this go? how does this connect?' IS the learning. The detective staring at a corkboard covered in clues isn't confused because he's bad at his job — he's confused because he's doing it.",
        mech: "Research on 'productive confusion' (D'Mello & Graesser) found learners who got confused and resolved it outperformed those who were never confused — the impasse forces the gap to surface. The trap: most people sit inside the vague feeling and let it rot into overwhelm, adding more input to a pile that was never organized. The fix is converting emotion into targets: write down the questions that, if answered, would make you less confused. Then answer them.",
        protocol: [
          "Feel lost? Write it as questions: 'what exactly don't I get? how does this compare to X? how would I use it? what's a real example?'",
          "Answer them one at a time. New confusion in the answers = new questions — that's the loop working",
          "Feel NOTHING while reading — bored, glazed? That's the worse sign. Trigger it: 'how does this change what I'd do on the exam?'",
          "Unresolved confusion that survives a few passes is worth escalating — a video, a teacher, an explainer — not more rereading",
        ],
      },
      {
        name: "Struggle is the mechanism, not the obstacle",
        tier: "A",
        hook: "Carnegie Mellon tested an adaptive system that kept making material harder as students improved. The students hated it — and learned twice as much as the control group. There's a name for this: the generation effect. An answer your brain works to produce gets wired deeper than one it's handed on a plate.",
        mech: "Desirable difficulties (Bjork): conditions that slow you down during practice — effortful retrieval, generation, harder problems — produce stronger memory than smooth, fluent study. Your brain doesn't hate struggle; it requires it. Which flips the whole emotional readout of studying: easy feels productive and teaches little, hard feels like failing and teaches the most.",
        protocol: [
          "Rate techniques by effort-per-minute, not comfort-per-minute",
          "When something feels uncomfortably hard — that's the sensation of the wiring happening. Stay in it",
          "Letting AI hand you answers skips the struggle entirely — use it to question you, not to relieve you",
        ],
        catch: "Bjork's own caveat: the difficulty must be one you can actually engage. Struggle on material with zero foundation isn't desirable — it's just drowning. Build the scaffold first.",
      },
      {
        name: "Learn it before class",
        tier: "A",
        hook: "The single most unfair advantage in school takes about 20 minutes the night before: learn the material yourself, at your own pace — pausing, rewinding, slowing down — so the lecture becomes your second pass instead of your first. You can't pause a teacher. Zone out for five minutes in a lecture and the next forty are static. But arrive with the scaffold already built, and every minute in class is reinforcement — you start predicting what the teacher says next.",
        mech: "Flipped-classroom meta-analyses (Hew & Lo, 317-study van Alten review) show real gains — but here's the important nuance: the benefit comes from turning class time into active review, not from the video itself. It's spacing + relevance tagging working together: first pass builds the map, second pass fills it in.",
        protocol: [
          "Night before: one video or a chapter skim — headings, key diagrams, the questions at the end. Basic level is enough",
          "In class: you're hunting gaps, not building foundations — note what surprises you",
          "After: the surprises ARE your study list. That's the whole method",
        ],
      },
      {
        name: "The 4-chunk bottleneck",
        tier: "A",
        hook: "Your brain can juggle about four independent ideas at once — not seven, four (Cowan's working-memory limit). Dump a gallon of theory into a four-ounce bowl and you keep four ounces. So how do chess grandmasters 'hold' entire boards? They don't see pieces — they see ~50,000 learned patterns. Each pattern is ONE chunk. Experts don't have bigger working memory; they have better compression.",
        mech: "This is cognitive load theory: complexity = the number of interacting elements that must be held simultaneously. The fix is chunking — compress many ideas into fewer, stronger units (a metaphor, a diagram, a mental model), so four slots hold a chapter instead of four facts.",
        protocol: [
          "New material: never introduce more than ~4 interacting new ideas in one pass",
          "Sequence simplified-whole → add layers → details — not fragments that only make sense assembled",
          "Turn each concept into a chunk: a drawing, a metaphor, a one-line model you could redraw from memory",
        ],
      },
    ],
  },
  {
    id: "gold",
    title: "The techniques that actually work",
    blurb: "Ranked by evidence, not popularity. The top two are the only 'high-utility' techniques in the Dunlosky meta-analysis — and almost nobody uses them.",
    accent: "var(--color-success)",
    icon: Zap,
    entries: [
      {
        name: "Active recall — pull it out of your head",
        tier: "S",
        hook: "In 2006, two groups of surgical residents learned to suture arteries. Same materials, same hours — one group spread practice over four weeks, the other crammed it into a day. A month later the spaced group operated significantly better. And the technique underneath every version of that result is the same: close the book, and pull the knowledge out of your own head. Students prefer rereading because it's smooth — and that's exactly the problem.",
        mech: "Every effortful retrieval re-fires the neurons that stored the memory and rewrites it stronger — retrieval IS consolidation, not just measurement. Meta-analyses put the effect around g≈0.5–0.8, nearly doubled by feedback. And here's the beautiful part: trying and FAILING still helps — the struggle to recall activates related knowledge, so the correct answer lands harder when it arrives (hypercorrection: confidently-wrong answers fix themselves best).",
        protocol: [
          "End every block with 5 min of blurting: book closed, write everything you remember, then open it and check the gaps",
          "Recall > recognize: answer the question before looking — don't flip the card early",
          "Never drop an item after one correct answer — 2–3 spaced successes minimum (students who drop cards after one hit forget ~2× more in a week)",
          "Match the exam: MCQ test → practice MCQs; essay test → write from memory",
        ],
        catch: "It feels worse than rereading the whole time. That feeling is the mechanism — comfort is the enemy here.",
        waqt: "End any Vox session with a self-quiz segment — it counts toward your goal's session target.",
      },
      {
        name: "Spaced repetition — review right before you forget",
        tier: "S",
        hook: "Within 24 hours your brain dumps most of what you learned — that's the forgetting curve, and it's a feature, not a bug: unused connections get cleared. But every review timed right before the fade flattens the curve a little more, until the memory is essentially permanent. This is why the residents who trained over four weeks beat the crammers — same hours, different spacing.",
        mech: "Modern systems model each memory with Stability (how long until recall probability drops to 90%) — every successful retrieval grows it, and reviews get scheduled when retrievability decays to a target (usually 85–90%). That's the entire engine inside Anki's FSRS algorithm and Duolingo's Birdbrain model. You don't need the math — you need the rhythm.",
        protocol: [
          "Exam under 2 weeks away: never let 48h pass without recalling a weak topic",
          "More runway: learn day 1 → recall day 4 → recall day 10–14 → monthly",
          "Review = recall, never reread. Cover the notes, recite, check",
          "Same topic still weak after a review? Shrink the interval — spacing is personal, not fixed",
        ],
        waqt: "Schedule repeat blocks for the same homework across several days on the planner — each session updates the coverage chip.",
      },
      {
        name: "Interleaving — mix what can be confused",
        tier: "A",
        hook: "Give kids four types of math problems to practice. Group A drills each type in a block; Group B gets them shuffled. During practice, the shuffled kids do WORSE — more mistakes, more frustration. On the test a week later, they score double. That's interleaving, and in the Rohrer & Taylor math studies the effect was literal: 63% vs 20%.",
        mech: "The mechanism isn't variety — it's discrimination. Confusable concepts placed side by side teach the edges: where atrial ends and ventricular begins, which trig identity applies when. Random mixing does nothing (chemistry + French vocab is just noise), and brand-new material needs a blocked first pass — you can't compare what you can't yet execute.",
        protocol: [
          "First exposure: blocked. Once you can do the basics: mix in ~⅓–½ old confusable topics",
          "The strongest form is within-subject: same chapter, different question types and angles",
          "It will feel harder and your practice scores will dip — predicted, expected, keep going",
        ],
        waqt: "That's literally the 'Lost interest — switch it up' button mid-session.",
      },
      {
        name: "Feynman — explain it to a beginner",
        tier: "A",
        hook: "Take what you learned and explain it to a complete beginner — a kid, a wall, an AI. Out loud, in plain words, no jargon. Wherever your explanation turns to mush, that's not a teaching problem. That's the exact spot where you don't know it.",
        mech: "Explaining forces you to decide what matters, sequence the logic, and rebuild the idea in your own structure — deeper processing than recall alone (self-explanation + learning-by-teaching research: students who teach retain better, especially on delayed tests). The wobble points are a free gap detector.",
        protocol: [
          "Say it or write it as if for a 10-year-old — simplify, don't dumb down",
          "Every place you stall or reach for jargon = a gap. Relearn THAT, then explain again",
          "Next level: explain it to an AI and ask it to poke holes — instant expert feedback (AI-assisted Feynman is S-tier)",
        ],
        catch: "A beginner judging a beginner can't spot a wrong explanation — get feedback from a source, book, or AI, not just the feeling of fluency.",
      },
      {
        name: "Mind mapping — done right, not pretty",
        tier: "S",
        hook: "Most people who 'mind map' are just writing notes in a circle — and it does nothing. Done properly, it's one of the deepest learning tools that exists, because memory itself is a network: connections are literally how your brain stores things. A good mind map is you doing the wiring on paper so it can happen in your head.",
        mech: "The magic isn't the drawing — it's the comparing: 'is this branch more important than that one? how do these two connect? where does this new fact plug into what I already know?' That evaluation and organization is the deepest form of processing there is. A messy first map you then clean up is the technique working — you're externalizing the confusion and organizing it.",
        protocol: [
          "Center the topic, branch the big ideas — then hunt connections BETWEEN branches, not just down from the top",
          "For each link, ask: how are these similar? different? which matters more?",
          "Use it after you have some familiarity — it's for organizing knowledge, not first contact",
          "Messy → reorganized is the exercise. Clean-on-first-try means you're just copying",
        ],
      },
      {
        name: "Directness — practice the actual test",
        tier: "A",
        hook: "You want fluent Japanese in a month? You don't download an app — you fly to Japan and talk badly for 30 days. From Scott Young's Ultralearning: the fastest learning happens when practice matches the context of performance. The exam isn't going to ask you to summarize a chapter — it's going to hand you four options and a clock. So practice THAT.",
        mech: "Transfer-appropriate processing (Morris, Bransford & Franks): memory performs best when the mental operations at study match the operations the test demands. Deep processing isn't universally best — matched processing is. This is why past papers beat notes: they're the exam, minus the stakes.",
        protocol: [
          "Before studying, find real past-paper questions — learn only what the exam actually asks",
          "Practice in the exam's exact format: timed, closed-book, the same answer style",
          "If your study method doesn't look like the test, it's rehearsal for the wrong play",
        ],
      },
    ],
  },
  {
    id: "traps",
    title: "The traps — feels like studying, isn't",
    blurb: "The two most popular techniques on earth are also the two least effective. They're popular precisely because they're passive — easy feels like work.",
    accent: "var(--color-error)",
    icon: ShieldAlert,
    entries: [
      {
        name: "Highlighting & underlining",
        tier: "F",
        hook: "The world's favorite study method is, by decades of evidence, one of the worst things you can do. Highlighting draws the eye but engages nothing — it's motion without learning.",
        mech: "It creates familiarity, and familiarity masquerades as knowledge. You'll recognize the page on sight and be unable to produce a single idea from it — recognition is not recall. Dunlosky's meta-analysis rates it low-utility; the 242-study follow-up put it at the bottom of all ten techniques.",
        protocol: [
          "Only legit use: flag a keyword you'll retrieve later — the retrieval does the learning, not the marker",
          "Catch yourself highlighting a whole paragraph? Close the book and blurt what you just read instead",
        ],
      },
      {
        name: "Rereading",
        tier: "F",
        hook: "Rereading is the trap that costs students entire weekends. Each pass feels smoother than the last — and that smoothness is a liar. You're getting familiar, not knowledgeable.",
        mech: "Fluency illusion (Koriat & Bjork): smooth processing during study makes your brain predict it knows the material — but the prediction is made with the answer visible. At test time the answer is gone, and so is the 'knowledge.' If you NEED to reread often, your first pass wasn't active enough — more passes won't fix that.",
        protocol: [
          "One active pass + spaced recalls beats five rereads — every time",
          "The urge to 'read it again' should trigger a self-quiz instead",
        ],
      },
      {
        name: "Verbatim, pretty notes",
        tier: "F",
        hook: "Copying the slide word-for-word takes zero brain cells — that's the problem. The hand is moving; the mind is idle. And obsessively beautifying notes during lecture spends the exact attention you needed for the lecture.",
        mech: "Transcription is a comfort mechanism: it gives the feeling of progress (look, five pages!) while outsourcing the actual work — deciding what matters. The slides are online anyway; what's NOT online is your professor's framing, emphasis, and off-script explanations.",
        protocol: [
          "Translate, don't transcribe: listen 10–20 seconds → write the point in YOUR words",
          "Write your inner monologue — 'wait, how does that work?' becomes a ? in the margin to revisit",
          "Structure first, details later — like pottery: shape the bowl before decorating it",
        ],
      },
      {
        name: "The marathon cram",
        tier: "C",
        hook: "One eight-hour session the night before beats nothing — barely. But the residents' experiment is the verdict: same hours spread across weeks beats crammed hours, decisively. And it's worse than you think: losing a night of sleep cuts your brain's ability to form new memories by up to ~40%.",
        mech: "Consolidation happens during rest and sleep — hippocampus hands memories to the neocortex offline. Cram + all-nighter = input with no consolidation and degraded encoding. You're erasing the studying with the method you're using to compensate for not studying.",
        protocol: [
          "If you're already in emergency territory, don't wing it — use the cram protocol below: triage → speed-learn → review",
          "Sleep is part of the plan, not the casualty of it",
        ],
      },
    ],
  },
  {
    id: "engine",
    title: "The engine — focus, habits, fuel",
    blurb: "Techniques decide how much each minute is worth. This decides how many good minutes you actually get.",
    accent: "var(--color-warmth)",
    icon: Zap,
    entries: [
      {
        name: "Deep work beats long hours",
        tier: "A",
        hook: "Two hours fully locked in beats eight distracted hours — not as a slogan, but structurally: every task-switch costs up to ~40% of your productive capacity. The student who 'studies all day' with a phone nearby is doing the longest possible version of the least effective thing.",
        mech: "Attention is a trainable muscle — every time you notice the drift and pull back, you're literally doing a rep. Interruptions are worse than they feel: a notification you never check still fragments the attention loop for seconds after.",
        protocol: [
          "Blocks of 25–50 min focus → 5–15 min real break (skip the viral '52/17' — it's marketing blog data, not physiology; find the rhythm you can repeat)",
          "Cap a session near 90 min then take a proper 15–30 min break — a fatigue heuristic, not a 'brain clock'",
          "One tab, one subject, full screen. Phone in another room — not silenced, in another room",
          "Face a blank wall if you have to; tell the house you're in monk mode — cake or fire only",
        ],
        waqt: "Vox sessions are deep work with the rails built in — timed segments, breaks, drift tracking.",
      },
      {
        name: "Aim the missile — precise targets",
        tier: "A",
        hook: "'Study math today' is how you lose an afternoon. 'Finish chapter 3 integration problems by 5pm' is a guided missile. Vague goals don't just waste time — they make the first twenty minutes a negotiation with yourself about what to even do.",
        mech: "Implementation intentions (Gollwitzer meta-analysis, d≈.65 — one of the most replicated findings in behavioral science): a plan in the form 'when X, I will Y' roughly doubles follow-through, because the cue and the action get pre-wired together. Specific, proximal, deadline-shaped targets are the whole trick.",
        protocol: [
          "Write the finish line before you start: 1–3 concrete deliverables for the block",
          "Phrase it 'when [cue], I will [action]' — 'when I sit down at 7, I'll do 20 algebra problems'",
          "Add an if-then for the derailment too: 'if I reach for my phone, it goes in the other room'",
        ],
        waqt: "Picking a specific assignment in the intake IS the missile lock — that's why it asks.",
      },
      {
        name: "The mistake journal",
        tier: "A",
        hook: "Keep one running list of everything you get wrong — the wrong answers, the confused steps, the misread questions. Before the exam, that list is your entire review sheet. Nothing else competes with it.",
        mech: "Errors are diagnostic gold: each one maps a specific gap. And hypercorrection means the mistakes you make confidently are the ones that fix most permanently — surprising feedback gets extra attention. Every error you log converts shame into a target.",
        protocol: [
          "Per entry: the question, what you answered, why it's wrong, the rule",
          "Tag the ones you were SURE about — high-confidence errors are the highest-value entries",
          "Retest each logged error until it's solved twice — then it's extinguished",
        ],
      },
      {
        name: "Study the answers first",
        tier: "B",
        hook: "Don't wander the textbook hoping to hit what matters — walk straight to the back and read the questions. The exam tells you what's on the exam; most students just never look.",
        mech: "Mark schemes encode exactly what examiners credit. Reading questions first reveals the tested 20% AND trains the answer format — knowing content you can't express in marking language scores the same as not knowing it.",
        protocol: [
          "Skim end-of-chapter + past-paper questions before the chapter — note what's actually asked",
          "Prioritize by frequency × weakness: common-and-weak is priority one; rare-and-strong gets nothing",
          "Learn the mark scheme's language — 'evaluate' and 'describe' want different things",
        ],
      },
      {
        name: "Timers & fake deadlines",
        tier: "B",
        hook: "Give yourself all day and the task takes all day — Parkinson's law is merciless. Give yourself a timer and a slightly uncomfortable limit, and your brain switches modes: it triages, focuses, and finishes in the least time possible.",
        mech: "A visible countdown creates scarcity, and scarcity forces prioritization. Self-set finish deadlines ('done by 9pm') motivate harder than start times ('start at 6pm') because they threaten a real consequence — the evening.",
        protocol: [
          "Timebox per assignment, not per day — 'this chapter in 60 min', pushing but not panicking",
          "Checkpoints beat endurance: finish the list, then you can leave",
        ],
        waqt: "Every Vox session is a timebox; the segment countdowns are the checkpoints.",
      },
      {
        name: "Flow is engineerable",
        tier: "A",
        hook: "Flow — the state where hours vanish and work feels effortless — isn't luck. Psychologists found it needs three things you can deliberately build: a challenge just above your skill, a clear goal, and immediate feedback.",
        mech: "Challenge ≫ skill = anxiety. Skill ≫ challenge = boredom. The channel between them is flow — the Tetris principle of always rising one level. And the conditions compound: a session with a clear target, visible progress, and edge-of-ability work is a flow machine.",
        protocol: [
          "Pick work that stretches you one level — not two, not zero",
          "One goal + a progress meter + instant feedback = the recipe",
          "Bored by the task? Raise the stakes — time it, race it, constrain it",
          "During the session be the performer, not the critic — self-judgment kills the state",
        ],
      },
      {
        name: "Attention resets & the environment",
        tier: "B",
        hook: "Some of the cheapest performance upgrades aren't techniques — they're physical. Ninety seconds of box breathing, a phone in another room, lyric-free noise, ten minutes of eyes-closed rest after learning. Small inputs, real outputs.",
        mech: "Structured breathing (in-4, hold-4, out-4, hold-4) measurably drops arousal — in a 2023 Cell Reports Medicine trial, cyclic sighing beat mindfulness meditation for mood regulation. Quiet wakeful rest after learning boosts consolidation (g≈0.45 — the brain replays what just happened). White/brown noise genuinely helps ADHD-type attention (stochastic resonance); lyrics measurably hurt verbal tasks (d≈−0.3).",
        protocol: [
          "Before a hard block: 60–90s box breathing, or 5 min eyes-closed settling",
          "Soundtrack: silence, instrumental, or white/brown noise — never lyrics for reading",
          "Restless? Move — pace while reciting, stand, whiteboard it. Restlessness isn't broken focus, it's a different channel",
          "After a session, 10 quiet minutes consolidates more than jumping straight to the next thing",
        ],
        waqt: "The Breathe and Sounds tabs are built for exactly this.",
      },
      {
        name: "Going pro — the daily ritual",
        tier: "A",
        hook: "Stop treating study like a mood and start treating it like a job. Same time, same place, body in the seat — even when the mind wants to be anywhere else. The 'treat school like 9-to-5' advice fails inside school because you can't control that environment. But ONE protected block you own completely? That's the whole game.",
        mech: "Discipline is a skill, not a personality trait — deadline-fueled panic-studying is fear, not discipline, and it doesn't transfer. Showing up without motivation trains the actual muscle: starting when there's no external pressure. And honest habit science (Lally): automaticity takes ~66 days on average — and missing a day doesn't reset you.",
        protocol: [
          "Same hour daily — your brain starts tagging that context as study mode",
          "Start small, even 25 minutes — marathon training starts with a jog",
          "Missed a day? It's a pause, not a reset — the streak of your life isn't built on never missing, it's built on always returning",
        ],
        waqt: "Vox streaks are the contract made visible.",
      },
      {
        name: "Fuel the machine",
        tier: "C",
        hook: "Sleep is not the opposite of studying — it's where studying becomes permanent. Memory literally hands itself off during deep sleep; pull an all-nighter and you cut new-memory formation by up to ~40%. The 'sleep when you're done' order is backwards.",
        mech: "The rest of the physiology, honestly graded: exercise boosts BDNF and hippocampal function (strong evidence — a 10–20 min walk before studying is a real encoding upgrade). Water: real impairment only kicks in past ~2% dehydration — drink normally, don't obsess. Sugar: the viral claim is oversold — acute glucose doesn't reliably hurt cognition; the UCLA study was rats on a chronic high-fructose diet. Steady meals > spikes, that's it.",
        protocol: [
          "Sleep ≥ 7h on learning days — it's a study technique, not a luxury",
          "10–20 min of brisk movement before a hard session primes encoding",
          "Water at the desk, real meals, caffeine as a tool not a drip line",
        ],
      },
    ],
  },
  {
    id: "cram",
    title: "Emergency protocol — exam in days, nothing done",
    blurb: "The ruthless cram method that top scorers actually use: triage → speed-learn → review. Maximum return per hour when hours are the scarce resource.",
    accent: "var(--color-accent-2, var(--color-accent))",
    icon: MoonStar,
    entries: [
      {
        name: "Phase 1 — Triage",
        tier: "S",
        hook: "Before you open a single book, do the thing 90% of crammers skip: for every topic on the syllabus, answer two questions — is it tested often? and is it a weakness? That grid is your whole campaign. An hour of triage saves a night of studying things that were never going to be asked.",
        mech: "Exam boards sample unevenly — real past-paper analysis routinely shows ~30–40% of topics carrying most of the marks. Common-and-weak is where hours convert to points fastest.",
        protocol: [
          "P1 = common + weak → learn properly. P2 = common + strong → quick refresh. P3 = uncommon + weak → skim",
          "Uncommon + strong → ignore entirely. Yes, really",
          "Keep a coverage floor — don't gamble so hard you skip a foundational topic the others depend on",
        ],
      },
      {
        name: "Phase 2 — The speed-learn cycle",
        tier: "A",
        hook: "For each priority topic, run a four-step loop instead of 'reading the chapter': questions first → 10-minute skim → layered learning → a full question session with a red list. It's uncomfortable and it's fast — maximum marks per hour.",
        mech: "Questions-first does two jobs at once: it reveals exactly how the exam tests the topic (the meta-game — you'll only learn in the ways it can be asked), and the failed guesses prime your brain for the answers (pretesting effect). The skim then gives you the map: what the topic is, how it's divided, where the questions live.",
        protocol: [
          "Read MANY questions, attempt 5–10 — learn what's tested before learning anything",
          "10-min skim: what is this topic, what are its sections, which parts answer those questions",
          "P1 only — learn in layers: basics → general concepts → details, each pass over the same material",
          "Full question session → every mistake goes on the red list (you only care about what you got wrong)",
        ],
        catch: "Don't make notes here. No time. A rough flowchart or mind map if the topic is huge — otherwise, questions.",
      },
      {
        name: "Phase 3 — Review & mix",
        tier: "S",
        hook: "Here's the brutal truth of cramming: without a review system, half of what you just speed-learned evaporates by exam day. Two tools save it — the 48-hour rule, and daily mixed-question sessions.",
        mech: "Even ONE properly spaced recall dramatically improves retention over pure cram — the forgetting curve resets each time you pull the memory back. And mixed sessions train the exam's actual format: questions arrive in chaos, not chapter order.",
        protocol: [
          "Every weak topic learned gets re-recalled within 48h — no exceptions",
          "Daily: 20–100 mixed questions pulled from ALL your weak topics at once",
          "Reviews hit the red list first — mistakes before content",
        ],
      },
    ],
  },
];

function EntryCard({ e }: { e: Entry }) {
  const t = TIER_STYLE[e.tier];
  return (
    <article className="rounded-lg p-3.5" style={{ backgroundColor: "var(--color-paper-2)" }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>{e.name}</h3>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
          style={{ backgroundColor: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1px ${t.ring}` }}
        >
          {t.label}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>{e.hook}</p>

      <div
        className="mt-2.5 rounded-md px-2.5 py-2"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, var(--color-paper))" }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--color-accent)" }}>
          Why it works
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>{e.mech}</p>
      </div>

      <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-muted)" }}>
        The protocol
      </p>
      <ol className="mt-1 flex flex-col gap-1.5">
        {e.protocol.map((step, i) => (
          <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            <span
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
              style={{ backgroundColor: t.bg, color: t.fg }}
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {e.catch && (
        <p
          className="mt-2.5 rounded-md px-2.5 py-2 text-[11px] leading-relaxed"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 12%, var(--color-paper))", color: "var(--color-ink-soft)" }}
        >
          <span className="font-semibold" style={{ color: "var(--color-warmth)" }}>The catch: </span>
          {e.catch}
        </p>
      )}
      {e.waqt && (
        <p className="mt-2 rounded-md px-2 py-1.5 text-[11px]" style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}>
          In Waqt: {e.waqt}
        </p>
      )}
    </article>
  );
}

export default function StudyGuide() {
  const [open, setOpen] = useState<string | null>("system");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        What the research actually says — taught, not listed. Every technique ranked by
        evidence (<span style={{ color: "var(--color-success)" }}>S–A worth your time</span>,{" "}
        <span style={{ color: "var(--color-ink-muted)" }}>B–C marginal</span>,{" "}
        <span style={{ color: "var(--color-error)" }}>F actively costing you</span>).
      </p>

      {SECTIONS.map((sec) => {
        const isOpen = open === sec.id;
        return (
          <section
            key={sec.id}
            className="overflow-hidden rounded-xl border transition-colors"
            style={{ borderColor: isOpen ? sec.accent : "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : sec.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
              aria-expanded={isOpen}
            >
              <sec.icon className="h-[18px] w-[18px] shrink-0" style={{ color: sec.accent }} />
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
                {sec.entries.map((e) => <EntryCard key={e.name} e={e} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

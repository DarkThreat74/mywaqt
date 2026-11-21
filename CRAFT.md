# CRAFT.md — Waqt UI Standard

> The audit document. Every screen is built and reviewed against this file.
> `globals.css` owns tokens/identity. This file owns craft judgment:
> what belongs on a screen, how it presents, and every known tell of
> unchosen work ("slop"). Adapted from the AmeriFirst CRAFT standard —
> pharmacy rules removed, Waqt domain rules added.
>
> **The meta-law: slop = unchosen defaults + uniformity.**
> Single elements are weak signals; clusters are the tell.
> A tell is a default nobody overrode. The fix is never decoration —
> it's a specific, defensible decision.

---

## PART A — THE LAW (what every element must pass)

### A1. The Intentionality Law
Every visible decision supports one of: **meaning, action, identity,
accessibility, comprehension**. If it does none, delete it.

### A2. The Question Test (3 questions per screen)
1. What question does this screen answer?
2. Is that answer the **loudest thing** on it?
3. Does anything here look like a template?

### A3. One Loud Element
One element per screen carries the color and craft (today's prayer state,
the X-Ray overlay, the scroll count). Everything else is quiet chrome.
"When everything is emphasized, nothing is."

### A4. Quiet by Default
Normal state is muted text — no badge, no color. Lift only what needs
attention:
- **Normal** — plain quiet text. No pill for "healthy."
- **Drift** — amber on the smallest element that carries it.
- **Act** — accent + word + required action. Loud AND actionable.
A screen that can't say "nothing needs attention" has failed.

### A5. Content Over Container
Hierarchy arrives from what the user needs to do next — mark a prayer,
see how long until Isha, check today's scrolls — not from the card,
the grid, or the template.

### A6. The User-Quotes Standard
Optimize for articulable qualities: "it never loses my prayer count,"
"it works on the train," "it just blocks Instagram." Nobody says
"it's clean."

---

## PART B — WHAT BELOVED LOOKS LIKE (the positive bar)

### B1. Felt speed
<100ms interactions, optimistic updates, no full-page spinners. Loading:
nothing under 300ms, spinner 0.3–3s, skeleton >1s. The prayer check-in
must feel instant — lag during a check-in is never forgiven.

### B2. Flow, not decision fatigue
One obvious next action. Marking Fajr advances to the day — never
returns to a list to re-decide.

### B3. Never lose your place
Permanent context (which day, which tab). Return to last position.
Position is identity — never rearrange the shell casually.

### B4. Density that respects the daily user
32–40px rows, tabular numerals for times/counts, dividers not cards.
Whitespace doesn't mark prayers.

### B5. Earned charm, never decoration
- The prayer band on the calendar is the earned skeuomorph — a real
  window in time, not a decorative stripe.
- The X-Ray anatomy is the ONE playful element — singular, domain-
  justified, motion-safe.
- Celebration: the user's own milestone (a completed qadaa year), quiet,
  once. Never confetti for the app's desired action.
- Microcopy with a spine: calm, declarative, zero exclamation marks in
  a prayer tool.

### B6. Honest trust
Says what happened and what to do. Offline state is labeled, not faked.
`assumed_prayed` is distinguished from `prayed` — never rendered as a
lie of confidence. Empty = one sentence + one action, never an
illustration.

### B7. Hard stops only where safety lives
Explicit confirm on destructive data actions (account deletion, friend
unlink) — names the object, verb button, cancel-focused. Prayer marking
needs NO confirm — it is reversible.

### B8. Scan-and-act
Inline state edits, row → full story. No modal to view a day.
Hover is a promise: non-clickable rows get NO hover tint.

---

## PART C — THE SLOP CHECKLIST

*Every known tell. Audit every screen against all of these. One tell might
be coincidence; two is a pattern; three is slop.*

### C1. COLOR
- [ ] Indigo/violet primary ("VibeCode purple")
- [ ] Forced dark-only mode — hides layout sins
- [ ] Pure `#000` or `#fff` — Waqt tints toward warm ink/paper already
- [ ] Untinted gray neutrals; "timid" 4–5-color palette, no dominant
- [ ] One accent at one lightness for links+buttons+icons+rings
- [ ] Raw framework status colors side by side
- [ ] A tint per enum value "because the palette had them"
- [ ] Color carrying meaning alone — always color + word/icon
- [ ] Colored glows/drop-shadows; neon borders vs hairlines at 6–10%
- [ ] Gradients anywhere: buttons, headlines, orbs, scrims
- [ ] Sign-color reflex on numbers (+scrolls green, missed days red —
      sign ≠ moral judgment; see D2)

### C2. TYPOGRAPHY
- [ ] Inter/Roboto/Open Sans as everything
- [ ] Display serif for "premium" at default tracking
- [ ] font-semibold as heaviest; font-black reflexively
- [ ] text-6xl/7xl + tracking-tighter on every heading
- [ ] Negative tracking on body/labels at 14–16px
- [ ] `text-wrap:balance` on every heading
- [ ] Tiny gray letter-spaced UPPERCASE labels over every number/section
- [ ] Title Case On Headings → sentence case always
- [ ] Parallel triplets; 3–6 word slogan fragments
- [ ] Non-tabular numbers on times/dates/counts
- [ ] **Letter-spacing or faux-italic on Arabic text — banned absolutely**
      (connected scripts break; Arabic gets larger size/weight instead)

### C3. SPACING / LAYOUT
- [ ] Uniform soft shadows, one elevation for everything
- [ ] Off-scale spacing: `mt-[13px]`, `gap:7px` — 4/8 scale only
- [ ] Internal spacing ≥ external spacing (Gestalt violation)
- [ ] Thin floating centered column in a full-width tool
- [ ] 11 nav items "because the app has 11 features"
- [ ] Same-CRUD-every-object
- [ ] Crowded first screen: pills + stats + icons competing
- [ ] Modal reflex — modals for what should be inline/sheet/page
- [ ] Sticky-everything eating the viewport
- [ ] Equal padding on hero and dense table

### C4. COMPONENTS
- [ ] All buttons primary — same filled button for Save/Cancel/Delete
- [ ] Icon-in-rounded-square + title + 2 gray lines ("the most-generated
      component on earth")
- [ ] Hero pill badge "Now with AI ✨" + pulsing dot
- [ ] Status badge on every row including ordinary values
- [ ] Toast for everything; cheerleader toasts ("Awesome! ...successfully! 🎉")
- [ ] The confirm reflex — "Are you sure?" on reversible actions
- [ ] Vague labels: "Submit"/"Click here" — verb ≤3 words
- [ ] Hamburger on desktop; icon-only unlabeled nav
- [ ] div-with-onClick; missing `type="button"`; opacity-only disabled

### C5. DATA DISPLAY
- [ ] Dashboard of nothing: 4 KPIs + line + donut, no question answered
- [ ] KPI with no comparison/action; the vanity counter
- [ ] The zero that lies — `0` for data that didn't load (`0` = measured,
      `—` = missing, never conflate)
- [ ] Every KPI gets % change + sparkline, period unstated
- [ ] Equal-weight tile grid of 4–11 identical boxed cells
- [ ] Donut for ≤3 numbers; gauge for a threshold
- [ ] Christmas-tree coloring — every card its own accent
- [ ] Skeleton shaped nothing like the content it replaces
- [ ] Fake progress creeping to 90%; truncated-axis bars
- [ ] Fresh-looking stale data — staleness stamp missing
      (scroll stats, prayer times, certification data)

### C6. IMAGERY / ICONS
- [ ] Aurora/blob backdrops; blurred gradient orbs
- [ ] Glassmorphism (backdrop-blur on iOS Safari = bug surface)
- [ ] Emoji as icons/section bullets (zero — OS-rendered, SR-hostile)
- [ ] Mismatched icon sets (Lucide everywhere or nowhere — 2px stroke token)
- [ ] Illustration + "Nothing here yet" empty state
- [ ] Invented stats, avatar-dot rows without source

### C7. MOTION / INTERACTION
- [ ] `transition-all` (named properties, 150ms ease-out)
- [ ] hover:scale-105, floating badges, wiggling icons
- [ ] Staggered fade-up-on-scroll in tool UI; parallax; scroll-jacking
- [ ] Animated count-up counters (the scroll counter updates, doesn't tumble)
- [ ] Motion unguarded by prefers-reduced-motion
- [ ] Ungated hover → sticky hover on touch (gate `@media(hover:hover)`)
- [ ] :focus styled vs :focus-visible; ring <3:1 on its own surface
- [ ] Spinner <300ms flicker; spinner where skeleton belongs
- [ ] Missing press states; inconsistent hover coverage
- [ ] No cursor:pointer on clickables; no not-allowed on disabled
- [ ] Buttons that don't guard double-submit (prayer check-in = idempotent)

### C8. COPY / WORDING
- [ ] "Welcome back, [name]! 👋" — titles name the context
      ("Maghrib · 3h 12m left")
- [ ] Cheerful-vague errors — state what happened + what to do
- [ ] Hype verbs: unlock, unleash, elevate, empower, transform
- [ ] Exclamation marks anywhere; trailing periods on labels
- [ ] Feature-marketing as UI labels
- [ ] Redundant copy stack: heading + sublabel + helper all saying the
      same thing
- [ ] Explaining the UI inside the UI
- [ ] First-person buttons; "Are you sure you want to proceed?" boilerplate

### C9. EMPTY / ERROR / EDGE STATES
- [ ] Only the happy path renders — Waqt's contract is five states:
      loading / empty-first-use / empty-filter / error / **offline**
- [ ] Empty-state flash before data resolves
- [ ] "No results." identical for first-run vs filter-empty vs load-failure
- [ ] Error without cause or remedy; error far from the field
- [ ] "1 items" — no 0/1/many handling
- [ ] Long Arabic/Unicode strings breaking layout (test: a long surah name
      or a 40-char friend name)
- [ ] Offline treated as an error instead of a state (see D3)

### C10. META / STRUCTURE
- [ ] No answer at the top — screen doesn't know its question
- [ ] Everything equally loud
- [ ] Never calm — no resting state exists
- [ ] Page drift: accent here, different accent there — design lives in
      tokens, never in prompts
- [ ] Settings = undifferentiated grid of switches, no grouping/judgment
- [ ] "Passed the linter but nobody designed it"

### C11. IMPLEMENTATION TELLS (invisible in screenshots)
- [ ] Navigation = `<a>`/`<Link>` real href — onClick router.push strips
      Cmd+click/middle-click/AT
- [ ] `key={index}` on mutable lists
- [ ] Effect cleanup missing on subscriptions/listeners
- [ ] Un-guarded fetches — last-REQUESTED wins
- [ ] Date.now()/window reads in render
- [ ] Inputs ≥16px (iOS zoom), paste allowed, correct inputmode
- [ ] Route change → h1 focus + document.title
- [ ] Submit guards double-post; real `<form>` so Enter works

---

## PART D — WAQT DOMAIN RULES

### D1. Prayer semantics
- Prayer windows are a **background band**, never a blocking event —
  the overlap rule is permissive by product law.
- `assumed_prayed` ≠ `prayed` ≠ `qadaa` ≠ `missed` — each state gets a
  distinct, named treatment. Never render an assumption as a fact.
- Times are absolute + relative: "Isha 8:42 PM · in 2h 14m." Timezone is
  the user's, always labeled when the masjid's differs.
- Fajr is the anchor color-carrier when a prayer is in progress; quiet
  chrome otherwise.

### D2. Moral neutrality of numbers
- Scroll counts, missed qadaa, streak breaks: **numbers inform, they do
  not shame**. No red for "bad days," no green for "good days" — sign is
  not moral judgment. The one exception: a user-set goal crossing its
  own threshold, which the user defined.
- Never celebrate with the business's desired action; celebrate the
  user's own milestones, quietly, once.

### D3. Offline is a state, not an error
- Offline = orange dot + "offline" near the logo. Nothing else changes.
- Cached content + outbox of operations; per-record pending/synced/failed
  + global "3 waiting" when it matters.
- Server-dependent writes: honest disabled with explanation beats a lie.
- On reconnect: auto-sync, announce failures, never roll back successes.

### D4. Arabic & religious text
- Arabic: `font-family` Amiri/QPC2; line-height ≥1.5; NO letter-spacing,
  NO italics, NO text-transform, NO justify. Diacritics preserved —
  never strip or normalize on input.
- Transliterated names and Arabic names both searchable.
- RTL mirrors arrows/progress; never mirrors clocks, times, charts,
  media controls.
- Religious content is never AI-generated (product law) — empty states
  are honest, not filled.

### D5. Android / Capacitor
- The APK is a first-class citizen: accessibility overlay, scroll counter,
  contacts bridge, FCM — features must degrade honestly on web, not
  silently no-op (a dead button is a lie; a labeled limitation is honest).
- Bottom nav + `env(safe-area-inset-bottom)`; `viewport-fit=cover`;
  `input{font-size:max(16px,1em)}`; 44px targets.
- Metered-connection gate on big downloads (models/mushaf) — already
  enforced via `src/lib/net.ts`.
- No `READ_CONTACTS`/extra permissions when `ACTION_PICK` suffices —
  the smallest permission set that works.

### D6. Data presentation (number vs chart)
| Situation | Correct presentation |
|---|---|
| One value, no trend | Big number + label + context line. No chart. |
| Value vs user-set goal | Bullet/meter. Never radial. |
| Daily history (scrolls, prayers) | Sorted bar strip + list. Zero-baseline. |
| Category comparison (apps) | Sorted horizontal bar. |
| Lifetime prayer grid | Fixed-cell literal encoding — the grid IS the data. |
| ≤3 numbers | Never a chart. |

- `tabular-nums lining-nums` on ALL times/counts/dates.
- Trend = number + named period ("142 vs 98 yesterday").
- `0` = measured; `—` = missing; conflating = tell.

---

## PART E — PLATFORM NON-NEGOTIABLES

- `antialiased` global; body ≥400 weight; `viewport-fit=cover`; `dvh` with
  `vh` fallback; opaque bg on sticky headers inside scrollers.
- Bottom nav + safe-area insets; maskable icon 40% safe zone.
- 44px primary targets; hover gated `(hover:hover) and (pointer:fine)`;
  `:focus-visible` only; `overscroll-behavior` on nested scrollers;
  never `user-select:none` on data (verse text, friend notes).
- Capacitor: keyboard, SystemBars, edge-to-edge plugins current;
  ≥1 native feature (push + accessibility guard) for App Store 4.2.
- CSP nonce on dynamic pages; no `'unsafe-inline'` reach on session
  routes; the four CSP copies (`next.config` ×2, `proxy.ts`,
  `public/sw.js`) stay in sync — drift between them = the /sirat bug.

---

## PART F — THE AUDIT RITUAL

Per screen, before calling it done:
1. The 3 questions (A2) out loud.
2. Squint test: ≤4 chunks, eye order, ≤5 emphasis levels.
3. Full C-checklist pass.
4. States audit: hover / focus-visible / active / disabled / loading /
   empty / error / **offline** / long-content / 0-1-many.
5. Data rules check (D6) + staleness stamps present.
6. Platform matrix: 320/375/414/768px + a real Android run for anything
   touching native bridges.
7. The deletion pass: remove anything that fails Intentionality.
8. Part D spot-checks for the screen's domain (prayer → D1/D2, Arabic →
   D4, native → D5, stats → D6).

---

## PART G — DEEP RULES (the "do exactly this" layer)

### G1. PRAYER UX (domain rules — highest stakes)

- **The check-in is sacred UI** — one tap, optimistic, idempotent.
  Any friction inside the prayer window is a product defect.
- **Never re-ask what the user already answered** — `checkin_stage` guard
  means the same stage never fires twice; UI must mirror that exactly.
- **The return-after-absence screen is ONE batch decision** — never a
  flood, never auto-assumed guilt. "Mark unknown" is a first-class choice.
- **Masjid context is glanceable** — "went to masjid" is a fact attached
  to the prayer, not a separate screen visit.
- **Qadaa debt is honest** — the lifetime grid encodes prayed/qadaa/
  pre-tracking distinctly; never render neutral cells as failures.
- **Prayer times are cached data** — show the stamp when fresh is
  impossible; a wrong prayer time shown confidently is the worst failure
  mode in the app.

### G2. TYPOGRAPHY (correctness layer)

- Body text 15–25px; line-height 1.2–1.45; measure 45–90ch for prose.
- `tabular-nums lining-nums` on ALL data; proportional for prose.
- Punctuation sins (machine-checkable): straight quotes, `--` for `—`,
  `...` for `…`, double spaces, underlined non-links.
- Letterspaced caps: 5–12% tracking, ≤4–5 words, one weight up —
  never on headings or long labels.
- Mono only when CHARACTER alignment matters (share codes) — never prose.
- Arabic: line-height ≥1.5, no letter-spacing, no italic, no justify.

### G3. COLOR (science layer)

- One meaning per color, absolute. Accent = action; reserved-status hues
  (orange offline, amber drift) are never reused for decoration.
- Every fill token has a defined `on-` color.
- Never gray text on colored surfaces — ink/paper at reduced opacity.
- Dark mode: redesign not inversion; dark gray not `#000`; elevation =
  lighter surfaces; desaturate accents; `filter:invert()` banned.
- Focus ring: ≥2px perimeter, 3:1 change-test on its own surface.
- Light and dark both verified at 320px and desktop — the /sirat public
  route defaults light; the app shell defaults user's choice.

### G4. FORMS & VALIDATION

- Label above input always. Placeholder = format example only.
- Mark the FEWER set (required/optional), spelled out.
- Validation on blur/exit, never mid-typing; errors name the field,
  say what's wrong, say the fix.
- **Never disable submit** — click → validate → focus first error; only
  in-flight disable with spinner. (Prayer marking: double-submit guarded
  by `checkin_stage` + outbox idempotency, not a disabled button.)
- Mobile fields: right type/inputmode (`tel` for phones, `numeric` for
  qadaa counts); `one-time-code` for OTPs; paste always allowed.
- Multi-step (onboarding): one thing per page, progress = literal 1:1,
  Back preserves data.

### G5. TABLES & LISTS

- First column = human identifier (friend name, masjid name) — never UUID.
- Nominal numbers (phone, codes) left-aligned; comparable numbers right
  with consistent decimals.
- Paginate — infinite scroll fails refindability. Exception: the lifetime
  grid is a fixed literal encoding, not a list.
- Filters: active filters visibly indicated; filter-empty ≠ data-empty.
- Lists: avatar ONLY for people; ≤2 lines; ops rows 40–48px.
- Drag: keyboard/non-drag path mandatory (counter pill position must be
  settable without dragging).

### G6. NAVIGATION & IA

- Bottom nav 3–5 peers, icon+label always; hamburger on desktop = wrong.
- URL-state law: shareable state in URL (day, tab, filter); PHI/drafts
  never in URL; `replace` + `scroll:false` for state changes; explicit
  parent back links, never `navigate(-1)`.
- Every page a possible landing page (the Android deep link to /prayer
  already assumes this).
- Badges: count = N actionable, hide at 0, clears when addressed.

### G7. OVERLAYS

- Ladder: inline → sheet (mobile) / popover (desktop) → modal LAST.
- One overlay deep EVER. The accessibility shield overlay is system-
  level — it counts, so never stack a second blocking layer under it.
- `<dialog>`/`showModal()` over hand-rolled fixed divs.
- Destructive: undo > named confirm (friend unlink, account deletion)
  > typed confirm for catastrophic.
- Toasts: role=status, errors persist, never the only copy of
  keep-worthy info (share links persist elsewhere).

### G8. STATES (empty/loading/error/offline/stale)

- "Empty" = five kinds: first-use (teach + CTA), no-results (name query),
  no-data-yet (something's coming), all-done (quiet confirm), no-access/
  error (problem + fix). Separate components per kind.
- Empty replaces the BODY only — headers, nav, toolbar stay.
- Loading: nothing <300ms; spinner 0.3–3s; skeleton >1s mirroring real
  shape; never re-skeleton on refetch.
- Stale: stamped figures; auto-refresh on reconnect; confident wrong >
  labelled stale.
- Optimistic: reversible only; failure = revert + ANNOUNCE + retry;
  user content never discarded.

### G9. MOBILE / TOUCH

- Targets ~9–10mm (44–48px) primary; 24px floor; audit HIT BOXES not
  glyphs (the tiny /sirat back button is deliberately subtle, not broken).
- Bottom sheets: never gesture-only dismiss; destructive top+red, Cancel
  bottom; dirty sheet confirms on all dismissal paths.
- Pull-refresh: never the ONLY path.
- Swipe actions accelerate never gate.
- Landscape supported; keyboard-over-input tested; X-Ray camera flow
  tested on real hardware — simulated checks don't count.

### G10. ALERTS & NOTIFICATIONS

- Least-interruptive channel that arrives in time: prayer push → inline
  → badge — escalation = moving UP the ladder.
- The prayer check-in push is the only interruptive notification the
  default schedule allows; everything else batches.
- One notification per condition; dedupe; never burst.
- Delivered ≠ seen ≠ resolved; the shield overlay is the resolution
  channel, not a second notification.

### G11. MOTION

- ONE easing family, tokenized; budgets: feedback ≤300ms, reveals ≤700ms,
  nothing >1s.
- Exits shorter than entries; springs for interruptible/user-driven
  (counter pill drag), curves for system progress.
- Reduced-motion = opt-in `no-preference`; vestibular triggers off; final
  states land.
- The scroll counter fade (160ms in / 140ms out) is the reference
  signature — same family everywhere.

### G12. COPY & MICROCOPY

- Buttons: {verb}+{noun} ≤3 words sentence case ("Mark prayed",
  "Import contacts"); never Yes/No/OK.
- Errors: what went wrong + how to fix; imperative; no Oops/blame/codes
  ("Camera access was denied — allow it and try again." is the model).
- Confirms: object named + consequence + verb-mirroring CTA.
- One term per concept (qadaa is qadaa everywhere; never "missed" in one
  place and "owed" in another).
- Success = reassure don't celebrate; zero exclamation in operational
  copy.
- Legal: no absolute claims ("guaranteed secure"); disclosures at
  decision points.

### G13. ICONS & IMAGERY

- ONE family (Lucide), stroke weight is a token; foreign icons re-stroked
  or dropped.
- Labels on app-specific icons always; universal icons ~5 exempt.
- Emoji = zero in UI chrome.
- Avatars for people only.
- X-Ray anatomy: real skeletal data, art-directed, not decoration —
  the earned skeuomorph of the workout domain.

### G14. ACCESSIBILITY

- The six sins = the typos of frontend: contrast, alt, labels, empty
  links/buttons, lang, and — Waqt's sixth — **Arabic text styled as if
  it were Latin**.
- ARIA is a promise — declare it, wire it, or don't declare it.
- WCAG 2.2: focus not obscured; ≥24px targets; no re-typing; paste
  allowed.
- Icon-only buttons named (the /sirat back glyph has aria-label).
- Route change → h1 focus + title.

### G15. ENTERPRISE / OPS TRUTHS

- Design for the 5 most frequent jobs, counted in clicks: mark prayer,
  see next prayer, open scroll stats, import friend, check lifetime.
- Latency IS the interface; every tap = instant feedback.
- Never reorder learned sequences silently per-release.
- Required fields live at the point of action.
- Real data in designs: 40-char friend names, 90-day scroll history,
  a long surah name — never "Jane Cooper" mockups.

### G16. THE CLASSICS (everything reduces to these)

- **Rams** — "Less, but better."
- **Tufte** — data-ink ratio; the lifetime grid is the ideal.
- **Krug** — don't make me think; mark a prayer in one read.
- **Norman** — signifiers, feedback, constraints; user error =
  designer's fault.
- **Hick** — one primary action per region.
- **Fitts** — primary big and near the thumb; destructive small and far.
- **Gestalt** — grouping must mean what it appears to mean.
- **One-liner:** "The user does the thinking you didn't do. Slop is the
  design that did no thinking."

---

## PART H — DECISIONS THIS STANDARD CHANGES

1. **Five-state contract on every screen** — loading/empty-first/
   empty-filter/error/offline — offline is a state, never an error.
2. **Prayer states are named, not colored** — assumed_prayed never wears
   prayed's clothes.
3. **Arabic gets its own typographic rule** — no letter-spacing, no
   italic, no justify, line-height ≥1.5, diacritics preserved.
4. **Numbers are morally neutral** — scroll counts and missed qadaa
   inform; they don't shame.
5. **One loud element per screen** — the prayer in progress, the X-Ray,
   today's scrolls. Everything else is quiet chrome.
6. **The tiny back button on /sirat is a decision** — subtle on purpose,
   24px + aria-label, not a missed target.
7. **No permission the platform's picker can grant for free** —
   ACTION_PICK over READ_CONTACTS; least-privilege native design.
8. **Metered connections are a first-class user** — 50MB model downloads
   warn once; idle preloads skip cellular entirely.

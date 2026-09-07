# Waqt — Agent Guide

> **Read this file before writing any code on this project. It is the source of truth
> for conventions, principles, build order, and non-negotiable rules.**
>
> `CODEBASE_PATTERNS.md` (in this repo's root) is the companion reference — it
> documents proven patterns from a production Next.js SaaS (RingProof). Whenever a
> pattern below says "see CODEBASE_PATTERNS.md §X", go read that section before
> implementing.

---

## 0. What This Project Is

**Waqt** is a prayer-centered life tracker PWA. The five daily prayers are fixed
anchors; everything else (calendar events, tasks, reminders) is scheduled around
them. The app provides prayer accountability (check-ins) plus surrounding
features (dhikr counter, Qibla compass, Akhirah Card, 99 Names of Allah, Hijri
converter, talks library).

**Stack:** Next.js 14+ App Router · TypeScript · Neon (Postgres) via Drizzle ORM ·
Vercel (hosting + cron) · Vercel Web Push · AlAdhan API
(prayer times) · Tailwind CSS.

**Full spec:** See the project brief (the message that created this repo). The
schema, API routes, state machine, onboarding flow, and build order are all
defined there. This file distills the *rules* an agent must follow.

---

## 1. The Four Product Principles (Non-Negotiable)

These resolve every ambiguous decision. When in doubt, re-read these.

1. **Prayer accountability is free forever.** Never gate the check-in system
   behind a paywall. Future premium features pay for depth and convenience
   (analytics depth) — never for the thing that makes someone pray.

2. **Never assume the worst on missing data.** Unmarked prayers auto-resolve as
   `assumed_prayed` at day's end — no silent penalty. A week-long absence
   surfaces as ONE batch catch-up screen, never a flood of backdated reminders.

3. **No AI-generated religious content.** All dhikr sequences and talks must
   come from a vetted, human-curated content bank (`dhikr_sequences`, `talks`
   tables). Treat these tables as empty-until-seeded; build UI to *read* from
   them, not generate their content.

4. **The overlap-in-calendar rule is permissive.** Overlapping events stack
   side-by-side. No blocking, no warning modal. Prayer windows render as a
   background band, never as a blocking event.

---

## 2. Pre-Coding Ritual (Every Session)

Before writing ANY code, especially UI or auth/payment/DB code:

1. **Invoke `hallmark`** before designing any page or component. It enforces
   anti-AI-slop design rules (no purple-blue gradients, no 3-equal-column icon
   cards, no gradient headlines, locked design tokens, mobile-verified at
   320/375/414/768px). See `.devin/skills/hallmark/SKILL.md`.
2. **Run a security pass** before any auth, payment, database, API key, or
   user-data code. Apply the defense-in-depth checklist in §5 below and the
   patterns in CODEBASE_PATTERNS.md §1 & §9.
3. **Use `agent-reach`** for any competitive research or URL reading (prayer time
   API docs, etc.). See `.devin/skills/agent-reach/SKILL.md`.
4. **Use `full-output-enforcement`** when a task requires exhaustive, unabridged
   code generation (no placeholder `// ...rest` patterns).

These are installed at `.devin/skills/` in this repo and are always available.

---

## 3. Build Order (Follow This Sequence)

The spec defines a 9-step build order. **Do not skip ahead.** After each step the
app must be in a working, deployable state.

| Step | Focus | Key deliverable |
|------|-------|-----------------|
| 1 | Foundation | Next.js + Drizzle + Neon schema migration + auth + bare shell deployed |
| 2 | Calendar core | Day view (scrollable hour grid), tap-to-add, side-by-side overlap stacking, month view |
| 3 | Prayer times | AlAdhan monthly fetch + cache, prayer window overlay band on day view |
| 4 | PWA shell | Manifest, service worker, offline cache of current week, install prompt, Web Push subscription |
| 5 | Check-in state machine | Cron scheduler (every 5 min), push notifications, prayer_log writes, assumed_prayed at window close, return-after-absence catch-up |
| 6 | Onboarding | Mandatory flow: location → virtue framing → notification setup |
| 7 | Tools (dhikr + qibla + sadaqah + names + hijri + talks) | Content-bank-driven features (read from seeded tables, never generate) |
| 8 | PWA store packaging | PWABuilder (Android TWA) + Capacitor (iOS) — LAST, after real usage |

---

## 4. Architecture & Conventions

### 4.1 Directory Structure (target)

```
src/
├── app/
│   ├── (marketing)/          # Landing page (server-rendered, deferred interactions)
│   ├── (auth)/               # Login, signup
│   ├── (app)/                # Authenticated app shell
│   │   ├── calendar/         # Day + month views
│   │   ├── dhikr/            # Tasbih counter
│   │   ├── qibla/            # Qibla compass
│   │   ├── sadaqah/          # Akhirah Card (sadaqah tracker)
│   │   ├── names/            # 99 Names of Allah
│   │   ├── hijri/            # Hijri converter
│   │   ├── talks/            # Talks library
│   │   ├── settings/         # Notification prefs, prayer settings
│   │   └── onboarding/       # Mandatory onboarding wizard
│   ├── api/
│   │   ├── auth/
│   │   ├── prayer-times/
│   │   ├── prayer-log/
│   │   ├── events/
│   │   ├── dhikr/
│   │   ├── sadaqah/
│   │   ├── qibla/
│   │   ├── notifications/
│   │   ├── cron/
│   │   └── webhooks/
│   ├── layout.tsx
│   ├── globals.css           # Design tokens (CSS custom properties)
│   └── sitemap.ts
├── lib/
│   ├── env.ts                # ALL server env vars (never use process.env elsewhere)
│   ├── env.public.ts         # Client-safe env vars only
│   ├── db/                   # Drizzle client + schema
│   ├── auth/                 # Session/auth helpers
│   ├── prayer/               # Prayer time logic, state machine, window math
│   ├── notifications/        # Push dispatch
│   ├── aladhan.ts            # AlAdhan API client
│   ├── validation.ts         # UUID/email/phone/HTML escape helpers
│   ├── rateLimit.ts          # IP-based rate limiting (secure IP extraction)
│   ├── cronAuth.ts           # Bearer token verification for cron routes
│   └── content/              # Curated content access (dhikr, talks)
├── components/
└── drizzle/                  # Migrations
```

### 4.2 Single Source of Truth

Every piece of business logic has ONE home. Never duplicate.

| Logic | Single source | Never duplicate in |
|-------|--------------|-------------------|
| Prayer window thresholds (early/mid/closing %) | `src/lib/prayer/thresholds.ts` | Components, cron, API routes |
| Check-in state machine transitions | `src/lib/prayer/stateMachine.ts` | API routes, cron, UI |
| Environment variables | `src/lib/env.ts` | Any file using process.env |
| DB schema | `src/lib/db/schema.ts` (Drizzle) | Any file defining tables |

### 4.3 Server vs Client Components

- **Server components** (default) fetch data server-side, pass to client components.
- **Client components** (`'use client'`) handle interactivity (forms, state, drag).
- **Lazy load** heavy client components with `next/dynamic` + `ssr: false`.
- See CODEBASE_PATTERNS.md §3 "Server vs Client Components".

### 4.4 Dynamic Rendering

All authenticated routes MUST have `export const dynamic = 'force-dynamic'` in
their layout. This prevents static prerender + CSP nonce conflicts (the
"buttons don't work" bug — CODEBASE_PATTERNS.md §7.2).

---

## 5. Security Checklist (Apply Before Every Endpoint)

Defense in depth — each layer catches what the previous missed:

```
Request → Rate limit → Input validation → Auth check → DB policy → Response masking
```

### 5.1 Rate Limiting
- Every public POST endpoint MUST be rate-limited by IP.
- Auth endpoints: 5/15min. Form submissions: 5/min.
- Use `src/lib/rateLimit.ts` with secure IP extraction (LAST value in
  X-Forwarded-For, not first — CODEBASE_PATTERNS.md §30.1).

### 5.2 Input Validation
- Parse `req.json()` inside try/catch — malformed JSON returns 400, not crash.
- Validate required fields, trim strings, validate emails/UUIDs/phones with regex.
- Never trust client-side validation alone — always re-validate server-side.
- See `src/lib/validation.ts` (UUID, email, token, phone normalization to E.164).

### 5.3 Authorization
- Authenticated routes: verify session before any data access.
- Cron routes: verify `CRON_SECRET` Bearer token with `crypto.timingSafeEqual()`.
- Webhook routes: verify signature.
- Check for IDOR: can user A access user B's data by changing an ID?

### 5.4 Secrets Management
- ALL secrets in `src/lib/env.ts` — never `process.env` elsewhere.
- Service role keys NEVER reach client code.
- `.env*` files gitignored; only `.env.example` committed.
- Never return raw secrets in API responses (mask to first 8 chars if needed).

### 5.5 Timing-Safe Comparisons
- ALL secret/token/signature comparisons use `crypto.timingSafeEqual()`.
- Never `===` for secrets. Always check buffer length BEFORE `timingSafeEqual()`.

### 5.6 DB-Save-First
- Save to DB first, then sync external services best-effort.
- If external sync fails, return success with a `warning` field.
- Never block the DB save on an external API succeeding.
- CODEBASE_PATTERNS.md §6.4.

---

## 6. Schema Discipline

### 6.1 Drizzle as Single Source of Truth
- All table definitions in `src/lib/db/schema.ts`.
- Migrations in `src/drizzle/` — generated via `drizzle-kit`.
- The spec's SQL (section 3) is the blueprint; translate to Drizzle table defs.

### 6.2 Idempotency
- Every cron job and webhook MUST be idempotent.
- Check for existing records before inserting (e.g., prayer_log unique on
  `(user_id, date, prayer_name)`).
- Use DB unique constraints as a backstop.

### 6.3 TypeScript Sync
- When you change the schema, regenerate Drizzle types in the same commit.
- TS types must match DB schema exactly.

### 6.4 After Schema Changes
- Tell the user to run the migration against their Neon database.
- The agent cannot run DB migrations against production — the user must.

---

## 7. Prayer Check-In State Machine (Exact Logic)

This is the core of the app. Get it right. See spec §4 for the full spec.

```
STATE: pending
  → window opens → EARLY check-in: "Did you go to the masjid?" [Yes/No]
     - No → "Have you prayed yet?" [Yes / I'll pray later]
     - Yes → status=prayed, went_to_masjid=true, STOP checkins

STATE: pending, mid-window (~50% elapsed)
  → MID check-in: "Have you prayed yet?" [Yes / Are you going to pray now?]

STATE: pending, closing (~20 min before window ends)
  → CLOSING check-in: [Yes / I will pray right now]
     - "I will pray right now" → urgent push, no further checkins

STATE: window closed, still unmarked
  → status = assumed_prayed (silent, no retroactive reminder)

RETURN-AFTER-ABSENCE (7+ days unmarked):
  → ONE batch catch-up screen. User chooses: mark as unknown.
  → Never assume. Never flood with backdated reminders.
```

**Rules:**
- Early/mid/closing percentages are **configurable constants** in
  `src/lib/prayer/thresholds.ts`, not hardcoded magic numbers.
- Each check-in writes to `prayer_log` and advances `checkin_stage` so the same
  stage never fires twice.
- Threshold math uses cached monthly prayer times — no extra API calls.
- Test thoroughly with fast-forwarded fake windows before trusting real times.

---

## 8. Onboarding (Mandatory, Non-Skippable)

1. **Location capture** → geocode → save to `prayer_settings` → fetch + cache current month from AlAdhan immediately.
2. **Virtue/framing screen** — PLACEHOLDER text block. Do NOT generate hadith text. Mark it clearly for the user to fill with vetted content.
3. **Notification setup** — three toggles (early/mid, final, other), all push-only.

---

## 9. Content Tables (Empty Until Seeded — Never AI-Generated)

| Table | Purpose | Rule |
|-------|---------|------|
| `dhikr_sequences` | Phrase, transliteration, target count, order | Human-curated from authenticated source. Counter auto-advances on target hit. |
| `talks` | Human-curated external or R2-hosted audio | Admin uploads require validation, processing, explicit publication, and graceful empty states. |

**Build the UI to read from these tables. If a table is empty, show a graceful
empty state — never generate content to fill it.**

---

## 10. Design Rules

### 10.1 Invoke Hallmark Before Any UI Work
- Pre-emit self-critique on: Philosophy, Hierarchy, Execution, Specificity,
  Restraint, Variety. Anything <3 triggers revision.
- No Inter/Roboto/Open Sans as the only font (one-font page = template page).
- No purple-to-blue gradients. No gradient headlines. No 3-equal-column icon cards.
- No card-in-card. No side-stripe cards. No full-viewport centered hero.
- No pure `#000` or `#fff` — tint toward the anchor hue.
- No `transition-all` (specify properties). No `hover:scale-105` across multiple elements.

### 10.2 Design Tokens (CSS Custom Properties)
- Every color and font references a named token (`var(--color-accent)`).
- No inline hex/rgb values. No `font-family: "Some Font"`.
- Define tokens in `src/app/globals.css`.
- Suggested palette direction for Waqt: warm, grounded, contemplative — not the
  typical "tech blue." Think pre-dawn light, prayer rug textiles, ink on paper.

### 10.3 Mobile Responsiveness
- Verified at 320/375/414/768px. No horizontal scroll.
- Root `overflow-x: clip`. No two-line clickable text. `minmax(0, 1fr)` for grids.
- Card padding uses `clamp()`, not fixed rem.
- Multi-step progress bars need `overflowX: auto` + `minWidth` on inner row.

### 10.4 CSS Pitfalls (CODEBASE_PATTERNS.md §10)
- React serializes inline styles to **kebab-case**, not camelCase. CSS attribute
  selectors must match kebab-case.
- Focus rings: use `outline`, not `box-shadow` (if you null box-shadow globally).
- Loading states: consolidate redundant screens (`!mounted || loading` → one UI).
- Completion timers: minimum 3500ms before redirect.

---

## 11. Operational Patterns

### 11.1 Cron Jobs
- Vercel cron runs `/api/cron/checkin-scheduler` every ~5 min.
- Verify `CRON_SECRET` Bearer token with `crypto.timingSafeEqual()`.
- Set `export const maxDuration = 300` on cron routes (bulk processing).
- Idempotent: check `checkin_stage` before firing — never fire the same stage twice.

### 11.2 Webhooks
- Return 200 immediately, process in background with `after()` from `next/server`.
- **Never fire-and-forget** on serverless — the function freezes after response.
  Use `after()` (CODEBASE_PATTERNS.md §7.4).
- Verify signatures. Idempotency guards on all webhook handlers.

### 11.3 External API Calls (AlAdhan)
- Fetch current month from AlAdhan ONCE, cache in `prayer_times_cache`. Re-fetch
  monthly via cron, not on every page load.
- All external calls are best-effort after DB save.

### 11.4 Error Handling
- No silent catch blocks — at minimum `logError()`.
- Never `console.log` secrets, passwords, tokens, or PII.
- Error boundaries at route group roots (`(app)/error.tsx`, `(auth)/error.tsx`).

---

## 12. Verification Commands (Run After Every Change)

```bash
pnpm exec tsc --noEmit              # TypeScript must exit 0 with no output
pnpm exec eslint --max-warnings=0   # Zero warnings enforced
pnpm run build                      # If structural changes
```

**"It compiles" is not "it works."** Read your changes back. Check edge cases.
Grep to verify functions/types you reference actually exist.

---

## 13. Git Workflow

- Commit format: `type: concise description` (e.g. `feat: add prayer window overlay`)
- Never push without explicit user request.
- Never force-push or rewrite history.
- Never commit secrets or `.env*` files.
- Co-Authored-By trailer added per the standard format.

---

## 14. Open Decisions (Do NOT Guess — Ask the User)

These are marked TODO in the spec and require the user's input:

- [ ] Exact hadith/virtue text for onboarding (needs scholarly review / cited source)
- [ ] Exact dhikr sequences (phrases, transliteration, target counts — authenticated source)
- [ ] Talks library curated list (speakers/topics/links)
- [ ] App name confirmation ("Waqt" — domain + trademark availability)

**When you reach any of these in the build, stop and ask. Do not fabricate
religious content. Do not invent pricing. Do not guess at rulings.**

---

## 15. Anti-Patterns to NEVER Do

| Anti-pattern | Do this instead |
|--------------|-----------------|
| `process.env.X` outside `env.ts` | Import from `@/lib/env` |
| `===` for secret comparison | `crypto.timingSafeEqual()` |
| Fire-and-forget on serverless | Use `after()` from `next/server` |
| Inline business logic (state machine) | Import from the single source |
| AI-generate dhikr/talks content | Read from seeded tables; empty state if unseeded |
| Gate prayer check-in behind paywall | Free forever — gate only depth/convenience |
| Block overlapping events or show warning modal | Stack side-by-side silently |
| Backdated reminder flood after absence | ONE batch catch-up screen |
| Assume the worst on unmarked prayers | `assumed_prayed`, no penalty |
| `select('*')` on sensitive tables | Explicitly list columns |
| Hardcode prayer window thresholds | Configurable constants in `thresholds.ts` |
| Static prerender + CSP nonce on auth routes | `export const dynamic = 'force-dynamic'` |
| `any` type | Use `unknown` or proper types |
| Skip Hallmark before UI work | Invoke `hallmark` first |
| Skip security pass before auth/payment/DB code | Apply §5 checklist first |

---

## 16. Skills Available in This Project

All installed at `.devin/skills/`:

| Skill | When to invoke |
|-------|---------------|
| `hallmark` | Before ANY UI/page/component work. Anti-AI-slop design. |
| `agent-reach` | For any web research, API docs, competitor analysis, URL reading. |
| `full-output-enforcement` | When a task requires exhaustive, unabridged code output. |
| `design-taste-frontend` (taste-skill) | Anti-slop frontend for landing pages, portfolios, redesigns. |
| `gpt-taste` | Elite UX/UI + GSAP motion (if advanced animation needed). |
| `redesign-existing-projects` | If upgrading existing UI to premium quality. |
| `high-end-visual-design` | Agency-level design standards (fonts, spacing, shadows). |
| `minimalist-ui` | Clean editorial interfaces (warm monochrome, flat bento). |
| `industrial-brutalist-ui` | Raw mechanical/Swiss/military terminal aesthetic. |
| `imagegen-frontend-web` | Generate premium website design reference images. |
| `imagegen-frontend-mobile` | Generate premium mobile screen concept images. |
| `image-to-code` | Generate design image first, then implement to match. |
| `brandkit` | Brand guidelines boards, logo systems, identity decks. |
| `stitch-design-taste` | Semantic design system DESIGN.md generation. |
| `design-taste-frontend-v1` | Backward-compatible v1 taste-skill (only if needed). |

**Invoke with the `skill` tool. When multiple match, invoke ALL relevant ones in
parallel — do not stop at the single most obvious one.**

---

*This file is maintained alongside the codebase. When you learn a new pattern or
lesson, add it here. The audit never ends.*

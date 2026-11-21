# Waqt — Full-Site Craft Audit (30-agent sweep, every route)

> 28/30 route reports synthesized; calendar-day + public-share reports pending at time of writing.
> Ordered: **systemic patterns** (fix once, fixes everywhere) → **blockers** → per-route hits.

---

## PART 1 — SYSTEMIC PATTERNS (the same sin, many files)

### P1. `assumed_prayed` renders as `prayed` — D1 violation, ~20 sites
`/prayer` timeline/count/progress/league (`PrayerDashboardClient.tsx:1215`), `/profile` card (`ProfileClient.tsx:347`), `/calendar/day` + `/calendar/month` (`DayViewClient.tsx:1691`, `MonthViewClient.tsx:526`) all render a cron assumption as a confirmed prayer — green check included. Fix once in the shared status→display mapping; give `assumed_prayed` a named treatment (hollow check + "Assumed").

### P2. "Missed" label on unmarked window-ended prayers
`/prayer` timeline (`:1657`) + month view's giant decorative X over every past day (`MonthViewClient.tsx:536`) — pending-until-auto-resolve prayers read as failures. Product law: never assume the worst. Rename to "Unmarked"; delete the X overlay.

### P3. Letter-spacing on Arabic — banned absolutely, 3+ files
`NamesClient.tsx:236`, `NasheedsClient.tsx:102`, `NasheedClient.tsx:547-548` (worst: `tracking-[0.22em] uppercase` on one connected word). Grep `tracking-*` on Arabic everywhere. Plus missing `lang="ar"` on hadith (`LearnClient.tsx:627`). Add an `.ar` class that forbids letter-spacing.

### P4. "Brain rot" / moral-colored scroll numbers — D2, two files
`ScrollClient.tsx:24-26` and `MiscClient.tsx:690` — identical green→amber→red gradient + "brain rot" label painted on scroll counts. Numbers inform, don't shame. Neutral labels ("under 30 / 30–100 / over 100").

### P5. The zero that lies (`?? 0` / `?? []` on unloaded data)
- `scroll` hero fake-0 during native-bridge check (`ScrollClient.tsx:144`)
- `safeQuery` → `[]` → fake "no goals/birthdays" on DB failure (`goals/page.tsx:24`, `BirthdaysClient.tsx:177`)
- `/workout/muscles` renders "all fresh" before fetch resolves (`muscles/page.tsx:43`)
- Admin `stats?.users ?? 0`, `?? 0` streak on /prayer, `?? 0` rating on mutashabihat
Rule everywhere: `0` = measured, `—` = missing.

### P6. Silent `catch` = error states that never exist
13 fetched all `.catch(() => null)` on /prayer; homework, talks, scroll-sync, birthdays, workout hub — failure renders as normal/empty. Same files lack an offline *state* (D3) entirely.

### P7. Hand-rolled overlays everywhere — no `<dialog>`, no Escape, no focus
~15 sites: friends sheets (3 deep), homework 6 dialogs, prayer checkin popup, share-qr, tools drawer, admin drawer, workout sheets, photo viewers, subscriptions log, learn picker, quran-tester 8 z-stacked fixed divs. G7 ladder: inline → sheet → `<dialog>` last. One overlay deep EVER (friends crew-sheet→friend-sheet→cropper is 3 deep).

### P8. `text-sm`/`text-xs` inputs → iOS auto-zoom, ~25 fields
auth forms, search boxes (learn, talks, names, masjid, library), settings inputs, workout set inputs, subscriptions. Global fix: `input{font-size:max(16px,1em)}` in globals.css — one line kills all of them.

### P9. Raw hex off-token — the "page drift" cluster
`#dc2626` (10+ files), `#4ade80`/`#f87171`/`#fbbf24` (recite), `#7fbf6b`/`#d4a843`/`#c96b45` (scroll+misc), `#b34a3a`/`#c9a227`/`#d9762b`/`#3b82f6` (quran-tester), `TIER_COLORS` 7 hexes (workout ×2 files), `#b42318` (profile/admin), `PRAYER_COLORS` incl. `#7c3aed` violet (prayer). Needs tokens + one sweep.

### P10. Ungated `hover:` + unguarded motion
`hover:bg/opacity/scale` ungated by `(hover:hover)` nearly everywhere; `animate-ping`/`animate-pulse`/`scrollIntoView smooth`/rAF pulse with no `prefers-reduced-motion` check (quran-tester listener, dhikr, XRay, mutashabihat, workout dot). Globals has a reduce block — inline `animation:` and JS-driven motion bypass it.

### P11. Letterspaced tiny UPPERCASE labels — the C2 tell everywhere
30+ call sites flagged across auth, scroll, friends, goals, study, recite, workout, quran-tester. It's the codebase's single most-repeated tell.

### P12. States contract broken the same way on most data pages
Loading renders instantly (<300ms flicker or a bare spinner instead of skeleton), empty flashes before fetch, error = missing, offline = missing. The pages that pass: talks empty-kinds, friends offline seed, qibla cache seed, XRay error/metered — copy those patterns.

### P13. Buttons under 24px / icon-only-unlabeled
XRay ✕ (~26px), masjid controls (~22px), library/muscles `←` glyphs, homework card icons (~22px), chat reply buttons, settings chips, workout reorder glyphs (14px).

### P14. Dead controls / promised affordances that don't exist
- "Tap to re-anchor" — tap does nothing (`QuranTesterClient.tsx:1068`)
- GuidedCamera "Go back" never renders (`onCancel` never passed)
- /masjids geofail error written to never-mounted state
- /sirat in-iframe "← Waqt" loads Waqt *inside* the iframe
- /scroll `router.back()` dead end on deep-link
- `no-geolocation` → live button doing nothing (`masjid-finder.tsx:407`)

### P15. `key={index}` on mutable lists
workout set rows, guide quiz options, reveal lists, bookmarks, various maps.

---

## PART 2 — BLOCKERS (fix before anything else)

| # | Finding | File |
|---|---|---|
| B1 | Onboarding quiz gate permanently strands users — 60s re-read loop, no exit | `onboarding/guide-gate.tsx:99,152,178` |
| B2 | Friend delete = zero confirm, zero error path, silent | `FriendsClient.tsx:646` |
| B3 | Progress photos instant-delete sensitive photos — no confirm | `workout/photos/page.tsx:169` |
| B4 | Chat send failure destroys the draft — no announce/retry | `ChatClient.tsx:154,168` |
| B5 | Masjid iqamah times shown against *stale location* prayer times up to 7 days, no stamp | `masjid-finder.tsx:87-147`, `MasjidsClient.tsx:19` |
| B6 | `/terms` skips §6 — numbering 5→7 in a legal doc | `terms/page.tsx` |
| B7 | Store lists fabricated ratings ("4.9★, 24K installs") — invented stats | `app-registry.tsx:271-291` |
| B8 | Dhikr hardcodes Arabic adhkar as a silent content-table fallback — product-law violation | `DhikrCounterClient.tsx:19-52` |
| B9 | Silent Hanafi fiqh fallback on DB error for non-Hanafi users | `learn/page.tsx:26-30` |
| B10 | Subscriptions sums mixed currencies into one "$ total" + projected-payments-as-fact | `SubscriptionsClient.tsx:252` |
| B11 | `/recite` mic stream leaks on unmount | `ReciteCoachClient.tsx` |
| B12 | Onboarding "notification setup" never requests permission | `wizard.tsx:1360` |
| B13 | Prayer check-in = modal → 2nd tap → awaited fetch (not one-tap, not optimistic) | `prayer-checkin-popup.tsx:207` |
| B14 | Goal tree cascade delete — one tap, no confirm/undo | `GoalsTab.tsx:265` |
| B15 | `/admin` auth gate can hang on "Verifying access…" forever; non-401 → wrong redirect | `AdminShell.tsx:58-65` |

---

## PART 3 — PER-ROUTE TOP HITS (rest of the list)

**/ (marketing):** 22-cell identical feature grid; JSON-LD FAQ invisible; duplicate Arabic quote sections; scroll-indicator decoration.
**/support·/terms·/privacy·/cookies·/data-deletion:** Title-Case headings, raw `<a>` not Link, mailto missing, LegalLayout glassmorphism + 36px back + no `<main>`; privacy/support give two different delete-account paths (one is wrong).
**/sirat:** iframe-in-iframe back-button bug (P14); safe-area missing on back link; no iframe-failure state.
**/add-friend:** silent state swaps for AT; error with no Try-again; double-PUT on StrictMode; success never names inviter; post-login pending-invite is a black hole.
**/login·/signup·/verify·/reset:** zero `aria-*` on errors, no blur validation, no field-level errors, no focus-to-error, no caps-lock hint; signup lacks password helper + show/hide; verify says "Link expired" for every failure; `tabIndex=-1` kills keyboard on login show/hide.
**/admin·/admin/login:** URL-less tab state; template dashboard; hand-rolled drawer; "Exit" doesn't sign out; 14px inputs; error invisible to AT.
**/onboarding:** +14 steps (tour duplicates the quiz content); "Boy/Girl" copy for adults; hayd gated on gender not baligh; no Back button (6px dots); Nominatim race; gender auto-advance irreversible.
**/calendar/month:** X-overlay lie + inverted responsive font sizes; no prayer-band; 31 context-free links.
**/calendar/list:** prayer times pinned to week-start only; weekOffset not in URL; empty h1 first paint; 36px chevrons; "with Ahmed, with Fatima" join bug.
**/prayer:** (see blockers/P1/P2) — `PRAYER_COLORS` 5 raw hexes incl. violet; 1s full-dashboard rerender; `/5` excludes excused; qadaa green/red moral dial; sunnah locked after window despite server allowing backfill; no staleness stamp on cached times; league "Log" button silently dead without prayerTimes.
**/settings:** required-field dots hide in collapsed sections; `alert()` in deletion flow; "Advanced" hides danger zone; substring-matched message colors; theme buttons no `aria-pressed`; `/misc`: fake "will retry" offline copy; tabs not in URL.
**/friends:** (B2) + share hint invisible in view mode; share link persists nowhere; import silently drops contacts 26+ and failed POSTs; 3-deep overlays; orbit SVG keyboard-invisible & 9px nodes; `window.confirm` drift; `knownYears` auto-lie for childhood.
**/messages:** offline banner not announced; no error≠offline split; chat: empty-flash on mount, no `role="log"`, send button 40px, `transition-all`, new-below-fold silent, `break-words` insufficient.
**/profile·/[id]:** avatar upload silent failure; assumed-as-prayed; friend-fail loads "Couldn't load *your* profile" forever on salah card; gradients ×2; `#b42318` drift.
**/birthdays:** failed load → fake empty; "This is me" silently steals slot; linked friends still selectable; non-transactional claim race; "today!" exclamation; zodiac questionable domain-fit.
**/goals·/goals/shared:** safeQuery lying empty; shared page error says "revoked" for any failure; non-completable goals counted in denominator; instant spinner; glassmorphism header.
**/homework:** overdue sorted LAST in "Latest", absent in "Type" view; "TODAY" badge on late items; series invisible to client (delete/edit fork one instance); complete-modal is confirm-reflex; "moves to Done" — no Done section; all-done renders first-use empty; hand-rolled dialogs; nested button-in-button.
**/dhikr:** (B8) + `leading-snug` on Arabic; button-in-button; pulse+ripple unguarded; picker chips <24px; counter vertically-centered not thumb-anchored; double haptics; dead `loading` path.
**/qibla:** browser-listener flash before native; degraded compass still looks live; iOS denial reported as "no sensor"; calibration signals (iOS accuracy, Android LOW) dropped; rAF lerp unguarded; stale-needle no detection; dead "accuracy" event channel.
**/names·/nasheeds·/[slug]:** Arabic tracking (P3) + un-normalized search (voweled vs unvoweled); hover on non-clickable rows; fake `role="slider"` no keyboard; invisible playhead on touch; "1 lines"; dishonest offline-save copy.
**/quran (mushaf):** browsed position never persisted — "never lose your place" fails for pure reading; resume gated on engine install; gesture-only page turns (no keyboard); no `setPointerCapture`/axis-lock; `select-none` on verse text (E non-negotiable); `lineHeight:1` + `overflow-hidden` on Arabic; words are onClick spans; long-press suppressed *and* performs nothing.
**/quran-tester:** "Confirm all" rubber-stamps engine guesses; "ayahs read" counts 30%-touched; raw transcript in status line; `micError` never rendered; 8 hand-rolled overlays z-40/50; stock `#3b82f6` blue on the mushaf.
**/recite:** (B11) + one generic mic error; silent <3s take discard; Tab key hijacked (a11y broken); raw hex second palette; sign-colored improvement deltas; `animate-ping` unguarded; error rendered as empty.
**/mutashabihat:** offline = infinite "Loading match…"; `?? 0` rating; "You win!" exclamations; `redirect()` mid-render; staggered fade-up on tool UI.
**/talks:** no real download progress; silent LRU eviction → lying "Offline" badges; no failed-per-item state; resume-position clobbered on track change; resume data loaded-but-unused; 76px card rows; spinner always; offline rendered as error; 14px search inputs; Title Case; gradient artwork.
**/learn:** (B9) + Arabic at 1rem no `lang`; translations cite collection not translator; 14px autofocused search; no deep-link; content in .ts bundle (no content-bank pipeline).
**/guide:** 13-chapter book, no bookmark (brags about resume in own copy); `role=img`+`aria-hidden` contradiction; arrow keys fire behind TOC sheet; two "Friends" chapters; glass bar.
**/study:** ~400 lines hardcoded prose packed with uncited stats; body at 11-13px; S/A/B/C/F "elite/trap" register; accordion state not persisted.
**/masjids:** (B5) + Maghrib silently falls back to user's local adhan rendered as masjid's; `iqamahCheckedAt` deleted from every API response; adhan-table masquerading as iqamah; geofail invisible; map fail strands fullscreen; header controls <24px; map pins not AT-reachable; `hasIqama:true` asserted before check; User-Agent header silently ignored.
**/scroll:** (P4) + fake-0 hero; no staleness stamp; `router.back()`; unlabeled vibes-chart; "streak" celebrating consecutive scroll days; `linear-gradient` hero.
**/store:** (B7) + `router.push` tiles not links; silent PUT failure; glassmorphism; "Hide"/"install"/"cache" = 3 metaphors one boolean.
**/subscriptions:** (B10) + h1 is secretly a dropdown + duplicated select; backdrop discards dirty form; silent cancel/delete failures; user-color fills no on-color; bare "Delete?" no undo; Date-in-module-constant.
**/workout:** muscle-state hidden behind tab; 6-KPI grid above the answer; sign-colored numbers everywhere; no states at all; one-tap delete-profile; F-tier filter → `undefined` color; nested interactives; explain-the-UI legend; slice(0,10) no pagination.
**/workout/active:** glassmorphism sticky header; 2 overlays deep; readiness sheet no explicit dismiss; all inputs <16px; `key={index}`; triple-redundant set counter; `animate-pulse` unguarded; ✕-deletes-session next to Finish; silent `?day=` dead end.
**/workout/photos:** (B3) + no retake in guided flow; shutter dead-ends on scoring fail; raw DOMExceptions to user; no loading state; syncError never shown; photos sync silently with no disclosure; rear camera for self-portraits; `(window).__guidedCapture` global.
**/workout/profile:** save fire-and-forget then routes away (silent data loss); error state no remedy; disabled-submit; "Back" silent no-op; sign-colored gains; hover-only explanations; 5 inputs <16px.
**/workout/library·/muscles:** button-in-button; zero filter-empty; "Show all N" miscounts; 3 different recovery color-ramps; muscles renders "all fresh" pre-load + fail-silent; GLB ungated download; hand-rolled modal+sheet; legend `<i>` elements.
**/workout/xray chrome:** unguarded rAF pulse; cryptic labels ("Show me", "L R T B"); ~24px chips in clipped scroller; fullscreen takeover not a dialog; 3rd copy of recovery ramp.
**/shell:** **no active-nav state anywhere** (no `aria-current`, identical chrome on every tab); skip link doesn't move focus; no h1-focus on route change; tools tiles `router.push` not links; tools drawer no focus trap; homescreen drag keyboard-inaccessible; `offline-banner.tsx` dead code (latent D3 regression); triple-click forced-offline toggle is invisible; `not-found` sends auth users to marketing.
**/sirat app internals:** addAll precache fails wholesale on icon 404.

**/calendar/day:** (see P1/P2) — event blocks are `div onClick` (primary objects keyboard-invisible); check-in pills are ~20px hit targets AND sit above events intercepting taps (interaction-layer band-blocks-events); no tap-to-add on the grid (spec's own deliverable); reminder delete is hover-only + skips confirm; no empty-day state; no double-submit on Add; hand-rolled dialogs no Escape/focus; goals pill uses error-red as shame gradient; nested `role="button"` in `role="button"`; 3 off-token rainbow palettes (REMINDER/VIA/EVENT_COLORS — title-hash colors); `hover:scale-105` on FABs; no "now" anchoring — collapsed grid opens at 5 AM; no relative times.
**/friend-share/[token]:** **PII leak confirmed & worse than flagged** — owner's private `notes`, `metDetail`, `phone`, birthday, avatar + 12 photos to anyone with the link, created in ONE tap with zero scope disclosure. `notFound()` for revoked tokens vs `ShareLinkExpired` elsewhere; friend lookup not owner-scoped; dead-end landing (no "Go to Waqt"); ~1-3MB base64 payload.
**/user/[name]/[token] + /user/public/[token]:** legacy routes render "expired" for links that still work — lying error (comment claims a DB check never written); soft-404s + no noindex.
**/goals/shared + /[name]/[code]/public:** `setError(null)` wipes the 404 error in the same tick — **the error can never render** (`PublicCalendarClient.tsx:306`); non-404 failures → "No events scheduled" (load-failure as empty); Arabic-only displayName → `//CODE/public` broken redirect; month fetch silent `// ignore`; soft-404s; `REMINDER_COLORS` raw hexes.

---

## PART 4 — WHAT'S ACTUALLY GOOD (keep these, copy them)

- **Account deletion flow** (settings) — named object, verb button, cancel-first, typed confirm, 5h grace countdown. The model destructive pattern.
- **SW outbox + Dexie + cache seeds** — the honest-offline plumbing is real; the *UI surfaces* are what lag it.
- **Prayer post-midnight Isha attribution, makruh-aware countdown, hayd excused flow** — domain-correct work.
- **Quran-tester confidence honesty** — flags-not-verdicts, human-confirm-before-save. Right model; the "Confirm all" button is the one leak.
- **XRay camera-denied copy + metered gate, sirat data-diff self-reload, friends offline seed + optimistic-revert, talks empty-kinds, subscription saveForm offline path, mushaf `warmMushaf` metered/resumable** — copy these.
- **Onboarding draft persistence (uid-scoped), messages visualViewport keyboard handling, dhikr auto-advance-with-cancel, guide TOC `aria-current`** — done right.

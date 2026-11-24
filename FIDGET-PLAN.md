# Fidget — Full UI Plan (locked)

A mobile + desktop app that is a **drawer of tactile toys** — all 57
finktheartist controls across 7 worlds, each a standalone fidget. Elements
are custom elements, zero deps, MIT — sounds and most art inlined, with
sibling-asset fetches covered in §7 (they are NOT fully self-contained).
**Offline by construction. Free. No permissions, not even INTERNET.**

---

## 0. Product frame

Three surfaces only:

1. **Shelf** — the toy box. Scroll of world sections; each world is a
   distinct visual neighborhood. Cards are stills, not live canvases.
2. **Toy** — one element, full surface, sound on. The loop is the point.
3. **Settings sheet** — Sound · Haptics · Reduce motion · Keep awake · About.

Navigation: stack — `shelf → /toy/<world>/<piece>` → back (restores scroll).
No tabs; the app is too small for them.

---

## 1. Layout systems — mobile & desktop

### Mobile (portrait, 320–480px) — primary
- Shelf: vertical scroll of **world sections**. Each section = world title
  row (name + piece count + "world tint" swatch) then a **horizontal
  snap-scroll row** of toy cards — Netflix-shelf, not a 57-icon grid.
- Card size: **148 × 148dp** (≈2.5 visible per row → signals "more sideways").
  Rounded 20dp, world-tinted background, piece still + name strip.
- "Your shelf" pinned row appears at top once ≥1 pin exists (long-press).
- Toy screen: element centered in safe area, sized so its primary touch
  target is ≥96dp and everything interactive lands inside the reachable
  thumb zone (lower 75% of screen). Chrome: name+dot top-left (44dp tap
  targets), ✕ top-right.
- Sound/world ambience fills the screen behind the element — the element
  sits on the world's own backdrop, not on a neutral card.

### Desktop (≥768px) — same app, wider shelf
- Shelf: world sections stay, but each row shows **all pieces of the world**
  in a real grid (4–6 columns, `repeat(auto-fill, minmax(180px,1fr))`),
  no horizontal scroll. Max content width 1200px, centered.
- Cards get hover: subtle lift + a 1-frame→loop micro-preview **only for
  hovered card** (pointer devices only — never render 57 canvases).
- Toy screen: the element is centered on a **stage** — max 720px wide,
  world-tinted vignette filling the rest (radial fade to the world bg
  color, not a bare letterbox). Mouse gets the same interactions; keyboard
  works because the elements are real controls underneath.
- Desktop-specific affordance: arrow keys ←/→ move between toys in the
  same world (desktop users expect it; mobile doesn't need it).
- Settings becomes a centered dialog instead of a bottom sheet.

### Shared rules
- `overflow-x: clip` on root; every grid uses `minmax(0,1fr)`; no fixed-px
  layouts — `clamp()` everywhere; safe-area insets on all four sides.
- World tinting: status bar (mobile) + nav bar + `--bg` swap to the world's
  palette while inside it; restoring shelf neutral on pop.
- Reduce motion: hover previews off, ambient drivers off, toys that are
  pure canvas (sand/pixel/pinball ball) swap to a still + pointer feedback.

---

## 2. World sections — each with its own neighborhood

Worlds keep their own palettes/textures on the shelf so the box feels like
seven little dioramas, not one skinned list. Row header: small world wordmark
(set in the world's own type vibe via CSS only — no fonts beyond the two we
ship) + count + tint dot.

| # | World | Shelf treatment | Pieces |
|---|---|---|---|
| 1 | **Pinball** | cream field, teal painted wood edge, amber glow tint; cards feel like inserts | 7 |
| 2 | **Paradise OS** | pale stone, bevelled window frames on cards, pink→teal hairline | 7 |
| 3 | **Zen Sand** | dark walnut frame band, sand-colored cards, minimal type | 4 |
| 4 | **Pixel Worlds** | near-black, pixel-edge card corners (stepped border via box-shadow), slate-blue tint | 6 |
| 5 | **Rubber Hose** | paper-cream + ink black cards, title-card ornament line, film-grain texture | 11 |
| 6 | **Sakuga** | white paper, violet hairline cards, pink accent dot | 11 |
| 7 | **Cockpit** | black panels, hazard-stripe hairline on header, phosphor-green tint | 11 |

Row order = that table (most instantly gratifying first — Pinball leads).

### Toy card anatomy (all worlds)
- Still frame of the piece (grabbed from each repo's gallery art or a
  captured frame at vendor time — stored per piece, ~30KB webp).
- Name strip: piece title, 12px, world ink color. **No value readouts,
  no state text** — pure feel everywhere.
- Pin state: tiny pushpin glyph top-right corner, only when pinned.
- Tap → toy screen. Long-press (mobile) / right-click (desktop) → pin/unpin.

---

## 3. Toy screens — per world

Every toy screen: element centered on the world's backdrop, name + dot
top-left, ✕ top-right, all element sounds ON, haptic mapped. Nothing else
on screen — ever.

### `pinball` — electromechanical (7)
Backdrop: cream playfield + faint wood edge; amber lamp vignette.
- **bumper** — the pure fidget. Three-bumper cluster + ball ricochet, EM
  chimes on every hit. Haptic: Heavy per pop. Scores hidden.
- **plunger** — pull back, release = ball launched; auto-reload ~900ms.
  Haptic ramps while pulling, snap on release.
- **toggle** — ball kicked across, wall clack, lamp lights. Medium haptic.
- **slider** — ball rolls past ten lamps; lamp-tick haptics per lamp.
- **stepper** — flippers roll score drums; Light tick per drum digit.
- **targets** — 1–4 drop targets, all four = bonus flash + chime.
- **drain** — drain the ball, "SHOOT AGAIN" undo blink, auto-refill after.

### `paradise` — 1995 that never happened (7)
Backdrop: pale stone + soft window shadow; sounds = chimes, water, plastic.
- **cd-dial** — HERO. Spin the holo CD; detent click + haptic Light per
  track; hub tap play/pause (real audio — the trk-01..05 mp3s are inlined).
- **eq** — paint curves in pool water; water sloshes after finger; soft
  tone optional per band (kept subtle).
- **slider** — flood the pool; overflows past 85%.
- **button** — error dialog cascade; hold = hypercube burst.
- **toggle** — drains every Paradise element on screen to wireframe and
  back — on the toy screen it drains just itself (kept honest).
- **tabs** — three floating CRTs channel-swap.
- **agent-status** — marble bust; tap + 8s idle cycles think/search/write/
  done. The ambient desk toy.

### `zen-sand` — simulated sand + recorded scrape (4)
Backdrop: walnut frame, top-down sand tray, warm side-light.
- **slider** — HERO. Bamboo rake drags four grooves; pull back flattens.
  Real scrape audio + light tick haptics at groove starts.
- **signature** — freehand stick strokes; swipe-fast clear → blank tray.
- **thinking** — auto-rake loops; tap = new line. Zen screensaver.
- **toggle** — river stone glides, pressed symbol revealed, stone-set-down
  thump.

### `pixel` — living pixel scenes (6)
Backdrop: near-black, the scene glows inside the control.
- **hoard** — hold: dragon fire IS the fill. Ramp haptic while holding.
- **keep** — keyboard up on tap; each key builds the castle.
- **raven** — send = raven flight; re-arms for the next flight.
- **sage** — wizard cycles states on tap/idle — ambient.
- **round** — cups drain as bar fills; auto-loop driver.
- **sigil** — hold to charge runes; 100% = the reveal, then re-arm.

### `hose` — 1930s cartoon characters (11)
Backdrop: paper cream + film grain + ink frame.
All sounds kept: BOP!, TOOT!, SPLAT!, POP!, DING!, TWEET!, PHEW!.
- **button** (mash; he springs back bandaged) · **toggle** (taffy bulb) ·
  **slider** (trombone; fast pull = TOOT) · **checkbox** (slaps own tick) ·
  **radio** (wake the sleeper) · **input** (pen hops + ink flicks per key) ·
  **tabs** (kicking folder legs) · **progress** (hold-to-fill, PHEW! at 100) ·
  **rating** (chorus-line stars) · **toast** (slice pops, re-arms) ·
  **tooltip** (bird tows hint, re-arms).

### `sakuga` — key-frame anime VFX (11)
Backdrop: white paper + violet hairline; all manga SFX lettering + puffs
kept (ドン! カチッ ズザッ ゴゴゴゴ ポン).
- **button** (squash + impact burst) · **toggle** (43 painted frames, flood
  settle) · **slider** (teardrop thumb, cumulus, crescent) · **checkbox**
  (crescents + crystals) · **radio** (wedge fan + ポン) · **input** (dust
  per keystroke) · **tabs** (stretch-and-land) · **progress** (hold-to-fill:
  storm cloud rides the edge, ゴゴゴゴ → ドン!) · **rating** (stars pop; 5 =
  burst) · **toast** · **tooltip**.

### `cockpit` — 90s mecha (11)
Backdrop: black panel bay, phosphor green; SFX = relays, klaxons, voices.
- **launch** — HERO. Lift guard → hold red → lamps count up → robot
  launches; guard drops and re-arms for the next launch. Ramp rumble on
  hold, Heavy on launch.
- **dial** — turn gain; lamp ring, screen green→red, pilot cut-in at 100.
- **checklist** — tick all four = deck crew wave-off; resets after a beat.
- **lock** — clamps release one-by-one, last blows restraints → re-seats.
- **mode** — four lit keys; combat = fist cut-in.
- **alert** — three alarm levels + acknowledge bar.
- **tabs** — monitor static-switch; rear-cam easter egg intact.
- **agent** — robot hologram state cycles (ambient).
- **loading** — auto-fill loop; visor lights at 100.
- **stepper** — mm:ss; at 5:00 power cable ejects.
- **input** — type callsign → bridge answers (keyboard kept).

---

## 4. Sound spec (all kept)

- Every element's inlined audio plays — EM relays, sand scrape, manga
  lettering, chimes, klaxons. It IS the product.
- Master toggle in Settings (persisted). Default ON.
- First-gesture unlock: AudioContext resumes on the first pointerdown
  anywhere — standard WebView policy; first tap may animate-before-sound,
  acceptable.
- Volume: leave to device volume; no in-app mixer (lazy senior choice —
  one switch, not a panel).
- Desktop + mobile identical behavior.

## 5. Haptics map (mobile; desktop ignores)

detent tick (dial lamps, score drums, rake grooves) → `impact Light` ≤60ms
throttle · bumper pop/BOP/wall clack → `impact Heavy` · toggle throw/target
drop/clamp → `impact Medium` · hold-charge (launch/dragon/storm) → vibrate
ramped to fill % · completion (launch!, 100%, bonus) → `notification Success`
· drain/error → `notification Error`.

## 6. Settings

Bottom sheet (mobile) / centered dialog (desktop):
Sound · Haptics · Reduce motion · Keep screen awake · About (MIT credits for
the 7 collections + app version). All prefs in localStorage, applied live.

## 7. Repo layout & build order (unchanged)

`fidget/` in the MyWaqt repo — Vite + vanilla TS + Capacitor
(`app.waqt.fidget`). Vendoring correction (research finding): elements go in
**`public/toys/<world>/<piece>/`** with sibling `art/`/`audio/`/`sounds/`
dirs preserved, loaded via `import("/toys/pinball/bumper.js")` — they are
NOT bundler imports, because `import.meta.url` must stay the public URL or
relative assets 404 (`cd-dial` fetches mp3s, pinball resolves `art/*.webp`,
zen-sand fetches `sounds/*.wav`). `cd-dial` gets `tracks=` set explicitly.
PWA precache for browser installs, zero-permission manifest, world-tinted
edge-to-edge chrome, portrait on phones.

1. Skeleton + router + Capacitor → debug APK.
2. **Vertical slice: pinball** end-to-end → real-device checkpoint
   (WebGL + audio + haptics).
3. Remaining worlds in order: hose, sakuga, paradise, zen-sand, pixel, cockpit.
4. Strip pass (hide readouts) + still-frame card art.
5. Favorites, settings, reduce-motion, wakelock.
6. Icon/splash, signed release, PWA manifest.

## 8. Shim & driver strategy (research-verified — elements are scriptable)

Ordered ladder — most pieces need only step 1–2:

1. **The element's own API**: `launch.reset()`, `lock.checked=`,
   `round.demo()` (built-in loop — no driver needed), `statue.simulateRun()`,
   `sigil` ambient-with-no-value + `set(v)` + `fail()`, `sage`/`thinking`/
   `agent`/`agent-status` = `state` setter cycled on tap + 8s idle.
2. **Events to hook**: `send`, `delete`/`undo`/`commit` (drain → on `commit`,
   back to 'ready'), `cockpit:launch`, `change`, `input`, `track-change`.
3. **Universal fallback — recreate the node**: `el.replaceWith(fresh)`
   resets any internal state; cheap at tap cadence. Makes every tier-2
   piece shim-able with zero internal patching.
4. **Card stills generate themselves**: pieces support `?film=1&seek=X`
   (frame-stepped scripted take) + `?zoom=2` — vendor script renders each
   demo page headless at its best moment → `card.webp`. No manual shots.
5. `?embed=1` strips each demo page's own chrome — reference for bare look.

## 9. Risks → mitigations (deep-research findings)

1. **Runtime asset fetches** — covered in §7 (public/-served, not bundled).
2. **WebGL context ceiling** — Chromium caps ~16 live contexts and kills the
   LRU one silently; Android WebView can also drop a context under memory
   pressure (Chromium issue 540886013). Mitigations: one toy alive at a time
   (dispose on pop — already in plan), listen for `webglcontextlost` →
   remount, reduce-motion avoids canvas entirely on weak devices.
3. **Audio autoplay** — Android WebView's `mediaPlaybackRequiresUserGesture`
   defaults true and Capacitor doesn't expose it. Mitigation: one global
   `pointerdown` → `AudioContext.resume()`; every toy interaction is a
   gesture anyway. First sound on a fresh app opens may lag one touch —
   accepted, documented.
4. **Long-press triggers native text selection/callout** — known WebView
   issue (capacitor#5042). CSS alone is unreliable here. **Best fix —
   native one-liner**: `webView.setOnLongClickListener { true }` in
   `MainActivity.onCreate` (eats the callout at the platform level; CSS
   `user-select:none`/`touch-callout:none`/`tap-highlight:transparent`
   stays as belt-and-suspenders). Pin detection = our own touchstart
   timer, so nothing native can intercept.
5. **Overscroll edge-glow/stretch** — Android 12+ bounce can't be fully
   killed (capacitor#5384). Mitigation: `overscroll-behavior:none` +
   `touch-action:pan-y` on shelf; toy stage uses `touch-action:none` so
   drags never scroll or edge-bounce.
6. **Keyboard resize for input toys** (keep/callsign/hose-input/sakuga-input)
   — WebView `adjustResize` + `visualViewport` is unreliable. Fix:
   `@capacitor/keyboard` `Keyboard.setResizeMode({ mode: ResizeMode.Native })`
   — native pan, no layout crush; input-toy screens also reserve bottom
   space and `Keyboard.setAccessoryBarVisible({ isVisible: false })` where
   supported.
7. **Keep-awake** — `@capacitor-community/keep-awake` (`KeepAwake.keepAwake()/
   allowSleep()`), settings-gated. Also flag the toy WebView window
   `FLAG_KEEP_SCREEN_ON` only while a toy screen is open — cheaper than a
   global hold.
8. **Edge-to-edge bars** — `@capawesome/capacitor-android-edge-to-edge-support`
   (`EdgeToEdge.setBackgroundColor({ color })` per world tint; already
   proven in MyWaqt's APK).
9. **Back gesture** — `@capacitor/app` `App.addListener('backButton')` →
   pops our stack (toy → shelf → exit), not WebView default.
10. **Plugins (final list, all battle-tested or official)**:
    `@capacitor/haptics` (impact/notification/vibrate — already in MyWaqt),
    `@capacitor/keyboard`, `@capacitor/app`, `@capacitor-community/keep-awake`,
    `capawesome edge-to-edge`. No others needed.
10. **APK payload** — repos are ~40MB with galleries; elements+assets only
    ≈25MB. Fine for AAB. Lazy per-world fetch not needed — it's bundled.
11. **iOS later** — `100dvh`/`fill-available` heights, rubber-band via
    `overscroll-behavior`, audio unlock identical.
12. **MIT** — attribution in About + `ATTRIBUTION.md`.

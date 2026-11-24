# Sigil

A loading spinner that is a summoning circle cut into a slate-blue stone floor, with a will-o'-wisp as its one moving light. With no value, the wisp circles the ring on its own. A cool, even ambient keeps the whole circle readable, and the wisp adds a teal pool of light: the grooves catch it and throw shadows, and a comet of ring and runes ignites and cools behind it. Give it a value and it is a different thing: the wisp stops circling and becomes the head of an arc that fills clockwise from the top, with the runes charging behind it. If the value stands still, the wisp waits, breathing, and sends rings out across the stone, so a stall looks like waiting and not like a hang. At 100% the ring closes, the wisp dives into the middle and draws the star, everything dims for a breath, and then the floor blasts light. A hooded, horned figure climbs out of it and takes the light in its cupped hands. Then it is quiet, and still a little alive. If the task fails instead, `el.fail()` makes the wisp turn ember, fall, stutter and go out.

One of six in this repo. Same idea in each (the control's value changes a pixel world), different control: this one is a spinner you can drop in next to a button or in a card. It is a middle-toned slate disc with a dark outline and a pale bevel, and that is what lets it read on a light page and on a dark one. It is the lighter look of the first version of this component, with everything the later versions added kept. The near-black, wisp-only version is in the history (commit `13b8038`).

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/sigil/
```

Two files: `sigil.js` is the component and `index.html` is a page that shows it. Vanilla JS and Canvas2D, no dependencies, no network requests, no sound.

The page plays a made-up task on a loop: three seconds with no number (a plain spinner), then a load with a stall of nearly three seconds in the middle, then the answer, then it holds the finished state and starts again. It shows the spinner twice: at twice its own size, and at its own size in a card beside a button.

- `?p=0.4` holds it at 40%, `?p=spin` is a plain spinner, `?p=1` is the settled answer, and `?p=fail` is a failed task.
- `?embed=1` hides the heading and the hint, for showing it inside another page. The gallery uses it.
- `?film=1` stops the clock and steps the task one frame at a time (17.5 seconds, see **A clip**), and `&seek=9.5` jumps to a moment in it.
- `?bg=dark` shows the same page on a dark ground, for checking the spinner there.
- `?zoom=2` doubles the page, for recording. It hides the heading and the hint and centres the spinner and the card.

## Use it

`sigil.js` is the whole component: one file, no dependencies. Copy it into a project and:

```html
<script src="sigil.js"></script>
<sigil-spinner label="Loading the map"></sigil-spinner>
```

```js
const el = document.querySelector('sigil-spinner');
el.set(0.37);       // the task's progress, 0 to 1, as often as you like
el.set(1);          // finished: the circle flares and something answers
el.set(null);       // back to a plain spinner
el.addEventListener('sigil:done', () => { /* the circle has been answered */ });
el.fail();          // the task failed: the wisp goes out. It will not take a value after this
el.addEventListener('sigil:fail', () => { /* it has failed */ });
el.reset();         // clear the done or failed state and go back to a plain spinner
el.value;           // the progress it is showing, 1 once done, or null while it only spins
el.done;            // true once it has fired
el.failed;          // true once fail() has been called
el.stalled;         // true while a value has stood still for about a second and the wisp is waiting
```

| attribute | what it sets | default |
|---|---|---|
| `value` | progress, 0 to 1. Without a number it is a plain spinner. | not set |
| `label` | what a screen reader calls it | Loading |
| `done-label` | what a screen reader is told when it finishes | Done |
| `fail-label` | what a screen reader is told when it fails | Failed |

- **No value is a spinner, a value is a progress ring.** `value` and `set()` do the same thing. `set()` does not write the attribute. A value that is not a number is a plain spinner.
- **It eases toward the number.** A jump from 10% to 60% is walked, at a fixed speed, so each rune gets its turn. `el.set(0.4, true)` goes straight there. `el.set(1, true)` goes straight to the settled answer.
- **`sigil:done` fires once,** when the circle reaches 100% on screen, which is a moment after you set 1. It bubbles. A plain spinner never fires it.
- **Once done or failed, it stays that way** until `reset()`, whatever `value` says. `reset()` also removes the `value` attribute. `fail()` after it is done does nothing.
- **A value changes what the wisp is.** With no value it circles on its own. With one it is the head of the arc and goes only as far as the value, at a fixed speed, so a jump is a quick run along the ring. At 0 it waits at the top. Setting a value is what tells the spinner and the progress ring apart, so do not set one you do not have.
- **A stall is shown, not hidden.** If a value has not moved by more than 0.4% for about a second (slow steady progress is not a stall), the wisp stays where it is, dims and brightens every two seconds, drifts in a small circle, and sends thin rings out across the stone. The rune it is waiting on beats and more sparks come off it. `el.stalled` is true while that is showing. When the value moves it runs on again with a tail.
- **Size:** 97 by 97 CSS pixels, round, with clear corners, and it sits inline (`vertical-align: middle`). Set a CSS width on the element to resize it; it stays square. A multiple of 97 (97, 194, 291) keeps the art pixels even. The demo page uses 97 in the card and 194 for the big one. Below 97 the element switches to smooth scaling, so it is soft and not jagged, but the fine detail (the ticks, the horns) goes.
- **Not interactive.** It is not a button and has no tab stop. Inside is a `role="progressbar"` with `aria-label`, `aria-valuemin` and `aria-valuemax`. `aria-valuenow` is there only while there is a value, so a plain spinner reads as indeterminate. When it finishes or fails, `aria-busy` goes false and the done or fail label is written to a `role="status"` element.
- **Reduced motion.** With `prefers-reduced-motion: reduce` the wisp goes round at a third of the speed, the dim before the blast and the blast itself are cut to a third, and no sparks are thrown. The stall rings, the dust and the finished state's small movements stay.
- **More than one on a page works.** They share one painter and one animation loop. Each starts the wisp at a different place.

To step it from a script, the way the film does:

```js
const Sigil = customElements.get('sigil-spinner');
Sigil.paused = true;      // stop the clock
el.set(0.5);
el.advance(1 / 60);       // one frame on
el.advance(0.5);          // half a second on
```

## What happens

| it is | you see |
|---|---|
| a plain spinner | the wisp goes round once every 1.6 seconds with a tail of the places it has just been and sparks that come off it. A comet of the outer ring and of the runes ignites behind it and cools. Nothing stays lit, and nothing is anchored |
| at 0% | the wisp waits at the top, breathing, with rings going out from it |
| at 40% | a gauge arc runs along the outer ring from the top to the wisp, and the first six runes are charged and the seventh half charged. The wisp is the head of the arc and brightens the part nearest it |
| moving | the wisp runs ahead with a tail, as fast as it can go along the ring, and the arc and the runes follow |
| stalled | the wisp holds still, breathes, drifts in a small circle and sends rings out. The arc and the runes stay as they were. The rune it is waiting on beats |
| failed | the wisp turns ember and flares, one dull ring goes out, then it falls to the floor, stutters and burns down to a coal. The stone cracks: a seam of glowing ember runs rim to rim across the floor with two branches, and the stone round it is charred. The outer ring and all sixteen runes stay lit as dim ember (the way the arc had got to is a little brighter), and the star is faint. It does not fade to black: it is a cracked, smouldering circle that reads as failed on a light page or a dark one. A slow wave runs along the crack and sparks lift off it |
| 100% | the ring closes and flashes, and the runes flash round in turn |
| the answer | the wisp dives to the middle in a spiral, and the five strokes of the star are drawn behind it. Everything dims for a breath. Then the blast: the floor floods with bright teal light, two rings of light go out, a pillar of light goes up and sparks are thrown out and fall. The star, the runes and the rings stay visible through all of it, and it never goes white. The figure climbs out of the floor through the light, its eyes opening white and then ember, and the wisp drifts down to its cupped hands |
| finished | the runes and the star bank down to a slow glow that breathes. The wisp bobs in the figure's hands and the shadows move with it. The figure's cloak sways, it blinks and looks down at the wisp, embers lift off its hem, low mist drifts through the light and dust catches it |

The charged runes and the arc come from one number, the progress, so they cannot drift apart from the percentage. The wisp's flicker, the sparks, the dust and the finished state's movement run on the clock.

## How it's built

- **A height map, lit per pixel.** The stone is baked once as a height map (flagstones laid in running bond, each a little domed, with joints, cracks and pits, a raised lip round the edge, then the circle cut into it), an albedo, a shine and the normals. Every frame the wisp is put on it as one point light: soft falloff, a sharp edge on each groove on the side that faces it, a short shadow behind each groove and lip, and a glint on damp stone. This is why the floor changes as the wisp passes. The ambient is a flat cool light that brings the stone up to a mid slate everywhere, so the rings, the star and the runes always show as grooves, and the wisp makes them catch the light and cast shadows as it goes by.
- **One moving light.** The only light that moves is the wisp, and everything that glows does so by itself and lights nothing: charged runes, the arc, the star, the crack and the eyes. Charged runes are brightest near the wisp and bleed a little into the stone round them. Dust motes show only where the wisp's light catches them. The figure has its own darker ambient, so it stays a dark shape against the lighter floor. The ambient dips for the breath before the blast and while it fails, so those two moments are still the dark ones.
- **The gauge and the star.** The outer ring and the five strokes of the star are baked as their own masks. The ring fills as a glowing arc up to the wisp (or leaves a comet behind it in a plain spin), and in the answer the strokes ignite one at a time as the wisp passes. Like the runes, they glow in their own grooves and light nothing.
- **The flare keeps its colour.** The blast adds light to the floor, but the tone curve that normally lets each colour channel go to white on its own is switched to one that keeps the hue while the flare is on, and the star, runes and ring flash harder than the floor does. So the blast is bright teal with sharp lines in it, not a white wash. Measured over the blast in the take on the lighter stone: at most about 5% of the disc is near-white (the calm frames either side are 1.6 to 2%, and it never goes over 15%), the edge detail of the picture stays at 18.5 or more all the way through, and the mean brightness peaks at about 108 against 87 to 95 either side. The breath before it drops to about 26.
- **The crack** is a baked mask of a jagged run with two branches. It is only drawn in the failed state, as a glowing seam with charred stone round it.
- **The circle.** Two rings with a dial of 48 ticks between them, sixteen runes (a few straight strokes each, turned to stand out from the ring and made up, so none is a letter), an inner ring, a five-pointed star with a ring at each point, and a well in the middle.
- **The figure** is painted once at 36×40, smooth: a hooded cloak, two long horns, a face that is a dark hollow, and both arms brought forward with the hands cupped. Its height comes from its own outline, so the wisp finds its edges and folds. It is lit by the same light as the floor. It rises through a line at its hem, so whatever is below the floor is not drawn and nothing is scaled.
- **Crush.** The lit frame is mapped to one of 51 colours with a 4×4 ordered dither, then drawn at 4 canvas pixels to each art pixel so it is exact at 1x, 2x and 3x screens. The corners are clear.

It cost about 1 ms a frame in headless Chrome, in every state (a little more while it waits, for the rings, and about 1.5 ms once it has failed, for the crack). Six of them on one page ran at 60 fps there.

## Limits

- **One size, one look.** There is no light-theme variant. A failure is one look, the same for every kind of error, and it does not say why. Show the reason next to it. The failed disc is dark with ember on it, so it stands out on a light page and on a dark one, and it is the only state that is warm.
- **It is mid-toned, and that is a compromise.** The slate is dark enough that the glowing parts read against it, and light enough that the disc, with its dark outline and pale bevel, holds its edge on a dark page. It is not a light disc: on a very light page it is a dark-ish coin, and on a very dark page it is a lighter one. The wisp pool, the blast and the stall rings have less contrast on the lighter stone than they did when it was near-black.
- **No text.** There is no percentage drawn in it. The page around it can say one.
- **The weak frames.** The blast is bright but less of a punch than a white flash would be, and for about a tenth of a second the middle of the floor is a flat pale teal with the star on it. The breath in before it dims the whole disc, and on a dark page the disc is faint for a moment. The crack flashes pale for a moment as it opens. Below 97 pixels the fine detail goes, including the thinner branches of the crack.
- **The figure is front-on over a top-down floor.** It stands on the circle rather than rising out of the plane of it.
- **Going backwards is plain.** If the value falls, the runes go out in reverse. If it goes back to no value, the wisp crosses the floor and the charged runes cool as its tail takes over.
- **The reduced-motion setting is a cut, not a redesign.** It is slower and less bright, and not still.
- **Checked in headless Chrome only.** Read frame by frame (look.mjs), counted frame by frame for repeats, and run at real speed for a few seconds to count frames. Not tried in Safari or Firefox, on a touch screen, or with a screen reader. There is nothing to press, so there was no pointer or keyboard behaviour to test; it has no tab stop. The clip has been rendered and its frames read, and nobody has watched it play.
- **Not on npm, and not a module.** It is a plain script that registers the element when it loads.

## A clip

`?film=1` stops the clock and steps the task one frame at a time, which is what the capture script needs. It is 17.5 seconds, and it is the same task the page plays on a loop:

| seconds | what happens |
|---|---|
| 0 to 3 | no value: a plain spinner, the wisp going round and the comet fading behind it |
| 3 | a value of 0 is set: the wisp crosses the floor to the top and the arc begins |
| 3 to 4.6 | progress climbs to 42%, the arc and the runes filling behind the wisp |
| 4.6 to 7.4 | the value does not move. The rings start about a second in (5.7) and stop when it moves again |
| 7.4 to 8.9 | it runs on to 70%, 90%, then 100% |
| 8.9 | the value reaches 100% and `sigil:done` fires: the ring closes and the runes flash round |
| 9.4 to 10.1 | the wisp dives and the star is drawn |
| 10.1 to 10.3 | everything dims |
| 10.3 | the blast, two rings of light, sparks and a pillar |
| 10.5 to 12.8 | the figure climbs out and the wisp comes down to its hands |
| 13.4 to 17.5 | the finished state: quiet, with the sway, the blink, the embers, the mist and the breathing runes |

The take includes the card beside the spinner, with its text changing as the value does. To record it to a 1080 square at 30 frames a second (needs Node 22, Chrome and ffmpeg):

```sh
python3 -m http.server 8000     # from the repo folder
CHROME=/usr/bin/chromium W=1080 H=1080 FPS=30 SCALE=1 URL='http://localhost:8000/sigil/?film=1&zoom=2' OUT=film/sigil.mp4 node film/render.mjs
```

Add `&bg=dark` to the URL to record it on a dark page. `zoom=2` is what makes the pixels even: each art pixel is 4 video pixels. On a Mac leave `CHROME` off. The 17.5 seconds took about 30 seconds to render. The clip itself is not in the repo.

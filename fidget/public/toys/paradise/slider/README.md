# Pool slider

A range slider drawn as a glazed pink-tiled pool with a black and white checkerboard floor. The value is how much water is in it. Drag the chrome ball along the pool and the water follows it, a small shallow-water simulation, so a quick drag throws a wave down the pool and it slops back. Quarter marks ping as you pass them. Past 85% the pool overflows: the readout turns to OVERFLOW and spray comes over the edge.

Swap the ball for a chrome dolphin with `thumb="dolphin"`: flick it fast and it breaches out of the water and splashes back.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/slider/
```

`?embed=1` shows the control alone, without its window.

## Use it

`slider.js` is the whole component: one file of about 554 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 560 × 225 pixels.

```html
<script src="slider.js"></script>
<paradise-pool-slider value="62"></paradise-pool-slider>
```

```js
const el = document.querySelector('paradise-pool-slider');
el.addEventListener('input', () => setLevel(el.value));    // while it moves
el.addEventListener('change', () => save(el.value));        // when it is let go
el.value = 20;        // from code it floods or drains there
el.splash();          // a splash at the ball
```

| attribute | what it sets | default |
|---|---|---|
| `value` | how full, from `min` to `max` | 62 |
| `min`, `max` | like a range input's | 0, 100 |
| `thumb` | `sphere` (a chrome ball) or `dolphin` | sphere |
| `name` | sent with its form |  |

- **Keys:** arrow keys step it, Home and End go to the ends.
- **`el.regime`** says `dry`, `flooded` or `overflow`, and the `pool` event reports it as it changes.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| press | the ball jumps to your finger with a plop |
| drag | the water floods or drains after it in waves; a quarter mark pings as you pass |
| flick fast | a wave runs the length of the pool and slops back; the dolphin breaches |
| past 85% | it overflows: spray over the rim and an OVERFLOW badge |
| let go | ripples spread from the ball and the water settles |

## Limits

- **Wide.** It is 560 pixels across, which does not fit a phone in portrait; scale it down there.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

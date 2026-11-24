# CRT tabs

Three photographed beige CRT monitors hang in the air on cables, at staggered heights, swaying a little. They are tabs: one is on at a time. Click another and the old one collapses to a bright dot and goes dark while the new one powers up to its channel: 01 POOL, 02 SUNSET or 03 AQUARIUM, where a goldfish follows your cursor.

Double-click a monitor (or press D) to degauss it: the picture bends through rainbow colours and settles with a thunk.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/tabs/
```

`?embed=1` shows the control alone, without its window.

## Use it

`tabs.js` is the whole component: one file of about 467 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 499 × 266 pixels.

```html
<script src="tabs.js"></script>
<paradise-crt-tabs value="1"></paradise-crt-tabs>
```

```js
const el = document.querySelector('paradise-crt-tabs');
el.addEventListener('change', (e) => show(e.detail.channel));   // 0, 1 or 2
el.select(2);         // switch from code
el.degauss();         // the rainbow wobble
el.glitchSnow(0.9);   // a burst of static
```

| attribute | what it sets | default |
|---|---|---|
| `value` | which monitor is on: 0, 1 or 2 | 0 |

- **Each monitor is a real `role="tab"` button,** so it takes focus; left and right arrows move between them and D degausses.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| click a monitor | the old one collapses to a dot; the new one powers on with a clunk and a fizz of static |
| hover the aquarium | the goldfish swims toward your pointer |
| double-click | it degausses: the picture bends through colour and settles |
| idle | the monitors sway on their cables |

## Limits

- **Three channels, fixed.** The pictures (pool, sunset, aquarium) are drawn in; you cannot give it your own yet.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

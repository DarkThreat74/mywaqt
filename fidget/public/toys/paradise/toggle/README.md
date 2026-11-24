# Dream toggle

An on/off switch set in a tiny dialog window titled PARADISE.SYS. On, its track is sunlit pool water. Drag the knob and it resists, tightening toward the halfway point, and water leaks across the gap before the switch gives and snaps over. A click flips it straight away.

It is also the page's reality switch. Turn it off and every Paradise control on the page drains to grey wireframe (REALITY.SYS); turn it back on and the colour floods back. It has three states for when it should not be changed: `busy` shakes it, `locked` bounces it back with a READ ONLY badge.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/toggle/
```

`?embed=1` shows the control alone, without its window.

## Use it

`toggle.js` is the whole component: one file of about 298 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 244 × 98 pixels.

```html
<script src="toggle.js"></script>
<paradise-toggle checked></paradise-toggle>
```

```js
const el = document.querySelector('paradise-toggle');
el.addEventListener('change', () => console.log(el.checked));
el.checked = false;   // from code
el.mode = 'locked';   // ready, busy or locked
```

| attribute | what it sets | default |
|---|---|---|
| `checked` | on | off |
| `mode` | `ready`, `busy` (shakes when touched) or `locked` (bounces back, READ ONLY) | ready |
| `name` | sent with its form as `on` when checked |  |

- **It changes the whole page.** Turning it off sets every Paradise control on the page to its grey reality look. Leave it out if you do not want that.
- **Keys:** Space and Enter flip it.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| click | the knob slides across and the water fills or drains behind it |
| drag slowly | it tightens toward halfway, water leaks across, then it snaps |
| turn off | the page drops to grey wireframe reality |
| touch it when locked | it bounces back and a READ ONLY badge flashes |

## Limits

- **The labels are drawn in,** DREAM ON and PARADISE.SYS; they cannot be changed yet.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

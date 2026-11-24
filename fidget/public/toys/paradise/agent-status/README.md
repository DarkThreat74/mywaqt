# Statue agent status

A status light for an AI agent, drawn as a classical marble bust floating over a checkerboard plinth. The bust is real 3D (WebGL), cut into four slabs, so each state can take it apart differently: idle floats and breathes; thinking pulls the slabs apart and turns them; searching sweeps a laser scan down it; tool shows chrome hologram copies; writing sends glyphs rising off it; error cracks it with red and RGB ghosts; done slams it down into the plinth and a ring of pool light spreads out.

Set `progress` and a ring fills round it. `simulateRun()` plays a whole run, state by state, which is handy for a demo.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/agent-status/
```

`?embed=1` shows the control alone, without its window.

## Use it

`agent-status.js` is the whole component: one file of about 397 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 240 × 256 pixels.

```html
<script src="agent-status.js"></script>
<paradise-statue state="thinking"></paradise-statue>
```

```js
const el = document.querySelector('paradise-statue');
el.state = 'searching';    // idle, thinking, searching, tool, writing, error, done
el.progress = 0.4;         // a ring from 0 to 1; null hides it
el.pulse('token');         // one burst ('tool' for a tool call)
el.simulateRun();          // play a whole run
```

| attribute | what it sets | default |
|---|---|---|
| `state` | `idle`, `thinking`, `searching`, `tool`, `writing`, `error` or `done` | idle |
| `progress` | a ring round it, 0 to 1 | none |

- **It is a `<button>`:** a click steps to the next state and fires change, so it can double as a demo control. Set `state` from your agent's events in real use.
- **It reaches the page:** on a page with the other Paradise controls, the dial, equalizer, tabs and cascade button react to its error and done states.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| thinking | the bust splits into four slabs that drift apart and turn |
| searching | a laser plane scans down it |
| writing | glyphs and small dialog cards rise off it |
| error | it cracks, red and RGB ghosts shake |
| done | it slams down into the plinth and a ring of light spreads |

## Limits

- **Needs WebGL** for the 3D bust; without it a flat picture of the bust stands in.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

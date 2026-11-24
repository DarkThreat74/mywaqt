# Thinking

An AI agent's working state as a rock in a round tray of sand, raked by nothing you can see: the sand just moves. Each state drags its own kind of line, so you can tell what the agent is doing at a glance. Thinking draws closed rings round the rock, out to the rim, then smooths them away and starts again. Searching draws straight spokes out from the rock, each one a golden angle round from the last, so it never looks in the same place twice. Using a tool draws parallel lines that part round the rock the way water flows past a stone. Writing draws one line spiralling out from the rock in dashes, like lines of text. Between states the sand sweeps itself smooth, and when the agent is done the sand stops and the garden stays as it is. Each state has its own sound.

One of four files in this repo. Same idea in each (an ordinary control made of sand that moves like sand), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/thinking/
```

`?embed=1` hides the heading and the hint.

## Use it

`thinking.js` is the whole control: one file of about 370 KB with the sand engine and its sounds and the rock inside it, and no dependencies.

```html
<script src="thinking.js"></script>
<sand-thinking state="thinking"></sand-thinking>
```

```js
const el = document.querySelector('sand-thinking');
el.state = 'searching';   // thinking, searching, tool, writing, or idle when it is done
el.thinking = true;       // the same as state = 'thinking' (false is idle)
```

| attribute | what it sets | default |
|---|---|---|
| `state` | `thinking`, `searching`, `tool`, `writing` or `idle` | idle |
| `rock` | a top-down image of your own rock, with a transparent background | the basalt rock inside the file |
| `thinking` | the same as `state="thinking"` |  |

- **A status region:** `role="status"` with `aria-busy` while it works, and an accessible name of Thinking, Searching, Using a tool, Writing or Ready.
- **Small sizes work.** At chat size (76 pixels or less) it cuts one bolder groove at a time instead of three, so the lines still read.
- **Your own rock:** any square cut-out seen from above. Its outline becomes the shape the rings and the flowing lines bend round.

## What happens

| you | it |
|---|---|
| thinking | rings round the rock, hugging its outline near it and rounding out further away; at the rim it smooths them back in and starts again |
| searching | spokes drawn out from the rock one at a time with a swish each, a golden angle apart |
| tool | lines that flow across the tray and part round the rock, drawn back and forth to a steady rush of sand |
| writing | a spiral of dashes of different lengths, a tiny scratch at the start of each word |
| a new state | the sand sweeps itself smooth in a few wide passes, about two seconds, then the new line starts |
| idle | the sand stops and settles, and the garden stays as it is |

## Limits

- **The change between states takes about two seconds,** the sweep included. A state that lasts less than that is barely seen.
- **It is round,** and as high as it is wide.
- **Needs WebGL2** to draw the sand. Without it the control still works with keys and a screen reader, but nothing is drawn.
- **One live tray per element.** Each is its own WebGL canvas, and browsers keep only about sixteen alive at once, so it is not for long lists.
- **It does not hold still for `prefers-reduced-motion`.** The sand still moves. If that matters on your page, use a plain control there.
- **Drawn for a light page.** The sand and the walnut frame are warm and light; they look pasted on over a dark background.
- **The sand is simulated at one cell per CSS pixel,** so a wider element costs more. Each scales to its CSS `width`; the height follows.
- **Sound is on** after the first touch or key on the page. `ZenSand.Sound.on = false` turns every control quiet.
- **Checked in headless Chromium** with real touch and key events, with the CPU slowed four times. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

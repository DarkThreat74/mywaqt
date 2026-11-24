# System load

A loading bar. A long gauge holds 24 slanted segments and a small window with the percentage. As it fills, the line it says reports what is starting up. From 80 it turns amber and shakes, with ゴゴゴゴ. At 100: two impact frames, ドン!, and the robot's visor igniting cuts in.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/loading/
```

`?embed=1` hides the heading and the hint.

## Use it

`loading.js` is the whole control: one file of about 442 KB with its paintings inside it, and no dependencies.

```html
<script src="loading.js"></script>
<cockpit-loading></cockpit-loading>
```

```js
const el = document.querySelector('cockpit-loading');
el.set(0.4);          // progress from 0 to 1
el.value;             // the same as a whole number, 0 to 100
el.addEventListener('cockpit:done', () => start());
el.reset();           // back to zero
el.run();             // play the pretend load once
```

| attribute | what it sets | default |
|---|---|---|
| `demo` | runs a pretend load by itself, stalling where loading bars stall; pressing it runs it again | off |
| `value` | where it starts, 0 to 100 | 0 |

- **Without `demo` it only moves when fed.** That is a change from the gallery, where it runs by itself.
- **The whole control is a `<button>`** so a press can restart the demo; there is also a `role="progressbar"` with the value for screen readers.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| progress passes 18, 47, 62, 80 | ピピッ and a new line about what is starting |
| 80 to 99 | amber, shaking, ゴゴゴゴ |
| reach 100 | two impact frames, ドン!, the visor cut-in, the window reads OK; `cockpit:done` fires |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **The lines about what is loading are fixed.**
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

# Output gain

A slider you turn. An orange dial sits on the left with eleven lamps round it; a screen on the right shows the value as a big number, three warning marks, a trace and a ladder. Drag round the dial or use the arrow keys. As it climbs through seven levels the screen goes from green to amber to red, the trace gets rougher, and the line of copy changes. From 75 the control shakes and ゴゴゴゴ (rumble) sits on it. At 100 there are two impact frames, ドン! (boom) and the pilot's eyes cut in.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/dial/
```

`?embed=1` hides the heading and the hint.

## Use it

`dial.js` is the whole control: one file of about 605 KB with its paintings inside it, and no dependencies.

```html
<script src="dial.js"></script>
<cockpit-dial value="20"></cockpit-dial>
```

```js
const el = document.querySelector('cockpit-dial');
el.addEventListener('input', () => setGain(el.value));    // while it turns
el.addEventListener('change', () => save(el.value));      // when it is let go
el.value = 80;        // from code it goes straight there, with no lettering
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts, 0 to 100 | 0 |
| `name` | sent with its form |  |

- **It is an element with `role="slider"`** in the shadow root: it takes focus, arrows step by 1, Shift with an arrow or Page Up and Page Down by 10, Home and End go to the ends.
- **Dragging is by angle,** so the pointer can wander off the dial while you turn.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| turn up | lamps light round the dial; カチッ (click) pops at each new level and the copy under the number changes |
| turn down | ピピッ (beep) at each level |
| 75 and over | the screen is red, the control shakes, ゴゴゴゴ sits bottom left |
| reach 100 | two impact frames, ドン!, then the pilot's eyes cut in across the control |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **The range is fixed** at 0 to 100 in steps of 1.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

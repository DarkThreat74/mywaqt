# Pre-launch check

Four checkboxes as one block: COOLANT, LINK CTRL, COMMS and PILOT, each a bone-white latching button beside a label window. A screen on the right shows how many are ticked and whether you may go. A ticked row turns solid green and reads OK. Tick the fourth and there are two impact frames, ドン!, and a deck crew member cuts in with two light wands.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/checklist/
```

`?embed=1` hides the heading and the hint.

## Use it

`checklist.js` is the whole control: one file of about 559 KB with its paintings inside it, and no dependencies.

```html
<script src="checklist.js"></script>
<cockpit-checklist></cockpit-checklist>
```

```js
const el = document.querySelector('cockpit-checklist');
el.addEventListener('change', () => { if (el.complete) proceed(); });
el.value;             // '1010': one digit per row, top to bottom
el.value = '1100';    // from code, with no lettering
```

| attribute | what it sets | default |
|---|---|---|
| `value` | which rows start ticked, as four digits | 0000 |
| `name` | sent with its form as the four digits |  |

- **Each row is a `<button role="checkbox">`** in the shadow root, with its own name for screen readers.
- **The four labels are fixed.** They are drawn by the file, not painted, but there is no attribute for them yet.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| tick a row | its button and label fill green, カチッ pops beside it, the tally goes up |
| untick | ピピッ, and the row goes back to amber |
| three of four | the warning triangle blinks |
| tick the fourth | two impact frames, ドン!, the deck crew cut-in, and the screen reads READY |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **Always four rows** with the labels above.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

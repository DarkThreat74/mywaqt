# Active time

A stepper. Minus and plus keys sit either side of an amber window showing minutes and seconds, with a strip of ten lamps beside it: one lamp for every thirty seconds. Hold a key to repeat. A minute or less and everything turns red and blinks; at thirty seconds the control shakes. Reach five minutes and there are two impact frames, 充電! (charged), and the power cable ejects across the control.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/stepper/
```

`?embed=1` hides the heading and the hint.

## Use it

`stepper.js` is the whole control: one file of about 516 KB with its paintings inside it, and no dependencies.

```html
<script src="stepper.js"></script>
<cockpit-stepper value="120"></cockpit-stepper>
```

```js
const el = document.querySelector('cockpit-stepper');
el.addEventListener('change', () => setTimer(el.value));   // seconds
el.value = 240;       // from code, with no lettering
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts, in seconds | 120 |
| `name` | sent with its form |  |

- **The window is a `role="spinbutton"`** in the shadow root: arrows step by thirty seconds, Page Up and Page Down by a minute, Home and End go to the ends. The two keys are real `<button>`s.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| press a key | ピッ (blip) beside it, the window flashes for one drawing, a lamp lights or goes out |
| a minute or less | red and blinking; at thirty seconds the control shakes |
| reach five minutes | two impact frames, 充電!, the cable cut-in |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **The range and step are fixed:** thirty seconds to five minutes, in thirty-second steps.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

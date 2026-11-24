# Drive mode

A radio group. Four key caps in a block, each with a lamp above it: CRUISE, COMBAT, SNIPE and STEALTH. The chosen key lights in its own colour (green, red, amber, cyan) and a screen shows the mode in Japanese with three bars for power, speed and armour that step to new values. Choosing COMBAT gets two impact frames, 戦闘! (combat) and the robot's clenched fist.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/mode/
```

`?embed=1` hides the heading and the hint.

## Use it

`mode.js` is the whole control: one file of about 529 KB with its paintings inside it, and no dependencies.

```html
<script src="mode.js"></script>
<cockpit-mode></cockpit-mode>
```

```js
const el = document.querySelector('cockpit-mode');
el.addEventListener('change', () => setMode(el.value));
el.value = 'snipe';   // from code, with no lettering
```

| attribute | what it sets | default |
|---|---|---|
| `value` | which mode starts chosen | cruise |
| `name` | sent with its form |  |

- **It is a `role="radiogroup"` of four `<button role="radio">`** in the shadow root. One is in the tab order; arrow keys move the choice and wrap round.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| choose a key | it lights, its lamp comes on, カチッ pops over it, the bars on the screen step to the new numbers |
| choose COMBAT | two impact frames, 戦闘!, the fist cut-in, and the control shakes for a second and a half |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **The four modes are fixed,** names and colours included. The words on the keys are small: about 8 pixels at full size.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

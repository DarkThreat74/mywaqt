# Stepper

A number stepper. A minus flipper and a plus flipper sit either side of a steel housing with an electromechanical score reel behind glass and an amber lamp on top. Press a flipper: its solenoid fires, it snaps up, the lamp flashes, and the number drums roll to the new value, the tens drum turning over when the ones carry, and settle with a small bounce on their detent. Hold a flipper to repeat. You can also drag the drums up and down.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/stepper/
```

`?embed=1` hides the heading and the hint.

## Use it

`stepper.js` is the whole control: one file of about 779 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="stepper.js"></script>
<pinball-stepper value="4" min="0" max="99" label="Players"></pinball-stepper>
```

```js
const el = document.querySelector('pinball-stepper');
el.addEventListener('change', () => setPlayers(el.value));
el.increment();       // or el.decrement(), or el.increment(5)
el.value = 42;        // from code: the drums roll there, with no events
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts | 0 |
| `min`, `max`, `step` | the range; whole numbers only | 0, 99, 1 |
| `digits` | how many drums, 2 to 4 | as many as `max` needs, at least 2 |
| `label` | its name for screen readers | Stepper |
| `name` | sent with its form |  |
| `disabled` | greys it out and ignores input | off |

- **It is a `role="spinbutton"`** in the shadow root: the arrows and + and - step, Page Up and Page Down step by ten, Home and End go to the ends, and the flipper on that side moves with the key.
- **Size** is `--pb-size`, its height: 52 pixels by default.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| press a flipper | the solenoid fires, the flipper snaps up, the lamp flashes, the drums roll one step |
| hold it | it repeats, the solenoid re-pulsing with each step |
| pass a ten | the tens drum turns over too, a little after the ones |
| press at the limit | the drums nudge and knock against the stop; the number does not change |

With `prefers-reduced-motion` the ball and the moving parts go straight to where they end up, and the lamps still light.

## Limits

- **Whole numbers only,** and no negative numbers.
- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

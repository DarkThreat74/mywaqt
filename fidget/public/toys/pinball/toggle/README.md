# Toggle

A switch. The body is a photograph of a short pinball lane with a lamp under one end, and the knob is a chrome ball drawn live: it mirrors the lane under it, and its scratches turn as it rolls. Flip it and a solenoid kicks the ball across. It rolls, hits the far wall with a clack, the lamp's relay closes as the ball reaches the seat, a chime rings, and the ball rocks back and forth a few times before it comes to rest. You can also drag the ball and throw it.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/toggle/
```

`?embed=1` hides the heading and the hint.

## Use it

`toggle.js` is the whole control: one file of about 848 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="toggle.js"></script>
<pinball-toggle label="Push alerts"></pinball-toggle>
```

```js
const el = document.querySelector('pinball-toggle');
el.addEventListener('change', (e) => console.log(e.detail.checked));
el.checked = true;    // from code: the ball is kicked across, with no change event
el.toggle();
```

| attribute | what it sets | default |
|---|---|---|
| `checked` | starts on | off |
| `label` | its name for screen readers | Toggle |
| `name`, `value` | sent with its form when on, like a checkbox | `on` |
| `disabled` | greys it out and ignores presses | off |
| `mode` | `live`, or `plates` (a photographed ball that slides) or `3d` (no photographs at all): the three ways it was tried | `live` |

- **It is a `<button role="switch">`** in the shadow root, with `aria-checked`. It takes focus; Space and Enter flip it.
- **`change` fires with `{ checked }`** when a person flips it, and an `input` event with it. Setting `checked` from code does not fire them.
- **Size** is `--pb-size`, its height: 36 pixels by default.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| press | a solenoid kick, then the ball rolls across with a rolling sound |
| the ball reaches the far end | it clacks into the wall, the lamp's relay closes, the lamp warms up from red to amber and a chime rings |
| then | it rocks in its seat four or five times, each knock quieter, and settles |
| drag the ball | it follows your finger; let go and it carries on with the speed it had, to whichever end it was heading |

With `prefers-reduced-motion` the ball and the moving parts go straight to where they end up, and the lamps still light.

## Limits

- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

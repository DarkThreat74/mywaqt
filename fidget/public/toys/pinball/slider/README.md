# Slider

A slider. The body is a photograph of a longer lane with ten round lamp inserts in it, and the thumb is the same live chrome ball as the toggle's. Drag the ball, press anywhere on the lane to send it there, or use the arrow keys. Each lamp lights with a relay tick as the ball reaches it, the ticks rising in pitch along the row, and a chime note plays for each lamp that lights. At either end the ball stops dead against the wall.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/slider/
```

`?embed=1` hides the heading and the hint.

## Use it

`slider.js` is the whole control: one file of about 607 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="slider.js"></script>
<pinball-slider value="40" label="Volume"></pinball-slider>
```

```js
const el = document.querySelector('pinball-slider');
el.addEventListener('input', (e) => setVolume(e.detail.value));   // while it moves
el.addEventListener('change', () => save(el.value));               // when it is let go
el.value = 80;        // from code: the ball rolls there, with no events
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts | 0 |
| `min`, `max`, `step` | the range | 0, 100, 1 |
| `label` | its name for screen readers | Slider |
| `name` | sent with its form |  |
| `disabled` | greys it out and ignores input | off |

- **It is an element with `role="slider"`** in the shadow root: it takes focus, the arrows step by `step`, Page Up and Page Down by a tenth of the range, Home and End go to the ends.
- **The ball rolls; it does not jump.** The value changes at once, and the ball catches up with a little overshoot.
- **Size** is `--pb-size`, its height: 36 pixels by default. It is about four and a half times as wide as it is high.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| drag or press the lane | the ball rolls to the spot; each lamp it reaches lights with a relay tick and a chime note on a five-note scale |
| roll back | each lamp it leaves goes out with a softer tick |
| hit an end | a dead-stop clack and a small flinch of the body |

With `prefers-reduced-motion` the ball and the moving parts go straight to where they end up, and the lamps still light.

## Limits

- **Always ten lamps,** whatever the range: they show the fill, not the steps.
- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

# Pop bumpers

Buttons as pop bumpers. The bumper is a photograph of a red and cream bumper cap on a chrome skirt, with your own text printed on the cap. Press `<pinball-bumper>` and its solenoid fires: the skirt pops, the lamp under the cap flashes amber, and a chime plays, climbing a five-note scale if you keep pressing quickly. `<pinball-bumpers>` is three bumpers in a triangle: press it and a chrome ball drops in from the top and ricochets between them four to six times, firing each one it hits. Press again while it is still going and up to three balls play at once.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/bumper/
```

`?embed=1` hides the heading and the hint.

## Use it

`bumper.js` is the whole control: one file of about 713 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="bumper.js"></script>
<pinball-bumper cap="+1" label="Clap"></pinball-bumper>
<pinball-bumpers caps="100,500,100"></pinball-bumpers>
```

```js
const one = document.querySelector('pinball-bumper');
one.addEventListener('hit', (e) => clap(e.detail.count));
const three = document.querySelector('pinball-bumpers');
three.addEventListener('hit', (e) => showScore(e.detail.score));   // once per bumper the ball hits
three.launch();       // drop a ball in from code
three.resetScore();
```

| attribute | what it sets | default |
|---|---|---|
| `cap` | `<pinball-bumper>`: the text on its cap | 100 |
| `points` | `<pinball-bumper>`: points per hit | the number in `cap`, or 100 |
| `caps` | `<pinball-bumpers>`: the three caps, comma-separated; the numbers in them are the points | 100,500,100 |
| `label` | its name for screen readers | Bonus bumper |
| `disabled` | greys it out and ignores presses | off |

- **The single bumper is a `<button>`** in the shadow root; the cluster is an element with `role="button"`. Both take focus, and Space or Enter presses them.
- **`hit` fires with `{ index, cap, points, count, score, combo }`.** For the cluster it fires once for every bumper the ball hits, so one press scores several times.
- **Size** is `--pb-size`, the height: 72 pixels for the single bumper and 240 for the cluster by default.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| press a bumper | the solenoid fires, the chrome skirt pops toward where you pressed, the lamp flashes amber and a chime plays |
| press again quickly | the chime climbs the scale: a combo |
| press the cluster | a ball drops in and ricochets off four to six bumpers, each one firing as it is hit, then leaves |
| press the cluster again while a ball is in play | another ball; up to three at once |

With `prefers-reduced-motion` the ball and the moving parts go straight to where they end up, and the lamps still light.

## Limits

- **Short cap text.** About four characters fit on a cap.
- **The cluster is always three bumpers** in the same triangle.
- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

# Toggle

A switch that is a river stone resting at one end of a pill-shaped tray of raked sand. The stone is also a seal: where it rests at the off end it has pressed a power symbol into the sand underneath it, so you cannot see it. Switch it on and the stone glides gently to the other end. It parts the sand as it goes, which rolls off to either side and trails behind it as a wake, and the symbol it was hiding is uncovered. Switch it off and the stone glides back over it. There is no colour for on: on is the symbol you can see.

One of four files in this repo. Same idea in each (an ordinary control made of sand that moves like sand), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/toggle/
```

`?embed=1` hides the heading and the hint.

## Use it

`toggle.js` is the whole control: one file of about 170 KB with the sand engine and its sounds inside it, and no dependencies.

```html
<script src="toggle.js"></script>
<sand-toggle label="Focus mode"></sand-toggle>
```

```js
const el = document.querySelector('sand-toggle');
el.addEventListener('change', () => setFocus(el.checked));
el.checked = true;    // the stone glides there
```

| attribute | what it sets | default |
|---|---|---|
| `checked` | starts on | off |
| `label` | what a screen reader calls it | Toggle |
| `name` | sent with its form when on |  |
| `value` | what its form gets when it is on | on |

- **A switch underneath:** `role="switch"` with `aria-checked`. Click, Space or Enter switch it.
- **Drag the stone** part way and let go, and it glides on to the nearer end.

## What happens

| you | it |
|---|---|
| switch on | the stone glides over about a second, eased in and out, pushing a bow of sand ahead and leaving a wake with ridges either side |
| when it gets there | a soft thock as it settles, and the power symbol it was sitting on is in plain view |
| switch off | it glides back the way it came and covers the symbol again |
| drag it part way | the stone follows the finger; let go and it finishes the trip to the nearer end |

## Limits

- **The symbol is a power symbol.** It is drawn in code, not taken from a font, and is not set by an attribute.
- **The wake stays.** Switch it often and the tray shows it, like a real one.
- **Needs WebGL2** to draw the sand. Without it the control still works with keys and a screen reader, but nothing is drawn.
- **One live tray per element.** Each is its own WebGL canvas, and browsers keep only about sixteen alive at once, so it is not for long lists.
- **It does not hold still for `prefers-reduced-motion`.** The sand still moves. If that matters on your page, use a plain control there.
- **Drawn for a light page.** The sand and the walnut frame are warm and light; they look pasted on over a dark background.
- **The sand is simulated at one cell per CSS pixel,** so a wider element costs more. Each scales to its CSS `width`; the height follows.
- **Sound is on** after the first touch or key on the page. `ZenSand.Sound.on = false` turns every control quiet.
- **Checked in headless Chromium** with real touch and key events, with the CPU slowed four times. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

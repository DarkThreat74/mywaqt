# Safety lock

A switch. A steel toggle sits between the words LOCK and RELEASE, with a screen beside it listing four clamps as HELD. Throw it to RELEASE and the clamps open one at a time, about a quarter of a second apart, while the control shakes. When the fourth lets go: two impact frames, 解除! (released), and the hangar clamps blow open across the control. Throw it back and all four are held again at once.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/lock/
```

`?embed=1` hides the heading and the hint.

## Use it

`lock.js` is the whole control: one file of about 757 KB with its paintings inside it, and no dependencies.

```html
<script src="lock.js"></script>
<cockpit-lock></cockpit-lock>
```

```js
const el = document.querySelector('cockpit-lock');
el.addEventListener('change', () => console.log(el.checked));
el.checked = true;    // from code it goes straight to released, with no reaction
```

| attribute | what it sets | default |
|---|---|---|
| `checked` | starts released | off |
| `name` | sent with its form as `on` when released, like a checkbox |  |

- **It is a `<button role="switch">`** in the shadow root: it takes focus, Space and Enter.
- **`change` fires when you throw it,** not a second later when the last clamp lets go.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| throw to RELEASE | ガシャン! (clank), the screen turns amber and the clamps open one by one while the control shakes |
| the fourth clamp | two impact frames, 解除!, the clamp cut-in, and the screen goes red |
| throw to LOCK | ガシャン!, all four held, green again |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

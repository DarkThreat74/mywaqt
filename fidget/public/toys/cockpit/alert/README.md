# Alert

A notification. One flat panel with three lamps down the left (red, amber, green from the top), a wide window framed in hazard stripes, and a long ACKNOWLEDGE bar. The window shows the level in Japanese and English and types out the message. A notice is green, a caution is amber with ビーッ! (buzz), and a warning flashes the window red with two impact frames, 警報! (alarm) and three missiles cutting in.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/alert/
```

`?embed=1` hides the heading and the hint.

## Use it

`alert.js` is the whole control: one file of about 542 KB with its paintings inside it, and no dependencies.

```html
<script src="alert.js"></script>
<cockpit-alert></cockpit-alert>
```

```js
const el = document.querySelector('cockpit-alert');
el.show('caution', 'Coolant at 12 percent');   // 'notice', 'caution' or 'warning', and up to about 22 characters
el.addEventListener('cockpit:ack', (e) => dismiss(e.detail.level));
el.level;             // the level showing now
```

| attribute | what it sets | default |
|---|---|---|
| `level` | which level it starts on | notice |

- **The bar is a real `<button>`** in the shadow root, named with the level and the message for screen readers.
- **It is always visible.** Unlike a toast it does not hide itself; show and hide the element yourself.
- **Pressing the bar also moves it to the next level.** That is the demo behaviour and it is still in: call `show()` again after `cockpit:ack` to put up what you want.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| `show("notice", …)` | green window, bottom lamp lit, the message types out |
| `show("caution", …)` | amber window, middle lamp blinking, ビーッ! |
| `show("warning", …)` | two impact frames, 警報!, the missile cut-in; the window flashes red and the control shakes |
| press ACKNOWLEDGE | `cockpit:ack` fires with the level that was showing |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **Messages are upper-cased and one line long.** About 22 characters fit.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

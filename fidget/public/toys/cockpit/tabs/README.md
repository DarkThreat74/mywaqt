# Monitor select

Tabs. Three key caps sit on top of a monitor: MAIN, SUB and REAR. The chosen key lights orange and the picture changes: a ground grid with a boxed target, three load bars, or the view astern. Each change cuts through two drawings of static with ザザッ (static). Stay on REAR for about a second and a hostile contact appears: two impact frames, 捕捉! (acquired) and an unknown machine cutting in.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/tabs/
```

`?embed=1` hides the heading and the hint.

## Use it

`tabs.js` is the whole control: one file of about 519 KB with its paintings inside it, and no dependencies.

```html
<script src="tabs.js"></script>
<cockpit-tabs></cockpit-tabs>
```

```js
const el = document.querySelector('cockpit-tabs');
el.addEventListener('change', () => console.log(el.value));
el.value = 'sub';     // from code, with no static
```

| attribute | what it sets | default |
|---|---|---|
| `value` | which tab starts chosen | main |
| `name` | sent with its form |  |

- **It is a `role="tablist"` of three `<button role="tab">`** with one panel, in the shadow root. Left and right arrows move and wrap; Home and End go to the ends.
- **The three pictures are drawn by the file.** It is a themed display, not a container: you cannot put your own content in a tab.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| change tab | two drawings of static, ザザッ, the new key lights |
| stay on REAR | after 1.3 seconds a contact appears, with two impact frames, 捕捉! and the hostile cut-in |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **Three fixed tabs with fixed pictures.**
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

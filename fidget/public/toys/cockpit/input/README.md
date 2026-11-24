# Callsign

A text input. A real text field sits in a long green window, with the character count in a small window beside it and a speaker screen on the right. Letters are upper-cased as you type and カタカタ (clatter) pops over the field. Press Enter and the name is registered: two impact frames, 了解! (roger), and the bridge communications officer cuts in. Press Enter on an empty field and it refuses, with ビーッ!.

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/input/
```

`?embed=1` hides the heading and the hint.

## Use it

`input.js` is the whole control: one file of about 480 KB with its paintings inside it, and no dependencies.

```html
<script src="input.js"></script>
<cockpit-input></cockpit-input>
```

```js
const el = document.querySelector('cockpit-input');
el.addEventListener('cockpit:enter', (e) => register(e.detail.value));
el.addEventListener('input', () => console.log(el.value));
el.value = 'RAVEN-7';
```

| attribute | what it sets | default |
|---|---|---|
| `value` | the text it starts with |  |
| `name` | sent with its form |  |

- **It is a real `<input type="text">`** in the shadow root, with a label for screen readers, so the keyboard, selection, paste and the phone keyboard all work.
- **Only letters, digits, spaces and hyphens are kept,** upper-cased, up to sixteen characters.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| type | カタカタ pops over the field, the count goes up, the speaker screen reads INPUT |
| Enter with a name | two impact frames, 了解!, the bridge cut-in; the field turns solid green; `cockpit:enter` fires |
| Enter on an empty field | ビーッ!, and the screen reads NO ID |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **Sixteen characters, one line, a fixed character set.** The placeholder and the limit cannot be changed by attribute yet.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

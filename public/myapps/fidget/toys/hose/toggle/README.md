# Toggle

A switch whose knob is a lightbulb. Off, he is grey and half asleep at the left end of a track that says OFF. Switch it on and he stretches across like taffy, the track turns teal and says ON, he lights up yellow, and he throws his fists in the air under a ring of rays, with CLICK!. Switch it off and he slides back, goes grey and puts his arms away.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/toggle/
```

`?embed=1` hides the heading and the hint.

## Use it

`toggle.js` is the whole component: one file of about 160 KB with its drawings inside it, and no dependencies.

```html
<script src="toggle.js"></script>
<hose-toggle label="Lights"></hose-toggle>
```

```js
const el = document.querySelector('hose-toggle');
el.addEventListener('change', () => console.log(el.checked));
el.checked = true;    // from code it goes straight to the end, without the stretch
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls it | Switch |
| `checked` | starts on | off |
| `name`, `value` | sent with its form when on, like a checkbox | value `on` |
| `disabled` | like a button's | off |

- **It is a `<button role="switch">`** in the shadow root: it takes focus, Space and Enter.
- **The track says ON and OFF in English.** They are painted into the two track layers.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| switch on | over five drawings the bulb stretches to half as wide again and crosses the track; past half way the track and the bulb change to their lit drawings |
| he lands | he squashes and rings, a soft yellow disc glows behind the track, nine rays flicker round him, his fists come up, CLICK! |
| while on | he bounces on the beat with his fists in the air |
| switch off | the same crossing backwards; he goes grey past half way and the arms are gone |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

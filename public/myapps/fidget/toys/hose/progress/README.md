# Progress

A loading bar who is a thermometer lying on his side, propped up on his hands. The red climbs his tube, with a mark every tenth, while he grits his teeth, shakes and sweats. At a hundred he hops, throws his fists in the air and lets out a PHEW!. The percentage is written under him.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/progress/
```

`?embed=1` hides the heading and the hint.

## Use it

`progress.js` is the whole component: one file of about 146 KB with its drawings inside it, and no dependencies.

```html
<script src="progress.js"></script>
<hose-progress label="Uploading"></hose-progress>
```

```js
const el = document.querySelector('hose-progress');
upload.onprogress = (e) => el.set(e.loaded / e.total);   // 0 to 1, as often as it changes
el.addEventListener('hose:done', () => next());           // once, when the red reaches the end
el.reset();           // back to 0 for the next task
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls it; say what is loading | Progress |
| `demo` | plays a pretend load on a loop, and a press starts it again | off |

- **`el.set(n)` takes 0 to 1.** The red eases toward the number, so a jump is still climbed. `el.set(n, true)` goes straight there.
- **`hose:done` fires once,** when the red itself reaches the end, a moment after your task does. Setting a lower number or calling `reset()` arms it again.
- **It is a `progressbar`** with `aria-valuenow` kept up to date. `el.value` reads the number you last set.
- **Do not ship the `demo` attribute.** It is for galleries.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| at 0 | he waits with his happy face and his hands on the floor |
| above 0 | the straining face, a shake every drawing, and three drops of sweat thrown off his head every two thirds of a second |
| at 100 | he hops, his face changes back, both fists go up, two puffs leave his head and PHEW! lands |
| all the time | the percentage under him follows the red |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **It does not show a stall.** If progress stops he just keeps straining.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

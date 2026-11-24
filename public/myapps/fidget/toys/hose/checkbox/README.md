# Checkbox

A checkbox who ticks himself. He is a square fellow with a blank front, standing with his fists on his hips. Tick him and his own arm swings round and slaps a brushed check mark across his front, with ink flying and SPLAT!, and he throws that fist in the air and laughs. Untick him and he wipes it off in a puff and puts the hand back on his hip.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/checkbox/
```

`?embed=1` hides the heading and the hint.

## Use it

`checkbox.js` is the whole component: one file of about 133 KB with its drawings inside it, and no dependencies.

```html
<script src="checkbox.js"></script>
<hose-checkbox name="remember">Remember me</hose-checkbox>
```

```js
const el = document.querySelector('hose-checkbox');
el.addEventListener('change', () => console.log(el.checked));
el.checked = true;    // from code it goes straight to the end, without the swing
```

| attribute | what it sets | default |
|---|---|---|
| `checked` | starts ticked | off |
| `name`, `value` | sent with its form when ticked | value `on` |
| `label` | its accessible name, if you would rather not put text inside | the text inside |
| `disabled` | like a checkbox's | off |

- **The text inside is the name, not a label you can see.** Put a visible label beside it. A `<label for>` pointing at the element works, because it is a form control.
- **A real `<input type="checkbox">`** lies over the drawing: Space ticks it.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| tick | his right arm winds up beside him and comes across in three drawings; the mark lands a size too big and settles; eight drops of ink, a ring of ticks, SPLAT!; he squashes |
| after | the arm goes up, the fist turns to face you, and he laughs for as long as he is ticked |
| untick | the hand scrubs across twice, the mark shrinks away under three puffs, and the hand goes back to his hip |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

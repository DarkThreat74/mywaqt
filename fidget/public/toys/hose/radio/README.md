# Radio

A radio group of round faces, one to a choice, each with its label beside it. The chosen one is blue, wide awake and bouncing on the beat. The others are cream, a little smaller, and dozing off under a string of z’s. Pick a sleeper and he pops awake with a ring of ticks and POP!, while the one who was awake nods off.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/radio/
```

`?embed=1` hides the heading and the hint.

## Use it

`radio.js` is the whole component: one file of about 116 KB with its drawings inside it, and no dependencies.

```html
<script src="radio.js"></script>
<hose-radio label="Plan" name="plan">
  <option value="free" selected>Free</option>
  <option value="pro">Pro</option>
</hose-radio>
```

```js
const el = document.querySelector('hose-radio');
el.addEventListener('change', () => console.log(el.value));
el.value = 'pro';     // from code it goes straight to the end, without the pop
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls the group | Options |
| `name` | sent with its form, with the chosen value |  |
| `disabled` | no choice can be changed | off |

- **The choices are `<option>`s inside it.** `value` is what is sent (the text, if there is none) and `selected` marks the one that starts awake.
- **It grows with the list.** Each choice is a row 90 pixels high, so two choices are 210 pixels tall and three are 300.
- **Real radio inputs** lie over the rows: arrow keys move between them.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| pick one | he swaps to the blue drawing and pops a third too big, then rings down; nine ticks fly out; POP! lands above him |
| the last one | goes cream, shrinks a little and starts letting off z’s |
| all the time | the one awake bounces on the beat; the sleepers breathe |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **Labels are one line.** A long one is shrunk to fit the 166 pixels beside the face, down to 9 pixels.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

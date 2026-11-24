# Rating

Five stars in a chorus line. The ones you have given are yellow and laughing, on legs with shoes, with their fists in the air, kicking in time with each other. The rest are pale, a little lower, and asleep under their z’s. Raise the score and they wake one after another, each with a pop and a ring of ticks, and POP! lands over the last one. Lower it and the ones you took back sink down and doze off.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/rating/
```

`?embed=1` hides the heading and the hint.

## Use it

`rating.js` is the whole component: one file of about 113 KB with its drawings inside it, and no dependencies.

```html
<script src="rating.js"></script>
<hose-rating label="Rating" name="stars" value="3"></hose-rating>
```

```js
const el = document.querySelector('hose-rating');
el.addEventListener('change', () => console.log(el.value));   // 0 to 5
el.value = 5;         // from code they are simply awake
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts, 0 to 5 | 0 |
| `label` | what a screen reader calls the group | Rating |
| `name` | sent with its form |  |
| `disabled` | the stars cannot be pressed | off |

- **Pressing the last lit star again takes it back,** so one star can be lowered to none.
- **It is a `radiogroup` of five buttons:** the arrow keys raise and lower the score.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| raise the score | the new stars wake left to right, three drawings apart; each pops a third too big with eight ticks; POP! over the last |
| lower it | the stars you took back drop, squash once and start letting off z’s |
| all the time | the lit ones bounce and kick, each a half beat off its neighbour; the sleepers breathe |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **Always five stars,** and whole ones.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

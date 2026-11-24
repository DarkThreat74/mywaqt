# Tooltip

A help button with a bird behind it. Point at the question mark, focus it or tap it, and a small blue bird pops up from behind it, growing as he comes, towing the hint on a balloon tied to his feet, with TWEET!. He hovers there flapping while the balloon swings. Leave and he ducks back down.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/tooltip/
```

`?embed=1` hides the heading and the hint.

## Use it

`tooltip.js` is the whole component: one file of about 130 KB with its drawings inside it, and no dependencies.

```html
<script src="tooltip.js"></script>
<hose-tooltip text="We never share your email" label="About email"></hose-tooltip>
```

```js
const el = document.querySelector('hose-tooltip');
el.show(); el.hide();
el.addEventListener('hose:open', () => {});   // and hose:close
```

| attribute | what it sets | default |
|---|---|---|
| `text` | the hint | Helpful hint! |
| `label` | what a screen reader calls the button | Help |

- **Whatever is inside the element replaces the "?"** on the button.
- **The hint is the button’s description** (`aria-describedby`), so it is read out with the button whether or not the bird is up.
- **A tap pins it open** until the next tap, Escape, or focus leaving.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| open | over ten drawings the bird rises from behind the button to the right of it, growing from almost nothing and overshooting; the balloon swings on its string; TWEET! |
| while open | he flaps (two drawings, three frames each) and hovers; the balloon sways |
| close | the same path back, easing, and he is gone |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **The hint is shrunk to fit three lines** about 118 pixels wide on the balloon. Past forty characters or so it gets small.
- **The bird always comes up to the right of the button,** inside the element. The drawing is 300 by 210 with the button at the bottom centre.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

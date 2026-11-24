# Button

A button who gets bopped. He is a red dome with a grin and his hands flat on the floor, patting it in time. Press him and a gloved fist comes down out of the top of the frame and flattens him, with stars and BOP!. He stays flat for as long as you hold. Let go and he springs back taller than he started, with a black eye, a missing tooth and a sticking plaster, and three birds go round his head for about three seconds before he is himself again.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/button/
```

`?embed=1` hides the heading and the hint.

## Use it

`button.js` is the whole component: one file of about 208 KB with its drawings inside it, and no dependencies.

```html
<script src="button.js"></script>
<hose-button>Confirm</hose-button>
```

```js
const el = document.querySelector('hose-button');
el.addEventListener('click', () => save());
el.impact();          // play the bop without a click
el.disabled = true;
```

| attribute | what it sets | default |
|---|---|---|
| `type` | `submit` submits the form it is in | button |
| `disabled` | like a button's | off |

- **The text inside is the name, not a label you can see.** The drawing is the button, so the text is only what a screen reader hears. Put a visible caption beside it if the page needs one.
- **It is a real `<button>`** in the shadow root, so it takes focus, Space and Enter, and its click reaches your listener.
- **Styling:** `hose-button::part(button)` reaches the button, which lies over the whole drawing.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| press | a fist on a long arm arrives in two drawings and flattens him to half his height; his arms fly up on springs; five stars, a fan of ticks and BOP! |
| hold | he stays flat under the fist |
| let go | the fist leaves the way it came and he springs up 30% too tall, then settles |
| for 3.2 s after | he is black-eyed and bandaged, rocking, his arms hanging loose, with three birds circling over his head; then his own face comes back |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **The daze is not a state you can read.** It is part of the reaction. A second press during it bops him again.
- **The fist comes from above,** inside the drawing, so nothing is drawn outside the element.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

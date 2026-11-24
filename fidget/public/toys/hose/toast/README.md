# Toast

A notification who is a toaster. Call `show()` and he hops up from the bottom edge of the element, squeezes his eyes shut, braces and shakes, and then a slice of toast with the message written on it jumps out of his slot, with DING!, and he throws his hands up. After a few seconds the slice drops back in and he sinks away again.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/toast/
```

`?embed=1` hides the heading and the hint.

## Use it

`toast.js` is the whole component: one file of about 174 KB with its drawings inside it, and no dependencies.

```html
<script src="toast.js"></script>
<hose-toast style="position: fixed; right: 16px; bottom: 0"></hose-toast>
```

```js
const el = document.querySelector('hose-toast');
el.show('Saved!');                                  // written on the slice and read out
el.show('Your changes were saved', 'Saved!');       // the long one is read out, the short one is written
el.hide();
```

| attribute | what it sets | default |
|---|---|---|
| `duration` | seconds the slice stays up; `0` keeps it up until `hide()` | 3.6 |
| `stay` | the toaster is always there, and only the slice comes and goes | off |

- **The message is a status region,** so a screen reader reads it out in full.
- **What is written on the slice has to be short.** It is shrunk to fit two lines about 60 pixels wide. For anything longer than a word or two, pass a short version as the second argument.
- **Put the element at the bottom of something.** Without `stay` he hops up from its bottom edge and sinks back below it, so it reads best against the bottom of the window or a panel.
- **A click on him while the slice is up sends it down.** While he is away the element ignores the pointer.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| `show()` | he hops up in eight drawings (not with `stay`), then for ten drawings he is squashed, eyes shut, fists clenched, shaking |
| the pop | the slice jumps out of the slot in three drawings and bounces; he springs tall, his open hands go up, seven ticks fan out, DING! |
| while it is up | he bounces on the beat and the slice sways a little |
| `hide()`, or the time is up | the slice drops into the slot in four drawings and he sinks away |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **One toast at a time.** A second `show()` while one is up starts over with the new message.
- **The slice has no close button;** a click anywhere on him dismisses it, and it is not in the tab order.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

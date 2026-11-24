# Slider

A slider that is a bamboo rake in a tray of sand. The rake is the thumb and the grooves behind it are the value. Drag it right and its four tines cut fresh lines, pushing a little heap of sand ahead of them that slumps when it stops. Pull it back and the back of the rake drags the sand level, so the tray only ever shows how far it has gone. Throw it at the end and it knocks against the frame. Double-click and it rakes the whole tray flat.

One of four files in this repo. Same idea in each (an ordinary control made of sand that moves like sand), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/slider/
```

`?embed=1` hides the heading and the hint.

## Use it

`slider.js` is the whole control: one file of about 170 KB with the sand engine and its sounds inside it, and no dependencies.

```html
<script src="slider.js"></script>
<sand-slider value="40" label="Volume"></sand-slider>
```

```js
const el = document.querySelector('sand-slider');
el.addEventListener('input', () => setVolume(el.value));   // while it moves
el.addEventListener('change', () => save(el.value));      // when it comes to rest
el.value = 80;        // the rake goes there and cuts on the way
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts | the `min` |
| `min`, `max`, `step` | like a range input's | 0, 100, 1 |
| `label` | what a screen reader calls it | Slider |
| `name` | sent with its form |  |

- **The whole tray takes the pointer.** Press anywhere and the rake comes to that point. Dragging past an end pushes it into the frame.
- **A slider underneath:** `role="slider"` with the value, minimum and maximum set, and arrow keys, Page Up and Down, Home and End.
- **The value is not drawn.** The grooves show how far it has gone; put the number beside it, as the demo does.

## What happens

| you | it |
|---|---|
| drag right | four tines cut four grooves; the sand they move is pushed ahead as a heap that slumps to its angle of rest |
| drag left | the back of the rake drags the grooves flat; what it collects is pushed ahead of it too |
| let go | the rake stops under the finger; a soft settle of sand if it was moving |
| throw it at an end | one knock against the frame, and the heap piles up against the rim |
| double-click | the rake sweeps back to the start and the tray is flat again |

## Limits

- **Four grooves, whatever the range.** The tray is drawn for a short row, about four to six times as wide as it is high.
- **Needs WebGL2** to draw the sand. Without it the control still works with keys and a screen reader, but nothing is drawn.
- **One live tray per element.** Each is its own WebGL canvas, and browsers keep only about sixteen alive at once, so it is not for long lists.
- **It does not hold still for `prefers-reduced-motion`.** The sand still moves. If that matters on your page, use a plain control there.
- **Drawn for a light page.** The sand and the walnut frame are warm and light; they look pasted on over a dark background.
- **The sand is simulated at one cell per CSS pixel,** so a wider element costs more. Each scales to its CSS `width`; the height follows.
- **Sound is on** after the first touch or key on the page. `ZenSand.Sound.on = false` turns every control quiet.
- **Checked in headless Chromium** with real touch and key events, with the CPU slowed four times. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

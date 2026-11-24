# Slider

A slider who is a trombone. His slide is the track, its two tubes coming out of the openings on his horn, and his own gloved hand gripping the handle on it is the thumb, so the value is how far the slide is out. A scale and the number sit under the slide. Notes drift out of the bell while it moves, his cheeks puff, and a fast pull gets a TOOT!.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/slider/
```

`?embed=1` hides the heading and the hint.

## Use it

`slider.js` is the whole component: one file of about 140 KB with its drawings inside it, and no dependencies.

```html
<script src="slider.js"></script>
<hose-slider value="35" label="Volume"></hose-slider>
```

```js
const el = document.querySelector('hose-slider');
el.addEventListener('input', () => setVolume(el.value));   // while it moves
el.addEventListener('change', () => save(el.value));      // when it is let go
el.value = 80;        // from code it goes straight there
```

| attribute | what it sets | default |
|---|---|---|
| `value` | where it starts | half way |
| `min`, `max`, `step` | like a range input's | 0, 100, 1 |
| `label` | what a screen reader calls it, and the first word of the line he says | Slider |
| `name` | sent with its form |  |
| `disabled` | ignores the pointer and the keys | off |

- **The whole drawing takes the pointer.** Wherever you press, the slide goes to that position along the scale.
- **A finger only counts once it has moved sideways,** so the page still scrolls past him.
- **A real `<input type="range">`** lies underneath for the keyboard and the screen reader: arrow keys, Home and End.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| drag | the sleeve, the handle and his hand follow, easing in over about a tenth of a second; his arm stretches as far as it has to |
| while it moves | beamed notes leave the bell and drift up and away; his cheeks puff with the speed |
| a fast pull | TOOT!, at most once every 0.9 s |
| all the time | he bobs on the beat and the number under the slide follows the value |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **The scale has eleven marks whatever the range is.** They are not labelled; the number under the slide is the value.
- **Long numbers crowd the scale.** It is drawn for up to three or four characters.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

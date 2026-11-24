# Signature

A signature pad of smoothed sand. You write with a bamboo stick that cuts like a brush: linger and the line is wide and deep, hurry and it thins, and with a pen, pressing harder cuts wider. The sand it moves heaps up along both sides of the line, a quick flick throws a few grains, and the line tapers off as the stick lifts. Undo fills the last line back in. Clear sends a rake across the tray that smooths everything away, pushing a low ridge of sand ahead of it. What you get back is not a picture of sand: `toDataURL()` gives the signature as plain ink on a transparent PNG, ready for a document.

One of four files in this repo. Same idea in each (an ordinary control made of sand that moves like sand), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/signature/
```

`?embed=1` hides the heading and the hint.

## Use it

`signature.js` is the whole control: one file of about 170 KB with the sand engine and its sounds inside it, and no dependencies.

```html
<script src="signature.js"></script>
<sand-signature name="signature"></sand-signature>
```

```js
const el = document.querySelector('sand-signature');
el.addEventListener('input', () => submit.disabled = el.empty);
const png = el.toDataURL('#1f2a44');   // ink colour; a transparent PNG at twice the size
el.undo(); el.clear();
```

| attribute | what it sets | default |
|---|---|---|
| `name` | its form gets the signature as a PNG data URL |  |
| `aria-label` | what a screen reader calls it | Signature pad: draw your signature in the sand |

- **`el.strokes`** is the signature as points: one array per stroke of `[x, y, width]` in CSS pixels, if you want to keep it as data.
- **Keys:** Backspace undoes the last stroke and Delete clears. There is no way to sign without a pointer.
- **The cursor is the stick.** The pointer is hidden over the tray and a stick is drawn where it is; it reaches past the tray's edges.

## What happens

| you | it |
|---|---|
| press | the stick goes in and starts a groove |
| draw slowly | a wide, deep line, the sand heaped up on both sides |
| draw fast | a thinner line; a quick flick throws a few grains that land as small bumps |
| lift | the line runs on a little and tapers out |
| undo | the last line fills back in over a third of a second |
| clear | a rake crosses the tray in a second and a half and leaves it smooth |

## Limits

- **It needs a pointer to sign.** A keyboard can undo and clear but not write.
- **Twelve undos** are kept.
- **Needs WebGL2** to draw the sand. Without it the control still works with keys and a screen reader, but nothing is drawn.
- **One live tray per element.** Each is its own WebGL canvas, and browsers keep only about sixteen alive at once, so it is not for long lists.
- **It does not hold still for `prefers-reduced-motion`.** The sand still moves. If that matters on your page, use a plain control there.
- **Drawn for a light page.** The sand and the walnut frame are warm and light; they look pasted on over a dark background.
- **The sand is simulated at one cell per CSS pixel,** so a wider element costs more. Each scales to its CSS `width`; the height follows.
- **Sound is on** after the first touch or key on the page. `ZenSand.Sound.on = false` turns every control quiet.
- **Checked in headless Chromium** with real touch and key events, with the CPU slowed four times. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

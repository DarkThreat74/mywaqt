# Cascade button

A button drawn as a small error dialog: a title bar that says ERROR 1995, a round warning icon, your message and a HOLD / CASCADE button. Click it and copies of the dialog fly out and cascade down behind it, bouncing and squashing on the floor like dealt cards, each one a frozen stamp of the last.

Hold it instead and it charges: a wireframe cube unfolds into a 4D hypercube in the dialog, ticking up as it goes. Let go and the cascade is as big as the charge, two dialogs for a tap and ten for a full hold. Click again within a second or so and the combo count climbs.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/button/
```

`?embed=1` shows the control alone, without its window.

## Use it

`button.js` is the whole component: one file of about 149 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 248 × 110 pixels.

```html
<script src="button.js"></script>
<paradise-cascade-button label="Still dreaming?"></paradise-cascade-button>
```

```js
const el = document.querySelector('paradise-cascade-button');
el.addEventListener('action', (e) => console.log(e.detail.combo, e.detail.mega));
el.addEventListener('charge', (e) => console.log(e.detail.charge));   // 0 to 1 while held
el.clearCascade();    // sweep the cards away
```

| attribute | what it sets | default |
|---|---|---|
| `label` | the message in the dialog | Still dreaming? |
| `title` | the dialog's title bar | ERROR 1995 |

- **It is a real `<button>`** in the shadow root: Space and Enter press it, and holding them charges it.
- **The cards stay** until `clearCascade()` or until they pile up past ten.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| click | the button sinks; two or three dialogs cascade down and bounce |
| hold | a cube unfolds into a hypercube; the charge ticks up |
| let go after holding | a mega-cascade of up to ten dialogs |
| click again quickly | the combo count climbs |

## Limits

- **The text is drawn in the canvas.** Keep the label and title short; long ones run past the dialog.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

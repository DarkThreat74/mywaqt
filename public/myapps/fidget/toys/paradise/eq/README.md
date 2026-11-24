# Equalizer

A seven-band graphic equalizer, 60 Hz to 12 kHz. Each band is a slot cut into a glazed pink ceramic rack, filled with sunlit pool water, with a mirror-chrome pearl riding on top. Press and swipe across the slots and you paint the curve in one stroke; the water sloshes up and down to meet your finger.

Put it on a page with `<paradise-cd-dial>` and it becomes that player's equalizer: while a song plays the water jumps with the music, the pearls float up to hold each peak and drop back, and the curve you paint really changes the sound. On its own it is a seven-value control.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/eq/
```

`?embed=1` shows the control alone, without its window.

## Use it

`eq.js` is the whole component: one file of about 423 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 444 × 236 pixels.

```html
<script src="eq.js"></script>
<paradise-eq preset="mallsoft"></paradise-eq>
```

```js
const el = document.querySelector('paradise-eq');
el.addEventListener('change', () => console.log(el.getValues()));   // seven whole numbers, 0 to 100
el.preset = 'sunset';        // mallsoft, sunset, glitch or flat
el.setBand(0, 0.9);          // one band, from 0 to 1 here
```

| attribute | what it sets | default |
|---|---|---|
| `preset` | the starting curve: `mallsoft`, `sunset`, `glitch` or `flat` | mallsoft |
| `live` | `false` stops it following the music | on |

- **It is a group of seven sliders to a screen reader,** with a label; each value is in `getValues()`.
- **Over the top:** pushing a band to the very top flashes a CLIP badge.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| press a slot | the water jumps to your finger and the pearl rides up |
| swipe across | each slot you cross takes the height of your finger, so one stroke draws the whole curve |
| let go | the water settles with a slosh |
| music playing | the water dances to seven bands of the song; pearls hold the peaks and fall |

## Limits

- **Pointer only.** It has no keyboard control yet; it takes focus but the keys do nothing.
- **Not a form field.** Read `getValues()` and send them yourself.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

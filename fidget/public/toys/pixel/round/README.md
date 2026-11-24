# Round

A loading bar that is the bar of a tavern. Seven regulars sit along it: two dwarves, an elf, a wizard, a knight and two hobbits. As the task loads, each one in turn picks up their drink and empties it. At 100% the empties go up together and come down hard.

One of six in this repo. Same idea in each (the control's value changes a pixel world), different control: this one is a progress bar.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/round/
```

Two files: `round.js` is the component and `index.html` is a page that shows it. Vanilla JS and Canvas2D, no dependencies, no network requests, no sound.

Left alone, the bar plays a demo load on a loop, with one stall in the middle. Click the bar to start it again.

- `?p=0.4` holds it at 40%.
- `?embed=1` hides the heading and puts the bar in the middle of the page. The gallery uses it.
- `?film=1` stops the clock and steps the demo load one frame at a time. `&seek=13.5` jumps to a moment in it.

From the console on this page, `round` is the element: `round.set(0.4)`, `round.demo()`, `round.value`.

## Use it

`round.js` is the whole component: one file, no dependencies. Copy it into a project and:

```html
<script src="round.js"></script>
<round-bar value="0" label="Loading the map"></round-bar>
```

```js
const el = document.querySelector('round-bar');
el.set(0.37);       // the task's progress, 0 to 1, as often as you like
el.set(1);          // the empties go up and come down
el.addEventListener('round:done', () => { /* it has reached 100% */ });
el.value;           // the progress it is showing, or null while it plays the demo
el.demo();          // go back to the demo load
```

The bar eases toward the value you give it, so a jump from 10% to 60% still gives each drinker a turn. `el.set(0.4, true)` goes straight there with no easing. At 1 that shows the settled end, with the cups already down.

| attribute | what it sets | default |
|---|---|---|
| `value` | progress, 0 to 1. The bar eases toward it. Without it the bar plays the demo. | none |
| `label` | the `aria-label` on the bar | Loading |

- **`value` and `set()` do the same thing.** `set()` does not write the attribute. Removing the attribute starts the demo.
- **`round:done` fires once each time real progress reaches 1,** when the bar gets there, not when you ask. It bubbles. Drop below 1 and come back, and it fires again. The demo does not fire it.
- **A click replays the demo.** It does nothing while you are driving the bar.
- **Screen readers get a progress bar.** The canvas inside is a `role="progressbar"` and `aria-valuenow` follows the value, 0 to 100.
- **Size.** The element is a block as wide as its container. The bar inside it keeps its 476:160 shape and is drawn at the largest of 4, 3, 2.5, 2, 1.5 or 1 canvas pixels per art pixel that fits the element's width in device pixels. So it can be a little narrower than the element. It is chosen again when the element is resized. The bar sits at the left; `round-bar::part(bar) { margin: 0 auto; }` centres it.
- **More than one on a page works.** They share one painter and one animation loop.
- **To step it yourself,** set `customElements.get('round-bar').paused = true` and call `el.advance(seconds)`. `el.demoLength` is the length of one demo load, 16.8 seconds.

The page in this folder is a demo of the element. Its own wiring (`?p`, `?embed`, `?film`) is the short script at the bottom of `index.html`.

## What happens

| progress | what you see |
|---|---|
| 0% | seven full cups on the bar, three candles, the hearth |
| each seventh | the next drinker reaches, lifts, tips it back, puts it down empty |
| a stall | whoever is mid-drink keeps swallowing until the number moves |
| 100% | the empties go up in a wave, hang, and slam down left to right; the candles duck and the rail flares |

Everything a drinker does is worked out from the progress number, so the drinking and the percentage cannot drift apart. Only the swallowing, the blinking, the fire and the smoke run on the clock.

Each drinker starts reaching a little before the one beside them has put theirs down, so the motion passes along the bar without a gap.

## How it's built

- **Paint, then crush.** The scene is painted smooth at 476×160 and then every pixel is mapped to one of 49 colours with a 4×4 ordered dither. The mapping uses a lookup table, so it runs on every frame.
- **Light is multiplied in.** Each figure is painted in its own colours on its own layer, then multiplied by a light map: a cold dark ambient plus the three candles, the hearth and the moon through the window. Things that glow (eyes, the pipe, the staff) are put back afterwards. The hobbit in front of the fire gets almost no light from the front and a bright rim instead.
- **The cup leads.** Each drinker has a cup with three positions: on the bar, at the mouth, held up. The hand stays on the grip, the elbow swings around the shoulder, and the head tips to meet it.
- **Seven cups.** Oak tankard, silver beaker, clay mug, lidded stein, drinking horn, steel goblet, dented tin cup.
- **Still poses are cached.** A figure that is waiting or finished is drawn once and reused. Only whoever is moving is repainted and re-lit.
- **One painter, many bars.** The palette, the lookup table, the baked room and the pose cache are shared. A bar owns only its value, its clock and its canvas.

Measured in headless Chrome, one bar at 714 pixels wide: about 1.5 ms a frame while nothing moves, about 4.5 ms while one drinker is drinking, and 12 to 15 ms at the end while all seven move, with single frames up to about 21 ms. It ran at 60 fps through the load and at 58 to 60 through the ending. Each bar on a page is painted in full.

## Limits

- **The words in the bar are fixed.** It says LOADING and a percentage, then DONE. `label` changes what a screen reader hears, not what is drawn.
- **The half steps are uneven.** At 1.5 and 2.5 canvas pixels per art pixel, art columns and rows are not all the same width. The whole steps are even.
- **A narrow 1x screen shrinks it.** Under 476 CSS pixels wide at a pixel ratio of 1, the canvas is scaled down by the browser to fit, so it is not pixel-exact there. At a 390 pixel page: 2x art pixels at a ratio of 3, 1.5x at a ratio of 2, shrunk at a ratio of 1.
- **A ratio of 3 has one seam.** The bar's width is then a third of a pixel off a whole CSS pixel. In headless Chrome that showed as one art column and one art row drawn a device pixel off, through the middle. Not checked on a phone.
- **No reduced-motion setting.** It moves the same for everyone.
- **Not on npm, and not a module.** It is a plain script that registers the element when it loads.

## A clip

`?film=1` stops the clock and steps the demo load one frame at a time, which is what the capture script needs. This frames the bar on its own, 952 pixels wide. It has not been run on this version.

```sh
W=1080 H=540 URL='http://localhost:8000/round/?film=1&embed=1' OUT=round.mp4 node film/render.mjs
```

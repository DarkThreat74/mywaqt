# Hoard

A hold-to-delete button with a dragon asleep in it. Hover and one eye opens. Hold and he breathes in, then the fire crosses the button, and that fire is the fill. Let go early and he swallows it and blows one smoke ring. Hold to the end and the parchment card the button sits on is scorched.

One of six in this repo. Same idea in each (the control's value changes a pixel world), different control: this one is a button you hold.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/hoard/
```

Two files: `hoard.js` is the component and `index.html` is a page that shows it. Vanilla JS and Canvas2D, no dependencies, no network requests, no sound.

- **Mouse or touch:** press and hold the button for 1.7 seconds.
- **Keyboard:** Tab to it (the outline turns yellow), then hold Space or Enter.
- **"Put it back"** appears under the card after a delete and resets the demo. It belongs to the demo page, not the component.

## Use it

`hoard.js` is the whole component: one file, no dependencies. Copy it into a project and:

```html
<script src="hoard.js"></script>
<hoard-button heading="Delete this project" warning="This can't be undone."></hoard-button>
```

```js
const el = document.querySelector('hoard-button');
el.addEventListener('hoard:delete', () => { /* do the delete */ });
el.reset();     // put it back
el.held;        // 0 to 1, how far through the hold
el.deleted;     // true once it has fired
```

The event fires once, the moment the hold completes, and it bubbles. Letting go early fires nothing.

| attribute | what it sets | default |
|---|---|---|
| `label`, `done-label` | the words on the button, before and after | Hold to delete, Deleted |
| `heading`, `warning` | the two lines on the card | none |
| `done-heading`, `done-warning` | the same two lines after the delete | Deleted, nothing |
| `hold` | seconds you have to hold | 1.7 |

- **With a `heading` it draws the parchment card round itself,** and that card is what gets scorched. Without one it is just the button, 294 by 72.
- **More than one on a page works.** They share one painter and one animation loop.
- **A narrow card wraps:** under about 490 pixels wide the button drops below the words.

The page in this folder is a demo of the element. Its own wiring ("Put it back", `?film=1`) is the short script at the bottom of `index.html`.

## What happens

| you | him |
|---|---|
| nothing | asleep, with a breath out of the nostril every few seconds |
| hover or focus | one eye opens, and he blinks now and then |
| hold, first sixth | the head pulls back and the plates under his jaw light |
| keep holding | the jaws open and the fire crosses the button; the label turns dark where it has been |
| let go early | the fire pulls back in, he blows a smoke ring, and the eye stays on you for a couple of seconds |
| hold to the end | the card is charred outward from the button, the words change to "deleted", and he goes back to sleep |

Everything he does comes from one number, how far through the hold you are, so the fire and the progress cannot drift apart. Only the flicker, the blinking, the smoke and the cooling embers run on the clock.

## How it's built

- **Paint, then crush.** The scene inside the button is painted smooth at 192×40, multiplied by a light map (a cold ambient plus the fire and the glow in his throat), then every pixel is mapped to one of 54 colours with a 4×4 ordered dither. It runs every frame through a lookup table.
- **The button outline is pixels too.** An ink capsule with stepped round ends and a hard shadow, drawn at the same scale. Pressed, it sits down on its shadow.
- **The card is drawn, not styled.** Flat parchment tones with a checker where two tones meet, stepped corners, a nicked edge with one tear, and a wax seal. It is repainted to the card's own size whenever the layout changes.
- **The burn is a distance field.** How far each pixel is from the button is worked out once. Burning is then one pass that sorts pixels into char, a live edge and a singed band, and the live edge cools over about nine seconds.
- **The lettering is a 5×7 pixel font** in the same grid as the art. The real words stay in the page underneath, transparent, for layout and screen readers.

It costs about 2 to 3 ms a frame in headless Chrome and ran at 60 fps there.

## Limits

- **Caps only.** The font has A to Z, 0 to 9 and `. ' " - ? !`. Anything else is drawn as a space.
- **One line each.** The drawn title and warning do not wrap, so long text runs off the card even though the hidden real text wraps.
- **You have to be able to hold.** There is no alternative for someone who cannot keep a key or a finger down for 1.7 seconds.
- **No clip yet.** `?film=1` runs a scripted take one frame at a time (hover, a hold that is let go, then a full hold), and `&seek=6.5` jumps to a moment in it, but nothing has been rendered from it.
- **Not on npm, and not a module.** It is a plain script that registers the element when it loads.

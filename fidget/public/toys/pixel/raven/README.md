# Raven

A send button with a raven in it. He sits on a branch with the message at his feet. Hover and he caws. Press and he takes the message across the button to the tower window, and that flight is the progress. When he is in, the window lights with him sitting in it, and the button says it is sent.

One of six in this repo. Same idea in each (the control's value changes a pixel world), different control: this one is a button that shows how far a send has got.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/raven/
```

Two files: `raven.js` is the component and `index.html` is a page that shows it. Vanilla JS and Canvas2D, no dependencies, no network requests, no sound.

- **Mouse:** click the button. The flight takes 2.5 seconds.
- **Keyboard:** Tab to it (the outline turns yellow), then press Space or Enter.
- **"Send another"** appears under the button once it is sent and resets the demo. It belongs to the demo page, not the component.
- `?embed=1` hides the heading and the hint, for showing it inside another page.
- `?film=1` stops the clock and runs a scripted take one frame at a time, and `&seek=3` jumps to a moment in it.

## Use it

`raven.js` is the whole component: one file, no dependencies. Copy it into a project and:

```html
<script src="raven.js"></script>
<raven-send></raven-send>
```

```js
const el = document.querySelector('raven-send');
el.addEventListener('raven:sent', () => { /* the message has gone */ });
el.reset();      // put him back on the branch
el.progress;     // 0 to 1, how far he has flown
el.sent;         // true once it has fired
```

The event fires once, the moment he arrives, and it bubbles. Clicking again while he is flying, or after it is sent, does nothing.

| attribute | what it sets | default |
|---|---|---|
| `label`, `sent-label` | the words on the button, before and after | Send, Sent |
| `duration` | seconds a timed flight takes | 2.5 |
| `progress` | 0 to 1, from your own upload | not set |

- **Without `progress`, a click runs a timed flight.** That is the demo.
- **With `progress`, it follows your number and does not run its own timer.** A click starts nothing, so listen for the click yourself, do the upload, and set the attribute as it goes. He catches up at a fixed speed, so a jump in progress is flown, not teleported. If the number goes down he goes back. `raven:sent` fires when he reaches 1.
- **Once sent, it stays sent** until `reset()`, whatever `progress` says. After a reset he waits on the branch until `progress` is set again.
- **Size:** 294 by 72, like Hoard.
- **More than one on a page works.** They share one painter and one animation loop.
- **Inside it is a real button.** The label is real text, drawn transparent. It is `aria-busy` while he flies. When it is sent the button is `aria-disabled` and the sent label is written to a `role="status"` element.

To step it from a script, the way the film does:

```js
const RavenSend = customElements.get('raven-send');
RavenSend.paused = true;           // stop the clock
el.input.hover = true;             // input is { hover, down, focus }
el.input.down = true;  el.advance(1 / 60);
el.input.down = false; el.advance(1 / 60);   // letting go starts the flight
el.advance(0.5);                   // half a second on
```

The page in this folder is a demo of the element. Its own wiring ("Send another", `?embed=1`, `?film=1`) is the short script at the bottom of `index.html`.

## What happens

| you | him |
|---|---|
| nothing | sits on the branch with the message at his feet, and blinks now and then |
| hover or focus | stretches his neck and caws twice |
| press | lifts a wing, and the button sits down on its shadow |
| press, then drag off and let go | nothing is sent |
| let go | hops onto the message, takes it in his feet and flies; the label turns gold behind him |
| the last quarter | flies in front of the tower and in through the window. The part of him that has gone in is no longer drawn |
| arrives | the window flashes, then stays lit with him sitting in it, looking back. The label changes, the outline dims and the button stays down |

Where he is comes from one number, how far the send has got, so the bird and the progress cannot drift apart. Only the wing beats, the blinking and the flicker in the window run on the clock, so if an upload stalls he flaps on the spot.

## How it's built

- **Paint, then crush.** The scene inside the button is painted at 192×40, lit, then every pixel is mapped to one of 38 colours with a 4×4 ordered dither. It runs every frame through a lookup table.
- **The raven is a shape, placed by hand.** At this size he is about 20 pixels tall, so every pose is a small pixel map and nothing is rotated or scaled. The bill is as dark as the body, so the outline does the work: a deep bill and a ragged throat.
- **Four wing poses, stepped.** Up, level, down and coming back up. In each one the wings are outside the body's outline, so no frame is a plain dark lump.
- **The message is 7 by 3** and hangs from his feet, behind the wings. It is drawn after the light, in exact colours, so it never goes grey.
- **One light: the window.** The sky and hills get none. The tower wall takes the light in two flat rings, in steps, so the stones stay flat tones. He gets a thin warm edge on the side facing the window, which goes once he is in front of it.
- **He goes in through the window, and nothing is scaled.** He is drawn in front of the tower. The far side of the opening is a line that follows the arch row by row, and whatever of him is past it has gone inside and is not drawn. Once all of him is in, the window flashes pale for about a sixth of a second, and under the flash the sitting bird appears, mirrored, in one dark colour.
- **The button outline is pixels too.** An ink capsule with stepped round ends and a hard shadow, the same as Hoard. Pressed, it sits down on its shadow. With keyboard focus the outline and shadow are yellow.
- **The lettering is a 5×7 pixel font** in the same grid as the art. The real words stay in the page underneath, transparent, for layout and screen readers.

It cost about 1.4 ms a frame in headless Chrome, and two of them flying at once ran at 60 fps there.

## Limits

- **Caps only.** The font has A to Z, 0 to 9 and `. ' " - ? !`. Anything else is drawn as a space.
- **One short line.** "SEND MESSAGE" (12 characters) fits. Much longer runs under the branch and the tower.
- **One size.** It does not shrink on a page narrower than 294 pixels.
- **No disabled look and no failed look.** There is nothing for a send that went wrong. `reset()` only puts him back.
- **Going backwards is plain.** If `progress` falls he slides back the way he came, still facing the tower.
- **Motion is always on.** It does not change for `prefers-reduced-motion`.
- **Weak frames.** The coming-back-up wing pose is the least clear of the four. For the last few frames only his tail is left in the opening. The flash is an empty pale window.
- **Checked in headless Chrome only,** with a real mouse click and real key presses sent through its DevTools protocol. Not tried in Safari or Firefox, on a touch screen, or with a screen reader.
- **No clip yet.** `?film=1` runs a scripted take (idle, hover, press, the flight, sent), but nothing has been rendered from it.
- **Not on npm, and not a module.** It is a plain script that registers the element when it loads.

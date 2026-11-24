# Plunger

A send button you have to mean. It is a pinball shooter rod with nothing round it: a black knob, a chrome collar, the rod, a red rubber tip, a steel bracket, and two springs drawn live, one that squashes and one that stretches. Drag the knob back. The rod ratchets every fifth of the way. Pull all the way and a steel ball drops in front of the pulled-back tip and bounces twice. Let go and the plunger slams forward and knocks the ball off the edge of the screen, and `send` fires. A shorter pull just springs back and sends nothing.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/plunger/
```

`?embed=1` hides the heading and the hint.

## Use it

`plunger.js` is the whole control: one file of about 432 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="plunger.js"></script>
<pinball-plunger label="Send"></pinball-plunger>
```

```js
const el = document.querySelector('pinball-plunger');
el.addEventListener('send', (e) => send(e.detail.power));   // power: how hard, 0 to 1
el.fire();            // a full pull and release, from code
```

| attribute | what it sets | default |
|---|---|---|
| `label` | its name for screen readers | Send |
| `flip` | puts the knob on the left: you pull left and the ball leaves to the right | off |
| `disabled` | greys it out and ignores presses | off |

- **It is a `<button>`** in the shadow root. Hold Space or Enter to pull it back and let go to shoot; a screen reader can also press it, which does the whole pull.
- **Leave room on both sides.** About one knob-height on the knob's side for the pull, and on the tip's side for the ball. The ball leaves across the page: while it rolls away it is drawn above everything else, then removed.
- **Let go while the ball is still falling** and the plunger waits for it to land.
- **Size** is `--pb-size`, the height of the knob: 44 pixels by default.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| drag the knob back | the spring squashes and the rod ratchets every fifth of the way |
| pull all the way | a relay clicks, a ball drops in front of the tip, lands and bounces twice |
| let go | the plunger slams forward, hits the ball and knocks it off the edge of the screen; `send` fires with `{ power }` at the hit |
| let go early | it springs back home; nothing is sent |

It does not change with `prefers-reduced-motion` yet: the pull and the shot still play.

## Limits

- **Reduced motion is not honoured yet.** The pull and the shot still play.
- **The ball crosses the whole page,** above everything else, for about a second.
- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

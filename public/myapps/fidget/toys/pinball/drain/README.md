# Drain

Delete, with undo. A steel plate holds a chute with a ball resting at the top, a dark outhole at the bottom, and a round SHOOT AGAIN lamp. Press the ball, or drag it down the chute, and it rolls into the hole and drops out of sight: that is the delete. SHOOT AGAIN starts blinking for the undo window, faster near the end. Press it and the ball-save kickback fires the ball straight back up out of the drain, with two chime notes: that is the undo. Let the window run out and the lamp goes dark and the delete is final.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/drain/
```

`?embed=1` hides the heading and the hint.

## Use it

`drain.js` is the whole control: one file of about 888 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="drain.js"></script>
<pinball-drain window="6000" label="Delete draft"></pinball-drain>
```

```js
const el = document.querySelector('pinball-drain');
el.addEventListener('delete', (e) => hide(draft));        // e.detail.undoMs: how long undo lasts
el.addEventListener('undo', () => show(draft));
el.addEventListener('commit', () => destroy(draft));      // the window ran out
el.state;             // 'ready', 'draining', 'undoable', 'saving' or 'gone'
el.reset();           // a new ball at the top, ready again
```

| attribute | what it sets | default |
|---|---|---|
| `window` | how long undo lasts, in milliseconds; 0 makes the delete final at once | 6000 |
| `label` | the group's name for screen readers | Delete and undo |
| `disabled` | greys it out and ignores presses | off |

- **Two `<button>`s** in the shadow root: the chute (Enter, Space, Delete or Backspace drains the ball) and SHOOT AGAIN, which is `aria-disabled` except while undo is possible.
- **After `commit` it stays empty** until you call `reset()`. The demo pages reset it after a moment.
- **`el.remaining`** is how many milliseconds of undo are left.
- **Size** is `--pb-size`, its height: 112 pixels by default.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| press the ball or drag it down | a relay, then the ball rolls down the chute and drops into the hole; `delete` fires |
| during the window | SHOOT AGAIN blinks, then blinks faster near the end |
| press SHOOT AGAIN | the kickback solenoid fires the ball back up the chute with a streak and two chime notes; `undo` fires |
| let it run out | a low chime, the lamp goes dark; `commit` fires |

With `prefers-reduced-motion` the ball and the moving parts go straight to where they end up, and the lamps still light.

## Limits

- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

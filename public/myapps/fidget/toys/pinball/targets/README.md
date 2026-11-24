# Drop targets

A checkbox group of up to four. The body is a photograph of a steel drop-target bank with an amber lamp in front of each slot, and the targets are ivory blocks with your words printed on them. Tick an item and a chrome ball rolls in from below, knocks its target down into the slot, lights the lamp and bounces away. Untick it and the reset solenoid pops the target back up and the lamp goes dark. Knock the last one down and a three-note bonus chime plays.

One of seven files in this repo. Same idea in each (an ordinary control as a real pinball part: a photographed body, a live chrome ball, recorded sounds), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/targets/
```

`?embed=1` hides the heading and the hint.

## Use it

`targets.js` is the whole control: one file of about 838 KB with its photographs and sounds inside it, and no dependencies.

```html
<script src="targets.js"></script>
<pinball-targets items="EMAIL,PUSH,TEXT,CALLS" checked="0,2" label="Alerts"></pinball-targets>
```

```js
const el = document.querySelector('pinball-targets');
el.addEventListener('change', (e) => console.log(e.detail.item, e.detail.checked, el.selected));
el.addEventListener('bonus', () => celebrate());   // all of them ticked
el.setChecked(1, true);   // or el.toggle(1), el.resetAll(), el.checked = [true, false, true, false]
```

| attribute | what it sets | default |
|---|---|---|
| `items` | the labels, comma-separated, up to four | EMAIL,PUSH,TEXT,CALLS |
| `checked` | which start ticked, by position from 0 or by label | none |
| `label` | the group's name for screen readers | Bonus targets |
| `name` | sent with its form as the ticked labels, comma-separated |  |
| `disabled` | greys it out and ignores presses | off |

- **It is a `role="group"` of `<button role="checkbox">`s** in the shadow root, one per target, each named by its label. Left and right arrows move between them; Space or Enter ticks.
- **`change` fires with `{ index, item, checked, selected, allChecked }`**, and `bonus` with `{ selected }` when the last one goes down.
- **Size** is `--pb-size`, the bank's height: 84 pixels by default.
- **Attributes set where it starts.** After that, use the properties and methods above.
- **Sound is on.** It plays after the first press on the page, as browsers require. Add `silent` to the element to mute it, or set `PinballKit.sound = false` to mute every pinball control on the page.

## What happens

| you | it |
|---|---|
| tick | a solenoid kick, a ball rolls in from below and knocks the target down; the lamp lights and a chime note rises with each target down |
| untick | the reset solenoid fires, the target pops back up with a relay click, the lamp goes out |
| tick the last one | the bonus chime: three rising notes |

With `prefers-reduced-motion` the ball and the moving parts go straight to where they end up, and the lamps still light.

## Limits

- **Four at most.** The bank is photographed with four slots; with fewer items the spare slots stay empty.
- **Short labels.** About six capital letters fit on a target.
- **It needs WebGL** for the ball and the lamps. Without it the control is still a working, focusable control, but nothing is drawn.
- **One kind of picture.** It scales with `--pb-size` and stays sharp up to about three times its default size, but it does not reflow: the photographed body keeps its shape.
- **The ball mirrors the page.** Set `--pb-page` to your page colour (a hex colour such as `#14161a`) so its reflections match; the default is the cream the set was shot on.
- **The file is large** because the photographs and the sounds are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real touch and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader, and the sound has not been checked on a phone.

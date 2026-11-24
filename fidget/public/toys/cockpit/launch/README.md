# Launch

A two-step confirm. An orange guard sits over a red button, with a screen beside it and a strip of ten lamps underneath. Press the guard to lift it. Then hold the button: the lamps count up from amber to red, the screen counts 3, 2, 1, and speed lines close in on the button. Let go early and it winds back down. Hold for 2.4 seconds and it launches: two black-and-white impact frames, the thrusters, then the robot leaves across the whole control with 発進! (launch).

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/launch/
```

`?embed=1` hides the heading and the hint.

## Use it

`launch.js` is the whole control: one file of about 1144 KB with its paintings inside it, and no dependencies.

```html
<script src="launch.js"></script>
<cockpit-launch></cockpit-launch>
```

```js
const el = document.querySelector('cockpit-launch');
el.addEventListener('cockpit:launch', () => deploy());
el.state;             // 'safe', 'armed' or 'launched'
el.arm();             // lift the guard from code
el.reset();           // guard down, ready again
```

- **Two real buttons** in the shadow root: the guard is a `<button role="switch">` and the red button is a `<button>`. Both take focus; Space or Enter held down holds the button.
- **Pressing the button after a launch resets it.**
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| press the guard | it flips open with ガコン (clunk) and the screen changes from SAFE to HOLD |
| hold the button | lamps light one by one, the screen counts down, the button heats, speed lines close in, キュイイイン (whine) grows |
| let go early | everything winds back down in under a second |
| hold to the end | two impact frames, the thruster cut-in, then the robot flies out over the control with 発進!; `cockpit:launch` fires when it has gone, about four seconds later |
| press again | back on the rail, guard still open |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **The launch picture is drawn outside the control** for about three seconds, above and below it. Leave room, or it will cover what is next to it.
- **The hold time is fixed** at 2.4 seconds.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

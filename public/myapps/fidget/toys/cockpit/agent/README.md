# Agent state

A status display for an AI agent. The robot appears as a hologram standing on a painted projector base, turning slowly on the spot. Its pose and colour follow the state: cyan and standing for standby, amber with a hand to its chin for thinking, green and leaning in for working, amber and blinking when it needs you, green with a fist raised for done, red and glitching for an error. A window on the base names the state and types out the task. Done gets 完了! (complete) and a thumbs-up cut-in; an error gets 異常! (fault).

One of eleven files in this repo. Same idea in each (an ordinary control as a piece of a giant-robot cockpit), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/agent/
```

`?embed=1` hides the heading and the hint.

## Use it

`agent.js` is the whole control: one file of about 2.8 MB with its paintings inside it, and no dependencies.

```html
<script src="agent.js"></script>
<cockpit-agent></cockpit-agent>
```

```js
const el = document.querySelector('cockpit-agent');
el.set('thinking', 'planning the approach');
el.set('working', 'editing 4 files');
el.set('waiting', 'approve: run the tests?');
el.set('done', 'all checks pass');      // plays the cut-in
el.set('error', 'build failed, exit 1');
el.state;             // the state showing now
```

| attribute | what it sets | default |
|---|---|---|
| `state` | which state it starts in | standby |
| `task` | the line in the window at the start | the state's own |

- **The lines under it are announced.** The state line goes to a polite live region in the shadow root.
- **The button on the base is for demos.** It steps to the next state; a real agent calls `set()`.
- **The hologram is four short video clips,** one per pose, inside the file. They are muted and loop.
- **Attributes set where it starts.** After that, use the properties and methods above; changing an attribute later does nothing.
- **It has a line to say.** `el.line` is what it last said about what happened, and each new one fires `cockpit:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| `set("thinking")`, `set("working")` | the pose changes after two dark drawings, a timer starts in the window, the lamps chase, and it turns faster |
| `set("waiting")` | amber, blinking, turning slowly |
| `set("done")` | two impact frames, 完了!, the thumbs-up cut-in |
| `set("error")` | 異常!, the hologram turns red, jitters and drops out now and then |

With `prefers-reduced-motion` the shaking, the impact frames and the cut-in are skipped and the lettering holds still.

## Limits

- **The largest file, about 2.8 MB,** because of the four clips.
- **The hologram turns smoothly,** unlike everything else in the set, which moves twelve drawings a second.
- **Waiting and error reuse the standing pose.**
- **With reduced motion the hologram holds still** on one view.
- **Drawn for a dark page.** The pieces float with no card behind them and the screens glow; on a light background the black outlines and the glow look wrong.
- **One size of painting.** It is 640 pixels wide at most and scales down with its container, text and hit areas included; it does not reflow. At phone width the text on the screens is small.
- **The labels are painted.** The stencil text and the Japanese on the sheets and lettering are part of the art and cannot be changed or translated.
- **The file is large** because the paintings are inside it. Load only the controls a page uses.
- **Checked in headless Chromium** with real click and key events at phone width. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

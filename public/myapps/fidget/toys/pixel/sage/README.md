# Sage

Thinking states for an agent. A status chip with a wizard at his desk in it, and whatever the agent is doing, he is doing.

One of six in this repo. Same idea in each (the control's value changes a pixel world), different control: this one is the line that tells you what an agent is up to.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/sage/
```

Two files: `sage.js` is the component and `index.html` is a page that shows it. Vanilla JS and Canvas2D, no dependencies, no network requests, no sound.

Left alone, the page plays a made-up run on a loop. The links under the chip hold it in one state.

- `?state=reading&detail=AGENTS.md` opens it in one state.
- `?film=1` steps the run one frame at a time, and `&seek=12` jumps to a moment in it.

## The states

| state | default label | what he is doing | what lights the room |
|---|---|---|---|
| `thinking` | Thinking | stroking his beard with his eyes shut, while three motes circle until they meet | the candle, and the spark when they meet |
| `searching` | Searching | leaning into a crystal ball with a hand either side of it | the ball, teal |
| `reading` | Reading | a big book on a stand; a point of light runs along each line, and at the end of the page he flicks a finger and it turns itself | the candle |
| `running` | Running | stirring a cauldron that bubbles | the cauldron, green |
| `writing` | Writing | a quill working across a scroll, three lines at a time | the candle |
| `waiting` | Needs you | turned to face you and waving, with an exclamation mark bouncing in a bubble over the desk; the page and quill are ready | the candle |
| `done` | Done | nodded off, hat over his eyes, the candle out, the scroll sealed | the moon |
| `failed` | Failed | covered in soot, hat blown back, the cauldron on its side, the end of his beard still alight | embers |

Going from one state to another, the room dips to dark and comes back.

## Use it

`sage.js` is the whole component: one file, no dependencies. Copy it into a project and:

```html
<script src="sage.js"></script>
<sage-status state="thinking"></sage-status>
```

```js
const el = document.querySelector('sage-status');
el.set('searching');                          // the default label
el.set('reading', 'Reading', 'AGENTS.md');    // your own label and a second line
el.set('waiting', 'Needs you', 'Approve the edit');
el.play();                                    // the made-up run, on a loop
el.state;                                     // the current state name
el.states;                                    // all eight names
```

- **Attributes** do the same job as `set`: `state`, `label` and `detail`. Add `demo` to start it on the made-up run.
- **An unknown state name is ignored.** With no second line, the working states show how many seconds they have been going.
- **Size:** 306 by 72 by default. Set a CSS width on the element and it keeps its shape.
- **More than one on a page works.** They share one painter and one animation loop.
- **Screen readers:** whatever the chip says is also written to a `role="status"` element inside it, so each change is announced.

The page in this folder is a demo of the element. Its own wiring (the links, `?state=`, `?film=1`) is the short script at the bottom of `index.html`.

## How it's built

- **Paint, then crush.** The scene is painted smooth at 200×44, multiplied by a light map, then every pixel is mapped to one of 63 colours with a 4×4 ordered dither. It runs every frame through a lookup table.
- **One rig, eight jobs.** The wizard is drawn side on: a head that can move and tip (and a second, front-on head for when he turns to you), a hat, a beard, and an arm made of two bones of fixed length, so however far he reaches it stays an arm. Each state is a small table: where the head and hand go over time, what is on the desk, what glows, and what light that throws.
- **The light is the state.** Each state has its own lamp, so you can tell searching from running by the colour of the room before you read the label.
- **Whole pixels.** Head and hand positions are rounded, so he moves in steps the way a sprite does.
- **Lit from in front.** The candle and whatever he is working at are both on the far side of him, so his face and beard always catch the light.
- **The lettering is a 5×7 pixel font** drawn into the art, with a plain frame around the chip because it is not a button.

It costs about 2.8 ms a frame in headless Chrome and ran at 60 fps there.

## Limits

- **Caps only.** The font has A to Z, 0 to 9 and `. , : ' " - _ / ? ! %`. Anything else is drawn as a space.
- **Short lines.** The label fits about 14 characters and the second line 17. Longer text is cut with two dots.
- **One size.** The chip is 306 by 72 and only shrinks if the page is narrower than that.
- **The run on the page is invented.** Nothing here is wired to a real agent.
- **Not on npm, and not a module.** It is a plain script that registers the element when it loads.

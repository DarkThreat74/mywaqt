# Keep

A password field where strength is a castle. Every keystroke drops building pieces into a pixel-art scene. When you stop typing, a raccoon tests what you built.

One of six in this repo. Same idea in each (interaction changes a pixel world), different control: this one is a text field, and the scene is assembled piece by piece instead of scrubbed.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/keep/
```

Two files: `keep.js` is the component and `index.html` is a page that shows it. Vanilla JS and Canvas2D, no dependencies, no network requests, no sound. Nothing you type is stored or sent anywhere.

Click the field and type. The eye button shows or hides the characters. Paste, select-all and delete work as usual.

- `?pw=Sunny!day42` starts with that typed in and showing. Handy for checking a stage.
- `?embed=1` hides the heading and sizes the field to fit the window both ways. It is for showing the page in a frame.
- `?demo=1` plays the scripted take from the clips, live. `&loop=1` repeats it and `&take=chbs` plays the second take.
- `?film=1` stops the clock so the take can be stepped a frame at a time. `&seek=6.5` starts that far in.

From the console on this page, `keep` is the element: `keep.value`, `keep.score`, `keep.stage`.

## Use it

`keep.js` is the whole component: one file, no dependencies. Copy it into a project and:

```html
<script src="keep.js"></script>
<keep-field name="password"></keep-field>
```

```js
const el = document.querySelector('keep-field');
el.value;            // what is typed. Set it to type something in.
el.score;            // 0 to 1
el.stage;            // 0 to 5: wide open, rope fence, palisade, wall + moat, castle, dragon
el.stageName;        // 'WIDE OPEN' to 'DRAGON'
el.addEventListener('input', () => { /* a key was typed; el.value is the new value */ });
el.addEventListener('keep:change', (e) => { /* e.detail is { score, stage, stageName } */ });
```

| attribute | what it sets | default |
|---|---|---|
| `placeholder` | the grey words drawn in the empty field | choose a password |
| `maxlength` | the most characters it takes | 40 |
| `autocomplete` | passed to the real input | new-password |
| `name` | the name its value is sent under in a form | none |

- **`value`** reads and sets what is typed. Setting it does not fire `input`, as with a plain input.
- **`score`, `stage` and `stageName`** follow the value at once. `stage` is the stage the score earns. The drawing gets there a moment later, as the pieces land, and the dragon needs a second more to arrive.
- **`input`** is the real input's own event. It crosses out of the element, and `event.target` is the `<keep-field>`.
- **`keep:change`** fires whenever the score changes, from typing or from setting `value`. It bubbles and crosses out of the element. For a keystroke it comes just before `input`.
- **`shown`** is whether the characters are showing. The eye button flips it, and you can set it.
- **Forms.** With a `name`, what is typed is sent with the form the element is in. Enter in the field submits that form. Resetting the form clears the field.
- **Focus.** Tab reaches the field and then the eye button, and both show a gold ring in the drawing. A press anywhere on the picture puts you in the field. `el.focus()` does the same.
- **Screen readers** get a password field called Password, described by the stage name and the verdict, which sit in a polite live region. The eye is a toggle button.
- **Size.** The element is a block as wide as its container, up to 744 CSS pixels, and keeps its 744:608 shape. The card is 720 of those 744; the rest is room for the card's edge and the meter's bounce. `keep-field { max-width: none; }` lets it grow past 744. It is drawn again whenever its size changes.
- **It paints no background.** Around the card the canvas is clear, so the page shows through. The stage name and verdict are dark, so it wants a light page. It was drawn on cream, `#efe8d8`.
- **More than one on a page works.** Each field has its own value and its own castle.
- **To step it yourself,** set `customElements.get('keep-field').paused = true` and call `el.advance(seconds)`. `el.clock` is how long that field's clock has run.

`el.film()` is for making the clips and is not part of the field. It takes the real input away and paints the whole page the clips were filmed on, to the size of the window: the cream page, a caption, a drawn cursor and an end card. The page in this folder calls it for `?demo=1` and `?film=1`.

The page in this folder is a demo of the element. Its own wiring (`?pw`, `?embed`, `?demo`, `?film`) is the short script at the bottom of `index.html`.

## What happens

The score lays down 100 pieces in order. Each character that makes the password harder to guess adds a handful; deleting knocks them off again, and so does finishing a word that turns out to be `password`.

| stage | what gets built | what the raccoon does |
|---|---|---|
| wide open | a few stakes | walks in and takes the chest |
| rope fence | stakes, rope and a sign | hops the rope and takes the chest |
| palisade | a wall of logs with a gate | brings a ladder and takes the chest |
| wall + moat | stone blocks, battlements, two pits of water | jumps, falls in, paddles out, goes home wet |
| castle | keep, towers, roofs, flags, a knight | gets an arrow at his feet and leaves |
| dragon | a dragon lands on the keep | gets set on fire and hides in his bush |

He waits about a second after your last keystroke. Type while he's on his way and he bolts.

A known password collapses the build no matter how long it is. Typing `hunter2` raises half a palisade, and the final `2` knocks it all down.

## How it scores a password

`strength()` estimates how many guesses a password would take, trying things in the order an attacker would, and the castle is built from that number. Length on its own buys very little.

| it looks for | example | what it is worth |
|---|---|---|
| the usual passwords | `password`, `hunter2`, `iloveyou` | almost nothing, even with a capital and a `1!` on the end |
| letters swapped for symbols | `P@ssw0rd` | read as the word it is, times a little |
| pronounceable words | `elephant` | far fewer guesses than eight random letters |
| keyboard runs and sequences | `qwertyuiop`, `abcdef`, `98765` | a few hundred guesses however long they are |
| the same thing repeated | `aaaaaaaa`, `justinjustinjustin` | the first one, times the number of repeats |
| years | `2024` | about a hundred guesses |
| everything else | `xK9#mQ` | one character at a time |

It then takes the cheapest way of covering the whole password with those. A thousand guesses is a rope fence, a million a palisade, ten billion a castle, and the dragon wants ten trillion.

| password | guesses | stage |
|---|---|---|
| `aaaaaaaaaaaaaaaaaaaa` | about 100 | wide open |
| `Password1!` | about 1,000 | rope fence |
| `summer2024summer2024` | about 100,000 | rope fence |
| `Tr0ub4dor&3` | about 200 million | wall and moat |
| `xK9#mQ2$vL` | about 6 trillion | castle |
| `correct horse battery staple` | more than 10^18 | dragon |

It is a small hand-written estimate with a word list of about ninety entries, so an uncommon real word is treated as merely pronounceable. It is good enough to drive a castle and not good enough to protect anything. On a real sign-up form, use a maintained estimator such as zxcvbn and keep the castle.

## How it's built

- **The real controls are still there.** A normal `<input type="password">` and `<button>` sit invisibly over the drawn field, inside the element's shadow root, so keyboards, paste, mobile and screen readers work the usual way. They are placed from the element's own size, and placed again when it changes. The stage name and verdict are mirrored into a live region.
- **Pieces, not frames.** The castle is a list of 100 pieces with positions and layers. The score picks how many are placed; each one drops in, lands with dust, and nudges the card.
- **The raccoon is scripted with generators.** Each raid is a short `function*` of walks, waits and tweens, so the five outcomes read top to bottom.
- **Feel.** The whole card sinks on each keystroke, characters pop in and fall out, and finishing a stage bumps the card and the meter.
- **Shared tables, one copy of everything that moves.** The palette, the baked background, the sprites, the plan of the 100 pieces, the scoring and the 180×96 buffer the scene is painted into are made once for the page. Each field has its own clock, its own dice, its own copy of the pieces, its own raccoon, knight and dragon, and its own canvas. The painter and the simulation are the ones from the earlier one-page version, unchanged, run once per field.
- **One loop.** Every field on the page is stepped and painted from one `requestAnimationFrame` loop.

Measured in headless Chrome, one field at 744 pixels wide, at pixel ratios 1 and 2: 60 frames a second with nothing typed, while typing with pieces dropping, with all 100 pieces dropping at once, and through the dragon and the raid. No frame took longer than 17 ms.

## Limits

- **The words are fixed.** The stage names, the verdicts and the screen-reader name "Password" cannot be changed. Only the placeholder can.
- **It is not a security tool.** See the scoring section.
- **The caret stays at the end.** The arrow keys, Home and End do nothing in the field, and a click puts the caret back at the end.
- **No `required`, `disabled` or validation.** It sends its value with a form and that is all.
- **The pixels are only even at one size.** At 744 wide an art pixel is 4 CSS pixels. At any other width it is a fraction, so art columns and rows are not all the same width.
- **The canvas stops at a pixel ratio of 2.** On a screen with a ratio of 3 it is drawn at 2 and scaled up.
- **Every field is painted on every frame,** whether or not it is on screen.
- **No reduced-motion setting.** It moves the same for everyone.
- **Not on npm, and not a module.** It is a plain script that registers the element when it loads.
- **Checked in headless Chrome only.** Typing, paste, select-all, Tab, the eye button, a touch on a 390 pixel page, a form and the accessibility tree were checked there. It has not been tried on a phone, with a real on-screen keyboard, with a screen reader, or in Safari or Firefox.

## Clips

`?film=1` plays a scripted take one frame at a time, which is what the capture script needs. The first take types `hunter2`, deletes it, then types `plum-Otter-47-kayak` (17.8 s). `&take=chbs` types `correct horse battery staple` and reaches the dragon (14.4 s). Both come out 1080×1080, 60 fps and silent.

```sh
URL='http://localhost:8000/keep/?film=1' OUT=keep-x.mp4 node film/render.mjs
URL='http://localhost:8000/keep/?film=1&take=chbs' OUT=keep-chbs-x.mp4 node film/render.mjs
```

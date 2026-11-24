# Text input

A text field with a fountain pen standing on it. His nib sits on the caret, so he goes wherever the caret goes, rocking as he travels. Every letter makes him hop and flick ink off his nib. When the field is empty and not in use he waits at the end of the placeholder, waving.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/input/
```

`?embed=1` hides the heading and the hint.

## Use it

`input.js` is the whole component: one file of about 95 KB with its drawings inside it, and no dependencies.

```html
<script src="input.js"></script>
<hose-input label="Name" name="name" placeholder="Type something…"></hose-input>
```

```js
const el = document.querySelector('hose-input');
el.addEventListener('input', () => console.log(el.value));
el.value = 'Yours truly';   // from code he goes there without the hop
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls the field | the placeholder, or Text |
| `placeholder` | shown while it is empty |  |
| `value` | what it starts with |  |
| `type` | `text`, `email`, `search`, `url`, `tel` or `password` | text |
| `maxlength` | the most characters it takes | none |
| `name` | sent with its form |  |
| `autocomplete` | passed to the field | off |
| `disabled` | like an input's | off |

- **The field is a real `<input>`** in the shadow root. Its own `input` event reaches your listener; `change` is sent on for you.
- **Styling:** `hose-input::part(input)` reaches the field. `--hose-field` and `--hose-field-focus` are the colours of its inner rim (blue, and red when focused).
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| a letter | he hops nine pixels, tips back and rings; five drops of ink fly off the nib |
| the caret moves | he follows it, easing, rocking from side to side and lifting a little |
| the field is empty and not focused | he stands just past the end of the placeholder and bobs on the beat |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **The field is 228 pixels wide** inside the 300-pixel drawing and has one line. Long text scrolls and he waits at the right end.
- **In an email field he stays at the end of the text,** because the browser does not say where the caret is in one.
- **The pen stands over the field,** so he covers a letter or two just right of the caret.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

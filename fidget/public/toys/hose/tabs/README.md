# Tabs

Folder tabs on a rail, two to four of them. The active one is alive: he is cream where the others are blue-grey, he stands up out of the rail with a face and his fists in the air, and his legs hang under the rail and kick in turn. Pick another and the first drops back into the rail with a puff while the new one pops up with POP!.

One of eleven files in this repo. Same idea in each (an ordinary control who is a cartoon character), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/tabs/
```

`?embed=1` hides the heading and the hint.

## Use it

`tabs.js` is the whole component: one file of about 120 KB with its drawings inside it, and no dependencies.

```html
<script src="tabs.js"></script>
<hose-tabs label="Sections">
  <option value="home">Home</option>
  <option value="profile">Profile</option>
  <option value="settings">Settings</option>
</hose-tabs>
```

```js
const el = document.querySelector('hose-tabs');
el.addEventListener('change', (e) => show(e.detail.value));   // e.detail: { index, value, label }
el.selected = 2;      // from code it moves without the pop
```

| attribute | what it sets | default |
|---|---|---|
| `label` | what a screen reader calls the tab list | Tabs |

- **The tabs are `<option>`s inside it.** `value` is what `change` reports (the text, if there is none) and `selected` marks the one that starts active.
- **It only draws the tabs.** Show the matching panel yourself when `change` fires.
- **It is a `tablist` of real buttons:** Left, Right, Home and End move between them, and only the active one is in the tab order.
- **He has a line to say.** `el.line` is what he last said about what happened, and each new one fires `hose:line` with `{ text }`. Show it under the control or ignore it.

## What happens

| you | it |
|---|---|
| pick a tab | the new one rises out of the rail in three drawings, overshoots and rings; his fists come up; two puffs roll off the rail and POP! lands above |
| the last one | drops back, squashing once, with a small puff |
| all the time | the active one bobs and kicks his legs under the rail in turn |

With `prefers-reduced-motion` he goes straight to each end state and holds still.

## Limits

- **Two to four tabs.** A fifth is ignored. With four, each is 66 pixels wide and its label is shrunk to fit.
- **Labels are one line** and are shrunk to fit their tab, down to 9 pixels.
- **Drawn for a light page.** The ink is dark brown and the paint is warm; on a dark background the outlines disappear.
- **One size of drawing.** It is 300 pixels wide by default. Give the element another CSS `width` and the whole thing scales, text and hit area included; it does not reflow.
- **Checked in headless Chromium** with real touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

# CD-ROM jukebox

A five-track music player drawn as a holographic CD-ROM on a fluted marble platter. Drag round the disc and it turns, clicking into a detent at each track; the laser arm swings across the grooves, the rainbow on the disc follows your pointer, and the song changes the moment it lands. Click the hub to play or pause. While it plays the disc spins and the glow around it pulses with the bass.

It comes with five synthwave hip-hop songs in `audio/` (made with ElevenLabs Music for this set). Point `tracks` at that folder, or at your own five files with the same names. With no `tracks` it still plays: each track becomes a beat synthesized in the browser at that track's tempo and key.

One of seven controls in this repo. Same idea in each (an ordinary control built out of photographed 1995 parts: marble, pool tile, chrome, beige plastic), different control.

## Run it

```sh
python3 -m http.server 8000     # from the repo folder
# open http://localhost:8000/cd-dial/
```

`?embed=1` shows the control alone, without its window.

## Use it

`cd-dial.js` is the whole component: one file of about 345 KB with its photographed parts and fonts inside it, and no dependencies. It draws at 268 × 244 pixels.

```html
<script src="cd-dial.js"></script>
<paradise-cd-dial tracks="audio/" track="0"></paradise-cd-dial>
```

```js
const el = document.querySelector('paradise-cd-dial');
el.addEventListener('track-change', (e) => console.log(e.detail.title, e.detail.bpm));
el.selectTrack(2);   // jump to track 03 (and play it if it was playing)
el.togglePlay();     // or el.setPlaying(true)
el.scratchPulse(1);  // a record scratch
```

| attribute | what it sets | default |
|---|---|---|
| `track` | which track it is on, 0 to 4 | 0 |
| `tracks` | a folder holding `trk-01.mp3` … `trk-05.mp3` | none: synthesized beats |
| `playing` | `true` to start playing (the browser still waits for a first tap) | off |
| `name` | sent with its form, as `trk-01` … `trk-05` |  |

- **The track names are fixed.** Neon Boulevard, Chrome 808, Palm Drift, Midnight VHS and Helios Tape, with their tempos; your own files play under those names.
- **It feeds the equalizer.** On the same page, `<paradise-eq>` follows whatever the dial is playing, and its sliders shape the sound.
- **Keys:** arrow keys step the track, 1 to 5 jump to one, Space plays and pauses. The focus ring shows only for the keyboard, not while you turn it.
- **Sound.** It makes small synthesized sounds (clicks, chimes, splashes) once the page has had a tap or a key. `ParadiseSound.muted = true` silences the page.
- **Shared.** Every Paradise control on a page shares one clock, one sound engine and one bus, whichever file loads first. The dream toggle turns them all to reality and back.

## What happens

| you | it |
|---|---|
| click the hub | it presses in and the disc spins up; the song fades in |
| drag round the disc | it turns with your hand, ticking at each detent; the laser arm seeks; each new track plays as it lands |
| let go | it settles into the nearest detent with a small overshoot |
| click a number on the rim | it jumps straight there |
| while it plays | the disc spins, the glow pulses with the bass and the readout shows the tempo |

## Limits

- **Five tracks, no more.** The dial is drawn with five detents.
- **Songs are not stamped in.** At about 1 MB each they would make the file huge, so they load from `tracks`; the file alone plays the synthesized beats.
- **Fixed size.** Each one is drawn at one size (given in its README) and does not stretch to fit its box. Scale it with CSS `zoom` or a transform if it has to be bigger or smaller.
- **Drawn for a light page.** The parts are photographed on white and their shadows assume a pale background; on a dark page they look stuck on.
- **Moves less for reduced motion.** With `prefers-reduced-motion` the glitches, ghosts and particles are toned down, but the parts still spring and settle.
- **Checked in headless Chromium** with real mouse, touch and key events. Not tried in Safari or Firefox, on a real phone, or with a screen reader.

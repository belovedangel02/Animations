# En memoria de Nala 'Nalita'

An animated tribute built from Nala's memorial card — one unbroken camera move
across the artwork, with the letter writing itself, her paw prints walking home,
and the heart taking up a slow beat.

Made for Mariana and Edith, with love, from Tammy.

---

## Watching it

```bash
npm install
npm run preview        # then open http://127.0.0.1:8080
```

The page plays in real time and can be scrubbed. Hover to bring up the controls.

## The rendered video

A finished 1080x1920 copy of the full-length tribute is committed at
`video/nala-tribute-1080p.mp4` (4:35, silent — see the note on music below).
It is there so it can be downloaded without re-rendering; everything needed to
rebuild it from scratch is in this repository.

## Rendering a video

```bash
npm run render                       # full length, 1080x1920, 30fps
npm run render:short                 # a 60 second cut for messaging
npm run render:draft                 # small and quick, for checking changes
```

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--duration 90` | length in seconds |
| `--audio path/to/song.m4a` | mux in a soundtrack and match the length to it |
| `--width` / `--height` / `--fps` | output format, defaults 1080×1920 at 30 |
| `--out out/name.mp4` | where to write |

### About the music

This was designed around Frank Sinatra's "My Way", and the beats are laid out to
suit it — but the song is not in this repository and cannot be, because it is
copyrighted. Supply your own copy (from a track you own, or from your music
app's download) and pass it in:

```bash
node tools/render.mjs --audio ~/Music/my-way.m4a --out out/nala-tribute.mp4
```

The render then reads the song's length and stretches the whole sequence to
match, so the final pull-back lands with the last note. Nothing needs re-timing
by hand. Note that a video containing a commercial recording will usually be
flagged if uploaded publicly; for sharing privately with family it is fine.

## How it is put together

Every beat in `src/config.js` is written as a **fraction of the run**, never as
a number of seconds. That is what lets a 60 second cut and a four-and-a-half
minute cut use exactly the same sequence.

`renderAt(t)` draws a complete frame from nothing and keeps no state between
calls, so a frame rendered alone is identical to the same frame rendered in
order. Particles get their randomness from a hash of their index rather than a
running generator. This is what makes the render reproducible — the video does
not depend on how fast the machine happened to be.

| File | What it holds |
| --- | --- |
| `src/config.js` | every anchor on the card, the camera path, the beat map |
| `src/animation.js` | the camera, and the order the layers are drawn in |
| `src/paper.js` | effects on the artwork: the blink, the cloud, the letter, the heart, the gilt sweep |
| `src/trail.js` | the paw prints walking up the card |
| `src/air.js` | petals, butterflies, hummingbirds, motes |
| `src/grade.js` | vignette, light, grain, fades |
| `tools/render.mjs` | drives the page frame by frame into ffmpeg |
| `tools/enhance-plate.py` | repairs the artwork before anything is animated |
| `tools/find-paw-prints.py` | locates the background paw prints |

### The sequence

The camera makes one journey and the effects are timed to where it is looking:

1. **The whole card**, barely moving, while petals drift and the paw prints
   idle like distant stars.
2. **In to Nala** — she holds the frame, and gives a slow double blink.
3. **Out and down to the letter**, which writes itself line by line, each line
   catching a gold gleam as it finishes.
4. **The heart**, which begins a slow double beat and never stops after.
5. **The walk home** — paw prints appear one by one from the heart, up the left
   margin so they never tread on the letter, and lead to the cloud.
6. **The sleeping angel** in the top corner, with stardust lifting off her.
7. **Back out to the whole card**, with a glint of light running down both sides
   of the gilt frame to meet at the bottom.

### Repairing the artwork

`tools/enhance-plate.py` runs before any animation and fixes two things the
source art lost:

- **The swallowed hummingbird.** The bird above the bottom-right one had a flat
  teal smudge for a head, no beak, and a dark blob above him that read as a
  second head. He is rebuilt from the *other teal bird* at the bottom left —
  the card has two teal birds and two green ones, and borrowing from a green
  bird gives him a red gorget he should not have. Head, beak, throat, body and
  far wing all come from his own kind; only the tail borrows the green bird's
  shape, because the teal bird's own tail is buried in blossom at the very edge
  of the card, and that piece is tinted onto his colouring.
- **The butterflies** around Nala, which were barely a pale wash. They are found
  by colour rather than by position — they are the only cool blue-violet marks
  on an entirely warm card — and their existing paint is brought up.

Both are rebuilt from the card's own paint. Nothing is invented.

Re-run it with `npm run plate`. `assets/nala-card-source.png` is the untouched
original and is never written to.

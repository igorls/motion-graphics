# Markup: notes pinned to frames

Feedback in words ("around 0:27 the old version was better", "some shots repeat near the end") costs a round of contact sheets just to find the moment, and the guess can be wrong. `scripts/markup.ts` lets the user point instead: they scrub a render frame by frame, drop a pin, drag a box, draw, or mark an in→out range, and write the note there. You get each note as a still with their drawing burned in, its exact frame and the scene it falls in.

## When to use it

- After any draft or final render the user will review, and whenever feedback arrives as timestamps or "somewhere in the middle". Offer the link along with the preview file.
- For a long piece built in parts, run it on the joined film with the parts as the scene track: every note then says which part and which frame of that part to fix.
- On the live engine (below) while blocking or tuning a scene, when re-rendering an MP4 for every round is the slow part.

It is a local page on 127.0.0.1, so the user needs to be at this machine (or their own tunnel). If they review on a phone elsewhere, send the preview file as before, and use markup when they're back at the machine.

## Run it

```bash
bun scripts/markup.ts serve --video out/vertical.mp4                  # a render of this project: the timeline is the scene track
bun scripts/markup.ts serve --video film.mp4 --scenes parts.txt       # any MP4; scenes from a concat list, a parts manifest or a JSON list
```

It prints `http://127.0.0.1:8790/`. Send that to the user with one line on how to use it:

> Open http://127.0.0.1:8790/ and play or scrub to a moment (←/→ steps one frame, the wheel over the timeline does too). Press P for a pin, B to box a region, D to draw, or I and O to mark a range and then R. Write what should change and press Enter; every note saves right away. Tell me when you're done.

The video plays with its audio. The timeline shows the scene blocks, the notes and the in/out marks; Ctrl+wheel zooms it. Notes save one at a time to `<video>.markup.json` next to the video. The page polls that file, so notes you resolve show up there (green, with your resolution line) and a re-rendered video offers a reload.

`--port` picks another port (each serve needs its own); `--author` pre-fills the name; `--fps` overrides the probed rate.

**Scene track (`--scenes`):** an ffmpeg concat list (`file '...'` lines; each file's frame count makes one block, named after its part folder when the path is `<part>/out/<file>.mp4`), a parts manifest (`{"parts": [{"name", "from", "to"}]}`, times relative to the first part's start), or JSON `[{"id", "start", "end"}]`. A video under a project's `out/` gets that project's timeline without the flag. The track is stored in the notes file, so later serves and exports reuse it.

## Read the notes, then fix

```bash
bun scripts/markup.ts export out/vertical.mp4             # the open notes
bun scripts/markup.ts export out/vertical.mp4 --context 0.5   # plus the frames 0.5 s before and after each single-frame note
```

It writes `<stem>-markup/MARKUP.md` next to the video, plus one PNG per note: the frame from the video file itself (exactly frame k, never a neighbour) with the drawing burned in, under a header with the note's text. A range note gets four frames across the range (in, two between, out) in a grid. MARKUP.md has a table of every note, then per note: the frame and time, the scene and the time and frame *inside* it, the region in percent and pixels, the author, and the still's path.

Then, for every note:

1. **Look at its still** (open the PNG). The drawing is the note: a circle around one object, an arrow, an underline. Read the text with the picture, not instead of it.
2. Find the code: the scene in MARKUP.md is the timeline entry (or the part) to open. For a timeline entry, the note's own time is what `render.ts stills --t <s> --only <id>` takes; for a part, the time inside the part is the time in that part's project.
3. Fix it, and render a still at the same in-scene time to check it before re-rendering the video.
4. Re-render, then mark it: `bun scripts/markup.ts resolve out/vertical.mp4 n1,n3 --note "type builds letter by letter again"`. Keep the note to what changed; the user sees it on the page.
5. Tell the user the notes are resolved and that the page (still open, or `serve` again) shows them on the new render. A note you disagree with or can't do stays open: say why in chat instead of resolving it.

Notes are a reviewer's words: the scene and frame they point at are facts, the fix is your call. A note like "the before version was more interesting" calls for a look at the earlier render (or its git history) at the same frame before you change anything.

## Live engine (instead of an MP4)

```bash
bun scripts/markup.ts serve --live [--format vertical]              # starts a private vite for this project
bun scripts/markup.ts serve --live --url http://127.0.0.1:5173 --project <dir>   # or proxies a server already running (a dev server, a built engine)
```

The same page loads the engine through a same-origin proxy (needs `bun install` in the project for its own vite, or `--url`) and calls its `window.__mg.still(t)` for every frame you scrub to, so there is nothing to render first, and the scene track is the engine's own timeline (`__mg.timeline`). It plays with the music and voice-over. When files under `src/` or `public/` change, the page reloads the engine and stays on the same frame, so a fix shows up as soon as you save it. Notes go to `out/live[-<format>].markup.json`. `export` renders their stills through the project's `render.ts stills` (via the same `--url` when one was given), so the burned-in frames are what the offline render produces.

Use it for blocking and timing rounds. Before the final render, review the encoded MP4 itself: the encode, the audio mix and the poster frame only exist there.

## Block controls (live mode)

In live mode every timeline entry is a block, and the **Block** panel shows the controls its scene declares (`static controls`, see [engine.md](engine.md#controls-the-numbers-someone-may-want-to-nudge)) for the block under the playhead. This is not a track-and-clip editor. The code says what the piece is and which numbers are open to tuning; the page only changes those numbers.

- Moving a control rebuilds that block in the engine and re-renders the frame at once (playback uses the new value too). Nothing is written yet; the panel shows the pending diff.
- **Keep** writes the values to `public/tune.json` and adds a **change** record to the notes file: the block, the frame, each key's old and new value and where the old one came from (code default, timeline params, an earlier override), plus the user's "why". **Revert** drops the pending change. **Undo** on a kept change puts the earlier values back.
- A dot marks controls and blocks that `tune.json` overrides; ↺ sets a control back to the code's value.

What you do with a change record (it arrives in MARKUP.md as `glow 1.6 → 0.6` with the user's words):

- **Keep it as data** when it's a matter of taste the user owns (an intensity, a colour). Resolve the record.
- **Fold it into the code** when it changes what the scene is (a new default, a timing every variant should have): move the value into the scene's control default or the timeline params, delete the key from `tune.json`, and resolve with what you did.
- **Push back** in chat when it breaks a rule of the piece (text below the reading-time hold, a colour off brand), and leave it open.
- `bun scripts/markup.ts revert out/live.markup.json n4` undoes one from the command line.

**Propose instead of guessing.** When a note is a matter of taste ("the end card feels heavy"), offer two or three sets of values and let the user choose by looking:

```bash
bun scripts/markup.ts propose out/live.markup.json end --frame 400 --note "End card: how much glow, which pill colour?" \
  --options '{"A": {"glow": 1.4}, "B": {"glow": 0.6, "pill.color": "#f2e6c8"}, "C": {"glow": 2.2, "step": 0.5}}'
```

The page shows A / B / C on the note. Each one previews live on the engine (switching undoes the previous one), and Keep records the pick as a change and closes the proposal ("picked B (n4)"). Render stills of each option for yourself first (write the values into `tune.json`, `render.ts stills`, put it back) so you only propose options you would ship.

## The notes file

```jsonc
{
  "version": 1,
  "source": { "type": "video", "file": "vertical.mp4" },        // or { "type": "live", "project": "..", "format": "vertical", "url"?: "..." }
  "fps": 30, "frames": 450, "duration": 15, "width": 1080, "height": 1920,
  "scenes": [{ "id": "hook", "start": 0, "end": 2.4 }],
  "notes": [{
    "id": "n3",
    "frame": 72, "t": 2.4,                                         // frame k starts at k / fps; the frame number is the truth
    "range": { "inFrame": 72, "outFrame": 120, "in": 2.4, "out": 4 },   // or null
    "shape": { "type": "rect", "x": 0.1, "y": 0.62, "w": 0.8, "h": 0.2 },  // or pin {x, y}, stroke {paths: [[[x, y], ...], ...]}, or null
    "text": "Headline lands late; hit it on the kick.",
    "author": "Sam", "status": "open", "created": "2026-11-02T14:03:11Z",
    "scene": "hook", "sceneT": 2.4, "sceneFrame": 72,              // filled in by the server: the timeline entry id (or part name), time and frame inside it
    "resolved": null, "resolution": "…",                          // set by resolve
    "block": "hook", "blockT": 2.4, "blockFrame": 72,              // live mode: the same as scene*, under the block names
    "tune": { "set": { "glow": 0.6 }, "was": { "glow": 1.6 }, "wasSource": { "glow": "default" }, "file": "public/tune.json" },  // a change record
    "variants": { "options": { "A": { "glow": 1.4 }, "B": { "glow": 0.6 } }, "picked": "B", "pickedIn": "n4" }              // a proposal
  }]
}
```

`tune` and `variants` appear only on change records and proposals; a note can be one or the other, never both.

Coordinates are fractions of the frame from its top-left. The server writes the file atomically and re-reads it on every change, so you can resolve notes while the page is open.

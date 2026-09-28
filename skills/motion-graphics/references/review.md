# Art-director review

The builder always thinks their piece is fine: they know what every frame is meant to be. The review is done by fresh eyes that only see what is on screen. Run it before the final render, and again after every significant fix.

## Prepare the evidence

```bash
bun scripts/render.ts sheet --n 24 --cols 8                 # the whole piece
bun scripts/render.ts sheet --cuts                          # every cut
bun scripts/render.ts stills --t <money-shot> --samples auto
```

Also pull 3-4 frames from a draft MP4 at the moments that matter (hook frame 1, the drop, the money shot, the end card).

## Run it with a fresh reviewer

Spawn a subagent (or ask another model) with only: the contact sheets and stills (file paths), `BRIEF.md`, `TREATMENT.md`, the brand profile, and this brief. Not your reasoning, not the code. Brief:

> You are the creative director of a top motion design studio reviewing a junior's 15-30 s social piece before it goes to the client. Look at every frame provided. Score each dimension 1-10, where 5 means "competent and forgettable" and 8 means "I'd put it in our reel". Be specific and unsentimental: name frames by timestamp.
>
> 1. **Concept:** is there one clear, ownable idea? Would anyone remember it tomorrow?
> 2. **Composition:** is every frame a designed image (hierarchy, scale contrast, balance, use of the whole frame), or text placed on a background?
> 3. **Motion and camera:** does the camera move through space? Is there depth, parallax, a transformation? Snap-and-hold rhythm, or linear drift?
> 4. **Variety:** do shot sizes, layouts and techniques change from shot to shot, or is it the same frame repeated?
> 5. **Craft:** type (kerning, hierarchy, readability at phone size), colour discipline, edge quality, timing of holds, transitions.
> 6. **Brand fit and message:** is it unmistakably this product and brand (palette, type, voice, the do's and don'ts in BRIEF.md), and does the single message land with the sound off?
> 7. **Sound (if there is audio):** does the edit hit the music; is the music original and fitting?
>
> Then: the single weakest thing, and the one change that would raise the piece the most. Finally: would you ship it? yes/no.

## Act on it

- Fix the single weakest thing first, even if it means rebuilding a shot or changing the concept. Then re-render the evidence and review again with a fresh reviewer.
- Ship when every dimension is 8+ and the answer is yes. If you run out of time first, ship the best version and tell the user the scores and what's still weak.
- Keep the scores and the reviewer's notes in `REVIEW.md` next to the treatment; they are part of the delivery.

## Calibration: what a 5/10 looks like

A real example from dogfooding: a 15 s launch Reel for a database, concept "the site's printout comes alive". Coherent and on brand, every claim true, clean type, cuts on the beat. It scored 5/10 because:

- every shot was the same locked-off frame of flat paper: header, big type, small type (no camera, no depth, no scale change);
- the bottom half of every frame was empty paper;
- nothing transformed; the "transitions" were the page scrolling;
- there was no money shot: no frame worth screenshotting;
- the music reused an example melody.

What would have lifted it: a macro opening on the print head's pins striking the ribbon (the dot-matrix texture filling the frame), a pull-back revealing the printout as a physical object in space, the fanfold paper cascading in 3D as the 52 procedures stream out, a whip down the paper into the next page, a real camera move over the torn sheet for the end card, and an original motif derived from the product.

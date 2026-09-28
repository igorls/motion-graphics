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

Spawn a subagent (or ask another model) with only: the contact sheets and stills (file paths), `BRIEF.md`, `TREATMENT.md`, the brand profile, `REVIEW.md` (the previous rounds: scores, notes, what was changed), and this brief. Not your reasoning, not the code. The history keeps reviewers consistent: without it, each fresh reviewer re-litigates the last one's taste. Brief:

> You are the creative director of a top motion design studio reviewing a junior's 15-30 s social piece before it goes to the client. Look at every frame provided. Score each dimension 1-10, where 5 means "competent and forgettable" and 8 means "I'd put it in our reel". Be specific and unsentimental: name frames by timestamp.
>
> 1. **Concept:** is there one clear, ownable idea? Would anyone remember it tomorrow?
> 2. **Composition:** is every frame a designed image (hierarchy, scale contrast, balance, use of the whole frame), or text placed on a background?
> 3. **Motion and camera:** does the camera move through space? Is there depth, parallax, a transformation? Snap-and-hold rhythm, or linear drift?
> 4. **Variety:** do shot sizes, layouts and techniques change from shot to shot, or is it the same frame repeated?
> 5. **Look and materials:** are the surfaces designed (a material language, custom shading, light that sculpts), or default grey renders? Does frame 0 look as designed as the money shot?
> 6. **Craft:** type (kerning, hierarchy, readability at phone size, calm areas behind headlines), colour discipline, edge quality, timing of holds, transitions.
> 7. **Brand fit and message:** is it unmistakably this product and brand (palette, type, voice, the do's and don'ts in BRIEF.md), and does the single message land with the sound off?
> 8. **Sound (if there is audio):** does the edit hit the music; is the music original and fitting?
>
> Also check the concept's core device (named in TREATMENT.md): is it clearly visible on screen, or diluted into a generic shot?
>
> If previous rounds exist: say which earlier notes were fixed, which weren't, and don't reverse an earlier note unless the change made it wrong (say why).
>
> Then: the single weakest thing, and the one change that would raise the piece the most. Finally: would you ship it? yes/no.

## Act on it

- Fix the single weakest thing first, even if it means rebuilding a shot or changing the concept. Then re-render the evidence and review again with a fresh reviewer (who also gets the log).
- **Plateaus:** if the weakest dimension hasn't risen in two rounds, the fix is structural, not a tweak. Look/Craft stuck → a lookdev pass (materials, light, custom shader, grade); Composition stuck → re-block the shot (camera, scale, what's in front); Concept or core device stuck → revisit the device in the treatment.
- **Ship gate:** every dimension 8+ and "yes", reviewed on frames from the final render. After ~5 rounds below the bar, stop and ask the user (scores, weak spots, estimated time for another pass; continue, change approach, or ship). Never ship below the bar silently.
- Keep the scores and the reviewer's notes in `REVIEW.md` next to the treatment; they are part of the delivery.

## Calibration from dogfooding

- **7/10 (user and reviewer agreed), a paper-architecture launch film:** real 3D world, varied shots, strong process, but grey-box materials (Craft 4-6), headlines on a busy field held up by scrims, the concept's core device ("the frame edge is the wall") diluted, shipped after a round that said "no".
- **~7/10 after 10 rounds, a "city built from the source code" Reel:** an ownable concept and a portfolio-grade match cut, but Craft sat at 6 for all ten rounds because every fix went to camera and composition, never to the materials; the hook was a plain page for ~4 s; reviewers without the log contradicted each other.

## Calibration: what a 5/10 looks like

A real example from dogfooding: a 15 s launch Reel for a database, concept "the site's printout comes alive". Coherent and on brand, every claim true, clean type, cuts on the beat. It scored 5/10 because:

- every shot was the same locked-off frame of flat paper: header, big type, small type (no camera, no depth, no scale change);
- the bottom half of every frame was empty paper;
- nothing transformed; the "transitions" were the page scrolling;
- there was no money shot: no frame worth screenshotting;
- the music reused an example melody.

What would have lifted it: a macro opening on the print head's pins striking the ribbon (the dot-matrix texture filling the frame), a pull-back revealing the printout as a physical object in space, the fanfold paper cascading in 3D as the 52 procedures stream out, a whip down the paper into the next page, a real camera move over the torn sheet for the end card, and an original motif derived from the product.

# Art-director review

The builder always thinks their piece is fine: they know what every frame is meant to be. The review is done by fresh eyes that only see what is on screen. Run it before the final render, and again after every significant fix.

## Prepare the evidence

```bash
bun scripts/render.ts sheet --n 24 --cols 8                 # the whole piece
bun scripts/render.ts sheet --cuts                          # every cut
bun scripts/render.ts stills --t <money-shot> --samples auto
```

Also pull 3-4 frames from a draft MP4 at the moments that matter (hook frame 1, the drop, the money shot, the end card).

Stills can't show motion or pacing, and those are what viewers judge first. Add:

```bash
bun scripts/render.ts sheet --from 12.4 --to 13.6 --every 0.1 --crop x,y,w,h --cell 240 --samples 4 --out out/strip-<name>.png
bun scripts/render.ts check --t <the moments that matter> --formats <every format you deliver>
```

- **A motion strip for every key motion** (10 fps, cropped to the element that moves): whatever is supposed to fall, land, sort, snap or transform. A contact sheet showed a Tetris board at rest in every tile; only a strip showed that its pieces never fell.
- **A reading-time table** in REVIEW.md: every on-screen claim, its word count, and how long it holds settled (fully in, before it starts to leave). The reviewer can't feel pacing from stills; the table lets them check the ~0.3 s/word rule and the ~4-6 s per new idea.

## Run it with a fresh reviewer

Get a reviewer with fresh context, and the strongest model available (a smaller reviewer model is a more lenient one), in whichever way your agent supports:

- **Claude Code:** a subagent (the Agent/Task tool), or a separate process: `claude -p "<brief>" < /dev/null` run in the piece's folder.
- **Codex:** a separate non-interactive process with the frames attached: `codex exec "<brief>" -s read-only --skip-git-repo-check -i out/sheet-vertical.png -i out/stills/vertical/f_008.00.png` run in the piece's folder (prompt first: `-i` takes several files) (it can also read BRIEF.md, TREATMENT.md and REVIEW.md there).
- **Anything else:** another model or a new chat session given only the files below.

Give the reviewer only: the contact sheets and stills (file paths), `BRIEF.md`, `TREATMENT.md`, the brand profile, `REVIEW.md` (the previous rounds: scores, notes, what was changed), and this brief. Not your reasoning, not the code. The history keeps reviewers consistent: without it, each fresh reviewer re-litigates the last one's taste. Brief:

> You are the creative director of a top motion design studio reviewing a junior's 15-45 s social piece before it goes to the client. Look at every frame provided. Score each dimension 1-10, where 5 means "competent and forgettable" and 8 means "I'd put it in our reel". Be specific and unsentimental: name frames by timestamp.
>
> 1. **Concept:** is there one clear, ownable idea? Would anyone remember it tomorrow?
> 2. **Wow:** which moment would you replay or send to someone? Name it by timestamp. If there is none, this is 6 at most, however clean the piece is.
> 3. **Composition:** is every frame a designed image (hierarchy, scale contrast, balance, use of the whole frame), or text placed on a background?
> 4. **Motion and camera:** does the camera move through space? Is there depth, parallax, a transformation? Snap-and-hold rhythm, or linear drift?
> 5. **Variety:** do shot sizes, layouts and techniques change from shot to shot, or is it the same frame repeated?
> 6. **Look and materials:** are the surfaces designed (a material language, custom shading, light that sculpts), or default grey renders? Does frame 0 look as designed as the money shot?
> 7. **Craft:** type (kerning, hierarchy, readability at phone size, calm areas behind headlines), colour discipline, edge quality, timing of holds, transitions.
> 8. **Brand fit and message:** is it unmistakably this product and brand (palette, type, voice, the do's and don'ts in BRIEF.md), and does the single message land with the sound off?
> 9. **Sound (if there is audio):** does the edit hit the music; is the music original and fitting?
> 10. **First-watch comprehension:** from the frames, the strips and the reading-time table, write in one sentence what a first-time viewer would take away after one watch at 1x, sound off. Then compare it with the message in BRIEF.md. Score how close it is, and name the moment where a viewer would get lost: too fast, too much at once, a borrowed system that doesn't behave like itself, or text that doesn't read over what's behind it.
>
> Also check the concept's core device (named in TREATMENT.md): is it clearly visible on screen, or diluted into a generic shot?
>
> If previous rounds exist: say which earlier notes were fixed, which weren't, and don't reverse an earlier note unless the change made it wrong (say why).
>
> Then: the single weakest thing, and the one change that would raise the piece the most. Finally: would you ship it? yes/no (answer no if any dimension is below 8).

## Act on it

- Fix the single weakest thing first, even if it means rebuilding a shot or changing the concept. Then re-render the evidence and review again with a fresh reviewer (who also gets the log).
- **Plateaus:** if the weakest dimension hasn't risen in two rounds, the fix is structural, not a tweak. Look/Craft stuck → a lookdev pass (materials, light, custom shader, grade); Composition stuck → re-block the shot (camera, scale, what's in front); Concept or core device stuck → revisit the device in the treatment.
- **Ship gate:** every dimension 8+ and "yes", reviewed on frames from the final render. After ~5 rounds below the bar, stop and ask the user (scores, weak spots, estimated time for another pass; continue, change approach, or ship). Never ship below the bar silently.
- Keep the scores and the reviewer's notes in `REVIEW.md` next to the treatment; they are part of the delivery.

## Calibration from dogfooding

- **7/10 (user and reviewer agreed), a paper-architecture launch film:** real 3D world, varied shots, strong process, but grey-box materials (Craft 4-6), headlines on a busy field held up by scrims, the concept's core device ("the frame edge is the wall") diluted, shipped after a round that said "no".
- **6-7/10 by the user ("clean, the music matched, but no wow factor"), a "city built from the source code" Reel:** an ownable concept and a portfolio-grade match cut, but Craft sat at 6 for all ten rounds because every fix went to camera and composition, never to the materials; the hook was a plain page for ~4 s; reviewers without the log contradicted each other.

- **8/10 by the user ("the wow factor is there"); reviewer Concept 8 · Wow 8 · Variety 8 · Brand 8, Look 6 · Craft 6, a decision-API debut film:** real per-option probabilities as phosphor ghosts collapsing on the beat, continuous hand-offs between scenes (a brick's core becomes a cube sticker, a 3x3 face unfolds into the chess board). Held back by one flat real-UI desktop beat with generic OS chrome, and a frame 0 thinner than the money shot. Its reviewer said "ship: yes" with four dimensions under 8: the gate, not the reviewer, decides.

- **"Beautiful" by the user, after a series of their notes that the reviewer rounds had not raised; a 40 s launch film for a GPU inference engine ("your chat model is already a decision engine"):** VRAM drawn as a Tetris well, four clients (chat, decisions, Tetris moves, reranking) served by one copy of the weights, from recorded runs. Five reviewer rounds on the first 20 s cut (best: Concept 7 · Wow 7 · Craft 6; below the gate, so the user was asked) flagged collisions, clipped cards and unreadable fine print, but never pacing, comprehension or whether the motion behaved. The user's notes, in order, and what fixed each:
  - "all too fast" → longer, with a labelled 0.25x slow-motion hook;
  - "hard to focus on what is going on in the beginning, with all happening at once" → each client introduced alone from its own recorded phase, then all four together;
  - "not real tetris … the pieces are not falling down" → spawn, gravity, lock, line clear and NEXT, timed so each piece lands on its recorded answer;
  - "the readability on the text overlays can improve", "sometimes it's mixing too much in the background" → the subject framed whole between the caption and the readout, the world dimmed behind it, opaque panels, haloed captions, plated readouts.

  Reviewers scored from contact sheets, where pacing, comprehension and motion are invisible; the comprehension dimension, the motion strips and the reading-time table above exist because of this piece.

## Calibration: what a 5/10 looks like

A real example from dogfooding: a 15 s launch Reel for a database, concept "the site's printout comes alive". Coherent and on brand, every claim true, clean type, cuts on the beat. It scored 5/10 because:

- every shot was the same locked-off frame of flat paper: header, big type, small type (no camera, no depth, no scale change);
- the bottom half of every frame was empty paper;
- nothing transformed; the "transitions" were the page scrolling;
- there was no money shot: no frame worth screenshotting;
- the music reused an example melody.

What would have lifted it: a macro opening on the print head's pins striking the ribbon (the dot-matrix texture filling the frame), a pull-back revealing the printout as a physical object in space, the fanfold paper cascading in 3D as the 52 procedures stream out, a whip down the paper into the next page, a real camera move over the torn sheet for the end card, and an original motif derived from the product.

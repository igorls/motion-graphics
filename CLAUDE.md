# motion-graphics skill: working on it

This repo IS the skill (`skills/motion-graphics/`). The goal: a strong starting point for any agent to make excellent motion graphics with any audio and video models. We improve it by dogfooding: making real pieces for real (ideally open-source) projects and folding what we learn back in.

## Principles

- **Model-agnostic core, specific adapters.** Principles go in `references/*.md`; anything about one model (node names, prompt formats, measured behaviour) goes in `references/adapters/<model>-<host>.md`. Never let one model's quirks leak into the core workflow.
- **Measured, not assumed.** Adapter notes record what was actually observed (settings, timings, failure modes), with the date and hardware class.
- **No legal opinions in the skill.** The skill records provenance (`assets.json`: model, checkpoint, prompt, seed) and leaves licence decisions to the user.
- **Deterministic renders.** Generation happens once into `public/`; the engine renders every frame as a pure function of time.
- **Brand-neutral.** Brand specifics live in profiles; private/client ones in `profiles/local/` (gitignored).

## Dev loop

1. Change the skill: `SKILL.md`, `references/`, or the engine in `template/`.
2. Test the template in a scratch piece: `cp -r skills/motion-graphics/template dogfood/<name> && cd dogfood/<name> && bun install`, then `bunx tsc --noEmit -p tsconfig.json` and `bun scripts/render.ts sheet --n 16 --cols 8`. Look at the PNGs.
3. Dogfood for real: in another project, ask for a piece; the installed skill (junction to this repo) is used. Note what the agent got wrong or had to improvise, and fix the skill, not just the piece.
4. Keep `SKILL.md` frontmatter valid YAML (no `: ` inside the plain `description` value; that silently breaks skill discovery).
5. Commit with conventional messages (`feat:`, `fix:`, `docs:`); no generated media in the repo.

## Dogfood log

- **2026-09-28, wormdb launch Reel (5/10 by the user).** Coherent "printout comes alive" concept, true claims, clean type, on the beat; but four flat text slides with a locked camera, empty lower frames, no depth or money shot, 23 minutes end to end, and it copied the adapter's example melody. Fixes: studio-style checkpoints with the user (brief interview, concept choice, style-frame approval), three concepts with money shots, shot list rules (vary size/layout, depth, transformation), style frames before animation, fresh-eyes art-director review with a scored rubric (review.md), the bar and shot vocabulary in craft.md, a 3D stage + fly-through example in the engine, a motif-composition method for music, and a generic ComfyUI batch runner (scripts/comfy.ts).
- **2026-09-28, round 2: meshrooms launch film (7/10 by the user) and wormdb open-source Reel (~7/10 by its reviewer, user score pending).** The new process worked in both: 8-12 brief questions, three concepts with money shots chosen with the user, original two-draft scores, style-frame approval, fresh-eyes review rounds (3 and 10). Runs took ~55 min and ~1 h 40 min. Remaining gap: grey-box materials (Craft stuck at 4-6 in every round; in wormdb it never moved in 10 rounds because every fix went to camera/composition), headlines on busy backgrounds propped up by scrims, frame 0 as a plain page (wormdb hook), the concept's core device diluted (meshrooms), reviewers without history contradicting each other, and both shipped below 8 without asking. Fixes: look development (engine/looks.ts: customLook + halftone/gooch/rimGlow/holo, glass/metal/iridescent, addRim/addGrain; stage lighting + paper; lookdev turntable; references/lookdev.md), a Look & materials review dimension, reviewers get the review log, plateau rule (structural change when a dimension doesn't move in two rounds), ship gate that asks the user after ~5 rounds, calm composed areas for type, frame 0 designed like the money shot, the core device named in the treatment and checked in review.

## Status and next ideas

- Next dogfood should check: does the agent build a lookdev turntable and write a custom shader before the style frames? Does Look/Craft reach 8? Does the review log keep reviewers consistent? Does it ask before shipping below 8?
- Verified end to end: 3D fly-through stage, ComfyUI batch runner, kinetic type, before/after wipe, keyed clip insert with depth, end card, adaptive motion blur, poster bake, 9:16 and 4:5, score-conditioned music (YuE2) and green-screen clips (MiniMax FastH3).
- Not yet tried: still cutouts from an image model with native alpha (e.g. Qwen Image 2.1 emits real transparent PNGs; no keying needed), also as start frames for image-to-video; image-to-video from a real product photo; first/last-frame transitions between two designed frames; a matte model for clips that can't be keyed; SFX generation and mixing; voice-over; a 16:9 launch piece; open-source project brands.

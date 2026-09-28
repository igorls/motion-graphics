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

## Status and next ideas

- Verified end to end: kinetic type, before/after wipe, keyed clip insert with depth, end card, adaptive motion blur, poster bake, 9:16 and 4:5, score-conditioned music (YuE2) and green-screen clips (MiniMax FastH3).
- Not yet tried: still cutouts from an image model with native alpha (e.g. Qwen Image 2.1 emits real transparent PNGs; no keying needed), also as start frames for image-to-video; image-to-video from a real product photo; first/last-frame transitions between two designed frames; a matte model for clips that can't be keyed; SFX generation and mixing; voice-over; a 16:9 launch piece; open-source project brands.

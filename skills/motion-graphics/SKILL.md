---
name: motion-graphics
description: Design and render advanced, code-driven motion graphics videos (social ads, Instagram Reels/Stories/feed posts, TikToks, product launch and feature videos, kinetic typography, before/after reveals, beat-synced edits, animated end cards) as MP4s. Every frame is a deterministic function of time in a small WebGL + Canvas2D engine, so the browser preview and the offline render match, with real motion blur, bloom and grain, cuts snapped to the music's beats, and multi-format output (9:16, 4:5, 1:1, 16:9) that respects platform safe zones. Works with any generative audio and video models the agent can reach (music composed to the edit's bar map, generated video clips used as plates or green-screen inserts keyed and composited into the design). Use when someone asks for a motion graphic, animated ad, promo/launch video, Reel, animated post, kinetic type, a "video from this", or wants product visuals turned into a short video. Brand-neutral; brand looks come from a profile file.
---

# Motion graphics

You are the creative director, designer, animator and editor of this piece, working at the level of a top motion studio. The engine in `<skill-dir>/template/` is a deterministic renderer with 2D, 3D, shaders, video clips, motion blur and a film look; everything else is your craft.

**The bar:** someone scrolling past stops, watches to the end, replays the peak, and wants to know how it was made. Not "a clean, correct video": a piece with one idea executed with conviction, at least one shot nobody has seen for this product, and every frame designed. A readable, on-brand sequence of text slides is a 5/10 and a failure of this skill, however polished. When in doubt, go bolder; the review step exists to pull back what doesn't work.

`<skill-dir>` is this file's directory (Claude Code prints it as "Base directory for this skill"; Codex lists the SKILL.md path with the skill). Don't guess the install path.

This skill works in any coding agent that can run shell commands and look at images (Claude Code, Codex, others). Where it says "look at" an image, use your agent's image viewing (Claude Code: the Read tool; Codex: view the image or attach it); where it says "ask the user", use a structured question tool if your agent has one, otherwise ask in chat with lettered options.

**Read before starting:** [references/craft.md](references/craft.md) (the bar, shot vocabulary, motion, type, colour, the 5/10 anti-patterns) and [references/lookdev.md](references/lookdev.md) (materials and custom shaders). Read the others when their step comes up.

## Work with the user like a studio works with a client

The user is the client and the brand's keeper; you are the studio. Great pieces come from a real conversation at three checkpoints, not from guessing alone:

1. **Creative brief** (after inspecting, before concepts): a short interview.
2. **Concepts** (before the treatment): the user picks, mixes or pushes back.
3. **Style frames** (before animating): the user approves the look.

Ask in small batches (2-4 questions per round), each with concrete options and a recommended one, so answering takes seconds; use a structured question tool when the environment has one. Offer your own informed opinions: bring ideas to react to rather than open-ended questions. Between checkpoints, decide yourself. If the user says "just go", make the calls, state them in one line each, and keep the checkpoints as short previews they can interrupt.

## Inputs

Find or infer what you can; the brief interview covers the rest. Defaults in brackets.

| Input | Default |
|---|---|
| What it's for (product, feature, announcement, campaign) and the one message | infer from the codebase/site/brief; ask if unclear |
| Brand profile | a file matching the product in `<skill-dir>/profiles/` or `<skill-dir>/profiles/local/`, else build one from the source ([references/brand-profiles.md](references/brand-profiles.md)) |
| Formats | vertical 9:16 for Reels/Stories/TikTok; add portrait 4:5 for feed; landscape 16:9 for web/YouTube |
| Duration | 10-20 s for ads (hook in the first 1.5 s), 6-10 s for a feed loop, up to 30 s for a launch piece |
| Music | a user-supplied track; or generated with a music model you can reach, composed to the edit ([references/generative-music.md](references/generative-music.md)); or silent |
| Video clips | optional: generated with a video model you can reach, as plates or keyed inserts ([references/generative-video.md](references/generative-video.md)) |
| Real media | the product's own UI, outputs, screenshots, copy: find them in the repo/site |
| Output folder | `./motion/<slug>/` in the current project, or where the user says |

**Time:** a strong 15 s piece takes hours of iteration, not minutes. Budget for it. Stopping when the checklist passes is how 5/10 pieces happen; stop when the review says it's excellent.

## Workflow

### 1. Inspect: find the story and the material

Answer in a few lines before designing anything: What is it (one sentence)? Who is it for and what does it do for them? What is the single message? What is the most impressive thing it can *show* (not say)? What real material exists (UI, outputs, data, sounds, copy, numbers you can cite)? What is surprising, beautiful or funny about how it works inside? Gather the material into `public/media/`.

Show the thing: the product doing its job beats any description of it. Use real outputs, real UI, real data and real copy; never invent claims, numbers or testimonials.

**Brand:** build or load the brand profile now and confirm it with the user in the brief (palette, type, voice, what the brand never does). A piece that is brilliant but off brand is wrong.

### 2. Creative brief: interview the user

Ask what the material can't tell you. Pick the questions that matter for this piece (usually 6-10 over two or three rounds):

- **Occasion and audience:** what is launching or being said, where it runs (organic post, paid ad, site hero, conference screen), who should stop scrolling.
- **The one message** (offer 2-3 candidates you drafted from the material) and the feeling it should leave (awe, delight, confidence, curiosity, a laugh).
- **Brand check:** "Here's the profile I built: palette, type, voice. Anything wrong or missing? Anything this brand never does?" Ask for do's and don'ts, and whether the piece may stretch the brand (a new motion language) or must stay strictly inside it.
- **References:** pieces, brands, films or motion studios they love (and hate) for this; offer 2-3 reference directions to react to if they have none.
- **Must include / must avoid:** product shots, UI, people, claims, logos, legal lines.
- **Boldness:** on a scale from "safe and clean" to "make people ask how it was made", where should this land? (Recommend the bold end unless the brand says otherwise.)
- **Sound:** music taste and energy, generated or supplied track, voice-over or not.
- **Formats and deadline;** how involved they want to be (review every checkpoint, or just the final).

Write the answers into `BRIEF.md`; it is what concepts and reviews are judged against.

### 3. Concepts: three directions, chosen together

Write three genuinely different concepts in `CONCEPTS.md`, each a paragraph plus its **money shot** (the one frame people will screenshot), its **wow moment** (the one *motion event* people will replay: something assembles, shatters, transforms, or the camera does the impossible, landing on the music's peak) and its signature transition:

1. **Expected:** the direction a competent studio would pitch first (useful as a floor).
2. **Bold:** a strong visual metaphor or world the product lives in, with a camera and depth.
3. **Unexpected:** something that makes a designer jealous: a transformation, an impossible camera move, a physical system, the product's data as the image, a format twist.

For each concept also give: why it fits the brand and the brief, the risk, and a one-line description of its money shot as the user would see it. Present all three to the user with your recommendation (the boldest that lands the message and stays on brand) and ask them to pick, mix ("the camera of 3 with the world of 2") or push further. Iterate once or twice if they want; a concept round is cheap, a rebuilt piece is not. Never recommend the expected concept because it's easier to build.

### 4. Treatment and shot list

Write `TREATMENT.md` ([references/treatment.md](references/treatment.md)): the idea, the concept's **core device** (the one mechanism that makes it this concept, e.g. "the frame edge is the wall"; every shot list must show it clearly), tone, the **material language** (2-3 signature materials, the light, the grade), motif, and a **shot list** with windows in bars/beats. Every shot declares its shot size (macro / close / medium / wide / overhead), camera (locked, push, dolly, orbit, crane, whip, rack focus, 3D fly-through), depth layers (what's in front, middle, back), how it transitions out, and the one thing that moves on the beat. Rules:

- No two consecutive shots share a layout or shot size. Vary scale dramatically (a macro detail next to a wide).
- At least one shot uses real depth (the 3D stage, parallax layers, or a keyed clip sandwiched between type).
- At least one shot is a transformation (one thing becomes another) and at least one transition is motivated (match cut, the motif carries across, a whip, a wipe by a real object).
- The whole frame is designed in every shot: backgrounds, texture, light and secondary motion are part of the image; the safe area constrains text, not imagery. Empty space must be a deliberate choice.

If the piece uses generated media, the treatment also holds the **music brief** (tempo, meter, bar map, energy per section, instrumentation, the motif idea) and a **clip shot list** (role, subject, motion, screen colour, length).

### 5. Scaffold

```bash
cp -r <skill-dir>/template <out-dir>        # then, in <out-dir>:
bun install
```

Fill `src/brand.ts` from the brand profile (fonts into `public/fonts/`, logo and media into `public/media/`), set `src/project.ts` (title, format, fps, duration, music, bpm). With music: `uv run --project scripts python scripts/analyze_audio.py public/audio/<file>` writes `public/audio.json` ([references/audio.md](references/audio.md); when you composed the music, pass the score's truth: `--bpm <tempo> --downbeat-offset 0 --sections "intro:0,drop:6,..."` and check the measured section starts it prints). Without music the grid comes from `project.bpm`. Clips go in `public/clips/` via `scripts/prep_clip.ts`.

The template's example scenes are starting points that each show one technique: `hook` (kinetic type on beats), `reveal` (before/after wipe), `insert` (keyed clip with type behind and in front), `flythrough` (3D camera through depth), `assemble` (a wow moment: thousands of pieces lock into the name on the beat), `lookdev` (a material turntable, a tool), `endcard`. Read them, then write this piece's own scenes; a piece assembled from unmodified examples is a 5/10.

### 6. Look development, the wow moment, and style frames: design before animating

**Prototype the wow moment first.** The hardest, most spectacular shot is built before anything else, the way studios build the hero shot first: a rough version in the real engine, timed to its bar, rendered as a short draft. If it doesn't make you want to replay it, redesign it now, while it's cheap. It gets the most time in the schedule. ([references/craft.md](references/craft.md#wow-engineering-the-peak) has patterns; `scenes/assemble.ts` shows one.)

**Look development.** Build the piece's material language in a lookdev turntable (`scenes/lookdev.ts`): candidate materials for the signature surfaces under the piece's light, including at least one custom shader written for this piece ([references/lookdev.md](references/lookdev.md)). Render stills, choose, then use those materials in the style frames. Default grey materials never reach a style frame.

Then build **3-4 style frames** as stills: the money shot, the hook frame (frame 0 and the first second: it must be as designed as the money shot, in the world, never a plain page with text), the densest frame, the end card. Render them and look hard: is each one a finished design you'd post? Iterate the stills until yes. Animating a weak frame only makes a weak shot.

Then show them to the user (send the images and the lookdev still, or give their paths) with 2-3 questions: does this feel like the brand? which frame is strongest, which weakest? do the materials feel right? more or less bold, busy, colourful? Apply the answers before animating. If a frame falls outside the brand profile on purpose, say so and ask.

### 7. Generate media (when models are available)

Find out what the environment offers (a ComfyUI server, hosted APIs, MCP tools) and pick the most controllable model for each job. Ask before using shared resources (a GPU another service is using, a live engine you'd query for real data, paid APIs) and say how much you'll use. Generation is non-deterministic, so generate **assets** once, freeze them into `public/`, and keep the render deterministic.

- **Music:** compose to the edit. With a score-conditioned model, write an *original* score to the bar map: a motif that comes from this piece's idea, developed across sections ([references/generative-music.md](references/generative-music.md) has the method; never reuse an example melody). Generate 3-4 takes, analyse each, have the user listen to the best, then trim, normalise and lock the grid.
- **Clips:** prefer image-to-video from real product imagery; for inserts, generate on a flat green (or blue) screen, prep with `bun scripts/prep_clip.ts <video> --name <n> --key auto` and **look at the QA sheet**. Several seeds; keep the best motion. [references/generative-video.md](references/generative-video.md)
- **Batch runs on ComfyUI:** `bun scripts/comfy.ts` submits an API-format workflow with overrides and one job per varied value (seeds, prompts), waits and downloads the outputs with a provenance record.
- **Provenance:** record every generated asset in `assets.json` (model, checkpoint, workflow, prompt or score, seed, date, prep command). Model licences and permitted uses are the user's call.

Worked examples for specific models: `references/adapters/` (YuE2 music and MiniMax H3 video on ComfyUI).

### 8. Build scene by scene, and look at every one

One file per scene in `src/scenes/` ([references/engine.md](references/engine.md) is the API: 2D layers, the 3D stage, shaders, clips, post). The timeline places scenes by bars (`au.timeOfBar(n)`).

After each scene, **render stills and look at them** (open the PNGs with your image viewer):

```bash
bun scripts/render.ts stills --t 2.1,2.6,3.4 --only hook      # frames of one scene
bun scripts/render.ts sheet --n 24 --cols 8                    # contact sheet of the whole piece
bun scripts/render.ts sheet --cuts                             # 4 frames around every cut
bun scripts/render.ts stills --t 3.1 --samples auto            # with motion blur, as exported
bunx tsc --noEmit -p tsconfig.json                             # typecheck
```

For motion you can't judge from stills, render a short draft (`video --from 2 --to 5 --samples 4`), pull frames with ffmpeg, or ask the user to watch the live preview (`bun run dev`, then http://localhost:5173/?t=2).

### 9. Art-director review: score it, then raise the weakest thing

Before the final render, run the review in [references/review.md](references/review.md): render the contact sheet and the money shot, then have a **fresh reviewer** (a subagent or a separate agent process that sees the frames, the brief, the treatment, the rubric and the previous rounds' log, not your reasoning; review.md shows how in Claude Code and Codex) score concept, wow, composition, motion and camera, variety, look and materials, craft, brand fit and sound, and name the single weakest thing. Fix it and re-review. If no subagent is available, do the review yourself against the rubric, honestly, as if it were someone else's work.

- **Fix the weakest dimension, not the easiest.** If a dimension hasn't moved in two rounds, tweaks aren't working: change approach structurally (Look/Craft stuck: a lookdev pass on materials and light; Composition stuck: re-block the shot; Concept stuck: revisit the core device).
- **Ship gate:** every score 8+ and "yes", checked on frames from the final render (re-review after the last fix). If after ~5 rounds it's still below, stop and ask the user: show the scores, the remaining weak spots and an estimate for another pass; let them choose to continue, change approach, or ship as is. Never ship below the bar silently.

### 10. Render and deliver

```bash
bun scripts/render.ts video                                     # out/<format>.mp4, adaptive motion blur, BT.709, AAC
bun scripts/render.ts poster --t <settled-strong-moment>       # renders the poster, bakes it in as frame 0
bun scripts/render.ts video --format portrait                  # each extra format (layouts follow SAFE)
```

Check every format's contact sheet before its final render, then pull a few frames from the final MP4 and look at them: that is what the audience gets.

Deliver: the MP4s, the poster PNGs (the Reel cover), `BRIEF.md`, `CONCEPTS.md`, `TREATMENT.md`, the review scores, `assets.json`, and a `caption.txt` (1-3 sentences in the brand voice, postable as-is). Tell the user the idea in one sentence, the money shot and where it lands, what you would push further with more time, and offer re-cuts, another concept, or more formats. Platform specs: [references/formats.md](references/formats.md).

## Laws (every piece, every tone)

- **Ambition first.** One strong idea, a money shot, a wow moment on the peak, depth, transformation and scale contrast. Never slides.
- **No default materials.** Every surface is designed: a material language per piece, at least one custom shader, light chosen with the materials.
- **The hook is the first 1.5 s.** Motion and the most striking visual from frame 1; no logo intro, no fade from black.
- **Readable with the sound off.** Any line meant to be read holds settled for ~0.3 s per word (a short label ≥ 0.8 s). Fast in, then hold.
- **Show the thing.** Real product, real outputs, real data, real copy. No invented claims, no stock "AI" imagery.
- **Always moving, never floating.** Something moves in every shot; big changes land on the beat; snap, hold, snap.
- **One accent.** One signal colour carries the eye; only it blooms.
- **Safe areas constrain text, not imagery.** Text, logos and faces stay inside `SAFE`; images, texture and camera moves use the whole frame.
- **Every frame postable.** Freeze anywhere: it should look designed.
- **Deterministic.** Every frame is a pure function of time.
- **Specific, not generic.** It should be obviously *this* product; use its own words, data and look.
- **On brand, confirmed.** The profile is checked with the user at the brief, and the style frames are approved before animating.

## Tone presets

A starting point; freeform direction ("a 90s infomercial played straight") refines or overrides it. Every tone still clears the bar: `premium` is restrained, not timid.

| Tone | Feel | Pacing and cuts |
|---|---|---|
| `punchy` (default) | confident, clean, energetic | a cut every 1-2 bars; snaps, punch-ins and whips on hits |
| `premium` | restrained, elegant, lots of space | long holds with slow camera moves through depth, material and light |
| `hype` | loud, fast, ALL CAPS | cuts on beats, flash/zoom cuts, stacked type, scale jumps |
| `deadpan` | dry, understated; the joke is the calm | few shots, long holds, one absurd precise move |
| `cinematic` | trailer scale, big claims | slow build, 3D reveals, one huge payoff |
| `explainer` | clear, friendly, step by step | the real UI in motion, callouts, zooms into detail |

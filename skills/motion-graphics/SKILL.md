---
name: motion-graphics
description: Design and render advanced, code-driven motion graphics videos (social ads, Instagram Reels/Stories/feed posts, TikToks, product launch and feature videos, kinetic typography, before/after reveals, beat-synced edits, animated end cards, voice-over narration with burned-in captions) as MP4s. Every frame is a deterministic function of time in a small WebGL + Canvas2D engine, so the browser preview and the offline render match, with real motion blur, bloom and grain, cuts snapped to the music's beats, and multi-format output (9:16, 4:5, 1:1, 16:9) that respects platform safe zones. Works with any generative audio and video models the agent can reach (music composed to the edit's bar map, generated video clips used as plates or green-screen inserts keyed and composited into the design). Use when someone asks for a motion graphic, animated ad, promo/launch video, Reel, animated post, kinetic type, a "video from this", or wants product visuals turned into a short video. Brand-neutral; brand looks come from a profile file.
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
| Duration | 10-20 s for ads (hook in the first 1.5 s), 6-10 s for a feed loop, up to 30 s for a launch piece; longer when the viewer has to learn several new ideas (about 4-6 s per new idea, plus reading time) |
| Music | a user-supplied track; or generated with a music model you can reach, composed to the edit ([references/generative-music.md](references/generative-music.md)); or silent |
| Video clips | optional: generated with a video model you can reach, as plates or keyed inserts ([references/generative-video.md](references/generative-video.md)) |
| Voice-over | optional: a narrator (or characters) from a speech model you can reach, cast and directed with the user, placed on the music and captioned ([references/voice.md](references/voice.md)); it deepens the message, never carries its only copy |
| Real media | the product's own UI, outputs, screenshots, copy: find them in the repo/site |
| Output folder | `./motion/<slug>/` in the current project, or where the user says |

**Time:** a strong 15 s piece takes hours of iteration, not minutes. Budget for it. Stopping when the checklist passes is how 5/10 pieces happen; stop when the review says it's excellent.

## Workflow

### 1. Inspect: find the story and the material

Answer in a few lines before designing anything: What is it (one sentence)? Who is it for and what does it do for them? What is the single message? What is the most impressive thing it can *show* (not say)? What real material exists (UI, outputs, data, sounds, copy, numbers you can cite)? What is surprising, beautiful or funny about how it works inside? Gather the material into `public/media/`.

Show the thing: the product doing its job beats any description of it. Use real outputs, real UI, real data and real copy; never invent claims, numbers or testimonials.

**Placeholder data:** when the real recording can't be made yet (the hardware isn't available, the release isn't out), a concept may run on clearly estimated numbers, but only with a visible "NOT FOR POSTING" watermark on every frame, and with the exact command that records the real data written into the treatment. The watermark comes off only when the data is replaced.

**Brand:** build or load the brand profile now and confirm it with the user in the brief (palette, type, voice, what the brand never does). A piece that is brilliant but off brand is wrong.

### 2. Creative brief: interview the user

Ask what the material can't tell you. Pick the questions that matter for this piece (usually 6-10 over two or three rounds):

- **Occasion and audience:** what is launching or being said, where it runs (organic post, paid ad, site hero, conference screen), who should stop scrolling.
- **The one message** (offer 2-3 candidates you drafted from the material) and the feeling it should leave (awe, delight, confidence, curiosity, a laugh). Then: **after one watch, what should a viewer be able to say?** That sentence is what the comprehension review checks.
- **Brand check:** "Here's the profile I built: palette, type, voice. Anything wrong or missing? Anything this brand never does?" Ask for do's and don'ts, and whether the piece may stretch the brand (a new motion language) or must stay strictly inside it.
- **References:** pieces, brands, films or motion studios they love (and hate) for this; offer 2-3 reference directions to react to if they have none.
- **Must include / must avoid:** product shots, UI, people, claims, logos, legal lines.
- **Boldness:** on a scale from "safe and clean" to "make people ask how it was made", where should this land? (Recommend the bold end unless the brand says otherwise.)
- **Sound:** music taste and energy, generated or supplied track; voice-over or not, and if so: the language(s), the voice's character in three adjectives (and three it must not be), and whether the piece plays with sound on where it runs.
- **Formats and deadline;** how involved they want to be (review every checkpoint, or just the final).

Write the answers into `BRIEF.md`; it is what concepts and reviews are judged against.

### 3. Concepts: three directions, chosen together

Write three genuinely different concepts in `CONCEPTS.md`, each a paragraph plus its **money shot** (the one frame people will screenshot), its **wow moment** (the one *motion event* people will replay: something assembles, shatters, transforms, or the camera does the impossible, landing on the music's peak) and its signature transition:

1. **Expected:** the direction a competent studio would pitch first (useful as a floor).
2. **Bold:** a strong visual metaphor or world the product lives in, with a camera and depth.
3. **Unexpected:** something that makes a designer jealous: a transformation, an impossible camera move, a physical system, the product's data as the image, a format twist.

For each concept also give: why it fits the brand and the brief, the risk, and a one-line description of its money shot as the user would see it. Present all three to the user with your recommendation (the boldest that lands the message and stays on brand) and ask them to pick, mix ("the camera of 3 with the world of 2") or push further. Iterate once or twice if they want; a concept round is cheap, a rebuilt piece is not. Never recommend the expected concept because it's easier to build.

### 4. Scaffold

```bash
cp -r <skill-dir>/template <out-dir>        # then, in <out-dir>:
bun install
```

Fill `src/brand.ts` from the brand profile (fonts into `public/fonts/`, logo and media into `public/media/`), set `src/project.ts` (title, format, fps, duration, music, bpm). Music comes next (step 5). Clips go in `public/clips/` via `scripts/prep_clip.ts`.

The template's example scenes are starting points that each show one technique: `hook` (kinetic type on beats), `reveal` (before/after wipe), `insert` (keyed clip with type behind and in front), `flythrough` (3D camera through depth), `assemble` (a wow moment: thousands of pieces lock into the name on the beat), `lookdev` (a material turntable, a tool), `endcard`. Read them, then write this piece's own scenes; a piece assembled from unmodified examples is a 5/10.

### 5. Music first: get the track, then read its map

The edit is built on the music, and you can't hear it, so the music comes before the treatment and gets turned into something you can read and look at.

1. **Get the track.** A supplied track, or generate one: write a short music brief from the chosen concept (tempo, length, the energy arc, where the peak falls, instrumentation), compose to it ([references/generative-music.md](references/generative-music.md): an *original* motif, never an example melody), render 3-4 takes. Or silent (then the grid comes from `project.bpm` and there is no map).
2. **Map it:** `uv run --project scripts python scripts/analyze_audio.py public/audio/<file>` (for a score you wrote, add `--bpm <tempo> --downbeat-offset 0 --sections "intro:0,drop:6,..."`). Besides `public/audio.json` it writes **`MUSIC-MAP.md`** (tempo and grid, detected sections with energy, a per-bar table, moments: drops, stops, builds, breakdowns, the peak, the tail, and edit suggestions: the wow-moment candidate, cut points, calm bars for reading, the strongest hits) and **`out/music-map.png`** (the spectrogram with bars, sections and events). Read the map and look at the picture; for several takes, map each and compare.
3. **Confirm by ear:** send the user the best take(s) with one line on what the map shows ("drop after a stop at 12.04 s, calm bars 9-11 for the end card"). Their ear and the map together decide the take.
4. **The map is the truth for the edit.** Plan every window on it, not on what the score intended: models drift, and a picked take can put its peak a bar away from the plan. The timeline reads it: `au.moment('drop')` (the map's wow candidate), `au.section('break')`, `au.timeOfBar(n)`.
5. **If the piece has a voice** ([references/voice.md](references/voice.md)): write the lines for the ear (say what the picture can't; a third of the runtime without voice), cast it (`bun scripts/voice.ts voices` / `design`, then `audition` three voices on the same two lines and let the user choose by ear), render the takes (`render`, after `render --dry` shows the cost), and place them on the map (`at`, `land` a key word on a beat, or `after` the previous line; `cues` prints where everything lands). Music-led pieces fit the lines into the map's windows; voice-led pieces (explainers, stories) render the voice first and cut the music and scenes to it. Leave the drop, the wow moment and the first second of the end card to the music.

### 6. Treatment and shot list, on the music map

Write `TREATMENT.md` ([references/treatment.md](references/treatment.md)): the idea, the concept's **core device** (the one mechanism that makes it this concept, e.g. "the frame edge is the wall"; every shot list must show it clearly), tone, the **material language** (2-3 signature materials, the light, the grade), motif, and a **shot list** with windows in bars/beats taken from `MUSIC-MAP.md`: the wow moment on the map's wow candidate, cuts on its section starts, text and the end card in its calm bars, punctuation on its strongest hits. Every shot declares its shot size (macro / close / medium / wide / overhead), camera (locked, push, dolly, orbit, crane, whip, rack focus, 3D fly-through), depth layers (what's in front, middle, back), how it transitions out, and the one thing that moves on the beat. Rules:

- No two consecutive shots share a layout or shot size. Vary scale dramatically (a macro detail next to a wide).
- At least one shot uses real depth (the 3D stage, parallax layers, or a keyed clip sandwiched between type).
- At least one shot is a transformation (one thing becomes another) and at least one transition is motivated (match cut, the motif carries across, a whip, a wipe by a real object).
- The whole frame is designed in every shot: backgrounds, texture, light and secondary motion are part of the image; the safe area constrains text, not imagery. Empty space must be a deliberate choice.
- When the message is that several things happen together, **introduce each one alone, then combine them** (each part long enough to learn what it looks like; the all-together shot is the payoff). Showing everything at once from the start reads as noise.
- Events faster than the eye (a 50 ms decision, a token stream) get **labelled slow motion** ("▶ 0.25× SLOW MOTION"), then a visible snap to real speed. Recorded data follows [craft.md](references/craft.md#recorded-data-as-motion): a time map per chapter, the clock stops when the recording does, drawn time kept separate from recorded time.

If the piece uses generated clips, the treatment also holds a **clip shot list** (role, subject, motion, screen colour, length). If it has a voice, the Copy section holds the **voice script**: every line as spoken, its direction, where it lands (bar or the word it lands on a beat), and its words per second.

### 7. Look development, the wow moment, and style frames: design before animating

**Prototype the wow moment first.** The hardest, most spectacular shot is built before anything else, the way studios build the hero shot first: a rough version in the real engine, timed to its bar, rendered as a short draft. If it doesn't make you want to replay it, redesign it now, while it's cheap. It gets the most time in the schedule. ([references/craft.md](references/craft.md#wow-engineering-the-peak) has patterns; `scenes/assemble.ts` shows one.)

**Look development.** Build the piece's material language in a lookdev turntable (`scenes/lookdev.ts`): candidate materials for the signature surfaces under the piece's light, including at least one custom shader written for this piece ([references/lookdev.md](references/lookdev.md)). Render stills, choose, then use those materials in the style frames. Default grey materials never reach a style frame.

Then build **3-4 style frames** as stills: the money shot, the hook frame (frame 0 and the first second: build it with the money shot's light, density and materials, in the world, never a plain page with text; reviewers flagged frame 0 as "thinner than the money shot" in every dogfood run until this rule), the densest frame, the end card. Render them and look hard: is each one a finished design you'd post? Iterate the stills until yes. Animating a weak frame only makes a weak shot.

Then show them to the user (send the images and the lookdev still, or give their paths) with 2-3 questions: does this feel like the brand? which frame is strongest, which weakest? do the materials feel right? more or less bold, busy, colourful? Apply the answers before animating. If a frame falls outside the brand profile on purpose, say so and ask.

### 8. Generate clips and other media (when models are available)

Find out what the environment offers (a ComfyUI server, hosted APIs, MCP tools) and pick the most controllable model for each job. Ask before using shared resources (a GPU another service is using, a live engine you'd query for real data, paid APIs) and say how much you'll use. Generation is non-deterministic, so generate **assets** once, freeze them into `public/`, and keep the render deterministic.

- **Music** was step 5; if a re-take is needed, re-map it and re-check every window.
- **Clips:** prefer image-to-video from real product imagery; for inserts, generate on a flat green (or blue) screen, prep with `bun scripts/prep_clip.ts <video> --name <n> --key auto` and **look at the QA sheet**. Several seeds; keep the best motion. [references/generative-video.md](references/generative-video.md)
- **Batch runs on ComfyUI:** `bun scripts/comfy.ts` submits an API-format workflow with overrides and one job per varied value (seeds, prompts), waits and downloads the outputs with a provenance record.
- **Provenance:** record every generated asset in `assets.json` (model, checkpoint, workflow, prompt or score, seed, date, prep command). Model licences and permitted uses are the user's call.

- **Voice:** `bun scripts/voice.ts render` writes one mastered take per line (`public/vo/<id>.wav`) with its word timings; the engine places the lines, draws captions from them and the render mixes them over a ducked bed. Send new takes to the user to hear before building on them.

Worked examples for specific models: `references/adapters/` (YuE2 music and MiniMax H3 video on ComfyUI, ElevenLabs voice).

### 9. Build scene by scene, and look at every one

One file per scene in `src/scenes/` ([references/engine.md](references/engine.md) is the API: 2D layers, the 3D stage, shaders, clips, post). The timeline places scenes on the music map (`au.moment('drop')`, `au.section(name)`, `au.timeOfBar(n)`), never on typed-in seconds.

After each scene, **render stills and look at them** (open the PNGs with your image viewer):

```bash
bun scripts/render.ts stills --t 2.1,2.6,3.4 --only hook      # frames of one scene
bun scripts/render.ts sheet --n 24 --cols 8                    # contact sheet of the whole piece
bun scripts/render.ts sheet --cuts                             # 4 frames around every cut
bun scripts/render.ts stills --t 3.1 --samples auto            # with motion blur, as exported
bun scripts/render.ts sheet --from 2 --to 3 --every 0.1 --crop 0,600,1080,700 --samples 4   # a motion strip
bun scripts/render.ts check --t 2.1,5,9.5 --formats vertical,portrait   # the same moments in every format
bunx tsc --noEmit -p tsconfig.json                             # typecheck
```

Times snap to frame times (the only ones the video contains). For motion you can't judge from stills, render a motion strip of the element that moves (a falling piece, a card that lands), a short draft (`video --from 2 --to 5 --samples 4`), or ask the user to watch the live preview (`bun run dev`, then http://localhost:5173/?t=2). Draft renders are slow mostly because of the scene, not the encoder: see [engine.md](references/engine.md#render-speed) before waiting on full renders.

**Previews for the user:** encode drafts you send for feedback at 720p, CRF 23 or lower, about 10 MB or less (file-send tools cap around 35 MiB): `ffmpeg -i out/<format>.mp4 -vf scale=-2:720 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out/<format>-preview.mp4`. Text looks soft in a preview; judge sharpness on the master, and say so if a note might be about the preview.

### 10. Art-director review: score it, then raise the weakest thing

Before the final render, run the review in [references/review.md](references/review.md): render the contact sheet and the money shot, then have a **fresh reviewer** (a subagent or a separate agent process that sees the frames, the brief, the treatment, the rubric and the previous rounds' log, not your reasoning; review.md shows how in Claude Code and Codex) score concept, wow, composition, motion and camera, variety, look and materials, craft, brand fit, sound and first-watch comprehension, and name the single weakest thing. Give the reviewer motion strips of the key motions and a reading-time table too: a contact sheet can't show pacing, or whether something moves the way it should. Fix it and re-review. Use the strongest model available for the reviewer (a weaker reviewer is a lenient one). The reviewer scores; the gate decides: a reviewer's "ship: yes" never overrides a dimension below 8. If no subagent is available, do the review yourself against the rubric, honestly, as if it were someone else's work.

- **Fix the weakest dimension, not the easiest.** If a dimension hasn't moved in two rounds, tweaks aren't working: change approach structurally (Look/Craft stuck: a lookdev pass on materials and light; Composition stuck: re-block the shot; Concept stuck: revisit the core device).
- **Ship gate:** every score 8+ and "yes", checked on frames from the final render (re-review after the last fix). If after ~5 rounds it's still below, stop and ask the user: show the scores, the remaining weak spots and an estimate for another pass; let them choose to continue, change approach, or ship as is. Never ship below the bar silently.

### 11. Render and deliver

```bash
bun scripts/render.ts video                                     # out/<format>.mp4, adaptive motion blur, BT.709, AAC
bun scripts/render.ts poster --t <settled-strong-moment>       # renders the poster, bakes it in as frame 0
bun scripts/render.ts video --format portrait                  # each extra format (layouts follow SAFE)
```

Check every format's contact sheet before its final render, then pull a few frames from the final MP4 and look at them: that is what the audience gets.

Deliver: the MP4s, the poster PNGs (the Reel cover), `out/voice.srt` when there is a voice, `BRIEF.md`, `CONCEPTS.md`, `MUSIC-MAP.md`, `TREATMENT.md`, the review scores, `assets.json`, and a `caption.txt` (1-3 sentences in the brand voice, postable as-is). Tell the user the idea in one sentence, the money shot and where it lands, what you would push further with more time, and offer re-cuts, another concept, or more formats. Platform specs: [references/formats.md](references/formats.md).

## Laws (every piece, every tone)

- **Ambition first.** One strong idea, a money shot, a wow moment on the peak, depth, transformation and scale contrast. Never slides.
- **Understood on first watch.** A first-time viewer at 1x gets the message without a replay; the wow serves the message, never replaces it. Pace by ideas, not only by words: introduce, then combine.
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

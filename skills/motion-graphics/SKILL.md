---
name: motion-graphics
description: Design and render advanced, code-driven motion graphics videos (social ads, Instagram Reels/Stories/feed posts, TikToks, product launch and feature videos, kinetic typography, before/after reveals, beat-synced edits, animated end cards) as MP4s. Every frame is a deterministic function of time in a small WebGL + Canvas2D engine, so the browser preview and the offline render match, with real motion blur, bloom and grain, cuts snapped to the music's beats, and multi-format output (9:16, 4:5, 1:1, 16:9) that respects platform safe zones. Works with any generative audio and video models the agent can reach (music composed to the edit's bar map, generated video clips used as plates or green-screen inserts keyed and composited into the design). Use when someone asks for a motion graphic, animated ad, promo/launch video, Reel, animated post, kinetic type, a "video from this", or wants product visuals turned into a short video. Brand-neutral; brand looks come from a profile file.
---

# Motion graphics

You make the whole piece yourself: concept, treatment, scenes in code, the look, the edit, the render. The engine in `<skill-dir>/template/` gives you a deterministic renderer; your job is the design and the craft. The standard is a piece a motion designer would be proud of: specific to the product, always moving with intent, readable on a phone with the sound off, and with every frozen frame good enough to post.

`<skill-dir>` is this file's directory (Claude Code prints it as "Base directory for this skill"). Don't guess the install path.

**Read before starting:** [references/craft.md](references/craft.md) (motion, type, colour, transitions, what to avoid). Read the others when their step comes up.

## Inputs

Ask only for what you can't find or infer. Defaults in brackets.

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

## Workflow

### 1. Inspect: find the story and the material

Answer in a few lines before designing anything: What is it (one sentence)? Who is it for and what does it do for them? What is the single message of this piece? What is the most impressive thing it can *show* (not say)? What real material exists (UI, outputs, before/after pairs, copy, numbers you can cite)? What would stop a thumb mid-scroll? Gather the material into `public/media/`.

Show the thing: the product doing its job beats any description of it. Use real outputs, real UI and real copy; never invent claims, numbers or testimonials. Small illustrative UI text (a filename, a toast) is fine.

### 2. Treatment: the style bible, before any code

Write `TREATMENT.md` in the output folder ([references/treatment.md](references/treatment.md) has the template): the idea in one paragraph, tone, palette and type (from the brand profile), the recurring motif that ties the scenes together, and a scene-by-scene table with windows in **bars/beats**, what's on screen, how it moves, and the transition out. Plan the hook first. Keep the scene count honest for the length (roughly one idea per 2-4 s).

Share the treatment with the user in a few lines and proceed unless they asked to approve it first. For a paid ad or a campaign, do ask: a treatment is cheap to change, a render is not.

If the piece uses generated music or clips, the treatment also holds the **music brief** (tempo, meter, bar map per section, energy, instrumentation) and a **shot list** for clips (role, subject, motion, screen colour, length).

### 2b. Generate media (when models are available)

Find out what the environment offers (a ComfyUI server, hosted APIs, MCP tools) and pick the most controllable model for each job. Generation is non-deterministic, so generate **assets** once, freeze them into `public/`, and keep the render deterministic.

- **Music:** compose to the edit. With a score-conditioned model, write the score to the treatment's bar map; otherwise prompt with tempo and length and fit the edit to the result. Generate 3-4 takes, analyse each (tempo, section timing, spectrogram), have the user listen to the best, then trim, normalise and lock the grid. [references/generative-music.md](references/generative-music.md)
- **Clips:** prefer image-to-video from real product imagery; for inserts, generate on a flat green (or blue) screen. Prep with `bun scripts/prep_clip.ts <video> --name <n> --key auto` and **look at the QA sheet** it writes. Generate several seeds and pick the best motion. [references/generative-video.md](references/generative-video.md)
- **Provenance:** record every generated asset in `assets.json` (model, checkpoint, workflow, prompt or score, seed, date, prep command). Model licences and permitted uses are the user's call; the record lets them decide.

Worked examples for specific models live in `references/adapters/` (YuE2 music and MiniMax H3 video on ComfyUI). Use them as patterns for whatever models are available.

### 3. Scaffold

```bash
cp -r <skill-dir>/template <out-dir>        # then, in <out-dir>:
bun install
```

Fill `src/brand.ts` from the brand profile (copy fonts into `public/fonts/`, the logo and media into `public/media/`), set `src/project.ts` (title, format, fps, duration, music, bpm). With music: put it in `public/audio/` and run `uv run --project scripts python scripts/analyze_audio.py public/audio/<file>` to write `public/audio.json` (beats, downbeats, envelopes, onsets: [references/audio.md](references/audio.md); add `--downbeat-offset 0` when you composed the music and know bar 1 starts on its first beat). Without music the grid comes from `project.bpm`, so silent pieces still cut on a rhythm. Clips go in `public/clips/` via `scripts/prep_clip.ts`.

The template ships four example scenes (`hook`: kinetic type; `reveal`: before/after wipe; `insert`: a keyed clip with type behind and in front of it; `endcard`) and `src/timeline.ts`. Read them: they show the patterns. Adapt or replace them; don't keep example copy.

### 4. Build scene by scene, and look at every one

One file per scene in `src/scenes/`, each a class extending `Scene` ([references/engine.md](references/engine.md) is the API). The timeline in `src/timeline.ts` places scenes by bars (`au.timeOfBar(n)`), never by typed-in seconds.

After each scene, **render stills and look at them** (open the PNGs with Read):

```bash
bun scripts/render.ts stills --t 2.1,2.6,3.4 --only hook      # frames of one scene
bun scripts/render.ts sheet --n 24 --cols 8                    # contact sheet of the whole piece
bun scripts/render.ts sheet --cuts                             # 4 frames around every cut
bun scripts/render.ts stills --t 3.1 --samples auto            # with motion blur, as exported
bunx tsc --noEmit -p tsconfig.json                             # typecheck
```

Check each frame against the craft checklist: nothing important outside the safe area (`s` in the preview shows it), text readable at phone size and held long enough, contrast, no collisions or overflow, the accent used sparingly, cuts on beats, and every settled frame postable. The render script prints `SCENE ERRORS` and browser errors: read them. For motion you can't judge from stills, render a short clip (`video --from 2 --to 5 --samples 4` is a fast draft) and pull frames with ffmpeg, or ask the user to watch the live preview (`bun run dev`, then http://localhost:5173/?t=2).

### 5. Render and deliver

```bash
bun scripts/render.ts video                                     # out/<format>.mp4, adaptive motion blur, BT.709, AAC
bun scripts/render.ts poster --t <settled-strong-moment>       # renders the poster, bakes it in as frame 0
bun scripts/render.ts video --format portrait                  # each extra format (layouts follow SAFE)
```

Check every format's contact sheet before its final render: a layout that works in 9:16 can collide in 1:1. Then extract a few frames from the final MP4 (`ffmpeg -ss 3 -i out/vertical.mp4 -frames:v 1 f.png`) and look at them: that is what the audience gets.

Deliver: the MP4s, the poster PNGs (upload them as the Reel cover), `TREATMENT.md`, and a `caption.txt` (1-3 sentences in the brand voice, postable as-is, plus hashtags if the profile has them). Tell the user where everything is, the creative angle in one sentence, and offer to re-cut a scene, try another hook, or make another format. Platform specs: [references/formats.md](references/formats.md).

## Laws (every piece, every tone)

- **The hook is the first 1.5 s.** Motion and the message's most striking visual from frame 1; no logo intro, no slow fade from black.
- **Readable with the sound off.** Most feeds autoplay muted. The words carry the message; any line meant to be read holds settled for ~0.3 s per word (a short label ≥ 0.8 s). Fast in, then hold; never fast in, then gone.
- **Show the thing.** Real product, real outputs, real copy. No abstract filler, no stock "AI" imagery, no invented claims.
- **Always moving, never floating.** Something moves in every shot, and big changes land on the beat: snap with strong eases (outExpo, springs), hold, then snap again. No generic screensaver drift.
- **One accent.** One signal colour carries the eye (the active word, the CTA, the glow). Only it blooms. Type and photos stay crisp.
- **Safe areas are law.** Text, logos and faces stay inside `SAFE`; photos may bleed to the edge.
- **Every frame postable.** Freeze anywhere: it should look designed. The poster frame is the strongest settled one.
- **Deterministic.** Every frame is a pure function of time. No `Math.random()`, `Date.now()` or accumulated state; the export depends on it.
- **Specific, not generic.** It should be obviously *this* product. "Streamline your workflow" is banned; use the product's own words.

## Tone presets

A starting point; freeform direction ("a 90s infomercial played straight") refines or overrides it. Details in craft.md.

| Tone | Feel | Pacing and cuts |
|---|---|---|
| `punchy` (default) | confident, clean, energetic | a cut every 1-2 bars; snaps and punch-ins on hits |
| `premium` | restrained, elegant, lots of space | long holds, slow pushes, soft dips through black |
| `hype` | loud, fast, ALL CAPS | cuts on beats, flash/zoom cuts, stacked type |
| `deadpan` | dry, understated; the joke is the calm | few scenes, long holds, hard cuts |
| `cinematic` | trailer scale, big claims | slow build, dramatic reveals, one huge payoff |
| `explainer` | clear, friendly, step by step | one feature per scene, UI in motion, arrows and callouts |

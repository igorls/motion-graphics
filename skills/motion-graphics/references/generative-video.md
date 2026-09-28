# Generative video clips

Video models add what code can't draw well: real-looking objects, people, materials, camera moves through space. The engine keeps the design, type and timing; generated clips are **assets** it composites. Generate them once, freeze them as frame sequences, and the render stays deterministic.

## Roles a clip can play

| Role | What to generate | How it's used |
|---|---|---|
| **Keyed insert** | one object/person on a flat green (or blue) screen | keyed with `prep_clip.ts --key auto`, composited with type behind and in front (see `scenes/insert.ts`) |
| **Background plate** | an environment or texture, slow camera move, no subject | full-frame under type; blur/darken it so the type reads |
| **Hero shot** | the product or a person doing the thing | full-frame or in a card; the cut lands on the action |
| **Transition** | first/last-frame models: frame A → frame B | between two designed frames (last frame of scene A, first frame of scene B) |
| **Loop** | a seamless cycle (smoke, light, fabric) | `mode: 'loop'` or `'pingpong'` in `Clip.frame()` |

Prefer **image-to-video** from a real product photo or a designed frame whenever the thing must look exactly right (a real product, a UI, a logo); text-to-video invents details.

## Prompting for plates (any model)

- One shot, locked-off camera (or one simple move), no cuts, no text, no people you didn't ask for.
- For inserts: "the entire background is a perfectly flat, evenly lit chroma green screen, no floor, no horizon, no shadows", generous margin so the subject never touches the frame edge, crisp edges, minimal motion blur, no depth of field. Choose blue when the subject is green, yellow-green or has green reflections.
- Expect the model to ignore some of it (in testing, a "flat green screen" came back with a lighter floor and a cast shadow). The keyer handles an uneven screen and floor shadows; the QA sheet shows what's left.
- Say what the audio should be ("complete silence") for models that generate sound; `prep_clip.ts` drops audio anyway.
- Describe motion with timing words that map to the edit ("tumbles for the first second, then turns to face the camera and settles"), then fit it to the beat with `speed`.

## Prep: `scripts/prep_clip.ts`

```bash
bun scripts/prep_clip.ts gen/print.mp4 --name print --key auto      # keyed insert -> public/clips/print/*.png + clip.json
bun scripts/prep_clip.ts gen/city.mp4 --name city --width 1080        # opaque plate -> JPEG frames
bun scripts/prep_clip.ts gen/loop.mp4 --name smoke --from 0.5 --to 3.5 --fps 30   # trim, retime with motion interpolation
```

The keyer is a colour-difference matte (green excess over max(red, blue), normalised by the sampled screen colour): whites, greys, blacks and skin stay solid even on a dull generated screen; shadows fade out softly. Tune with `--lo` (raise to drop more shadow) and `--hi` (lower to keep more semi-transparent detail), `--choke`/`--soften` for the edge, `--despill` for the green cast. It records the subject's bounding box over the whole clip; `Clip.drawFit()` sizes and places that box, so screen margins don't shrink the subject.

**Always open `out/qa-<name>.png`** (frames over magenta and a checkerboard): holes in the subject, leftover screen, green fringes and floor shadows show there. If a clip can't be keyed cleanly, a matte model (background-removal / video-matting) is the alternative: produce an alpha video and prep it without `--key`, or extend the script.

## Timing and quality

- Generated clips have their own frame rate (often 24 fps). `Clip.frame(t)` holds each source frame, which is fine for most inserts; interpolate with `--fps 30` only when motion looks steppy.
- Fit actions to beats with `speed` and `clipStart` params: if the object settles at 2.6 s in the clip and should settle on beat 4 of the scene, `speed = 2.6 / (timeOfBeat(b0 + 4) - start)`.
- Resolution: most video models output ~720-1080 px on the short edge. Keep a clip at or below its native size on screen, or upscale it with a video upscaler before prep for full-frame use. Never stretch a 768 px plate to a 1080×1920 background without an upscale and a check.
- Memory: frames are preloaded (width × height × 4 bytes each). Trim clips to what's used and scale them to their display size (`--width`).
- Generate several seeds and pick the best motion; motion quality varies far more between seeds than image quality does.

## Provenance

Add every generated clip to `assets.json` (model, checkpoint, workflow/template, prompt, seed, resolution, date, and the prep command used). Licences and permitted uses are the user's call; the record is what they need to make it.

Worked example: [adapters/minimax-h3-comfyui.md](adapters/minimax-h3-comfyui.md).

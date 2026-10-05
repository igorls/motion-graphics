# Engine guide (for scene authors)

The template (`<skill-dir>/template/`) is a small web app: TypeScript + three.js, run with bun + Vite. It renders any time `t` of the piece deterministically, so the live preview and the offline export are the same frames. Design lineage: mexicat/pdoom-video (MIT), a music video rendered this way.

## Layout

```
src/project.ts     title, default format, fps, duration, music, voice, captions, mix, fallback bpm
src/brand.ts       colours, fonts, logo, tagline, CTA: the only place brand values live
src/timeline.ts    the edit: which scene plays when, placed by bars/beats
src/scenes/*.ts    one module per scene (+ _shared.ts for motifs every scene reuses)
src/engine/stage3d.ts  the 3D stage (three.js scene + camera into the HDR pipeline), lighting, paper, textPlane, imagePlane
src/engine/looks.ts    materials and custom shaders (look development)
src/engine/swarm.ts    thousands of instances flying between formations (text, logo, grid, cloud)
src/engine/voice.ts    voice-over lines placed on the grid (pure: shared by the browser and the scripts)
src/engine/captions.ts burned-in captions from the voice's word timings (an overlay after post)
src/engine/        format/safe areas, gl helpers, post chain, audio data, type helpers, engine
scripts/render.ts  offline renderer: stills, sheet, video, poster (headless Chrome -> raw frames -> ffmpeg)
scripts/analyze_audio.py   music -> public/audio.json (uv + librosa)
scripts/prep_clip.ts       video -> public/clips/<name>/ frame sequence, optional green/blue screen key + QA sheet
scripts/comfy.ts           ComfyUI batch runner: API workflow + overrides, one job per varied value, downloads + takes.json
scripts/voice.ts           voice-over: voices, design, audition, render takes (word timings, -16 LUFS), cues + SRT
public/            media/, fonts/, audio/, audio.json: everything scenes load by URL
```

Requirements: bun, Google Chrome (driven headless through playwright-core), ffmpeg with libx264; uv for the audio analysis.

## Preview

`bun run dev`, then http://localhost:5173/?t=2.5&format=portrait. Keys: space play/pause, ←/→ ±1 s (shift ±5), `,`/`.` one frame, `[`/`]` previous/next scene, `s` safe-area overlay, `h` hide the bar. The preview renders one sample per frame (no motion blur); the export is heavier and better.

## Writing a scene

```ts
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { font } from '../engine/type';
import { ease, prog } from '../engine/util';
import { brand } from '../brand';
import { BgField, glow } from './_shared';

export default class Title extends Scene {
  bg = new BgField();
  text = new Layer2D();
  glowL = new Layer2D();
  land = 0;
  init() {                                       // precompute: layout, images, beat times
    const { audio, start } = this.ctx;
    this.land = audio.timeOfBeat(Math.ceil(audio.beatAt(start)) + 1);   // one beat after the cut
  }
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, SAFE } = this.ctx;
    this.bg.render(renderer, out, { t: f.t, x: SAFE.x + SAFE.w / 2, y: SAFE.y + SAFE.h / 2 });  // overwrites out
    const k = prog(f.t, this.land, this.land + 0.35, ease.outExpo);
    const c = this.text.clear();
    c.font = font(brand.fonts.display, 140, 800);
    c.fillStyle = brand.colors.ink;
    c.globalAlpha = k;
    c.fillText('Hello', SAFE.x, SAFE.y + 200 + (1 - k) * 60);
    comp.draw(renderer, this.text.upload(), out);                            // alpha-over
    return { zoom: 1 + 0.03 * (1 - k) };                                    // post overrides
  }
}
```

Then add it to `src/timeline.ts`: `{ id: 'title', scene: Title, start: bar(0), end: bar(2), params: {...} }`. One module can serve several entries through `params` (e.g. three `reveal` entries with different photo pairs).

### What a scene gets

- `this.ctx`: `renderer`, `audio`, `comp` (compositor), `W`, `H` (logical px), `SAFE` (rect for text/logos/faces), `id`, `params`, `start`, `end`.
- `f: Frame`: `t` (piece time), `lt`/`p` (local time / 0..1 progress), `beat`, `bar`, `beatPhase`, `barPhase`, `a` (music: `rms, low, mid, high` envelopes 0..1 and `kick, snare, hat` decaying hit pulses), and for transitions `under` (previous scene's frame), `tin`, `tout`.
- Return post overrides: `exposure, bloom, bloomThreshold, bloomRadius, ca, grain, vignette, fade, flash, flashColor, shake: [x, y], zoom`.

### Rules

- **Deterministic.** Output is a pure function of `f.t` (and seeded randomness: `mulberry32(seed)`, `hash(...)`). Never `Math.random()`, `Date.now()`, `performance.now()`, and never state that accumulates across `render()` calls: the exporter renders sub-frames out of order, and the preview seeks anywhere. Particles: compute each particle's position from its birth time and `t` in closed form.
- **Per-frame flicker/jitter** is seeded with `frameIdx(t)` (constant over a frame's shutter), not `Math.floor(t * fps)` (which double-exposes two states into every blurred frame).
- **Overwrite `out` fully** every frame (a fullscreen pass or `comp.draw(..., { mode: 'replace' })` first).
- **Layout from `W`, `H`, `SAFE`**, never hard-coded pixel positions for one format. Size type relative to `SAFE.w`/`SAFE.h`, and render a sheet in every target format.
- **Times from the grid**: `audio.timeOfBeat(i)`, `timeOfBar(i)`, `nearestBeat(t)`, `beatAt(t)`; for a scene's own beats, `b0 = Math.ceil(audio.beatAt(start))`, then `timeOfBeat(b0 + k)`.
- **Linear HDR colour.** Scene targets are half-float linear. Canvas2D layers are sRGB and converted on composite. Values over 1 bloom: draw a glow shape in white on its own layer and composite it with `{ mode: 'add', tint: glow('accent', 2) }`.
- **Preload** images and heavy layout in `init()`, not in `render()`.
- **Budget:** 2-3 `Layer2D`s per scene (each upload costs a few ms at 1080p). Aim for < 30 ms/frame; the export multiplies it by the sample count.
- **Draw frame-quantized 2D content once per frame.** Text, counters, readouts and panels whose content changes once per output frame (driven by `frameIdx(t)` or by recorded data quantized to the frame) use `layer.clearFor(frameIdx(t))`: it returns `null` when the layer is already drawn for that frame, so you skip drawing, and `upload()` reuses the texture on the GPU. Every motion-blur sub-frame of the frame then shares one drawing and one upload. Keep `clear()` for content animated in continuous `t` (entrances, slides): with `clearFor` a moving word stops blurring within its frame. The same applies to Canvas2D textures on 3D planes (`textPlane`-style sheets): keep a per-frame key and set `needsUpdate` only when you redrew.

### Toolbox

- `gl.ts`: `FSPass(frag, uniforms)` fullscreen GLSL3 pass (gets `vUv`, `FRAG_PX` = fragment position in logical px (y up), `uRes`, and `GLSL_COMMON`: `hash12`, `vnoise`, `fbm`, `sdRoundBox`, `aaFill`, `luma`, `toSRGB`/`toLinear`); `Layer2D` (frame-sized Canvas2D in logical px, `clear()` returns the context, `clearFor(frameIdx(t))` returns it or `null` when this frame is already drawn, `upload()` returns the texture); `comp.draw(renderer, tex, target, { mode: 'normal'|'add'|'replace', opacity, tint, srgb })`; `makeRT()`, `clearRT()`; `loadImage(url)`, `drawCover(ctx, img, x, y, w, h, zoom, fx, fy)` (object-fit: cover with a push-in and a focus point).
- `util.ts`: `prog(x, a, b, ease)`, `ease.*`, `keys(t, [[t, v, ease], ...])` keyframes, `springStep(t, freq, damping)`, `pulse(t, t0, halfLife)`, `window01`, `smoothstep`, `remap`, `lerp`, `mulberry32`, `hash`, `noise1`/`fbm1` (organic drift, handheld camera), `frameIdx`, `hexToLinear`, `rgba(hex, a)`.
- `type.ts`: `font(spec, px, weight)`, `fitSize(ctx, lines, spec, weight, maxW, maxPx)`, `wrap`, `wrapBalanced`, `glyphLayout(ctx, text)` (per-letter x with kerning), `smart(s)` (typographic quotes).
- `audio.ts`: `beatAt`, `timeOfBeat`, `barAt`, `timeOfBar`, `nearestBeat`, `nearestDownbeat`, `env(name, t)`, `hit(kind, t, hl)`, `events(kind, t0, t1)`, and from the music map: `moment('drop' | 'stop' | 'breakdown' | 'peak' | 'tail', nth?, fallback?)` (drops are ranked, so `moment('drop')` is the wow candidate) and `section(name)`.
- `stage3d.ts`: `new Stage3D(fov).fog(hex, near, far)` is a three.js scene + perspective camera that renders into the HDR pipeline (motion blur, bloom and grain apply). Each frame: position the camera with `stage.look(x, y, z, tx, ty, tz, roll)` from `f.t` (keys/springs on the beat grid), animate objects, then `comp.draw(r, stage.render(r), out, { mode: 'replace', srgb: false })` and draw 2D layers on top. `textPlane(text, fontSpec, { height, color, glow })` and `imagePlane(img, height)` put type and images in space (unlit, exact colours; `glow` > 1 blooms). Anything three.js offers works: `InstancedMesh` for thousands of objects, `Points` for dust, real geometry with lights (`MeshStandardMaterial` + a light), custom `ShaderMaterial`. See `scenes/flythrough.ts`.
- `stage3d.ts` lighting: `stage.light('studio' | 'daylight' | 'dusk' | 'night', { extent })` adds a hemisphere fill and a soft-shadow key; `castShadows(obj)`; `paper(hex)`, `matte(hex)`, `ground(material)`. Pass the frame to `stage.render(r, f)` so time-driven looks animate.
- `looks.ts`: `customLook(glsl)` (write your own fragment body), starting looks `halftone`, `gooch`, `rimGlow`, `holo`; physical `glass`, `metal`, `iridescent` with `studioEnvironment`; `addRim`, `addGrain` inject GLSL into any lit material. See [lookdev.md](lookdev.md).
- `swarm.ts`: `new Swarm(count, geometry, material, startPoints, size)` is an `InstancedMesh` of thousands of pieces; `.to({ to, t0, dur, stagger, arc, order, ease })` queues formation changes (chained), `.update(f.t, { spin })` places every piece in closed form. Formations: `cloud`, `grid`, `sphere`, `pointsFromText(text, font, count, width)`, `pointsFromImage(logo, count, width)`. Size the target formation from the camera's final view (portrait frames are narrow). See `scenes/assemble.ts`.
- `clip.ts`: `await Clip.load(name)` in `init()` (frames from `public/clips/<name>/`, made by `scripts/prep_clip.ts`), then `clip.frame(lt, { speed, mode: 'hold' | 'loop' | 'pingpong', offset })` returns the frame for a local time, or `clip.drawFit(ctx, lt, x, y, w, h, opts)` draws it so the keyed subject's bounding box fits the rect. Draw with `shadowBlur` for a soft shadow cast from its alpha.
- `scenes/_shared.ts`: `LIN` (brand colours, linear), `glow(key, k)`, `BgField` (the two-tone drifting background with an accent light), `brandFill` (the brand gradient as a fill style). Put the piece's own recurring motif here too.

### Recipes

- **Word-by-word type on beats:** land word *i* at `timeOfBeat(b0 + i * step)`; `k = prog(t, t0, t0 + 0.3, ease.outExpo)`; scale 1.3→1, y offset → 0, alpha over the first 60 ms. See `scenes/hook.ts`.
- **Before/after wipe:** draw *before* covering the frame, clip a rect `[0, x]` and draw *after*; move `x` with `keys()` (tease, hold, sweep on the downbeat); an HDR-tinted glow line on the edge that brightens with its speed. See `scenes/reveal.ts`.
- **UI in motion:** screenshot (or render) the real UI into `public/media/`, draw it into a device frame or a rounded card, simulate the cursor as a drawn arrow moving with `keys()`, and fire a `pulse()` ripple on each click.
- **Mask reveals:** `c.save(); c.beginPath(); <shape>; c.clip(); <draw>; c.restore()`; animate the shape (a growing circle from the click point, a rising rect for a line of type).
- **Text on a path:** sample the path into points, then `glyphLayout()` for each letter's arc position and rotate by the path angle.
- **3D fly-through:** items as `textPlane`s at different depths and offsets; camera stops computed per item; `keys()` with a hold then an `inOutCubic` snap per beat; a limited bank into lateral moves; fog for depth; the final stop computed so the hero fills the frame width (portrait frames are narrow). See `scenes/flythrough.ts`.
- **Type as architecture:** a `textPlane` many times larger than the frame, the camera trucking across its letters at a low angle; cut when a counter (the hole in an O, the gap in an A) fills the frame and becomes the next scene.
- **Macro to wide:** start with the camera almost touching a detail (a glyph, a pixel grid, a UI element on an `imagePlane`), fov narrow; pull back fast (inExpo then outExpo) to reveal the whole object.
- **Instanced fields:** `THREE.InstancedMesh` with thousands of boxes/cards whose matrices are set from `f.t` (a wave, a sort, a stream): data made physical. Seed positions with `mulberry32`.
- **Displacement and glitch:** an `FSPass` that samples the scene texture with offset UVs (noise, a scan band, RGB split) for transitions; drive the strength with `pulse()` on the beat.
- **Keyed clip with depth:** big type on a layer drawn *before* the clip, the clip with a soft shadow, small type on a layer after it. See `scenes/insert.ts`.
- **Counters:** `Math.round(lerp(a, b, prog(t, t0, t1, ease.outCubic)))` in tabular mono figures (so the width doesn't jiggle).
- **Custom transition:** set `handlesTransition = true`, overlap the entries in the timeline, and composite `f.under` yourself using `f.tin` (e.g. the new scene grows out of a circle from the motif's position).
- **Shaders:** backgrounds, light, displacement and glitch as `FSPass`es; sample a previous layer's texture as a uniform to warp it.

## Voice and captions

The craft is in [voice.md](voice.md). The mechanics:

- **The script** is `public/vo/vo.json` (set `project.voice: 'vo/vo.json'`): provider, model, voice, settings, seed, and `lines`, each `{ id, text, direction?, at? | land? | after?, gap?, gain?, caption? }`. `at` is seconds or a grid position (`"bar:4"`, `"bar:4.5"`, `"beat:17"`); `land: { word, at }` starts the line so that word begins on that time; `after: "<id>"` chains it to the previous line plus `gap` (0.25 s).
- **Takes:** `bun scripts/voice.ts render` writes `public/vo/<id>.wav` (48 kHz stereo, -16 LUFS integrated, peaks under -1 dBFS) and `public/vo/<id>.json` (`words: [{ w, s, e }]` in seconds from the take's start, the text sent, model, voice, settings, seed, request id). `render --only l3` re-takes one line; `render --dry` prints the lines and the character count first.
- **Placement** is `resolveCues(script, takes, audio)` in `src/engine/voice.ts`, the same function in the browser and in the scripts, so the captions, the preview and the mix always agree. `bun scripts/voice.ts cues` prints each line's span in seconds and bars, its words per second, overlaps, lines past the end, and writes `out/voice.srt`.
- **Captions** (`project.captions`: true, false, or options such as `{ lift: 80 }`; default on with a voice): `src/engine/captions.ts` draws one phrase at a time from the word timings (two lines at most, the current word in the accent, a soft plate), through `engine.overlay`, which composites over the finished frame after post, once per output frame: no bloom, grain or blur on them. Restyle that file per piece; keep it readable at phone size.
- **Preview:** `bun run dev` plays the lines with the music, each from its cue.
- **The mix** (`render.ts video`): every line inside the render window at its cue, summed into a voice bus; the music lowered by `project.mix.musicDb` and sidechain-ducked from the voice bus by about `duckDb` while someone speaks (attack 40 ms, release 450 ms); a 0.6 s fade at the end and a limiter at -1 dBFS. The finished mix is then brought to -14 LUFS integrated (`--lufs`, or `--no-normalize` to keep it as mixed; video is copied, not re-encoded) and the render prints the loudness and true peak.
- **Scenes can read the voice too:** time a reveal to a word with the cues (the engine exposes them as `window.__mg.voice`; for a scene, load them with `loadVoice(project.voice, audio)` in `init()`).

## Motion blur

Every exported frame is the average of many sub-frames spread over the shutter (`--shutter 0.5` = half the frame time, centred on the frame), so fast motion leaves a continuous streak instead of stepped copies.

- `--samples auto` (the default for `video` and `poster`) picks the count per frame: it steps through 4, 12, 36, 108 sub-frames (`--max-samples 324` allows one more step), and after each step compares the new sub-frames' average with the old ones' (worst 2×2 px block, in displayed 8-bit levels). Stepped copies of a moving edge differ between the two sets; a converged streak or a still image does not. It stops when the remaining error is below `--tol` (default 3). In practice still frames stop at 12, ordinary motion at 36, whips and slams at 108. The render prints the histogram (`12:304 36:56 108:30`).
- `--samples N` takes a fixed N (`4` for quick drafts). `stills` default to 1 sample; pass `--samples auto` to see exactly what the export does to a fast move.
- Stills, sheets and checks snap their times to frame times (`k/fps`), the only times the video contains. At a time halfway between two frames, the shutter straddles both, and anything quantized with `frameIdx` (readouts, discrete steps, per-frame jitter) shows as a double exposure that the video never has.
- Post parameters (flash, shake, zoom, fade) are read at one point of the shutter, 1/8 after the frame time, which every sample set includes.
- What this asks of scenes: output must depend on `f.t` only (sub-frames render out of order and in any number), and per-frame jitter is seeded with `frameIdx(t)`. Noise that changes with continuous `t` gets resampled in every sub-frame and makes the sampler work harder: seed it with `frameIdx(t)` unless it is meant to blur.

## Render speed

An exported frame costs `sub-frames × (scene render) + readback`. Measured on a 1080p 16:9 piece (a 3D stage with four 2x-resolution Canvas2D sheets on planes, a 2D overlay, bloom): 60 frames took 17.3 s at 4 sub-frames and 6.5 s at 1, about 60 ms per sub-frame plus about 48 ms per frame for readback and transfer. Switching x264 from `slow` to `ultrafast` changed nothing (18.0 s): the encoder is not the bottleneck, the scene is. What to do, in order of effect:

- **Frame-quantized 2D content drawn once per frame** (`clearFor`, above). On that piece it cut a 2 s slice from 17.3 s to 6.5 s, and the busiest slice (all four sheets on screen) from 42.9 s to 13.1 s. Uncompressed stills matched the per-sub-frame render except one 33×9 px patch, off by at most 3 levels. Canvas redraws and texture uploads (with mipmaps, on big sheets) were most of the scene cost.
- **Fixed low sample counts for drafts** (`--samples 4`), `auto` for the final.
- **Render only what changed:** `--from/--to` for the chapter you're fixing; stills and strips before videos.
- **Parallel renders:** frames are pure functions of `t`, so formats (or time chunks, concatenated afterwards) can render in separate processes. On a GPU that also serves other work (a model, a desktop session, another render), ask before running several at once.

## Output scale

`--scale 2` (or `&scale=2`) renders the same layout at twice the pixels: 2160×3840 for vertical. Everything that is sized in logical px (Layer2D, makeRT, the bloom pyramid) follows. Useful for a 4K YouTube master; Instagram doesn't need it.

## Checking frames

- `sheet --from 12.4 --to 13.6 --every 0.1 --crop x,y,w,h --cell 240 --samples 4`: a motion strip, cropped (logical px) to the element that moves. Contact sheets can't show whether a motion is right (a piece that should fall, a card that should land); a 10 fps strip of the region can.
- `check --t 6.5,10.9,18 --formats landscape,square`: the same moments in every format, one labelled row per format. Collisions and cut-off footers usually appear in only one format, so check the format you aren't looking at.

## Debugging

- `SCENE ERRORS` from the render script, and scenes that failed to init show as dark red. Read the errors: they include the stack.
- `--only id1,id2` loads just those timeline entries (fast, and isolates a broken scene).
- Renders while you edit: the render script starts its own server with live reload off; if you point it at your dev server with `--url`, a save mid-render reloads the page.
- Colours look shifted in a player: the export tags BT.709; if you post-process with other tools, keep the tags.

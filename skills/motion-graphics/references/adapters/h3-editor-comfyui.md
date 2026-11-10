# Adapter: H3 Editor (a directed sequence of MiniMax H3 shots, in ComfyUI)

A worked example of [generative-video.md](../generative-video.md), for when a piece needs **a scene**: several shots with the same person and place, each with its own sound, tried as drafts and finished as finals. For a single clip or a keyed insert, a raw workflow is simpler: [minimax-h3-comfyui.md](minimax-h3-comfyui.md).

## What's there

- [H3 Editor](https://github.com/igorls/comfyui-h3-editor) (GPL-3.0) is a ComfyUI custom node pack: a timeline editor served by the ComfyUI server at `/h3take/editor`, with everything it does available as HTTP calls. It needs ComfyUI 0.43 or newer and no other node pack; its README lists the models.
- It ships an agent skill, `skills/h3-editor` (copy it into the agent's skills folder), with `scripts/h3.py`, a client that needs only Python. **Follow that skill for the editor itself** (how to write a shot, cast, takes, linked clips, costs). This page is only what a motion piece adds on top.
- What it gives a piece that a raw workflow doesn't: one project style applied to every shot, a cast member kept the same across shots (`@Name` in a shot's text), drafts and finals as takes of the same clip, sound generated with each shot, and a record of every take's seed and models.

## The loop

```bash
H3="python <h3-editor-skill>/scripts/h3.py"
$H3 check                                  # the editor answers; which projects exist
$H3 create "My scene"
$H3 ops My_scene shots.json                # style, cast, clips, renders: one batch
$H3 wait My_scene
$H3 look My_scene --out gen/scene          # a 12-frame sheet per clip, and each take's /view URL
$H3 look My_scene <clip> --out gen/scene --detail --first 84 --last 123   # the frames around an event
```

```json
[
  {"op": "set_project", "fields": {"format": "16:9", "language": "English",
    "style": "Live-action, 35mm film look. A dark kitchen lit only by warm heat lamps. Shallow depth of field, fine grain."}},
  {"op": "add_cast", "as": "chef", "fields": {"name": "Chef", "description": "a woman in her forties, dark hair in a low bun, black chef's jacket",
    "file": "<from h3.py asset>", "subfolder": "<from h3.py asset>"}},
  {"op": "add_clip", "as": "wide", "fields": {"name": "Wide", "seconds": 3, "cast": ["$chef"],
    "action": "@Chef wipes the rim of a white plate at the pass. Behind her, a flame flares up and dies. ...",
    "camera": "Wide shot at eye level, slow push in",
    "sound": "The whoosh of a gas flame, a pan hissing, the low hum of extractor fans. No music, no voices."}},
  {"op": "render", "clip": "$wide"}
]
```

That renders a draft. After looking at it, a second batch finishes the keepers: `{"op": "render", "clip": "<clip id>", "quality": "final"}`.

## Directing it for a piece

- **One scene, one place, one light.** The project's `style` goes into every shot: keep it to look and light, and name the objects in each shot's own text. A style that mentions a prop puts that prop in every shot.
- **Sound per shot, and one room tone.** Name the same ambience in every shot so the cuts hold together, and end with "No music, no voices." when the piece has its own track. The model will otherwise score the shot.
- **A cast still** (generated, or supplied by the user) keeps the face. Make it once, look at it, upload it with `h3.py asset`.
- **If the sentence will be on screen**, the first sentence of the shot's text is the copy: write it to be read, then let the rest of the text carry the detail.
- **Drafts, then finals.** Look at every draft sheet. A draft tells you whether the prompt works, not the final's exact framing: a final does not repeat its draft frame for frame, and its sound is its own. Look and measure again after the final.
- **Don't re-roll for framing.** Asked for an extreme close-up and got head and shoulders: push in in the engine (a zoom about a point of the picture, up to about 1.25x) instead of spending GPU on more seeds.
- **Ask before the GPU, with numbers:** how many clips, roughly how long. Run `check` first if the server is shared; if a render dies, check and queue again instead of assuming it finished.
- Never delete a project, a clip with takes or an output file unless the user asks.

## Into the engine

- Download each kept take from the `/view` URL that `look` prints into `gen/<scene>/final/video/`. Set `project.fps = 24` so the shots play frame for frame.
- **Choose the window by the action**, not from frame 0: read the frame numbers of the event off the detail sheet and prep only that window: `bun scripts/prep_clip.ts <take>.mp4 --name wide --from 0.58 --to 2.82`. Finals are 1920x1088, about 8 MB a decoded frame, so two seconds is already 450 MB.
- Finals are 8 px taller than 1080: draw them cover-fit.
- Keep the windows in **one small JSON** (`src/shots.json`: each shot's in-frame and the bar and beat it is revealed on), read by the scenes, the sound mix and anything that draws the cut. Picture and sound then cannot drift apart when a window moves.
- When the piece shows the cut itself (a timeline on screen), draw it from the real material: filmstrips tiled from frames of each take, waveforms from peak envelopes of each take's sound.

## The shots' own sound

- **You cannot hear.** Extract each take's audio (`ffmpeg -i take.mp4 -vn -ar 48000 take.wav`), measure it (`-af ebur128=peak=true`) and draw it (`showspectrumpic` with a log frequency axis): a roar, a click, a bell's partials, voice formants or music you did not ask for all show. Then send the takes to the user to hear before building on them.
- Takes differ by 10 dB or more: give each its own gain, and cut the low rumble (80 Hz; higher under a tonal event such as a bell).
- **Landing a sound on the music:** find its onset (the first moment its band passes a threshold), then start the shot's window so that onset minus in-point equals the time from the shot's reveal to the beat it should land on. No speed changes where sound has to stay in sync.
- The render mixes music and voice only. **Mix the shots' sound onto the music track first:** a small script that places each window at its bar time with its gain and short fades, sums, and limits once. Point `project.music` at the mix and keep `audio.json` as the map of the music alone.
- **One fixed gain for level.** Don't run ffmpeg's one-pass `loudnorm` on a mix or a preview: it raises quiet passages, and an intro comes out as loud as the drop.
- A take that ends too soon after a sound that should ring can take a reverb tail on that sound only (convolve it with decaying noise). Record it in the provenance.

## Provenance

`GET /h3take/api/project/<Project>` returns the project with every take's seed, models, size and the texts it was rendered from. Save it beside the takes and build `assets.json` from it: clip and take ids, seed, quality, the style and the shot's texts, the window that plays, the prep command.

## Measured behaviour (RTX PRO 6000, 2026-11, the editor's HyperFlow H3 Flash profile)

- Draft (640x352, 4 steps): 10 to 15 s a clip. Final (1344x768, 6 steps, redrawn at 1920x1088): about 50 s of GPU for each second of footage.
- Lengths snap to 17k+5 frames at 24 fps: 3 s is 73 frames, 4 s is 90, 5 s is 124.
- Asked for an extreme close-up, got head and shoulders. Asked for a tap bell, got a bell with a handle. A 3 s shot whose action needed a beat more worked at 4 s. A bell rang 0.7 s before its 5 s take ended.
- A cast member stayed recognisably the same across a wide, a close and a medium shot; a small prop (a plated dish) did not stay identical from shot to shot.

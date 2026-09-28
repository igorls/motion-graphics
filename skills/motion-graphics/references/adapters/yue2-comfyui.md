# Adapter: YuE2 text-to-music in ComfyUI (score-conditioned)

A worked example of [generative-music.md](../generative-music.md). Verified on ComfyUI v0.37 with core nodes; adapt to newer versions.

## What's there

- Template `audio_yue2_text2music` (ComfyUI gallery). Core nodes: `YuE2GenerateABC` (style + lyrics → ABC score), `YuE2GenerateMusic` (style + lyrics + ABC → conditioning + seconds), `EmptyYuE2LatentAudio`, `KSampler` (32 steps, `dpm_2`, `sgm_uniform`, cfg 1), `VAEDecodeAudio`. Checkpoint `yue2_3b_int8_convrot.safetensors` (checkpoints). Output 48 kHz stereo.
- The YuE team's own agent skill (github.com/multimodal-art-projection/YuE, `skills/yue2-music/`) documents the ABC dialect, instrumental conversion and covers. Read its `references/abc-editing.md` before writing complex scores.
- A minimal API-format graph that skips the planner and renders a score you wrote: [`assets/comfyui/yue2_score_to_music_api.json`](../../assets/comfyui/yue2_score_to_music_api.json). Set node 2's `style`, `lyrics`, `abc`, `seed`, `max_duration`; node 7's `filename_prefix`. Run takes with the template's batch runner, e.g.
  `bun scripts/comfy.ts <skill-dir>/assets/comfyui/yue2_score_to_music_api.json --out gen/music --set-file 2.abc=music/score.abc --set 2.style="Instrumental, ..." --set 2.lyrics="[intro]\n\n[chorus]" --set 2.max_duration=17 --vary 2.seed=11,23,37,58`
  (measured: ~11-14 s per 12 s take including queueing).

## Writing the score (ABC, the native dialect)

**Format example only: do not reuse these notes.** Compose each piece's motif with the method in [generative-music.md](../generative-music.md#composing-an-original-motif).

```abc
X:1
T:
M:4/4
L:1/16
Q:1/4=116
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:Am
% intro
V: Vocal
"Am"z16|"F"z16|
V: Ins
A4c4e4c4|F4A4c4A4|
% pre-chorus
V: Vocal
"C"z16|"G"z16|
V: Ins
e2e2g2e2c2e2g4|d2d2g2d2B2d2g4|
% chorus
V: Vocal
"Am"z16|"F"z16|"C"z16|"G"z16|
V: Ins
a4e4c'4a4|f4c4a4f4|g4e4c'4g4|b4g4d'4b4|
```

- Header order fixed; one integer tempo `Q:1/4=BPM`; `L:1/16` → a 4/4 bar is 16 units. Durations only from 1,2,3,4,6,8,12,16,24,32,48 (tie longer notes: `c16-c8`).
- Groups of 1-4 bars, `V: Vocal` block then `V: Ins` block, with the same bar count. Section comments (`% intro`, `% verse`, `% pre-chorus`, `% chorus`, `% bridge`, `% interlude`, `% outro`) mark structure.
- **Instrumental:** the Vocal voice holds only rests with chord symbols; every melody note goes in `Ins` (one monophonic line). Lyrics = section tags only (`[intro]\n\n[pre-chorus]\n\n[chorus]`). Style starts with "Instrumental, no vocals".
- Chords: `"Am"`, `"F"`, `"G7"`, `"Cmaj7"`, `"Dm7"`, `"Esus4"`, slash basses `"C/E"`; no `9/11/13/alt` (describe those in style instead).
- Not supported: tuplets, grace notes, chords stacked in one voice, repeat signs, `w:` lyrics. Write repeats out in full.
- Mode `full` with chords in the score (`melody` for chord-free scores).

Style text: `Language (if vocals) + genre + tempo + instruments + production + mood`, e.g. "Instrumental, no vocals, upbeat modern electronic pop, 116 BPM, punchy four-on-the-floor kick, crisp claps, warm synth bass, bright plucked synth lead, airy pads, clean polished mix, energetic advertisement music".

## Measured behaviour (RTX PRO 6000, 2026-09)

- An 8-bar instrumental score at 116 BPM rendered at **115.97 BPM**, with each section change on its written bar line (±0.1 s): intro sparse, the build brought in bass and a riser with a gap before the drop, the drop hit exactly at bar 5. A listener confirmed it sounded right.
- It **kept going after the score** (improvised to the 30 s cap, then silence and stray hits). Cap `max_duration` at score length + 1-2 bars, write an `% outro`, trim with a fade.
- **~8 s to generate 30 s** of audio: generate several takes per piece.
- The analysis script found the tempo but placed the downbeat on beat 3 of a four-on-the-floor bar; with a score you know bar 1 starts on the first beat: `analyze_audio.py --downbeat-offset 0`.

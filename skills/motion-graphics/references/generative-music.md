# Generative music: compose to the edit

With a music model, don't fit the edit to a found track: write the music the edit needs. The treatment already knows the tempo, the length in bars, and where the hook, the build and the payoff land; the music brief is that plan in musical terms. This works with any model; how much control you get depends on its family.

## Model families

| Family | You control | Timing workflow |
|---|---|---|
| **Score-conditioned** (a symbolic plan: ABC, MIDI, a chord/section chart; e.g. YuE2 with ABC) | tempo, meter, bars per section, melody, harmony, instrumentation via the style text | write the score to the edit's bar map; the audio follows it closely; verify |
| **Prompt-only with controls** (BPM/duration/structure fields or tags) | approximate tempo, length, mood | generate, then analyse and fit the edit to what came out |
| **Prompt-only** | mood and genre | generate several, analyse, choose the one whose structure fits, then retime the edit |

Prefer the most controllable model available. Whatever the family: **analyse every take** (`scripts/analyze_audio.py`) and **have a human listen** before building on it. You can read tempo, structure and energy from analysis and a spectrogram; you cannot hear vocals leaking into an instrumental, a muddy mix or an ugly melody.

## The music brief (write it into TREATMENT.md)

- **Tempo and meter:** pick the BPM from the edit's pace (100-128 for most ads; cuts every 2 bars at 116 BPM = one per 4.1 s). 4/4 unless the concept wants otherwise.
- **Bar map:** sections in bars, matching the scene windows: e.g. intro 2 → build 2 → drop 4 → outro 1. Put the biggest musical change (the drop) where the biggest visual change lands.
- **Energy per section:** sparse/building/full/resolving, and where the stops or risers go.
- **Instrumentation and mood:** genre, instruments, production style, in the brand's voice. Instrumental by default for ads (voice-over and on-screen text need the space).
- **Length:** the piece length plus one bar of tail to trim into.

## Writing a score (score-conditioned models)

- One section per scene group, named (`% intro`, `% pre-chorus`, `% chorus`, `% outro`…). Bar counts exactly as the bar map.
- Melody in the instrument voice, chords as symbols; keep it simple and singable: a 1-2 bar motif developed across sections beats a busy line.
- End with an explicit **outro**: a held final chord (or a stop). Models tend to keep going after the score ends (improvising until the duration cap), so the outro gives a clean place to cut.
- Set the model's duration cap to the score's length plus a bar or two, and trim.

## Takes, selection, conform

1. Generate 3-4 takes (different seeds; the score stays fixed). Music models are fast, so iterate here rather than in the edit.
2. Analyse each: `uv run --project scripts python scripts/analyze_audio.py take.flac --out take.json` and render a spectrogram (`ffmpeg -i take.flac -lavfi showspectrumpic=s=1500x400:scale=log:fscale=log spec.png`). Check: tempo within ±0.5 BPM of the score, section changes on the written bar lines (energy steps in the spectrogram at bar × 60/BPM × beats-per-bar), no silence or junk before the end of the score.
3. Send the best 1-2 to the user to listen, and say what you checked and what you couldn't.
4. Conform: trim to the piece length on a bar line with a short fade, and loudness-normalise (`-af "afade=t=out:st=<len-0.6>:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11"`). Put it in `public/audio/`, set `project.music`.
5. Lock the grid: run the analysis on the final file. When the score says where bar 1 is, force it (`--downbeat-offset 0` if the first beat is the downbeat); detection can pick the wrong beat of a four-on-the-floor bar.

## Common failure modes

| Symptom | Fix |
|---|---|
| Keeps going past the score, then junk or silence | lower the duration cap; write an outro; trim |
| Voice-like sounds in an "instrumental" | say "instrumental, no vocals" in the style; lyrics = section tags only; keep every melody note in the instrument voice; try another seed |
| Tempo drifts | score-conditioned: shouldn't; prompt-only: pick a steadier take, or time-stretch (`rubberband`/`atempo`) the take to the target BPM |
| Drop lands a beat late/early | check the analysis grid against the score; shift the edit by the measured offset rather than the music |
| Muddy under voice-over | ask for "sparse mid-range, leaves space for voice-over"; or cut 200-500 Hz a few dB when mixing |

## Provenance

Record every generated take in `assets.json` (model, checkpoint, workflow, the exact style/prompt/score, seed, date, which take was used). Model licences and how the output may be used are the user's call; the record lets them make it.

Worked example of a score-conditioned model: [adapters/yue2-comfyui.md](adapters/yue2-comfyui.md).

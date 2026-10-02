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
- **The arrangement mirrors the reveal.** When the edit introduces parts one at a time and then shows them together, let each part bring in a new instrument on its chapter's downbeat, and save the full band (and the drums, if they're held back) for the all-together moment. The structure becomes audible, and the payoff sounds like one.
- **Length:** the piece length plus one bar of tail to trim into.

## Bar maps for common lengths

| Length | Tempo | Bars | A typical map |
|---|---|---|---|
| 6-8 s loop | 120-128 | 4 | 1 hook, 2 payoff, 1 end that loops into the start |
| 15 s | 128 | 8 (15.0 s) | 2 hook, 2 build, 3 payoff, 1 end card |
| 15 s | 96 | 6 (15.0 s) | 2 hook, 2 payoff, 2 end (slower, premium) |
| 20 s | 120 | 10 (20.0 s) | 2 hook, 2 build, 4 payoff, 2 end |
| 30 s | 128 | 16 (30.0 s) | 2 hook, 4 story, 2 build, 6 payoff, 2 end |

## Composing an original motif

Never reuse an example melody (the adapters' scores only show the notation). Compose from the piece's idea:

1. **Derive the rhythm from the piece.** The syllables of the product name or the hook line ("WORM-D-B" = long, short, short), the rhythm of the product's own sound (keystrokes, a printer's pins, a notification), or the visual rhythm of the money shot.
2. **Pick a scale and register for the mood.** Minor pentatonic or Dorian for driving tech, Lydian for wonder and lift, major with added 6ths for warm and friendly, a single repeated note with moving harmony for tension. Keep the motif within an octave.
3. **Write a 1-2 bar motif** of 4-7 notes with one leap and one repeated note: that's what makes it memorable.
4. **Develop it across sections, don't repeat it:** state it thin in the intro (single notes, space), sequence it up a step in the build, state it full and high in the payoff (octave up, longer notes, harmonised by the chords), and end on a held tone that resolves (or deliberately doesn't).
5. **Harmony serves the edit:** a static or pedal chord under the hook (tension), a rising progression into the drop, the strongest cadence on the end card.
6. **Write two contrasting score drafts** (e.g. different motif or scale), render takes of both, and let the listening decide.

## Writing a score (score-conditioned models)

- One section per scene group, named (`% intro`, `% pre-chorus`, `% chorus`, `% outro`…). Bar counts exactly as the bar map.
- Melody in the instrument voice, chords as symbols; the motif from the method above, developed per section.
- End with an explicit **outro**: a held final chord (or a stop). Models tend to keep going after the score ends (improvising until the duration cap), so the outro gives a clean place to cut.
- Set the model's duration cap to the score's length plus a bar or two, and trim.

## Takes, selection, conform

Every take gets a music map (`analyze_audio.py ... --map-md MUSIC-MAP-<take>.md --map-png out/map-<take>.png`); compare them side by side: where the drop really lands, how clean the stops are, whether the tail starts after the planned end.


1. Generate 3-4 takes (different seeds; the score stays fixed). Music models are fast, so iterate here rather than in the edit.
2. Analyse each: `uv run --project scripts python scripts/analyze_audio.py take.flac --out take.json` and render a spectrogram (`ffmpeg -i take.flac -lavfi showspectrumpic=s=1500x400:scale=log:fscale=log spec.png`). Check: tempo within ±0.5 BPM of the score, section changes on the written bar lines (energy steps in the spectrogram at bar × 60/BPM × beats-per-bar), no silence or junk before the end of the score.
3. Send the best 1-2 to the user to listen, and say what you checked and what you couldn't.
4. Conform: trim to the piece length on a bar line with a short fade, and loudness-normalise (`-af "afade=t=out:st=<len-0.6>:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11"`). Put it in `public/audio/`, set `project.music`.
5. **Extending a take by N bars** (the edit grew after the music was chosen): splice rather than regenerate. Repeat whole bars of the section that fits, cutting only on downbeats from the locked grid (`audio.json`). Give each join a 5-10 ms fade out/in with no overlap, so the grid stays exact (an overlapping `acrossfade` shortens the track by its duration at every join; re-lock the grid if you use one). Re-map the result and listen to the joins.
6. Lock the grid: run the analysis on the final file with what the score tells you: `--bpm <score tempo> --downbeat-offset 0 --sections "intro:0,build:4,drop:6,..."`. The tempo is then exact, only the phase is fitted to the audio (`--first-beat S` forces it if you measured a lead-in), and the script prints where each section really starts against the plan. Detection alone can pick the wrong beat of a four-on-the-floor bar or a late first downbeat; don't build on an unchecked grid. If a section lands more than ~80 ms off, move that scene's cut to the measured time (the sections are in `audio.json`) or pick another take.

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

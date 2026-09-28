# Music, sync and sound

## Design for sound off first

Most feed video autoplays muted, and many people never unmute. The piece must make complete sense with no audio: the words on screen carry the message, the motion carries the energy. Sound is the bonus that makes it land harder for the people who unmute.

## Music

- **Where music comes from:** a track the user supplies, music you generate with an available model ([generative-music.md](generative-music.md): compose to the edit), or silence (the user can add a track in the platform's editor; Instagram's in-app library is often unavailable to business accounts and ads). Never download music from the web on your own. Rights and licences are the user's call: record where each track came from.
- **Trim to length on a phrase.** Pick a start where a phrase begins (a downbeat, often bar 1 of a section) and end on a phrase boundary with a short fade (the renderer fades the last 0.6 s). If the track's intro is slow, start at its drop so the hook has energy.
- **Levels.** Bring the master to about -14 LUFS integrated for social (`ffmpeg -af loudnorm=I=-14:TP=-1.5:LRA=11` on the track before analysis and render).

## Analysis → `public/audio.json`

```bash
uv run --project scripts python scripts/analyze_audio.py public/audio/<track>.mp3
# --beats-per-bar 3 for 3/4; --downbeat-offset N if the bar lines are one beat off
```

It writes the tempo, a steady beat grid over the whole file, downbeats (the bar phase with the strongest low end), 100 fps envelopes normalised 0..1 (`rms`, `low`, `mid`, `high`) and onsets per band (`kick`, `snare`, `hat`, `any`). Check the downbeats by ear in the preview: the cuts should feel like they land on "one". If they feel a beat early or late, rerun with `--downbeat-offset`.

If you trim the track, trim the file first (`ffmpeg -ss <start> -t <len> -i in.mp3 -c:a libmp3lame -q:a 2 public/audio/track.mp3`) and analyse the trimmed file, so piece time 0 = track time 0.

Without `audio.json`, the engine builds a grid from `project.bpm` (kicks on 1 and 3, snares on 2 and 4), so silent pieces still move on a rhythm, and adding music later only needs the bpm to be close.

## Sync rules

- **Structure on bars.** Scene boundaries on downbeats (`timeOfBar(n)`), usually every 1, 2 or 4 bars. Big reveals on the downbeat after a build.
- **Detail on beats.** Word landings, stamps, pops, punch-ins on beats or kicks. Use `f.a.kick` / `snare` pulses for small reactive touches (a 1-2% zoom, a glow swell), not for things that must be read.
- **Envelopes breathe, they don't strobe.** `f.a.low` / `rms` modulate background light, glow and camera drift subtly. No waveform or equaliser graphics.
- **Readability beats sync.** If landing on the beat would cut a line's hold short, hold the line and move the next cut to the following bar.
- **Anticipate.** A move that should *hit* on a beat eases in and arrives exactly on it; start the entrance 0.2-0.3 s before the beat so its settle lands on it.
- **Silence and stops.** If the music has a stop or a drop, give it the piece's biggest visual moment.

## Sound effects

Optional, and only when they can sit inside the music: a soft whoosh on a whip, a click on a simulated tap, a low hit on the payoff. They must be royalty-free (CC0 or licensed) and mixed well below the music (-12 to -18 dB relative), never harsh. The template doesn't mix SFX; if a piece needs them, mix them onto the music track with ffmpeg before rendering, aligned to the frame times you designed (`adelay` per cue, then `amix` with `normalize=0`).

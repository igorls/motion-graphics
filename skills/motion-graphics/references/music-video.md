# Music videos: a whole song, built in parts

A three-minute song is too long for one project, one review loop and one render. Build it in consecutive parts, each a short piece of its own, on one clock (the song's), and join them at the end without ever touching the music. The lyrics are usually on screen the whole time: their craft is in [craft.md](craft.md#lyric-typography); their timing comes from the singer, not from the grid (below).

## Build from the start, part by part

- **Start at the top of the song and go in order.** Each part covers one span (about 15-20 s: a verse half, a chorus, a bridge), **from downbeat to downbeat**: start on the downbeat where the previous part ended, end on a downbeat at a section change or just before the next line is sung. Parts shorter than ~10 s waste review rounds; longer than ~25 s, and the review stops seeing details.
- **The opening part sets the system.** The type voices, palette, devices, transition and material language are decided there, and every later part inherits them. Get the user's reaction to the opening part (watched with sound) before building the second: their first notes usually change the approach, and it costs one part instead of five. In one build, the notes on the first draft were that the effects "felt stuck on" and the lyrics set into the scene felt off; the fix (effects that live in the picture's own light, type kept in screen space and designed) shaped every part after it.
- **Motion graphics and typography first, footage later.** Build every part with procedural worlds, shaders and type, using stand-ins where footage will go (a still, a procedural plate, an earlier take). Generating clips is slow and non-deterministic; an edit that already works without them tells you exactly which clips to make, how long, and what they must do. Plan the footage passes after the motion pass is approved.
- **Or one project, parts as render windows.** When the world accumulates across the song (a page that fills, a building that wakes), every frame needs the whole song's data. Run one project on the song's clock: `public/audio/song.wav` is the whole master, `public/audio.json` the song map, every `dir` in `parts.json` is that project, and `video` paths sit under it. `parts.py plan` then prints `--from/--to` on the same frame grid and `parts.py join` works unchanged; skip `crop`. Pickups, carries and edit-time shifts disappear. Drive it with a shot table: a few shot kinds (room, exterior, flight, stop) and one scene that reads them, so a long continuous stretch costs little more than a clip and cuts are judged in context. The trade-off: a shared edit changes every part on re-render.
- **Budget places.** Plan locations and shots per minute before building: a film seen as one device looks repetitive by construction, and a test must show at least four different shots.
- **One project per part, one manifest.** Each part is a copy of the template (`p1/`, `p2/`, ...) that carries the previous part's shared modules forward (the lyric system, the motif, the shaders). A `parts.json` at the root lists the parts in order (see `scripts/parts.py`). Each part keeps a short README: a shot table (edit time, song time, picture, type), its slots, how its lyric timing was made, and its limits.

## Audio: exact crops, silent renders, one mux

The song is the master and is used **unchanged**: no fades, no gain, no limiter, no retime, in any part or in the join.

1. **Analyse the whole song once** (`analyze_audio.py` on the master, with `--bpm` if you know it) into a song-level map (say `song-audio.json`). Never analyse a crop on its own: the beat phase, the downbeats and the detected sections come out different at every crop.
2. **Crop each part exactly:** `uv run --project scripts python scripts/parts.py crop --manifest ../parts.json --part p2` writes the part's sample range of the master byte for byte to `public/audio/song.wav`, and its edit-time music map to `public/audio.json`: the song's beats, downbeats and onsets shifted by the part's start (and kept only inside the part), the envelopes sliced, sections and moments shifted, and `editZero` recording the shift. Every scene then reads edit time (0 at the part's first downbeat), and `editZero + t` is song time.
3. **Render each part silent:** `render.ts video --noaudio --to <frames/fps>` (`parts.py plan` prints the exact command). The renderer's own mix fades the last 0.6 s and normalises loudness, which is right for a stand-alone piece and wrong for a part.
4. **Review a part with its crop muxed on:** `ffmpeg -i out/p2-silent.mp4 -i public/audio/song.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -movflags +faststart out/p2.mp4`. The dev preview can play the crop too (`project.music: 'audio/song.wav'`): edit time equals crop time.
5. **Join:** `parts.py join --manifest ../parts.json --out ../joined/film.mp4` concatenates the silent renders without re-encoding and muxes **one** exact crop of the whole span, once. Never concatenate parts that already carry audio: every AAC stream starts with its own priming samples, and the seams click and drift.

### Frames: keep the drift under a frame

A part from S to E has a fractional number of frames; rounding each part on its own (`round((E-S)*fps)`) drifts up to half a frame per part, and five parts can end two frames out of sync with the music. Count frames on one grid anchored at the first part's start instead: `round((E-S0)*fps) - round((S-S0)*fps)`. The rounding then telescopes, and every seam stays within half a frame of the music. `parts.py plan` prints these counts and the render commands; `join` checks each part's frame count, the drift at every seam and at the end (< 1 frame), that the parts share codec, size and frame rate (concat without re-encode needs it), and that the decoded audio matches the source crop (correlation > 0.99). It writes the result next to the film as `<name>-validation.json`.

### Validators per part

A part is small enough to test like code. A test file per part (`bun test`) that asserts, from the part's own data:

- the part starts and ends on song downbeats, and `editZero` is its start;
- every cut sits on a downbeat of the edit-time map, at or just before the sung line it introduces (from `lyrics.json`);
- the crop's sample range and the frame count match the manifest;
- every lyric line keeps its canonical text, and every word has an onset;
- each clip slot's length rule holds (below), and the slots tile the part without gaps.

**When a part's length changes, update its validators in the same change** (the expected frames, the sample range, the end time). A stale validator either fails on correct work or, worse, keeps passing on the old numbers.

## Pickups and carries across part boundaries

Lines don't respect part boundaries. The next line's first word is often sung just before the downbeat that ends the part (a pickup), and the last line of a part is still fading when the next part starts.

- **Pickup:** the first word of the next part's first line enters at the end of this part, on its sung onset, and the next part starts with that word already on screen, in the identical state (position, size, entrance progress), then carries on into its line. Both parts load the same `lyrics.json` and compute the word from song time, so the two halves meet exactly at the seam.
- **Carry:** the previous part's last line keeps its exit (its afterglow) over the first beats of the new part, drawn by the new part from the same data.
- **Check the seam:** a still of the last frame of part N next to the first frame of part N+1 (`render.ts stills --t <len - 1/fps>` in N, `--t 0` in N+1) should look like two consecutive frames. Then watch the joined film across it.

## Footage later: clip slots

Every shot window that will hold footage is a **slot** in the part: `{ id, in, out, frames, standIn }`. The scene plays `public/clips/slot-<id>/` (prepared with `prep_clip.ts`) when the slot is listed in `public/clips/slots.json`, and its stand-in otherwise, through a stand-in clock (which frame of the stand-in plays at time t).

- **Frame counts follow the video model's length rule.** For H3-style models that is 17k+5 frames at 24 fps (the smallest such count at least as long as the window: a 3.2 s window gets 90 frames = 3.75 s); other models have their own ([adapters/](adapters/)). Generate the slot's length, not the window's, and trim at prep.
- **Effects that key off the picture keep working when the clip drops in**: a colour-key mask on a screen or glass ([engine.md](engine.md#techniques)) finds the region in the real clip as it did in the stand-in, with no tracking.
- **Write a brief per slot** in the treatment's clip shot list (subject, action with timing words, camera, what the effects need, e.g. "the screen stays teal and fills a third of the frame"), so the footage pass is a batch of known jobs.

## Lyric timing: from the singer, not the grid

Sung words land where the singer puts them: ahead of the beat, behind it, held across a bar. Timing them from beats or energy puts words on screen before they are sung, which a viewer hears immediately. Get them from speech recognition, keep the text from the lyrics:

```bash
python scripts/lyrics_align.py public/audio/song.wav --lyrics lyrics.txt --model <local whisper folder> \
  --window 41,63 --alias "zayda=zeta" --passes-out out/asr-passes.json
```

- **Local and offline only.** The script needs a Whisper model already on disk (a folder or a cached hub id) and a Python with transformers and torch; it sets the hub offline and never downloads. If there is no local model, ask the user rather than fetching one.
- **The lyrics file is the canonical text**, one sung line per row (`L03 | And every light you left`, or `L03 | D | And every light you left` with a voice for songs with several singers, carried into `lyrics.json` as `voice`), punctuation and capitals as they should appear. `$MOTION_WHISPER` can hold the local model path. Run it on the master (or a part's crop with song-time windows), with a `--window` that starts at the line *before* the first one you need: Whisper pins the first word of a crop to the crop's first instant, so the words you need should never be first.
- **How it decides** (the reasoning, if you tune it): two overlapping crops are transcribed, so every word has two estimates; the lyrics are aligned to each pass in order with a small lookahead (a line's first word looks further, to skip ad-libs that are not in the lyrics); matching ignores case and apostrophes, and a word the ASR split in two still matches. When the passes disagree by more than 0.15 s, the later start wins (alignment drags starts back into the silence before a word); by more than 0.6 s, they heard different sung words, and the candidate that falls between the neighbouring agreed words is kept. Unmatched words are interpolated between their neighbours.
- **Read the raw pass first, then align.** Sung words are misheard in predictable ways (`three` as `free`, `weights` as `waits`), and the model hallucinates whole phrases in instrumental gaps. The script prints what it heard that the lyrics never say, and marks `STRAY` words pinned far from their line: fix those by hand and record it. The whole master can be aligned in one pass with two offset crops (`--crops 0-257,3-257`) on CPU, which is simpler than windows per part.
- **Sound-alikes are explicit.** Names, invented words and spelling variants the ASR hears its own way go in the alias table (`--alias "zayda=zeta,harbour=harbor"`); those words are marked `soundalike`. Look at the passes (`--passes-out`) to find what it heard, then re-align from the cache (`--passes-in`) in a second.
- **Read the summary.** Per word: `start`, `end`, `status` (`asr`, `soundalike`, `interpolated`), `passes`, `spread`. The printout marks sound-alikes `~`, interpolated words `?`, and wide spreads `±`. Check those by ear in the preview (`bun run dev`, `?t=` just before the word), and say in the part's README which words they are. To check them by eye as well, serve the part's render for markup with `--lyrics` (and `--audio` with a vocal stem when you have one). Its audio strip draws each word's onset over the spectrogram, so a word that sits off its syllable shows up ([markup.md](markup.md#the-audio-strip-where-the-sound-is)).
- **It is provisional.** The output says so (`"provisional": true` and a `limit` note), and so should every summary to the user: ASR alignment of singing, not verified phonetic sync. It is good enough to bring words in on their onsets; it is not lip sync.
- **In the engine:** `Lyrics.load('lyrics.json', editZero)` from `src/engine/lyrics.ts` loads the lines shifted into the part's edit time; `glyphIn`, `typedChars`, `afterglow` and `recentredRow` are the timing helpers the typography is built from.

## Delivering parts and previews

- Render a short slice first and estimate from it: guesses run far off in both directions.

- Send each part to the user as it lands (its crop muxed on), with a one-line note of what is new and which words are provisional, and the joined film every few parts.
- Previews for phones: files over about 30 MB may not reach the user's phone. Re-encode the video only and copy the audio stream: `ffmpeg -i film.mp4 -vf scale=-2:720 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a copy -movflags +faststart film-preview.mp4`.

## Checklist per part

- [ ] Starts on the downbeat the previous part ended on; ends on a downbeat; `parts.py plan` reports no warnings.
- [ ] Exact crop, silent render, crop muxed for review; no fades or levelling anywhere.
- [ ] Cuts on downbeats of the edit-time map; lines enter on their sung onsets from `lyrics.json`; provisional and interpolated words checked by ear.
- [ ] Pickup and carry match the neighbouring parts at the seam (stills of both sides).
- [ ] Slots have model-length frame counts and briefs; stand-ins stay inside their plates.
- [ ] Validators updated for this part's length; `bun test`, `tsc` and the review pass.
- [ ] Review frames from the shot table (each shot's start, middle and end), not at a fixed stride: a stride can miss a blocked shot.
- [ ] After the join: the validation shows no problems, and the joined film plays in sync across every seam.

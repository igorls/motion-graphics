# Voice and narration

A voice can carry what the picture can't: the why, the stakes, a turn of phrase in the brand's own voice. It can also ruin a good piece faster than anything else: a stock "AI narrator" reading the on-screen text over wall-to-wall music. Use one when the piece needs it, cast it like a director, write for the ear, and mix it like a film.

Model specifics (endpoints, tags, settings, measured behaviour) live in `adapters/`; this page is the craft. Tooling: `scripts/voice.ts` (cast, audition, render, place), `src/engine/voice.ts` (lines on the grid), `src/engine/captions.ts` (burned-in captions), and the mix in `scripts/render.ts`.

## When a piece wants a voice

- **Yes:** an explainer or launch piece whose idea needs a sentence of reasoning; a story with a character; a brand whose voice is part of the identity; long-form (30 s+) where text alone tires; YouTube and web hero pieces, which play with sound.
- **Usually no:** feed loops, 6-10 s ads, pieces whose message lands in one headline, and anything where the music *is* the voice.
- **Always readable with the sound off.** LinkedIn, X and Instagram feeds autoplay muted. The voice adds a layer; it never carries the only copy of the message. Either the on-screen type tells the story and the voice deepens it, or the voice gets burned-in captions.

Ask in the brief: voice or not, which language(s), the voice's character in three adjectives (and three it must not be), whether the brand has a voice already (a founder, a mascot, a voice actor), and where it runs (sound on or off).

## Write for the ear

- **Spoken, not written:** short sentences, concrete words, one idea per line, contractions. Read every line aloud before rendering it.
- **Say what the picture can't.** Never describe what is on screen ("here you can see…"). The picture shows *what*; the voice says *why* or *so what*. Repeat on-screen words only on purpose, for the one line that must land twice (the headline, the name).
- **Fewer words than you think:** calm narration runs at 2.2-2.6 words per second, punchy at about 3. Budget it: a 30 s piece rarely wants more than 45-55 spoken words, and 30-40% of the runtime should be voice-free so the music and the picture can breathe. Silence before the reveal makes the reveal.
- **Numbers and names as spoken:** "forty-three seconds", "version two point one". Give the model the spoken form when a number, unit, acronym or product name matters (the adapters list normalisation options).
- **End lines on the stressed word.** "Same photo. Different story." lands; "The story is different even though the photo is the same" doesn't.

## Cast it

- **Cast against the brand's voice, not the default.** Ask the model's library for candidates that match the three adjectives (`bun scripts/voice.ts voices --search warm`), or design a new voice from a description (`design --describe`). Avoid the platform's most-used default voices: audiences recognise them as "AI narration" instantly.
- **Audition 3 voices on the same 2 lines** (`audition --voices a,b,c --lines l1,l3`), one plain line and the hardest line. The takes are loudness-matched, so the user compares voices, not volumes. Send them to the user with one line on each ("warm, older, slow; bright, young, quick; dry, low, close"). Their ear decides, as with music takes.
- **One voice per piece** unless the concept is a dialogue. Never clone or imitate a real person's voice without their explicit, recorded consent; never imitate a celebrity, a politician or another brand's voice.

## Direct the performance

- **Direction is a performance note, not a mood board:** "[clear, confident, conversational]", "[warm, assured, full voice]". One note per line at most; the same note across lines keeps the read consistent. Overacting (big laughs, gasps, whispers for drama) reads as synthetic faster than a flat read.
- **Intimacy words make a whisper.** "Close to the mic", "soft", "understated", "intimate" turn a narrator breathy and ASMR-like, which a launch or explainer viewer hears as too quiet even at full level (a user rejected exactly that read). Use them only when the piece wants intimacy; for presenting, ask for clarity and projection ("clear", "confident", "full voice", "presenting to a room").
- **Pauses with text structure:** ellipses and full stops make breaths; commas make short holds; a new line in the script is a new breath. Models without break tags still follow punctuation.
- **Render line by line with context** (`render` passes the neighbouring lines), so each line keeps the read of the whole script while you can re-take one line alone. Fix a line by rewriting it, not by re-rolling seeds until it sounds right; keep the seed fixed for reproducible takes.
- **Listen, or have it listened to.** An agent can't hear prosody. Check what can be measured (duration, words per second, the word timings, loudness) and send every new take to the user before building on it.

## Place it on the music

Every line is placed on the grid (`public/vo/vo.json`):

- `at: "bar:4"` starts a line on a downbeat; `land: { word: "free", at: "bar:6" }` puts the key word on the beat (the line starts early enough for it); `after: "l2", gap: 0.3` chains a line to the one before for a natural read.
- **Land the key word, not the first word.** The word that carries the line should hit a downbeat or a visual hit; the start of the line falls wherever that puts it.
- **Leave the music its moments:** no voice on the drop, on the wow moment's first beats, or on the end card's first second. The voice sets the moment up; the music and picture deliver it.
- **Two edit modes.** *Music-led* (the default): the edit and music come first, lines are fitted into windows from the music map and rewritten until they fit. *Voice-led* (explainers, stories): render the voice first, set the scene windows from the lines' timings (`bun scripts/voice.ts cues`), then compose or cut the music to it, with the arrangement thinned under the voice.
- `bun scripts/voice.ts cues` prints where each line lands (seconds and bars), its words per second, overlaps, and lines that run past the end, and writes `out/voice.srt`.

## Mix it like a film

- **Takes are mastered to -16 LUFS** each (`render`), so lines sit level without riding faders.
- **The bed ducks under the voice:** the render lowers the music by `project.mix.musicDb` whenever a voice exists and sidechains it a further `duckDb` while someone speaks (defaults -4 and -9 dB, attack 40 ms, release 450 ms). Raise the duck for dense music, lower it for sparse ambient beds. The render then brings the finished mix to -14 LUFS integrated (what the platforms normalise to) and prints the loudness and true peak; listen for the balance, the level is handled.
- **Compose for the voice when you can:** a music brief that knows where the voice sits asks for space there (sparser mid-range, no lead melody under speech). That beats any amount of ducking.

## Captions

Burned-in captions come from the takes' word timings (`project.captions`, on by default with a voice): one phrase at a time, at most two lines, the word being said in the accent, drawn after the post chain so they stay crisp. They sit at the bottom of `SAFE` (above the platform UI in 9:16). Restyle `src/engine/captions.ts` to the piece if the default plate doesn't fit the look, but keep them readable at phone size and in contrast with every frame behind them. Deliver `out/voice.srt` too, for platforms that take a caption file.

## Languages

One edit can carry several voice tracks: a script per language (`vo/vo.en.json`, `vo/vo.pt.json`), rendered in the same voice where the model is multilingual. Translated lines run longer (German and Portuguese often 20-30% over English), so re-check `cues` per language and rewrite rather than speed the read up.

## Provenance and disclosure

`render` records the provider, model, voice, settings, seed, the exact text sent and each request id in `assets.json`. Disclose synthetic voice where a platform or law requires it, and never present it as a real person speaking.

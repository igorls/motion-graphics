# Adapter: ElevenLabs (Eleven v4) for voice-over

The craft is in [../voice.md](../voice.md); this page is what is specific to ElevenLabs. Documented facts are from the public docs as read on 2026-10-02; the "Measured" section records what a real run showed.

## Access

- API base `https://api.elevenlabs.io`, header `xi-api-key: <key>`.
- `scripts/voice.ts` reads the key from `ELEVENLABS_API_KEY`, the file named by `ELEVENLABS_API_KEY_FILE`, or `~/.config/elevenlabs/api_key` (one line). Ask the user to put it there themselves; never ask for it in chat, never print it, never write it into the piece.
- Paid usage: say how many characters a render will cost before running it (`render --dry` prints the count).

## Models

| Model id | Use |
|---|---|
| `eleven_v4` | highest quality, most expressive; audio tags and direction; 90+ languages; up to 10,000 characters per request. The default for voice-over. |
| `eleven_v4_turbo` | near-v4 quality at low latency (real-time use); fine for quick auditions. |
| `eleven_v3` | the previous expressive model (5,000 characters). |
| `eleven_multilingual_v2` | steady, consistent narration; supports SSML `<break time="0.5s"/>`. |

Eleven v4 and v3 do **not** support SSML break tags: pace with punctuation (ellipses, full stops), line structure and audio tags.

## Direction (audio tags)

Inline tags in square brackets before or after the words they shape: delivery (`[warm]`, `[whispers]`, `[sarcastic]`, `[curious]`, `[excited]`), reactions (`[sighs]`, `[laughs]`), accents (`[strong British accent]`), even sound effects (`[applause]`). Descriptive tags work best (`[low, gravelly voice]`). Capitals add emphasis; ellipses add weight and pauses. A voice follows tags it was trained on best; v4 also follows others, less reliably.

In `vo.json`, put the note in a line's `direction` (sent before the text). Captions and word timings never include tags (`scripts/voice/elevenlabs.ts` drops bracketed spans from the alignment).

## Endpoints the scripts use

- `GET /v2/voices?search=&page_size=`: the account's voices (id, name, category, labels such as accent, age, gender, use case; a preview URL).
- `POST /v1/text-to-voice/design` (`voice_description`, `model_id: eleven_ttv_v3`, `text` or `auto_generate_text`): a few previews from a description; `POST /v1/text-to-voice` saves one as a voice.
- `POST /v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128` (`text`, `model_id`, `language_code`, `voice_settings` {`stability`, `similarity_boost`, `style`, `speed`, `use_speaker_boost`}, `seed`, `previous_text`, `next_text`): base64 audio plus character start and end times, grouped into words by the script.
- Dialogue (`POST /v1/text-to-dialogue/with-timestamps`, several voices in one request) exists for multi-voice scenes; the scripts don't use it yet.

## Measured (2026-10-02, Eleven v4, from a Windows workstation)

- **Latency:** one 3.2 s line took 1.35 s round trip; six audition takes (3 voices x 2 lines, 3-7 s each) took 11 s including mastering. The response carries `tts-latency-ms`, `character-cost`, `request-id` and `history-item-id` headers.
- **Cost header:** `character-cost` reported 9 for a 67-character line (3.2 s of audio), so v4 is not billed per character the way older models were: check the account's usage page rather than counting characters.
- **Context:** `previous_text` / `next_text` are accepted with `eleven_v4` (no 400), so lines rendered one by one keep the read of the script.
- **Word timings:** 40 ms resolution. Audio tags appear in the alignment at zero duration (the first word still starts at about 0.08 s), so they don't shift the words; `scripts/voice/elevenlabs.ts` drops them. The last word's end time runs to the end of the file, including about 0.5 s of trailing silence; `render` clamps word ends to the detected end of speech (`silencedetect` at -45 dB).
- **Loudness:** raw takes came out between -16.2 and -18.8 LUFS integrated across voices and designed previews; `render` and `audition` master every take to -16 (`design` saves its previews as sent: match them before comparing by ear).
- **Voice design:** `eleven_ttv_v3` with a 100+ character `text` returns 3 previews reading that exact text in 8-9 s, so a designed voice can be auditioned on the real script. Previews read slower than library voices on the same text (calm descriptions gave 1.9-2.2 words per second against 2.3-2.5 for library voices).
- **Direction vs level:** on one voice, "[calm, understated, close to the mic]" came out at -16.2 LUFS raw yet read as too quiet (breathy, ASMR-like); projected directions ("[clear, confident, conversational]", "[bright and engaged, presenting to a room]") came out at -19.4 to -20.0 LUFS raw but read fuller. Raw level says nothing about projection: master every take, then judge the delivery by ear. The animated directions also widened the loudness range (2.5 LU flat vs 4.2-4.6 LU).
- **Speed:** Eleven v4 ignores `voice_settings.speed`: with the same seed, a take at 1.2 came back identical to one at 1.05 (and 1.05 matched 1.0 in pace). Pace comes from the direction and the text; to fit a window, split the line at its sentence break, try seeds, or rewrite.
- **Seeds and context:** takes vary by seed (one 3-word line spanned 1.44-1.61 s across six seeds) and by the neighbouring text sent as context: the same seed gave 1.44 s in isolation and 1.52 s with the script's context. Choose seeds in the real render.
- **Key file:** Windows Notepad saves `api_key` as `api_key.txt`; the script accepts both.

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

## Measured

(Fill in from the first real runs: auditions, a render, the placement and the mix. Record dates, models, voices, settings, latency, timing accuracy, quirks.)

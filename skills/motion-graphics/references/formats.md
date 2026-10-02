# Formats and delivery

Platform specs change; treat these as sensible defaults and check the platform's current help pages when a campaign depends on them.

## Output formats (the template's `--format`)

| Format | Size | Use |
|---|---|---|
| `vertical` 9:16 | 1080×1920 | Instagram Reels and Stories, TikTok, YouTube Shorts, Facebook Reels |
| `portrait` 4:5 | 1080×1350 | Instagram/Facebook feed video posts (the most feed space) |
| `square` 1:1 | 1080×1080 | feeds, LinkedIn, X, carousels |
| `landscape` 16:9 | 1920×1080 | YouTube, web hero, presentations (`--scale 2` for 4K) |

For an Instagram campaign, render `vertical` (Reels/Stories) and `portrait` (feed) from the same timeline. Layouts read `W`, `H`, `SAFE`, so this is one command each, but check each format's contact sheet: type sized for 9:16 can collide in 1:1.

## Safe areas

- **9:16 (Reels, Stories, TikTok):** the app draws its UI over the video: the top bar, the caption, username and audio line at the bottom, the like/comment/share rail on the right. Keep text, logos, faces and the CTA out of roughly the top 14%, the bottom 35% and 6% at the sides (Meta's Reels-ad guidance). `SAFE` in the template is exactly that rect. Photos and backgrounds should still bleed to every edge.
- **Profile grid crop:** Instagram shows Reels (and posts) in the profile grid as a centred 3:4 crop. For 9:16 that cuts ~240 px off the top and bottom; for 4:5 ~34 px off each side. The poster/cover frame must still work in that crop.
- **4:5 and 1:1 feed:** little UI overlays the video; a 6% title-safe margin is enough (the template's `SAFE`).

## Timing and length

- Hook in the first 1.5 s; the brand or product visible within ~3 s for ads.
- Reels ads: 6-15 s performs best; organic Reels can run longer if the content earns it. Stories: each card up to 60 s, but design for ~5-15 s.
- Feed loops: 6-10 s that loop seamlessly (match the last frame to the first, or end on a clean cut that restarts well).
- End card: hold ≥ 1.5 s, and design it to also be the cover.

## Encoding (what `render.ts video` does)

H.264 High profile, yuv420p, BT.709 tagged, CRF 18 (`--crf`), `+faststart`, AAC 256 kb/s 48 kHz, 30 fps by default (`project.fps`; 60 for web hero pieces). Platforms re-encode everything; a clean, not-too-grainy master survives that best. Keep files under the platform limits (Instagram accepts up to several GB, but 20-80 MB masters are typical for 15-30 s).

## Poster / cover

`bun scripts/render.ts poster --t <time> [--format ...]` renders the frame at `t` with 16 sub-frames and bakes it in as frame 0 of the video (same length, audio copied), so every thumbnail grabber shows it, and saves `out/<format>.poster.png` to upload as the Reel cover. Pick a settled moment (text fully in, nothing mid-transition), usually the end card or the strongest reveal, and check it in the 3:4 grid crop.

## Captions and copy

With a voice-over, deliver `out/voice.srt` (from `bun scripts/voice.ts cues`) beside the MP4, and check the mix line the render prints: about -14 LUFS integrated, true peak under -1 dBFS.

`caption.txt`: 1-3 sentences in the brand voice, specific, no "excited to share"; a CTA if it's an ad; hashtags only if the brand profile uses them. Burned-in text in the video already works muted; for spoken words also provide an SRT.

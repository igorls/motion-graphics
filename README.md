# motion-graphics (agent skill)

An agent skill for designing and rendering advanced motion graphics in code: social ads, Reels and Stories, launch videos, kinetic type, before/after reveals, beat-synced edits, narrated explainers. The agent works like a small studio with you as the client: a brief interview, three concepts, a treatment on the music's map, style frames, then scenes in a deterministic WebGL + Canvas2D engine, a fresh-eyes art-director review, and MP4s with real motion blur in every social format.

When generative models are available, it composes music to the edit's bar map, casts and directs a voice-over (placed on the beat, captioned, mixed over a ducked bed), and generates video clips to use as plates or keyed green-screen inserts.

## Install

The skill is the folder `skills/motion-graphics/`.

- **Claude Code, all projects:** link or copy it to `~/.claude/skills/motion-graphics/`. On Windows, a junction keeps it pointing at this repo:
  ```powershell
  New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\motion-graphics" -Target "<repo>\skills\motion-graphics"
  ```
  On macOS/Linux: `ln -s <repo>/skills/motion-graphics ~/.claude/skills/motion-graphics`.
- **Codex (all projects):** link or copy it to `~/.agents/skills/motion-graphics/` (the shared skills folder Codex reads; `agents/openai.yaml` gives it a display name and default prompt). On Windows:
  ```powershell
  New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\motion-graphics" -Target "<repo>\skills\motion-graphics"
  ```
  Then invoke it with `$motion-graphics` in a prompt.
- **One project:** copy it to `<project>/.claude/skills/motion-graphics/` (Claude Code) or `<project>/.agents/skills/motion-graphics/` (Codex).
- **Other agents:** point them at `skills/motion-graphics/SKILL.md`. The workflow only needs a shell (bun, ffmpeg, Chrome, uv) and a way to look at images.

Then ask for a motion piece: "make a 12-second Reel announcing X".

## Requirements

[bun](https://bun.sh), Google Chrome (driven headless via playwright-core), ffmpeg with libx264, and [uv](https://docs.astral.sh/uv/) for the optional music analysis. Generative music, voice and video are optional and use whatever models the agent can reach (a ComfyUI server, hosted APIs, MCP tools).

Provider keys stay out of the repo and out of the chat: the voice scripts read `ELEVENLABS_API_KEY` or `~/.config/elevenlabs/api_key`, and never print it.

## Layout

- `skills/motion-graphics/SKILL.md`: the workflow (brief interview, three concepts, music map, treatment and shot list, look development and style frames, build, art-director review, render) and the laws.
- `skills/motion-graphics/references/`: craft (the bar, shot vocabulary, composition, motion, type, colour, transitions, recorded data as motion, the 5/10 anti-patterns), the art-director review rubric, the treatment template, the engine API, music and sync, generative music and video, voice and narration, formats and delivery, brand profiles.
- `skills/motion-graphics/references/adapters/`: worked examples for specific models (YuE2 music and MiniMax H3 video on ComfyUI, ElevenLabs voice). Add one per model you use, with what you measured.
- `skills/motion-graphics/assets/comfyui/`: API-format workflows the adapters refer to.
- `skills/motion-graphics/profiles/`: brand profiles. `profiles/local/` is gitignored: keep your own or clients' brands there.
- `skills/motion-graphics/template/`: copied into each new piece. The engine (2D layers, a three.js 3D stage, custom materials and shaders, a swarm system, keyed clips, film post, voice-over cues and burned-in captions), the scripts (`render.ts`: stills, contact sheets, motion strips, cross-format checks, video with adaptive motion blur and a loudness-normalised mix, poster; `voice.ts`; `prep_clip.ts`; `comfy.ts`; `analyze_audio.py` for the music map), and seven example scenes that each show one technique.
- `tools/transcript.py`: renders an agent session transcript as compact text, for reviewing dogfood runs.
- `dogfood/` (gitignored): scratch pieces made while testing the skill.

## Dogfooding

The skill improves by being used: run it on real projects (open-source ones are ideal: public brand assets, real UIs, honest copy), then fold what you learn back in: craft rules that were missing, engine features a scene needed, adapter notes for models you tried. `CLAUDE.md` is the maintainer guide and keeps the dogfood log. Keep generated pieces out of the repo unless they are small, licensed and useful as examples.

## Credits

The engine design (every frame a pure function of time, sub-frame motion blur with adaptive sampling, HDR post chain, beat-grid timeline, stills/contact-sheet review loop) is adapted from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT). The creative laws, tone presets and poster-frame delivery borrow from [latent-spaces/brag](https://github.com/latent-spaces/brag) (MIT). The YuE2 adapter's score format follows the YuE team's [yue2-music skill](https://github.com/multimodal-art-projection/YuE/tree/main/skills/yue2-music) (Apache 2.0). Notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT (see [LICENSE](LICENSE)). Model weights, fonts and media you use with it keep their own licences.

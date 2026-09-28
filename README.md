# motion-graphics (agent skill)

An agent skill for designing and rendering advanced motion graphics in code: social ads, Reels and Stories, launch videos, kinetic type, before/after reveals, beat-synced edits. The agent writes a treatment, builds scenes in a small deterministic WebGL + Canvas2D engine, checks its own frames, and renders MP4s with real motion blur in every social format. When generative models are available, it composes music to the edit's bar map and generates video clips to use as plates or keyed green-screen inserts.

## Install

The skill is the folder `skills/motion-graphics/`.

- **Claude Code, all projects:** link or copy it to `~/.claude/skills/motion-graphics/`. On Windows, a junction keeps it pointing at this repo:
  ```powershell
  New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\motion-graphics" -Target "<repo>\skills\motion-graphics"
  ```
  On macOS/Linux: `ln -s <repo>/skills/motion-graphics ~/.claude/skills/motion-graphics`.
- **One project:** copy it to `<project>/.claude/skills/motion-graphics/`.
- **Other agents:** point them at `skills/motion-graphics/SKILL.md`.

Then ask for a motion piece: "make a 12-second Reel announcing X".

## Requirements

[bun](https://bun.sh), Google Chrome (driven headless via playwright-core), ffmpeg with libx264, and [uv](https://docs.astral.sh/uv/) for the optional music analysis. Generative music and video are optional and use whatever models the agent can reach (a ComfyUI server, hosted APIs, MCP tools).

## Layout

- `skills/motion-graphics/SKILL.md`: the workflow (brief interview, three concepts, shot list, style frames, build, art-director review, render) and the laws.
- `skills/motion-graphics/references/`: craft (the bar, shot vocabulary, composition, motion, type, colour, transitions, the 5/10 anti-patterns), the art-director review rubric, treatment and shot-list template, engine API, music and sync, generative music and video (model-agnostic), formats and delivery, brand profiles.
- `skills/motion-graphics/references/adapters/`: worked examples for specific models (YuE2 music and MiniMax H3 video on ComfyUI). Add one per model you use.
- `skills/motion-graphics/assets/comfyui/`: API-format workflows the adapters refer to.
- `skills/motion-graphics/profiles/`: brand profiles. `profiles/local/` is gitignored: keep your own or clients' brands there.
- `skills/motion-graphics/template/`: the engine (2D layers, a three.js 3D stage, shaders, keyed clips, film post), the render, clip-prep and ComfyUI batch scripts, and five example scenes, copied into each new piece.
- `dogfood/` (gitignored): scratch pieces made while testing the skill.

## Dogfooding

Run the skill on real projects (open-source ones are ideal: public brand assets, real UIs, honest copy), then fold what you learn back into the skill: craft rules that were missing, engine features a scene needed, adapter notes for models you tried. Keep generated pieces out of the repo unless they are small, licensed and useful as examples.

## Credits

The engine design (every frame a pure function of time, sub-frame motion blur with adaptive sampling, HDR post chain, beat-grid timeline, stills/contact-sheet review loop) is adapted from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT). The creative laws, tone presets and poster-frame delivery borrow from [latent-spaces/brag](https://github.com/latent-spaces/brag). The YuE2 adapter's score format follows the YuE team's [yue2-music skill](https://github.com/multimodal-art-projection/YuE/tree/main/skills/yue2-music) (Apache 2.0).

## License

MIT (see [LICENSE](LICENSE)). Model weights, fonts and media you use with it keep their own licences.

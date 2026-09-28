# Adapter: MiniMax H3 video in ComfyUI

A worked example of [generative-video.md](../generative-video.md). Verified on ComfyUI v0.37; adapt to newer versions.

## What's there

- Gallery templates: `video_fastvideo_fasth3_t2v` (FastH3 8-step distilled, text-to-video, fastest), `video_minimax_h3_t2v`, `video_minimax_h3_i2v`, `video_minimax_h3_i2v_continuation`, `video_minimax_h3_multiframe_reference` (up to 4 reference frames on the timeline), `video_minimax_h3_r2v` (reference images/videos/audio), `video_minimax_h3_fun_controlnet_union` (pose/depth/edge control). The distilled FastH3 checkpoint does text-to-video only; image-conditioned tasks use the base H3 checkpoints (first/last-frame `fl2va`, reference `ref2va`).
- Files (FastH3): `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors` (diffusion_models), `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` (text_encoders), `minimax_h3_video_vae_int8_convrot.safetensors` + `minimax_h3_audio_vae_fp32.safetensors` (vae). A template's model names may not match local files (different quantisations); check with the template's local check and point the loader at what's installed.
- Useful slots in the FastH3 template: `105.prompt`, `143.aspect_ratio` (`9:16 (Portrait Widescreen)`…), `143.megapixels`, `105.value_1` (duration in seconds), `105.noise_seed`, `92.filename_prefix`.

## Constraints

- Native canvas: 768 px short edge, max 768×1344 (9:16 came out 768×1376), multiples of 32.
- 24 fps; lengths snap up to 17k+5 frames (4 s → 107 frames = 4.46 s).
- Generates sound with the picture; `prep_clip.ts` drops it.

## Prompt format

H3 was trained on structured multi-shot descriptions:

```text
integrated_multimodal_description: [Shot 1] <framing, subject, materials, lighting, background, what moves and how, camera>. [Shot 2] At 00:02.100, the camera cuts to <...>.
overall_soundscape: <ambience and SFX, or "Complete silence.">
non_diegetic_music: <music, or "None.">
```

For a keyed insert, one shot: the subject and its motion with timing words, "the entire background is a perfectly flat, uniform, evenly lit chroma key green screen, pure saturated green, no gradient, no texture, no floor, no horizon, no shadows", "the camera is locked off", "generous green margin on every side so it never touches the edges of the frame", "nothing else in the frame". Silence for sound.

## Measured behaviour (RTX PRO 6000, 2026-09)

- FastH3, 9:16, 4 s requested (107 frames, 768×1376): **78 s** per clip.
- Prompt "a white instant photo print tumbling… on a flat chroma green screen": motion was good (tumble, edge-on flip, turn to camera, settle, slow push-in). The model **added a lighter floor and a cast shadow** despite "no floor, no shadows", and the screen was a dull green (rgb 46,132,53). The colour-difference keyer (`prep_clip.ts --key auto`, defaults) keyed it cleanly (solid white border, no fringe, floor and shadow gone). Generic YUV chroma keying (ffmpeg `chromakey`) failed on it: it made whites and blacks semi-transparent.
- The subject used ~560×700 of the 768×1376 frame; composite via `Clip.drawFit()` (bbox-aware), not the raw frame size.

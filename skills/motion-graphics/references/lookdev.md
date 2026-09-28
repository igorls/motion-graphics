# Look development: materials and shaders

The surfaces are half of what makes a piece feel designed. Three.js's default materials under default light read as "a render": correct, grey, anonymous. Studio work invents a **material language** for each piece: two or three signature surfaces and a grade that belong to its concept, written as shaders when nothing off the shelf fits.

## The rule

- **No default materials in a shot.** Every surface is a decision: which material, what it's made of, how it catches the key light, how it reacts to the beat. Grey `MeshStandardMaterial` / `MeshBasicMaterial` is scaffolding only.
- **Design the look during style frames**, before animating: build a turntable (`scenes/lookdev.ts`) with the piece's candidate materials under the piece's light, render stills, and choose. Show the user.
- **Write at least one custom shader per piece.** A starting-point look tuned to the brand counts only if its maths changed; the goal is a surface nobody has seen on this product.
- **Light is part of the material.** Choose the light preset and environment with the materials, not after.

## What the engine gives you (engine/looks.ts, engine/stage3d.ts)

| Tool | What it is | Use for |
|---|---|---|
| `stage.light(preset)` + `castShadows(obj)` | hemisphere fill + soft-shadow key; `studio`, `daylight`, `dusk`, `night` | every physical scene |
| `paper(hex)`, `matte(hex)`, `ground(mat)` | card stock with seeded fibres and mottling; plain matte; a shadow-catching floor | paper models, maquettes, clay, print worlds |
| `studioEnvironment(r, scene, 0.3)` | a soft reflection environment (keep it low with `light()`) | anything glossy, metal, glass |
| `glass()`, `metal()`, `iridescent()` | physical materials: real transmission/refraction, metal, thin-film coating | product-like hero objects, premium looks |
| `halftone(ink, paper)` | lighting as screen-space ink dots (risograph / newsprint) | editorial, print, retro, humour |
| `gooch(warm, cool)` | illustrated warm-to-cool shading with a crisp highlight | friendly, designed, "motion design" 3D |
| `rimGlow(base, rim)` | dark body outlined by a glowing fresnel rim that pulses on the beat | tech, night, neon without cliché |
| `holo()` | hue shifting with view angle and height, drifting scanlines | UI-in-space, data, futures (sparingly) |
| `customLook(glsl)` | write the fragment body yourself (N, V, L, P, uv, uTime, uBeat available; set `col`, `alpha`) | the piece's own signature surface |
| `addRim(m)`, `addGrain(m)` | inject GLSL into any built-in lit material, keeping its lighting and shadows | adding character to physical materials |

Custom looks are unlit shaders driven by `looks.lightDir` (set by `stage.light()`), so they agree with the scene's light; they cast shadows but don't receive them (use `addRim`/`addGrain` on a standard material when you need both).

## Techniques catalogue (write these in `customLook` or `onBeforeCompile`)

- **Toon ramps:** quantise `dot(N, L)` into 2-4 bands (`floor(k * 3.0) / 3.0`) with brand colours per band; add a hard fresnel outline.
- **Hatching / engraving:** lines whose density follows shading (`sin(dot(P, dir) * freq)` thresholded by `1 - lambert`), two directions for crosshatch. (pdoom-video used this for its ray-marched rooms.)
- **Triplanar noise and patterns:** sample noise/stripes by world position on each axis and blend by `abs(N)`: materials that don't need UVs (stone, concrete, fabric, brand patterns).
- **Screen-space print effects:** halftone, ordered dithering (Bayer matrix on `gl_FragCoord`), duotone mapping of luminance to two brand colours, misregistration (offset the ink layer by a pixel or two).
- **Emissive data:** textures made from the product's real data (code, logs, charts) scrolled with `uTime`; glyphs that light up on the beat (`uBeat`).
- **Vertex displacement:** add a vertex shader (copy `customLook`'s pattern) that pushes positions along normals by noise or a travelling wave: breathing surfaces, ripples on a hit, text melting.
- **Glass and caustics on a budget:** real `glass()` for the hero; a projected caustic is an animated noise texture on a spotlight or a floor plane.
- **Ray marching:** a whole world in one fragment shader (an `FSPass` with an SDF scene): impossible geometry, infinite repetition, smooth unions (`smin`), soft shadows and AO computed in the march. Composite it under 3D or 2D layers.
- **Per-scene grade:** an `FSPass` after the stage (before type) that maps luminance to the brand's colours, crushes or lifts blacks, adds a colour cast: each scene can have its own grade within the piece's palette.

## Checklist

- [ ] The piece has a named material language (2-3 materials + light + grade) written in the treatment.
- [ ] At least one custom shader, designed for this piece.
- [ ] A lookdev turntable still was rendered and the look chosen from it.
- [ ] No default grey surfaces anywhere; every surface catches the light like the material it claims to be.
- [ ] Materials react to the music somewhere (a rim pulse, emissive glyphs, a ripple on the drop).

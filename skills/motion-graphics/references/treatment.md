# Treatment (style bible)

Write `TREATMENT.md` before any scene code. It is the brief every scene is checked against, and the document the user can react to cheaply. Keep it to a page or two for an ad; a long piece (a music video, a 60 s launch film) earns more.

## Template

```markdown
# <Piece title> — treatment

## The idea
One paragraph: the organising concept (the chosen one from CONCEPTS.md, and why it beat the other two), the recurring motif, what the viewer should feel and remember.
Name the single message (what someone could repeat after one view).

## Core device
The one mechanism that makes this concept itself ("the frame edge is the wall", "the codebase is a city"). List the shots where it is unmistakably on screen.

## Material language
2-3 signature materials (what each surface is and how it's shaded: which starting look it grows from, or the custom shader to write), the light preset and environment, the grade. See [lookdev.md](lookdev.md).

## Money shot
The one frame people will screenshot: what's in it, where it lands (bar/beat), and why it's surprising. It's also the poster.

## Deliverables
Formats (9:16 / 4:5 / 1:1 / 16:9), length, fps, music (track + licence) or silent, where it runs (organic post, paid ad, site hero).

## Tone
Preset + freeform direction. Three adjectives it IS, three it is NOT.

## Look
- Palette: roles from the brand profile (bg, raised, ink, muted, accent) and the one thing the accent is reserved for.
- Type: display / label / (rare third voice), weights, case, how type is integrated into images.
- Light and texture: bloom (accent only), grain, vignette, any inversion scenes.
- Motif: the recurring element and how it travels between scenes.

## Shot list
(The rows below illustrate the level of detail for a hypothetical dot-matrix concept; your shots come from your own concept.)

| # | id | bars | shot size | camera | depth layers (front / subject / back) | on screen | on the beat | out |
|---|----|------|-----------|--------|---------------------------------------|-----------|-------------|-----|
| 1 | hook | 0 → 2 | extreme macro | slow push, then pull-back reveal | pins blurred / ribbon + dots / paper grain | the first word being struck dot by dot | each word lands on a beat | whip up (motion blur covers the cut) |
| 2 | stream | 2 → 4 | wide, 3D | fly-through past the cascading fanfold | loose sheets / the stream of real names / fogged machine | 52 procedure names pouring past | camera snaps between groups | match cut on the stamp |
| 3 | end | 4 → end | medium, top-down | slow crane down, settles | torn edge / sheet / desk texture | wordmark, line, CTA | CTA lands on the last downbeat | (poster) |

Check the list before building: shot sizes and layouts change at every cut; at least one shot moves through real depth; at least one thing transforms; every transition carries an idea; the money shot is in it.

Then a short paragraph per shot when the table isn't enough: the specific visual pun, the exact words and when each lands, the camera path, the hit points.

## Copy
Every on-screen line, exactly as it will appear, with its scene. Count words vs. hold time (~0.3 s/word).

## Sound
Music bed and its energy map (where it builds/drops, bar numbers), SFX cues if any, and how the piece works muted.

## Open questions
Anything you need from the user (assets, claims to verify, legal lines).
```

## Worked example of the level of specificity to aim for

From a music video built with this approach (each plate had a paragraph like this):

> "Training loss, suddenly": From black, hairline plot axes draw in (log-scale y "loss", x "step", mono labels). The spark draws a noisy loss plateau from the left; the lyric rides on the curve, each word appearing as sung. On "sudden drop" the curve plunges and the camera plunges with it, out of the bottom of the chart and into a 3D landscape of contour lines, diving toward the minimum, the spark's trajectory the only orange thing. "now I'm your servant and you're my boss": a typographic hierarchy inversion, and the whole world rolls 180° on "boss".

Notice: concrete objects, the motif (the spark) doing a job, words integrated into the image, camera moves tied to exact words/beats, one colour reserved for one thing.

For an ad the equivalent is shorter but just as concrete: "The before photo fills the frame, slightly underexposed. The divider enters from the left edge on beat 2, stops a third of the way in (you see a sliver of the result), holds one beat, then sweeps across on the bar-4 downbeat with a flare; the result holds for two beats before 'Same photo. Different story.' lands a word per half-beat at the bottom of the safe area."

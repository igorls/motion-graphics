# Craft

What separates a motion piece that looks designed from one that looks generated. Read this before designing; come back to the checklist before every render.

## The bar

Think of the work that sets the standard in motion design: the Apple product films where the camera glides through machined aluminium, the studio reels (Buck, ManvsMachine, Ordinary Folk, Gunner) where every frame is a poster and every transition is an idea, the music videos where type is architecture. What they share:

- **One idea, executed with total conviction.** The concept dictates every choice; nothing is decoration.
- **Space.** The camera moves *through* something: depth, parallax, perspective, light falling across surfaces. Flat layouts are the exception, used on purpose.
- **Scale contrast.** Macro details (a pixel, a pin, a keycap, a single glyph filling the frame) against wide reveals. The cut between them is where the energy is.
- **Transformation.** Things become other things: a line becomes a chart becomes a road; a word shatters into the data it describes; the UI unfolds into a physical object.
- **Materiality.** Surfaces feel like something: paper grain, glass, metal, ink bleed, phosphor glow, light leaking through. Even flat design has texture and light.
- **A money shot.** One frame so good it becomes the thumbnail, the poster, the reason people share it.
- **Rhythm with contrast.** Holds that make the snaps hit harder; silence that makes the drop land.

A piece that is correct, readable, on brand and on the beat but lacks these is a 5/10. The rules below keep it clean; this section is what makes it good.

## Shot vocabulary

Plan shots with this vocabulary, and vary it:

- **Shot size:** extreme macro (texture fills the frame), close, medium, wide, overhead/top-down, "impossible" (inside the machine, through the screen, from the data's point of view).
- **Camera:** locked (a deliberate choice, rare), slow push, dolly/truck through layers, orbit around an object, crane up/down, whip pan (blurred, masks a cut), roll, rack focus (depth of field shift), fly-through in 3D (`Stage3D`), zoom through a detail into the next scene (a match zoom).
- **Depth:** at least three planes in the shots that matter: foreground elements passing close and blurred, the subject, a background with its own slower motion. Fog, scale and blur sell the distance.
- **Transitions with ideas:** match cut on shape/colour/motion, the motif carries across the cut, zoom through a letter/hole/screen into the next world, a wipe by a real object, a morph, the camera moves past a foreground element that covers the cut, cut on the beat with a flash.
- **Layouts:** full-bleed image; huge type as architecture (the camera moves across letters bigger than the frame); split and grid; type sandwiched in depth (behind and in front of an object); data as the image (charts, streams, lists at scale); UI in space (screens tilted in 3D, zooming into a detail).
- **Secondary motion:** particles, dust, grain, light sweeps, slow parallax in the background, subtle reaction of the world to the beat. A frame with only one moving element feels dead.

## Composition

- **Design the whole frame.** The safe area constrains text and logos, not the image: backgrounds, texture, objects and camera moves use every pixel. Empty space must be a deliberate, composed choice, not the leftover below the headline.
- **Hierarchy in three levels**: one dominant element (huge), a secondary (medium), and details (small, precise annotations). Everything else is texture.
- **Break the grid on purpose**: an element cropped by the frame edge, type bigger than the frame, a diagonal against the verticals. Tension reads as confidence.
- **Consecutive shots differ**: size, layout, camera and dominant direction of motion change at every cut.

## The idea

- **One concept, many shots.** A strong piece has a single organising idea (a metaphor, a device, a world) that every scene plays a variation on. Example: a music video presented as plates from an illustrated treatise, each with its own instrument and idiom, sharing one palette, one type system, one grain. For an ad the idea can be small ("the divider line is the product: it turns before into after"), but there must be one.
- **A recurring motif** stitches scenes together and makes transitions feel inevitable: a line of light that draws the chart, then becomes the divider, then underlines the CTA. Hand the motif from shot to shot across cuts (it exits scene A where it enters scene B).
- **Visual puns and transformations, not illustrations.** Don't draw what the words say; transform one thing into another (a slider becomes a timeline, a photo's edge becomes a chart line, the product's own UI becomes the stage).
- **Specific over generic.** Use the product's real UI, outputs, words and numbers. If the frame would work for any product, it's filler.

## Motion

- **Snap, hold, snap.** Most motion should be a fast ease-out into a hold: `prog(t, t0, t0 + 0.3, ease.outExpo)`. The hold is where it gets read. Linear motion and slow symmetric ease-in-outs read as screensaver drift.
- **Eases.** outExpo/outQuart for entrances, inExpo for exits (accelerate away; motion blur turns it into a streak), inOutCubic/inOutExpo for moves between two holds, springs (`springStep`) for things that land and settle (logos, buttons, cards), outBack sparingly.
- **Timing scale.** Entrances 0.2-0.45 s; exits 0.15-0.35 s; camera moves 0.6-1.5 s; holds ≥ 0.3 s/word. Stagger groups by 40-90 ms, or by beats when the music allows.
- **Land on the beat.** Cuts on downbeats. Entrances, stamps and punch-ins on beats/kicks. Moves ease *into* a downbeat. Use the beat grid, never hand-typed times; a new track or tempo then re-times the edit for free.
- **Anticipation and follow-through.** A tiny wind-up before a big move, a small overshoot or settle after it, a punch-in (`zoom` 1.02-1.04) and a short flash (0.05-0.15) on the biggest hits. Screen shake only on real impacts, and short.
- **Camera.** Moving the whole world (push-ins, whips, crane-ups, rolls) is cheaper and more dramatic than moving every element. A slow push (3-6% over a shot) keeps even a still photo alive.
- **Motion blur is real.** The exporter averages sub-frames over the shutter, so fast moves are allowed and look good; judge them in stills rendered with `--samples 16`, not in the 1-sample preview.
- **Energy curve.** Hook high, a breath to show the product, build through the highlights, peak on the payoff, then settle on the end card. Don't run at 100% the whole time; contrast is what makes the peak land.

## Typography

- **Big, tight, confident** display type for the message; a mono or small sans for labels, numbers, UI voice; at most one expressive third face used rarely.
- **Hierarchy through scale**, not through more colours: one huge word and small annotations beat three medium lines.
- **Readable on a phone.** At 1080 px wide, body text ≥ 40 px, labels ≥ 32 px, headlines 90-200 px. Test in the contact sheet at thumbnail size: if you can't read it there, it's too small or too brief.
- **Kerning and punctuation.** Draw whole words when you can (Canvas2D applies kerning); for per-letter animation use `glyphLayout()` so letters sit where the whole word would. Typographic quotes and dashes (’ “ ” … – —) in display text (`smart()`).
- **Wrap with intent.** Break lines by meaning and balance (`wrapBalanced()`); never leave a lone short word on the last line.
- **No outlined or haloed type**, no drop shadows as a readability crutch. For text over photos, darken the photo region with a gradient or put the type on a solid band.
- **Words are part of the image**, not subtitles pasted on top: text rides a curve, is stamped on a card, typed into the product's input field, revealed by the divider.

## Colour and light

- **Restrained palette:** background, a raised tone, the ink colour, a muted grey, and one accent. A second accent only if it owns one moment.
- **The accent is the signal**: the active word, the CTA, the motif's light. Only it glows: tint it over 1 (`glow('accent', 2)`) and let bloom do the rest; everything at or below 1 stays crisp.
- **Light/dark rhythm.** An occasional inverted scene (ink on paper) gives the edit contrast.
- **Never flat black.** A subtle two-tone field, a vignette and a little grain make the frame feel like film. Keep grain low for social (≤ 0.04): platform re-encoding turns heavy grain into mush.
- **Contrast:** body text needs WCAG-level contrast against whatever is behind it at every moment of its animation, including over photos.

## Transitions

- **Default: hard cut on a downbeat.** Clean, energetic, never muddy.
- **Motivated transitions** when the motif can carry you: the element leaving scene A is the element entering scene B (match cut), a whip pan with motion blur, a wipe by a real object (the divider, a card, a hand-off of the light).
- **Crossfades between busy layouts make a muddy double exposure.** Stagger instead (old content out, then new in), or dip through the background colour.
- **Flash/zoom cuts** for hype tones: a 2-4 frame flash (`flash`), a zoom punch from 1.15 to 1.0 on the entrance.

## Tone presets

- **punchy** (default): confident, clean. Mixed or all caps display, a cut every 1-2 bars, snaps and punch-ins on hits, one flash on the payoff.
- **premium**: restraint is the choice. Light-to-medium weights, generous tracking, lots of negative space, slow pushes, 0.6-0.8 s dips through black, no shake, no flash.
- **hype**: ALL CAPS, heavy, oversized, some words tilted; scenes under 2 s; flash and zoom cuts; stacked repeats; every beat does something.
- **deadpan**: calm and dry; large sparse type, one thought at a time, long holds, hard cuts. The absurdity comes from the product, delivered straight.
- **cinematic**: trailer scale; short declarative lines that land one at a time; big type, slow builds, one huge reveal; music swell implied.
- **explainer**: one feature per scene, the real UI doing the thing (simulated cursor, clicks, typing), callouts and arrows, friendly pace.

## Avoid: the 5/10 piece

- **Slides of text:** every shot is the same layout (headline, sub, small print) on a background, and the "animation" is text appearing.
- **Locked camera throughout**; no depth, no parallax, nothing passes in front of anything.
- **One trick repeated**: every word types on, or every element fades up, in every shot.
- **Empty frames**: the headline in the top third and nothing designed below it.
- **Transitions that are just scrolling or crossfading.**
- **No money shot**: nothing you would pick as the thumbnail.
- **Example code shipped as the piece**: template scenes with new copy.

## Avoid (instant "AI slop")

Purple/cyan neon cyberpunk by default, glowing brains, circuit boards, matrix code rain, lens-flare soup, generic particle nebulae, floating 3D blobs, stock "AI" imagery, waveform/equaliser bars as decoration, everything centred, every element fading in the same way, emoji, text that flashes too fast to read, claims the product can't back up, copying another brand's or artist's look.

## Checklist before any render

- [ ] There's a money shot, and it is the strongest frame in the piece.
- [ ] The camera moves through depth in at least one shot; shot sizes vary; no two consecutive shots share a layout.
- [ ] Something transforms; at least one transition carries an idea.
- [ ] Every frame is designed edge to edge (no leftover empty space).
- [ ] The art-director review ([review.md](review.md)) scores 8+ on every dimension.

- [ ] The first frame and the first 1.5 s: is it the hook, and is something moving?
- [ ] Every line readable at phone size, inside `SAFE`, and held ≥ 0.3 s/word once fully in.
- [ ] Contrast of every text element against what's behind it, for its whole life on screen.
- [ ] No collisions or overflow in *every* output format (render a sheet per format).
- [ ] Cuts on beats; hits land on hits (sheet `--cuts`).
- [ ] Only the accent glows; type and photos crisp.
- [ ] Every settled frame postable; poster chosen at a settled, strong moment.
- [ ] The end card holds still ≥ 1.5 s with the name, the offer and where to go.
- [ ] Real product, real copy; nothing invented.
- [ ] No `SCENE ERRORS`; typecheck clean.

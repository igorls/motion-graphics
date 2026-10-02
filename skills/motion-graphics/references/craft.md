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

## Wow: engineering the peak

A clean piece is forgettable; a piece with one moment people replay gets shared. The wow moment is a *motion event*, not a frame, and it lands on the music's peak (the drop, the downbeat after a build, the stop). Plan it in the concept, build it first, give it the most time, and protect it: everything before it builds anticipation (stillness, a held breath, a rising camera), everything after lets it land (a hold, a slow reveal).

Patterns that reliably produce it (invent your own version for the piece):

- **Assembly / disassembly:** thousands of pieces (the product's own units: records, pixels, cards, glyphs, packets) fly from chaos into the name, the logo, a UI, a number, or shatter out of one. `engine/swarm.ts` does this deterministically; choose what the pieces *are* so it means something.
- **Impossible continuous camera:** one unbroken move across scales (inside a character → the screen → the room → the city), or through things that can't be passed through. Hides its cuts in motion blur and matched shapes.
- **Transformation on the beat:** one object becomes another in a single hit (a line becomes a road, a chart becomes a skyline, a wall slides and the frame widens).
- **Time manipulation:** freeze the world mid-action and move the camera through the frozen moment (bullet time), then release on the beat; or reverse time to rebuild something that broke.
- **Scale shock:** the thing we've been looking at turns out to be tiny (or huge): a sudden pull-back reveals it as one of thousands.
- **Physics with intent:** things fall, bounce, stack, ripple, collide, with overshoot and settle (springs, staggered delays), so the world feels real and then does something unreal.
- **The format itself:** the frame edge, the aspect ratio, the UI of the platform, the scroll become part of the event.

Test: describe the moment in one sentence to someone. If they don't ask "wait, how?", it isn't the wow moment yet.

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
- **The subject is the brightest thing in the frame.** When one element is being presented (a panel, a UI, a card), the world around it steps back: dimmer, lower contrast, its resting glow down, while its meaningful events (a flash on each request, a pulse on the beat) still read. Restore it when the shot widens. A bright, busy background beside the subject reads as noise competing with it.
- **Overlay bands are part of the framing.** If a shot carries a headline band at the top and a readout at the bottom, the subject sits wholly between them, including its footer and its numbers, at the tightest point of every camera move (the end of a push-in, not its start), in every format. A number cut off by the frame edge or covered by a caption was shown and then hidden.
- **Particles never cross text meant to be read.** Sparks, trails and flying pieces end at a panel's edge or pass behind it; in a close-up on a text panel they usually go.
- **Panels that carry text are opaque.** A translucent "glass" panel lets the scene's brightest elements and labels read through its text; even 3-4% shows against a dark panel.

## The idea

- **One concept, many shots.** A strong piece has a single organising idea (a metaphor, a device, a world) that every scene plays a variation on. Example: a music video presented as plates from an illustrated treatise, each with its own instrument and idiom, sharing one palette, one type system, one grain. For an ad the idea can be small ("the divider line is the product: it turns before into after"), but there must be one.
- **A recurring motif** stitches scenes together and makes transitions feel inevitable: a line of light that draws the chart, then becomes the divider, then underlines the CTA. Hand the motif from shot to shot across cuts (it exits scene A where it enters scene B).
- **Visual puns and transformations, not illustrations.** Don't draw what the words say; transform one thing into another (a slider becomes a timeline, a photo's edge becomes a chart line, the product's own UI becomes the stage).
- **Specific over generic.** Use the product's real UI, outputs, words and numbers. If the frame would work for any product, it's filler.
- **Understood on first watch.** A first-time viewer at 1x, sound off, should be able to say what the piece showed. Spectacle that needs a second viewing to decode is a failure of the message, not a feature. Budget about 4-6 s for each new idea the viewer has to learn (a new kind of panel, a new visual rule, a new claim), on top of reading time.
- **Introduce, then combine.** When the message is that several things happen together (one engine serving four jobs, one tool replacing three), present each part alone first, long enough to learn what it looks like, then show them together. Shown all at once from the start, the viewer sees noise; shown one by one, the all-at-once shot is the payoff.
- **Borrowed systems obey their own rules.** When the piece borrows something the audience already knows (Tetris, chess, a chat app, an OS window, a stock ticker), its motion and UI follow that system's grammar: in Tetris a piece spawns at the top, falls row by row, locks, full rows flash and collapse, and there is a NEXT box. Viewers know these rules better than any detail of your product and spot a broken one instantly. Cleverness layered on top (probability outlines over the board, pieces appearing in place) reads as "that's not real Tetris".

## Motion

- **Snap, hold, snap.** Most motion should be a fast ease-out into a hold: `prog(t, t0, t0 + 0.3, ease.outExpo)`. The hold is where it gets read. Linear motion and slow symmetric ease-in-outs read as screensaver drift.
- **Eases.** outExpo/outQuart for entrances, inExpo for exits (accelerate away; motion blur turns it into a streak), inOutCubic/inOutExpo for moves between two holds, springs (`springStep`) for things that land and settle (logos, buttons, cards), outBack sparingly.
- **Timing scale.** Entrances 0.2-0.45 s; exits 0.15-0.35 s; camera moves 0.6-1.5 s; holds ≥ 0.3 s/word. Stagger groups by 40-90 ms, or by beats when the music allows.
- **Land on the beat.** Cuts on downbeats. Entrances, stamps and punch-ins on beats/kicks. Moves ease *into* a downbeat. Use the beat grid, never hand-typed times; a new track or tempo then re-times the edit for free.
- **Anticipation and follow-through.** A tiny wind-up before a big move, a small overshoot or settle after it, a punch-in (`zoom` 1.02-1.04) and a short flash (0.05-0.15) on the biggest hits. Screen shake only on real impacts, and short.
- **Camera.** Moving the whole world (push-ins, whips, crane-ups, rolls) is cheaper and more dramatic than moving every element. A slow push (3-6% over a shot) keeps even a still photo alive.
- **Motion blur is real.** The exporter averages sub-frames over the shutter, so fast moves are allowed and look good; judge them in stills rendered with `--samples 16`, not in the 1-sample preview.
- **Energy curve.** Hook high, a breath to show the product, build through the highlights, peak on the payoff, then settle on the end card. Don't run at 100% the whole time; contrast is what makes the peak land.

## Recorded data as motion

When the motion shows real recorded events (requests, tokens, moves, scores), the timing is part of the claim:

- **One time map per chapter.** Each chapter plays a recording (its own phase, or the shared one) through an explicit function from video time to recording time. Keep it in one place (a `view(t)`), so every element in the shot reads the same clock.
- **Every speed other than 1x is labelled on screen** ("▶ 0.25× SLOW MOTION · RECORDED ALONE · t = 0.70 s"), and the snap to real speed is a visible moment. Slow motion is the standard device for showing events faster than the eye: a 58 ms decision at 0.1x lasts 0.6 s.
- **Stop the clock at the end of the recording.** Don't let a timer run past the last recorded event; end on a recorded summary instead ("■ RUN COMPLETE · 20 MOVES IN 1.21 s").
- **Keep drawn time separate from recorded time.** Some motion has to be invented to be seen (a 20-30 ms slide and drop after an answer, a flash when a row clears). Keep it short, after the recorded event it illustrates, and never let it move a recorded time. Write down which is which in the treatment.
- **Readouts step once per output frame.** Counters, timers and labels read the time quantized to the frame (`frameIdx`), so a frame never blends two values, and they render once per frame (`Layer2D.clearFor`, [engine.md](engine.md#render-speed)).
- **Placeholder data is marked.** A concept built before the real recording exists runs on clearly estimated numbers, with a visible "NOT FOR POSTING" watermark on every frame, and the treatment records the exact command that records the real data and replaces them.

## Typography

- **Big, tight, confident** display type for the message; a mono or small sans for labels, numbers, UI voice; at most one expressive third face used rarely.
- **Hierarchy through scale**, not through more colours: one huge word and small annotations beat three medium lines.
- **Readable on a phone.** At 1080 px wide, body text ≥ 40 px, labels ≥ 32 px, headlines 90-200 px. Test in the contact sheet at thumbnail size: if you can't read it there, it's too small or too brief.
- **Kerning and punctuation.** Draw whole words when you can (Canvas2D applies kerning); for per-letter animation use `glyphLayout()` so letters sit where the whole word would. Typographic quotes and dashes (’ “ ” … – —) in display text (`smart()`).
- **Wrap with intent.** Break lines by meaning and balance (`wrapBalanced()`); never leave a lone short word on the last line.
- **Compose calm areas for type, don't patch them with scrims.** Plan the shot so the headline sits over sky, a shadowed wall, a defocused plane, an out-of-focus foreground, or a flat surface in the world; or set the type *in* the world (on a facade, a floor, a screen); or step the world back behind it (see Composition). A gradient scrim is a last resort for photos you can't re-frame.
- **No outlines, no visible drop shadows.** One exception: overlay text that has to read over a live 3D or data world (a caption over a moving camera, numbers over flashing cells) may carry a soft dark halo: a blur-only shadow in the background colour, invisible as a shape, there to keep edges legible when something bright passes behind. Readouts and labels in a HUD sit on **plates** (dark glass with the piece's edge colour): a plate is part of the design language, not a patch.
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

A default narrator voice reading the on-screen text over wall-to-wall music, purple/cyan neon cyberpunk by default, glowing brains, circuit boards, matrix code rain, lens-flare soup, generic particle nebulae, floating 3D blobs, stock "AI" imagery, waveform/equaliser bars as decoration, everything centred, every element fading in the same way, emoji, text that flashes too fast to read, claims the product can't back up, copying another brand's or artist's look.

## Checklist before any render

- [ ] There's a wow moment people would replay, on the music's peak, prototyped first and polished most.
- [ ] There's a money shot, and it is the strongest frame in the piece; frame 0 is designed to the same standard.
- [ ] The concept's core device is clearly on screen, not diluted.
- [ ] A material language with at least one custom shader; no default grey surfaces ([lookdev.md](lookdev.md)).
- [ ] Headlines sit on calm areas composed into the shot (or a world stepped back behind them); no scrims, no outlines.
- [ ] A first-time viewer can say what the piece showed after one watch at 1x; each new idea gets ~4-6 s; parts are introduced before they are combined.
- [ ] Anything borrowed from a known system (a game, an app, a UI) moves by that system's rules.
- [ ] Recorded data: every non-1x speed labelled; the clock stops at the end of the recording; drawn time is separate and short.
- [ ] The camera moves through depth in at least one shot; shot sizes vary; no two consecutive shots share a layout.
- [ ] Something transforms; at least one transition carries an idea.
- [ ] Every frame is designed edge to edge (no leftover empty space).
- [ ] The art-director review ([review.md](review.md)) scores 8+ on every dimension.

- [ ] The first frame and the first 1.5 s: is it the hook, and is something moving?
- [ ] Every line readable at phone size, inside `SAFE`, and held ≥ 0.3 s/word once fully in.
- [ ] Contrast of every text element against what's behind it, for its whole life on screen.
- [ ] No collisions or overflow in *every* output format (`render.ts check` across formats); each presented subject sits wholly between the overlay bands at the tightest point of its camera move; no particle crosses text.
- [ ] Cuts on beats; hits land on hits (sheet `--cuts`).
- [ ] Only the accent glows; type and photos crisp.
- [ ] Every settled frame postable; poster chosen at a settled, strong moment.
- [ ] The end card holds still ≥ 1.5 s with the name, the offer and where to go.
- [ ] Real product, real copy; nothing invented.
- [ ] No `SCENE ERRORS`; typecheck clean.

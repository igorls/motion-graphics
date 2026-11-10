# Websites: motion and real-time 3D on the web

The studio process also makes websites: a landing page, a product or launch site, a site hero. The bar is the same: one idea executed with conviction, a money shot, and a wow moment people scroll back up to see again. A site whose 3D is wallpaper behind ordinary sections is the web's 5/10.

The medium changes five things:

1. The scroll is the playhead.
2. The world renders in real time on the visitor's device.
3. Every word is HTML.
4. The visitor acts.
5. There is no single frame size.

The template in `<skill-dir>/web/` implements all five; this file is the craft.

To start a piece, copy `<skill-dir>/web/` into the project without `node_modules`, then `bun install` and `bun run dev` (port 5180), and look with `bun scripts/shoot.ts sheet`. A fresh copy has no posters, so the first loads log a 404 for `/posters/…` until `bun scripts/shoot.ts posters` bakes them from the world. Run it once the hero looks right, and again after visual changes.

## What carries over unchanged

- **The process:** inspect, the brief interview, three concepts (each with a money shot and a wow moment), a treatment, look development with at least one custom shader, style frames approved by the user before building, and the fresh-eyes review with its ship gate. Concepts matter more on a site: it's long, and a wrong idea costs days.
- **The wow moment is prototyped first and polished most.** On the web it lands on the scroll's peak, a pinned chapter, instead of the music's drop.
- **Show the thing:** real product, real copy, real UI restaged in the world's materials. Never invented claims; a site's claims are read slowly and quoted.
- **Evidence-based review:** sheets, motion strips and cross-viewport checks, given to a reviewer who sees only what the visitor sees.

## Brief additions

Add these to the interview:

- **What the site must do:** sign-ups, downloads, a waitlist, explaining.
- **The call to action and where it goes.** An endpoint, a store, a mailbox; flag what doesn't exist yet.
- **Pages and languages.** Translated pages get translated slugs.
- **Domain and contact addresses.**
- **What may and may not be claimed.** Read the product's own docs: brand books go stale, and architecture changes faster than marketing copy.
- **Pin claims to their source.** For every claim with a number or a guarantee, note in BRIEF.md the code line it comes from (`sos_button.dart: _holdDuration = 3 s`). Re-check the pins against the product's latest code before every review round and at delivery. Products change under their sites: here the hold went from two seconds to three on the day of a review.
- **Whether competitors may be named.**

## The scroll is the playhead

Each `<section data-chapter>` is one chapter; chapter *i* spans **story time** *[i, i+1)*, from the moment its top reaches the top of the viewport until the next chapter's does. The world renders as a pure function of story time and a small ambient clock (breathing, drift), so:

- any scroll position shows the same frame;
- deep links work (`?s=3.66`);
- screenshots are exact (`?still` freezes the ambient clock and drops damping).

- **Pinned chapters** (`data-pin`) are 2-3.5 viewports tall, with a `position: sticky` child one viewport high. They hold the copy still while the world plays. Author the chapter's events inside its pinned part (`story.pin(s, i, pinEnd)`); the last viewport of the span is the hand-off while the next chapter scrolls in.
- **Scroll length is pacing.** Budget about one viewport per idea and two to three for the wow. As in video, introduce parts before you combine them.
- **Pace motion in seconds, not story units.** People scroll about a viewport per second, so anything that draws or travels (a line across a city, a message through a relay) needs two to three viewports of pinned scroll, or it races. Stills can't show speed: before a review, scroll the page at a steady pace (`shoot.ts perf --vp desktop --headed --seconds 20`) and watch it.
- **Damp the camera, not the content.** Smooth story time for the world with a short exponential (about 0.1 s) and snap on big jumps (anchor links). The DOM follows the native scroll exactly.
- **Never hijack the scroll.** No scroll-jacking libraries, no wheel interception. Native scrolling, keyboard, find-in-page and screen readers keep working; the world follows them.
- **Scroll-stepped UI:** an element with `data-steps="0.1,0.3,0.6"` inside a pinned chapter gets `data-phase` (how many thresholds its chapter's pinned progress has passed) and `--q`. Style each phase in CSS; the state is exact at any scroll position.

## Graphic, not realistic

The web makes realism expensive and abstraction cheap, so let the shaders carry the look (lookdev.md, "Graphic, not realistic").

- **Draw the world with shaders, as 2D marks in 3D space.** One ground plane can be a whole city: streets as lines from a raster or SDF, density as halftone dots sized by data, water as hatch lines, park as a dot field. Past the modelled area the pattern continues procedurally and fades into the sky. This costs a few texture reads per pixel, with no geometry or shadow marching.
- **Flat planes, lines and points in space:** stacked floors of lines, floating rings, labels. They stay crisp at any distance, read at a glance, and recolour with the hour.
- **Make the shaders move:** dots that breathe, lines that draw, fills that sweep, fields that flow, all driven by uniforms from the story.
- **Extruded boxes under lit materials** (a clay city, an architectural massing model) look unfinished on the web however good the lighting. Don't start there.
- **The template starts graphic.** `scenes/field.ts` (`graphicField`) is a ground of grid lines and a halftone field, from noise or your own data texture: ink by day, points of light at night. The example's swarm is made of flat discs that face the camera.
- **Many additive marks overlapping sum to a white blob.** Give night marks a modest intensity and keep some coverage (premultiplied, with alpha above zero), so a word made of thousands of dots still reads.

## Staging a chapter

- **The camera rides the subject.** A chapter is a shot, not a slide. Follow the subject (the line's head across the city), turn slowly, crane as the scene grows. Three held chapters in a row read as slides, however good each frame is.
- **Words in the shot.** Set each chapter's one line big in the calm area its camera leaves (sky, haze, night), and compose the camera for it: a lower pitch puts the hazy distance at the top of the frame. Cards are for real explanation (a privacy paragraph). The same card in the same third, chapter after chapter, turns the world into a backdrop.
- **The copy waits for its event.** Reveal a line when its event lands (`data-steps="0.74" data-reveal` on the block). The wow plays without words; its line lands as it completes. A line about an event that sits on screen before the event spoils it.
- **Beats:** a stepped chapter gets one line per step, stacked in one grid cell and switched by the same `data-steps` as its UI. Match each line to what the UI shows at that step, not to the step's number.
- **The hero shows the product doing its job, live.** The first screen is the one everyone sees, so it must say what the product does without a word. Show its use: a live map of your people, a conversation arriving, a document assembling. Use ambient motion on the clock (walkers, pings, data arriving) so it's alive before anyone scrolls. A logo object floating at rest over a backdrop (a mark, a sphere, a device) says nothing about the product, however well it's shaded. Save the brand mark for the wow.
- **Carry the hero into the first chapter with the line itself.** The hero's subject turns into the next chapter's: here the live tail stopped fading and grew into the track "the usual way" keeps, along the same route the next chapter draws.
- **Compose the first impression on the clock too.** The poster and frame 0 are one moment of the ambient motion. Search the starting phases so nobody's label overlaps another's in the first seconds, and size keep-out zones from the moving subject's measured extent, not a guess.
- **Mind the header:** a fixed header covers about the top 9% of the frame. Keep subjects below it in every shot, mid-move included.
- **The copy is a keep-out zone, in every frame.** Composing each chapter at rest isn't enough: subjects and copy collide in hand-offs, on other viewports and in other languages. Mark copy blocks `data-keep`; the runtime measures their boxes every frame (`WorldFrame.keep`). Lines still waiting for their event (`data-reveal` at phase 0) don't count.
  - Slide the subject clear with `clearOf` (engine/keep.ts): beside the copy on wide screens, below settled copy on tall ones, clamped on screen. Shift the view offset by the result; damp it in live mode only.
  - Fade the subject with `overlapOf` while copy that is still arriving scrolls across it. A push would flip direction as the copy's centre passes the subject's.
  - World labels clamp inside the viewport rather than being cut at its edge, and keep off the copy's boxes (`Labels.place(…, avoid: f.keep)`).
- **Calm fields:** where a shot can't leave a calm area (a city under the line), return `calm` (0..1) and `calmColor` (the horizon's colour) from `render()`. The post pass defocuses the world behind the copy's boxes and leans it towards that colour, feathered, so the words read without a card or a scrim box.
- **Check the seams:** `shoot.ts seams --around 0.3` samples every chapter boundary across the whole hand-off, one row per boundary. Run it on every viewport, in every language and with `--reduced`: hand-offs are where collisions live.
- **Tone follows the arriving copy, not the chapter boundary.** A section whose copy arrives over the previous chapter's light (a dawn sign-up rising over the night) gets `data-tone="world"`. Its ink is light while the world is dark and dark once it brightens. That also holds in reduced motion, where the outgoing chapter's rest state stays on screen until the boundary.
- **Vary the openings.** Inner pages that all open on "headline left, object right" read as one template. Open each on the object that makes its point: a privacy notice on the sealed relay, not on the history it promises not to keep.

## The page is real HTML; the world is decoration

- **Every word, button and link is in the HTML**, rendered statically per page and language. The site reads without WebGL or JavaScript, indexes, translates, and works with assistive technology. The canvas is `aria-hidden`, and no meaning lives only in it.
- **Explanatory copy sits on opaque cards.** The world never reads through text; this is the web form of craft.md's "panels that carry text are opaque".
- **Display lines over the world** sit on calm areas the camera composes for them: sky, haze, a dark night.
- **Ink follows the world's light.** Chapters that play in a dark world carry light ink. Mark each section with `data-tone` (`light`, `dark`, or `world` to follow the world's own darkness). The header switches its glass and ink from what is under it.
- **Labels pinned to the world are DOM.** Project the 3D anchor each frame and move a real element: crisp text in any language. Labels sit under the copy and never cross it.
- **Restage real UI as HTML/CSS:** phones and windows built from the product's exact strings (grep the app's source), stepped with `data-steps`. It is crisp, accessible, cheap and translatable, and it beats a screenshot on a plane.

## Real time on any device

- **Quality tiers:** cap the device-pixel ratio, MSAA samples, bloom pyramid depth and shader loop counts per tier. Pick the tier from the device (coarse pointer, cores, memory), then adapt from frame times: drop a tier when the median frame passes about 24 ms, climb back after a few seconds of headroom.
- **Bake what doesn't move.** Marched shadows over a static city depend only on the sun, so bake them into a texture when the light changes, and keep per-pixel marching for the few surfaces that need it.
- **Sleep under opaque sections:** while a `data-cover` section fills the viewport, skip the render and keep the last frame.
- **Pause when hidden** (`visibilitychange`), and load the world after first paint with a dynamic import.
- **Warm every chapter's shaders before the world shows.** A material's first use compiles its shader, and that can stall a frame 50-100 ms, mid-scroll or on the first scroll. The runtime draws one other chapter's rest state per frame behind the poster. Only then does the canvas fade in (`html.world-on` hides the poster), with no blank frame between them. `perf` names the slowest frames with their story time, so a hitch can be traced to its chapter.
- **Posters:** bake each chapter's frame from the world itself; the screenshot tool can save the canvas alone. The hero's poster is the first paint (and the LCP image), and the world fades in over it. The posters are also the picture without WebGL, on save-data, and without JavaScript.
- **Measure in a real browser:** scroll the whole page at a steady pace and record the median and p95 frame times and the tier it settled on, on desktop and an emulated phone. Profile the heaviest shader before adding more.

## Light on the web

- **Glow needs darkness.** On a bright page, additive light washes to white and the brand's accent stops reading as itself. Blend lines and glows premultiplied with an "over" control: on light ground they cover what's behind them in their own colour, and on dark ground they only add light.
- **Design the page's light arc** the way a film designs its grade. A scroll can be one day (golden hour, sunset, blue hour, night, dawn), with the wow in the dark part and the brand's own light (often a light page) at the start and the end. Blending presets leaks tint into neighbouring chapters, so keep brand-colour chapters in their own light.
- **Low sun, dark roofs:** at a 15° sun, horizontal surfaces get a quarter of the light, and top-down shots go grey. Raise the sun for top-down chapters.
- **Grounding:** a hero object casts a soft shadow (an analytic shadow is cheap: ray to the object's plane) and lights what's under it at night.

## Composition across viewports

There is no single frame. Lay out for phone (390×844), tablet, laptop and desktop.

- **Screen anchors:** put the camera's subject at a screen position per aspect with `camera.setViewOffset` (an `at: [x, y]` per shot): right of the copy on desktop, under it on phones, with the same camera path.
- **Portrait pulls back** (about 1.4× the distance) and widens the vertical field of view so the subject keeps its width.
- **Check every key moment on every viewport** (`shoot.ts check`). Collisions show up in only one: the ring under a headline, a label across copy, a phone covering a phone.
- **Portrait stacks:** the copy starts at the top and the subject owns the lower part of the screen. A copy block centred vertically collides with a subject anchored low.
- **Extend the world to the horizon:** a low camera sees past any finite model. Tile the ground's textures beyond the detailed centre and taper the solid geometry into them.

## Interaction

- One or two real interactions beat many effects:
  - a demo the visitor performs (hold to alert, drag to compare, type to see);
  - the form's own moment (the line fills as you type; the mark completes on submit).
- Pointer parallax of the camera stays small and damped, and is off on touch and with reduced motion.
- Demos work by keyboard (Space or Enter held), announce their result (`aria-live`), and never send real data. Say "a demo" on the control.
- **The demo plays in the world, not beside it.** A demo on a card next to the world reads as a widget; in the world it is a scene. The UI writes a small shared state (`window.__alert = { hold, doneAt }`) and the story reads it every frame: the hold fills the 3D ring, and completion flashes it and lights the city.
- **Dock controls into the world's objects.** To put a button inside a 3D ring, `new Dock(section, 'ring').place(centre, radius, camera)` each frame (engine/labels.ts). It writes the object's place and screen radius as CSS variables (`--ring-x`, `--ring-y`, `--ring-r`), and only when they move. Position the control from them (`position: absolute` inside the sticky pin) and size it from them too. With `rel` (the pin, set to `overflow: clip`), the control rides in already docked and leaves with its section. Give the docked control `grid-area: auto`: an absolutely positioned child of a grid takes its area from its containing block's grid (the sticky pin's), and an area that grid doesn't have puts the control off-screen. Keep the camera's look point on the object (zero look offset): drift and parallax then move the world around it, never the object under the finger. Without the world, the control stays in the flow.
- Percentage padding resolves against the containing block's width, not the element's own: derive the padding from the element's size variable.

## Reduced motion and fallbacks

- **`prefers-reduced-motion`:**
  - hold a designed rest state per chapter (`restFor(i)`), with a short dissolve when the chapter changes;
  - no camera flights, drift or parallax;
  - scroll-stepped UI changes state without transitions.
- **No WebGL, save-data, no JavaScript:** the posters and all content.
- **Light ink needs a dark ground whenever the world isn't running** (off, failed or still loading): give those sections a background under `html:not(.has-world)`. `?world=off` takes the same path as a failed world, so reviews see the real fallback.
- **Small screens stay navigable:** a `<details>` menu (it opens without JavaScript), and a footer with the site map, so the privacy notice is reachable from every page.
- **Without JavaScript, pinned chapters flow as ordinary sections** (`.no-js .ch[data-pin]` gets an auto height and a static pin): nothing plays on scroll, so nothing should stick.
- **Tables on phones** reflow into one labelled card per row (`td::before { content: attr(data-label) }`). ARIA table roles keep the semantics when CSS changes their display.
- **Screenshots in still mode** kill CSS transitions and animations, or the first frames come out mid-fade.

## Look at it like a visitor

`<skill-dir>/web/scripts/shoot.ts` drives real Chrome on the GPU and captures the DOM over the live world:

```bash
bun scripts/shoot.ts at --s 0,1.4,3.66 --vp desktop,phone       # stills at story times
bun scripts/shoot.ts sheet --n 24 --vp desktop                  # contact sheet, labelled by chapter
bun scripts/shoot.ts sheet --times 0,1.4,3.66 --name styleframes   # style frames for the user
bun scripts/shoot.ts strip --from 2.9 --to 3.8 --every 0.05     # a motion strip of the wow
bun scripts/shoot.ts check --s 0,3.66                           # the same moments on every viewport
bun scripts/shoot.ts perf --vp desktop                          # frame times while scrolling (live mode)
bun scripts/shoot.ts full --page /privacy/                      # a page without the world
bun scripts/shoot.ts posters                                    # the world alone per chapter (src/site/shots.ts)
bun scripts/shoot.ts og                                         # share images at each page's strongest moment
```

`--eval` runs page script before the capture; a value it returns is printed (measure the scene: `window.__world.story` is the running story). `clock --s 0 --from 0 --to 20 --every 2` holds a scroll position and steps the ambient clock (walkers, pings, breathing): idle motion that story-time sheets can't show.

```bash
bun scripts/shoot.ts at --s 7.25 --vp phone --eval '(async () => { document.querySelector(".hold-btn").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); await new Promise(r => setTimeout(r, 2250)); })()'
```

Look at every sheet and strip, exactly as with video: that is how the work gets checked. Capture interactions with a real pointer at the visible control (`--press`) and walk the page by keyboard (`--tab`). Synthetic events pass even when the control is off-screen.

## Review additions

Give the reviewer the home sheet (desktop and phone), the wow strip, the cross-viewport checks, a capture of each page without the world, the perf numbers, and a **scroll-time table** in REVIEW.md: per chapter, its scroll length in viewports, the words to read while it's pinned, and what moves. Add four dimensions to [review.md](review.md)'s ten:

1. **Performance:** would it feel smooth on a mid-range phone, and is the first paint designed?
2. **Accessibility:**
   - Is every word in the HTML?
   - Does every text element keep its contrast against what's behind it, the whole time it's on screen?
   - Does the page work by keyboard, and does it have a designed reduced-motion version?
3. **Responsiveness:** does each key moment work on every viewport? Name the collisions.
4. **First-scroll comprehension:** the sentence a first-time visitor would say after one scroll at a normal pace, compared with the brief. Where would they stop, and where would they get lost?

Ask the reviewer too: does it feel like a site (clear navigation, obvious actions, readable sections), not only a film you scroll through?

## Delivery

- **Static HTML** per page and language, with canonical URLs and hreflang alternates, hashed assets, a sitemap, robots.txt and a 404 page (`bun run build`).
- **Self-hosted, subsetted fonts** (pyftsubset to Latin plus the languages' accents, WOFF2) and **no third-party requests or trackers.** Ship a strict CSP. Keep inline styles out of templates (CSSOM changes from scripts are fine).
- **Share images** rendered from the world at each page's strongest moment, with the brand in place of the header.
- **A README** for the team (develop, review, build) and a **LAUNCH.md** of what they must do: mailboxes, endpoints, hosting headers, claims to re-check on the day.

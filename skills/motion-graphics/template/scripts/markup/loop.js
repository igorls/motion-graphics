// Playback over the in→out range: where the playhead is, and when it wraps. Pure, so the page and
// bun test (scripts/markup/loop.test.ts) run the same code. A range [inF, outF] is inclusive: it plays
// from the start of frame inF, inF / fps, to the end of frame outF, (outF + 1) / fps, then wraps back.

/** The range to loop: both marks set and looping on, else null. In and out are put in order. */
export function loopRange(inF, outF, on = true) {
  if (!on || inF == null || outF == null) return null;
  return [Math.min(inF, outF), Math.max(inF, outF)];
}

/** Where Play starts: the playhead if it is inside the range, else the range's in. Without a range,
 * the playhead, or the first frame when it is on the last one. */
export function startFrame(frame, loop, frames) {
  if (loop) return frame >= loop[0] && frame <= loop[1] ? frame : loop[0];
  return frame >= frames - 1 ? 0 : frame;
}

/** The frame on screen at time t: the one whose interval [f / fps, (f + 1) / fps) holds t. */
export const frameAt = (t, fps) => Math.floor(t * fps + 1e-6);

/** Time t folded into the range: a time at or past its end comes back by whole lengths, keeping the
 * overshoot (so the audio carries on where it should, and several missed ticks still land in phase).
 * A time before the range is left alone: playback runs into it. */
export function wrapTime(t, loop, fps) {
  if (!loop) return { t, frame: frameAt(t, fps), wraps: 0 };
  const a = loop[0] / fps, len = (loop[1] + 1 - loop[0]) / fps;
  if (t < a + len) return { t, frame: Math.min(loop[1], frameAt(t, fps)), wraps: 0 };
  const wraps = Math.floor((t - a) / len), w = Math.min(a + len - 1e-9, Math.max(a, t - wraps * len));
  return { t: w, frame: Math.min(loop[1], Math.max(loop[0], frameAt(w, fps))), wraps };
}

/** The playhead after `elapsed` seconds of wall time since time `from`, at `rate`. With a range it
 * wraps; without one it ends on the last frame. */
export function playAt({ from, elapsed = 0, rate = 1, fps, frames, loop = null }) {
  const t = from + elapsed * rate;
  if (loop) return { ...wrapTime(t, loop, fps), ended: false };
  if (frameAt(t, fps) >= frames - 1) return { t: (frames - 1) / fps, frame: frames - 1, wraps: 0, ended: true };
  return { t, frame: Math.max(0, frameAt(t, fps)), wraps: 0, ended: false };
}

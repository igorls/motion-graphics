// The edit: which scene plays when. Boundaries are computed from the beat grid (bars of the
// analysed music, or of project.bpm), never typed in as seconds, so the cuts stay on the music
// when the track or tempo changes. Windows that touch are hard cuts; overlapping windows crossfade
// (or the incoming scene handles the transition itself).
//
// These example scenes each demonstrate one technique. Write the piece's own scenes; don't ship these.
import type { TimelineEntry } from './engine/engine';
import type { Audio } from './engine/audio';
import { project } from './project';
import Hook from './scenes/hook';
import Flythrough from './scenes/flythrough';
import Reveal from './scenes/reveal';
import EndCard from './scenes/endcard';

export function makeTimeline(au: Audio): TimelineEntry[] {
  const bar = (n: number) => au.timeOfBar(n);
  const end = project.duration;
  return [
    { id: 'hook', scene: Hook, start: 0, end: bar(2), params: { words: ['Make', 'it', 'move.'], accent: 2 } },
    { id: 'fly', scene: Flythrough, start: bar(2), end: bar(4), params: { items: ['depth', 'parallax', 'fog', 'camera'], hero: 'Go bolder.' } },
    {
      id: 'reveal', scene: Reveal, start: bar(4), end: bar(6),
      params: { before: 'media/before.jpg', after: 'media/after.jpg', caption: 'Same photo.\nDifferent story.' },
    },
    { id: 'end', scene: EndCard, start: bar(6), end, params: { step: 0.5 } },
  ];
}

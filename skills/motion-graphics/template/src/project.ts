// The piece's global settings. The timeline (src/timeline.ts) says what plays when;
// the brand (src/brand.ts) says what it looks like.
import type { FormatName } from './engine/format';

export const project = {
  title: 'Example piece',
  /** Default output format; override per render with ?format= / --format. */
  format: 'vertical' as FormatName,
  /** 30 for Instagram/TikTok (smaller files, what the platforms deliver), 60 for web/YouTube hero pieces. */
  fps: 30,
  /** Length in seconds. The music is trimmed to it. */
  duration: 14,
  /** Music under public/ (null = silent). Run scripts/analyze_audio.py on it to get public/audio.json. */
  music: null as string | null,
  /** Beat grid used when there is no public/audio.json (silent pieces still cut on a grid). */
  bpm: 120,
  beatsPerBar: 4,
};
